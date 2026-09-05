import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { StoreSnapshotRepository, type BootstrapFetcher, type DeltaFetcher } from "../replica/store-snapshot-repository";
import { PosSyncController } from "../pos-read/pos-sync-controller";
import { OfflinePosReadRepository } from "../pos-read/pos-read-repository";
import { InMemorySyncStore } from "../server/sync-store";
import { pullDelta } from "../server/sync-engine";
import { ReferenceEntityType, type ReferenceEntity } from "../replica/reference-types";
import type { ServerChange } from "../server/sync-contract";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const SCOPE = { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" };

function entity(type: any, id: string, payload: unknown, version = 1): ReferenceEntity {
  return { entityType: type, entityId: id, version, deleted: false, scope: SCOPE, payload };
}

function bootstrapFetcher(entities: ReferenceEntity[]): BootstrapFetcher {
  return async (cursor, limit) => {
    const page = entities.slice(cursor, cursor + limit);
    return { entities: page, nextCursor: cursor + page.length, hasMore: cursor + page.length < entities.length };
  };
}

function engineDelta(store: InMemorySyncStore): DeltaFetcher {
  return async (cursor, limit) => {
    const res = await pullDelta(store, "co-1", "dev-1", { schemaVersion: 1, cursor, limit }, new Date(), ["br-1"], ["wh-1"]);
    return { changes: res.changes as ServerChange[], nextCursor: res.nextCursor, hasMore: res.hasMore };
  };
}

test("controller bootstraps then applies deltas, reaching the POS read adapter", async () => {
  const db = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
  const repo = new StoreSnapshotRepository(db, NS);

  const bootstrapEntities = [
    entity(ReferenceEntityType.storeContext, "current", { companyId: "co-1", companyName: "GB", branchId: "br-1", branchName: "Main", warehouseId: "wh-1", terminalId: "POS-01", deviceId: "dev-1" }),
    entity(ReferenceEntityType.product, "p1", { id: "p1", name: "Water", sku: "SKU1", categoryId: "c1", retailPriceLak: 1000, barcodes: ["111"], units: [], stockDisplayMode: null, imageUrl: null, isActive: true }),
  ];
  const store = new InMemorySyncStore();

  const controller = new PosSyncController(repo, { bootstrap: bootstrapFetcher(bootstrapEntities), delta: engineDelta(store) });

  const first = await controller.sync("startup");
  assert.equal(first.ok, true);
  assert.ok(first.bootstrapped >= 2, "bootstrap applied the reference entities");

  let offline = await OfflinePosReadRepository.load(repo, { ...NS, warehouseId: "wh-1" });
  assert.equal((await offline.getProduct("p1"))?.retailPriceLak, 1000);

  // An online price change is emitted as a delta; a later sync applies it.
  store.seedChange("co-1", { entityType: ReferenceEntityType.product, entityId: "p1", version: 2, deleted: false, payload: { id: "p1", name: "Water", sku: "SKU1", categoryId: "c1", retailPriceLak: 1500, barcodes: ["111"], units: [], stockDisplayMode: null, imageUrl: null, isActive: true } }, "br-1", "wh-1");
  const second = await controller.sync("manual");
  assert.equal(second.ok, true);
  assert.equal(second.pulled, 1);

  offline = await OfflinePosReadRepository.load(repo, { ...NS, warehouseId: "wh-1" });
  assert.equal((await offline.getProduct("p1"))?.retailPriceLak, 1500, "delta price update reached the adapter");
  db.close();
});

test("second bootstrap run is skipped once complete (idempotent)", async () => {
  const db = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
  const repo = new StoreSnapshotRepository(db, NS);
  const store = new InMemorySyncStore();
  const controller = new PosSyncController(repo, {
    bootstrap: bootstrapFetcher([entity(ReferenceEntityType.storeContext, "current", { companyId: "co-1", branchId: "br-1", terminalId: "POS-01", warehouseId: "wh-1" })]),
    delta: engineDelta(store),
  });
  const r1 = await controller.sync("startup");
  assert.ok(r1.bootstrapped >= 1);
  const r2 = await controller.sync("focus");
  assert.equal(r2.bootstrapped, 0, "bootstrap does not re-run after completion");
  assert.equal(controller.isSyncing(), false);
  db.close();
});
