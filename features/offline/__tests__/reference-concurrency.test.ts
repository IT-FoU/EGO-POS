import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emitReferenceChanges,
  MemoryRevisionAllocator,
  referenceScopeKey,
  stockLevelEntityId,
  type ReferenceChangeInput,
  type ReferenceChangeTx,
} from "../server/reference-change";
import { ReferenceEntityType } from "../replica/reference-types";
import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { StoreSnapshotRepository, type DeltaFetcher } from "../replica/store-snapshot-repository";
import { InMemorySyncStore } from "../server/sync-store";
import { pullDelta } from "../server/sync-engine";
import { assertSingleWarehouseRollout, SingleWarehouseRolloutError } from "../config";
import type { ServerChange } from "../server/sync-contract";

function collectingTx() {
  const rows: Array<Record<string, any>> = [];
  const tx: ReferenceChangeTx & { rows: typeof rows } = {
    rows,
    offlineServerChange: {
      async create({ data }) {
        rows.push(data);
        return data;
      },
    },
  };
  return tx;
}

function productUpsert(id: string, price: number): ReferenceChangeInput {
  return {
    entityType: ReferenceEntityType.product,
    entityId: id,
    deleted: false,
    branchId: "br-1",
    warehouseId: null,
    payload: { id, retailPriceLak: price },
  };
}

test("1. two concurrent updates to the same product get unique, ordered versions", async () => {
  const tx = collectingTx();
  const allocator = new MemoryRevisionAllocator();

  // Fire many concurrent emits for the SAME scoped entity.
  await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      emitReferenceChanges(tx, "co-1", [productUpsert("p1", i)], allocator),
    ),
  );

  const versions = tx.rows.map((r) => r.version as number).sort((a, b) => a - b);
  const unique = new Set(versions);
  assert.equal(unique.size, versions.length, "all versions must be unique");
  assert.deepEqual(versions, Array.from({ length: 50 }, (_, i) => i + 1), "versions are 1..N, ordered");
});

test("2. update vs delete race: final replica matches the last-committed event", async () => {
  const store = new InMemorySyncStore();
  const { db, repo } = await openRepo();
  const fetch = engineFetcher(store, "co-1", "dev-1", ["br-1"]);

  // Seed an initial product, then two racing events: an update and a delete.
  store.seedChange("co-1", { entityType: ReferenceEntityType.product, entityId: "p1", version: 1, deleted: false, payload: { id: "p1", retailPriceLak: 100 } }, "br-1");
  await repo.pullDelta(fetch);

  // Whichever commits last gets the higher per-scope version and is authoritative.
  // Case A: update (v2) then delete (v3) -> deleted wins.
  store.seedChange("co-1", { entityType: ReferenceEntityType.product, entityId: "p1", version: 2, deleted: false, payload: { id: "p1", retailPriceLak: 150 } }, "br-1");
  store.seedChange("co-1", { entityType: ReferenceEntityType.product, entityId: "p1", version: 3, deleted: true, payload: null }, "br-1");
  await repo.pullDelta(fetch);
  assert.deepEqual((await repo.readLocalSnapshot()).products, [], "delete (highest version) is the final state");

  // A late-arriving lower-version update must NOT resurrect the deleted product.
  store.seedChange("co-1", { entityType: ReferenceEntityType.product, entityId: "p1", version: 2, deleted: false, payload: { id: "p1", retailPriceLak: 999 } }, "br-1");
  await repo.pullDelta(fetch);
  assert.deepEqual((await repo.readLocalSnapshot()).products, [], "stale update cannot resurrect a deleted product");
  db.close();
});

test("3. same product in two warehouses is isolated (distinct keys and versions)", async () => {
  const tx = collectingTx();
  const allocator = new MemoryRevisionAllocator();
  const stock = (warehouseId: string, qty: number): ReferenceChangeInput => ({
    entityType: ReferenceEntityType.stockLevel,
    entityId: stockLevelEntityId("p1", warehouseId),
    deleted: false,
    branchId: "br-1",
    warehouseId,
    payload: { productId: "p1", warehouseId, available: qty },
  });

  await emitReferenceChanges(tx, "co-1", [stock("wh-1", 10)], allocator);
  await emitReferenceChanges(tx, "co-1", [stock("wh-2", 20)], allocator);
  await emitReferenceChanges(tx, "co-1", [stock("wh-1", 12)], allocator);

  const wh1 = tx.rows.filter((r) => r.entityId === "p1::wh-1");
  const wh2 = tx.rows.filter((r) => r.entityId === "p1::wh-2");
  assert.equal(wh1.length, 2);
  assert.equal(wh2.length, 1);
  // Independent per-scope versions.
  assert.deepEqual(wh1.map((r) => r.version), [1, 2]);
  assert.deepEqual(wh2.map((r) => r.version), [1]);
  // Distinct scope keys.
  assert.notEqual(
    referenceScopeKey("co-1", { branchId: "br-1", warehouseId: "wh-1", entityType: "stock_level", entityId: "p1::wh-1" }),
    referenceScopeKey("co-1", { branchId: "br-1", warehouseId: "wh-2", entityType: "stock_level", entityId: "p1::wh-2" }),
  );
});

test("4. two terminal replicas only receive their permitted warehouse/branch changes", async () => {
  const store = new InMemorySyncStore();
  // Warehouse-scoped stock changes for two warehouses in the same branch.
  store.seedChange("co-1", { entityType: ReferenceEntityType.stockLevel, entityId: "p1::wh-1", version: 1, deleted: false, payload: { productId: "p1", warehouseId: "wh-1", available: 10 }, warehouseId: "wh-1" }, "br-1", "wh-1");
  store.seedChange("co-1", { entityType: ReferenceEntityType.stockLevel, entityId: "p1::wh-2", version: 1, deleted: false, payload: { productId: "p1", warehouseId: "wh-2", available: 20 }, warehouseId: "wh-2" }, "br-1", "wh-2");
  // A company-wide (no warehouse) change reaches everyone.
  store.seedChange("co-1", { entityType: ReferenceEntityType.settings, entityId: "current", version: 1, deleted: false, payload: { taxRatePercent: 7 } }, null, null);

  const termWh1 = await pullDelta(store, "co-1", "dev-1", { schemaVersion: 1, cursor: 0, limit: 100 }, new Date(), ["br-1"], ["wh-1"]);
  const ids1 = termWh1.changes.map((c) => c.entityId);
  assert.ok(ids1.includes("p1::wh-1"));
  assert.ok(ids1.includes("current"), "company-wide change reaches the terminal");
  assert.ok(!ids1.includes("p1::wh-2"), "another warehouse's stock must not leak");

  const termWh2 = await pullDelta(store, "co-1", "dev-2", { schemaVersion: 1, cursor: 0, limit: 100 }, new Date(), ["br-1"], ["wh-2"]);
  const ids2 = termWh2.changes.map((c) => c.entityId);
  assert.ok(ids2.includes("p1::wh-2"));
  assert.ok(!ids2.includes("p1::wh-1"));
});

test("single-warehouse rollout is enforced in code (not assumed)", () => {
  assert.deepEqual(assertSingleWarehouseRollout(["wh-1"]), ["wh-1"]);
  assert.throws(() => assertSingleWarehouseRollout(["wh-1", "wh-2"]), SingleWarehouseRolloutError);
});

// ---- helpers ----

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };

async function openRepo() {
  const db = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
  return { db, repo: new StoreSnapshotRepository(db, NS) };
}

function engineFetcher(
  store: InMemorySyncStore,
  companyId: string,
  deviceId: string,
  branchIds?: string[],
  warehouseIds?: string[],
): DeltaFetcher {
  return async (cursor, limit) => {
    const res = await pullDelta(
      store,
      companyId,
      deviceId,
      { schemaVersion: 1, cursor, limit },
      new Date(),
      branchIds,
      warehouseIds,
    );
    return { changes: res.changes as ServerChange[], nextCursor: res.nextCursor, hasMore: res.hasMore };
  };
}
