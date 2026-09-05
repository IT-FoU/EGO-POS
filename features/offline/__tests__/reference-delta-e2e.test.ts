import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { StoreSnapshotRepository, type DeltaFetcher } from "../replica/store-snapshot-repository";
import { InMemorySyncStore } from "../server/sync-store";
import { pullDelta } from "../server/sync-engine";
import { ReferenceEntityType, type ReferenceEntity } from "../replica/reference-types";
import type { ServerChange } from "../server/sync-contract";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };

async function openRepo(namespace = NS) {
  const db = await OfflineDatabase.open({ namespace, backend: new MemoryOfflineBackend() });
  return { db, repo: new StoreSnapshotRepository(db, namespace) };
}

/** A delta fetcher backed by the real sync engine + in-memory server change feed. */
function engineFetcher(
  store: InMemorySyncStore,
  companyId: string,
  deviceId: string,
  branchIds?: string[],
): DeltaFetcher {
  return async (cursor, limit) => {
    const res = await pullDelta(
      store,
      companyId,
      deviceId,
      { schemaVersion: 1, cursor, limit },
      new Date(),
      branchIds,
    );
    return { changes: res.changes, nextCursor: res.nextCursor, hasMore: res.hasMore };
  };
}

function productChange(id: string, version: number, priceLak: number): Omit<ServerChange, "cursor"> {
  return {
    entityType: ReferenceEntityType.product,
    entityId: id,
    version,
    deleted: false,
    payload: { id, retailPriceLak: priceLak },
  };
}

test("1. an online price change reaches another device through delta pull", async () => {
  const store = new InMemorySyncStore();
  const { db, repo } = await openRepo();
  const fetch = engineFetcher(store, "co-1", "dev-1", ["br-1"]);

  store.seedChange("co-1", productChange("p1", 1, 100), "br-1");
  await repo.pullDelta(fetch);
  let snap = await repo.readLocalSnapshot();
  assert.equal((snap.products[0] as { retailPriceLak: number }).retailPriceLak, 100);

  // Online price edit emits a strictly-newer change; the device pulls it.
  store.seedChange("co-1", productChange("p1", 2, 150), "br-1");
  await repo.pullDelta(fetch);
  snap = await repo.readLocalSnapshot();
  assert.equal(snap.products.length, 1);
  assert.equal((snap.products[0] as { retailPriceLak: number }).retailPriceLak, 150);
  db.close();
});

test("2. product/category deletion reaches the device and never reappears", async () => {
  const store = new InMemorySyncStore();
  const { db, repo } = await openRepo();
  const fetch = engineFetcher(store, "co-1", "dev-1", ["br-1"]);

  store.seedChange("co-1", productChange("p1", 1, 100), "br-1");
  store.seedChange("co-1", { entityType: ReferenceEntityType.category, entityId: "c1", version: 1, deleted: false, payload: { id: "c1", name: "Drinks" } }, "br-1");
  await repo.pullDelta(fetch);
  assert.equal((await repo.readLocalSnapshot()).products.length, 1);

  // Deletes emit tombstones.
  store.seedChange("co-1", { entityType: ReferenceEntityType.product, entityId: "p1", version: 2, deleted: true, payload: null }, "br-1");
  store.seedChange("co-1", { entityType: ReferenceEntityType.category, entityId: "c1", version: 2, deleted: true, payload: null }, "br-1");
  await repo.pullDelta(fetch);
  let snap = await repo.readLocalSnapshot();
  assert.deepEqual(snap.products, []);
  assert.deepEqual(snap.categories, []);

  // A stale older upsert must never resurrect the deleted product/category.
  store.seedChange("co-1", productChange("p1", 1, 100), "br-1");
  await repo.pullDelta(fetch);
  snap = await repo.readLocalSnapshot();
  assert.deepEqual(snap.products, [], "deleted product must not reappear from stale upsert");
  db.close();
});

test("3. cross-tenant and cross-branch data never leak", async () => {
  const store = new InMemorySyncStore();
  store.seedChange("co-1", productChange("p-br1", 1, 100), "br-1");
  store.seedChange("co-1", productChange("p-br2", 1, 200), "br-2");
  store.seedChange("co-1", { entityType: ReferenceEntityType.settings, entityId: "current", version: 1, deleted: false, payload: { taxRatePercent: 7 } }, null);
  store.seedChange("co-2", productChange("p-other", 1, 300), "br-1");

  // Device in co-1/br-1: gets br-1 + company-wide (null branch); never br-2 or co-2.
  const res = await pullDelta(store, "co-1", "dev-1", { schemaVersion: 1, cursor: 0, limit: 100 }, new Date(), ["br-1"]);
  const ids = res.changes.map((c) => c.entityId);
  assert.ok(ids.includes("p-br1"));
  assert.ok(ids.includes("current"));
  assert.ok(!ids.includes("p-br2"), "cross-branch product must not leak");
  assert.ok(!ids.includes("p-other"), "cross-tenant product must not leak");

  // Device in co-1/br-2 gets br-2 (+ company-wide), not br-1.
  const res2 = await pullDelta(store, "co-1", "dev-2", { schemaVersion: 1, cursor: 0, limit: 100 }, new Date(), ["br-2"]);
  const ids2 = res2.changes.map((c) => c.entityId);
  assert.ok(ids2.includes("p-br2"));
  assert.ok(!ids2.includes("p-br1"));
});

test("4. duplicate change delivery is harmless", async () => {
  const store = new InMemorySyncStore();
  store.seedChange("co-1", productChange("p1", 1, 100), "br-1");
  const { db, repo } = await openRepo();

  // A fetcher that re-delivers the same change from cursor 0 (does not advance).
  const change = { ...productChange("p1", 1, 100), cursor: 1 } as ServerChange;
  const redeliver: DeltaFetcher = async () => ({ changes: [change], nextCursor: 0, hasMore: false });

  const first = await repo.pullDelta(redeliver);
  assert.equal(first.stats.applied, 1);
  const second = await repo.pullDelta(redeliver);
  assert.equal(second.stats.applied, 0);
  assert.equal(second.stats.skippedStale, 1, "duplicate delivery is skipped, not duplicated");
  const snap = await repo.readLocalSnapshot();
  assert.equal(snap.products.length, 1);
  db.close();
});

test("5. cursor pagination and order are stable across pages", async () => {
  const store = new InMemorySyncStore();
  for (let i = 1; i <= 5; i += 1) {
    store.seedChange("co-1", productChange(`p${i}`, 1, i * 10), "br-1");
  }
  const seen: number[] = [];
  let cursor = 0;
  for (let guard = 0; guard < 10; guard += 1) {
    const res = await pullDelta(store, "co-1", "dev-1", { schemaVersion: 1, cursor, limit: 2 }, new Date(), ["br-1"]);
    for (const c of res.changes) seen.push(c.cursor);
    cursor = res.nextCursor;
    if (!res.hasMore) break;
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 5], "changes are delivered in stable cursor order exactly once");

  const { db, repo } = await openRepo();
  await repo.pullDelta(engineFetcher(store, "co-1", "dev-1", ["br-1"]), 2);
  assert.equal((await repo.readLocalSnapshot()).products.length, 5);
  db.close();
});

test("6. bootstrap then delta produce the same replica as the cloud state", async () => {
  const entities: ReferenceEntity[] = [
    { entityType: ReferenceEntityType.category, entityId: "c1", version: 1, deleted: false, scope: { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" }, payload: { id: "c1", name: "Drinks", parentId: null } },
    { entityType: ReferenceEntityType.product, entityId: "p1", version: 1, deleted: false, scope: { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" }, payload: { id: "p1", retailPriceLak: 100 } },
    { entityType: ReferenceEntityType.product, entityId: "p2", version: 1, deleted: false, scope: { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" }, payload: { id: "p2", retailPriceLak: 200 } },
  ];

  // Replica A: hydrated via bootstrap.
  const backendA = new MemoryOfflineBackend();
  const dbA = await OfflineDatabase.open({ namespace: NS, backend: backendA });
  const repoA = new StoreSnapshotRepository(dbA, NS);
  await repoA.bootstrap(async (cursor, limit) => {
    const page = entities.slice(cursor, cursor + limit);
    return { entities: page, nextCursor: cursor + page.length, hasMore: cursor + page.length < entities.length };
  }, 2);

  // Replica B: hydrated via delta (same cloud state expressed as changes).
  const store = new InMemorySyncStore();
  for (const e of entities) {
    store.seedChange("co-1", { entityType: e.entityType, entityId: e.entityId, version: e.version, deleted: e.deleted, payload: e.payload }, e.scope.branchId);
  }
  const dbB = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
  const repoB = new StoreSnapshotRepository(dbB, NS);
  await repoB.pullDelta(engineFetcher(store, "co-1", "dev-1", ["br-1"]), 2);

  const snapA = await repoA.readLocalSnapshot();
  const snapB = await repoB.readLocalSnapshot();
  assert.deepEqual(snapA.products, snapB.products);
  assert.deepEqual(snapA.categories, snapB.categories);
  dbA.close();
  dbB.close();
});
