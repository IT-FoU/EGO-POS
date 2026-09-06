import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { StoreSnapshotRepository } from "../replica/store-snapshot-repository";
import {
  ReferenceEntityType,
  type ReferenceEntity,
  type ReferenceScope,
} from "../replica/reference-types";
import type { ServerChange } from "../server/sync-contract";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const SCOPE: ReferenceScope = { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" };

async function openRepo() {
  const db = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
  return { db, repo: new StoreSnapshotRepository(db, NS) };
}

function product(id: string, version: number, priceLak: number, scope = SCOPE): ReferenceEntity {
  return {
    entityType: ReferenceEntityType.product,
    entityId: id,
    version,
    deleted: false,
    scope,
    payload: { id, name: id, sku: null, categoryId: "cat-1", retailPriceLak: priceLak, barcodes: [], units: [], stockDisplayMode: null, imageUrl: null, isActive: true },
  };
}

function category(id: string, version: number): ReferenceEntity {
  return {
    entityType: ReferenceEntityType.category,
    entityId: id,
    version,
    deleted: false,
    scope: SCOPE,
    payload: { id, name: id, parentId: null },
  };
}

/** Build a paginated bootstrap fetcher over an ordered entity list. */
function bootstrapFetcher(entities: ReferenceEntity[]) {
  return async (cursor: number, limit: number) => {
    const page = entities.slice(cursor, cursor + limit);
    const nextCursor = cursor + page.length;
    return { entities: page, nextCursor, hasMore: nextCursor < entities.length };
  };
}

/** Build a paginated delta fetcher over a ServerChange feed (cursor = seq). */
function deltaFetcher(changes: ServerChange[]) {
  return async (cursor: number, limit: number) => {
    const pending = changes.filter((c) => c.cursor > cursor).sort((a, b) => a.cursor - b.cursor);
    const page = pending.slice(0, limit);
    const nextCursor = page.length ? page[page.length - 1].cursor : cursor;
    return { changes: page, nextCursor, hasMore: pending.length > page.length };
  };
}

test("bootstrap paginates, applies, and marks complete", async () => {
  const { db, repo } = await openRepo();
  const entities = [
    category("cat-1", 1),
    product("p1", 1, 100),
    product("p2", 1, 200),
    product("p3", 1, 300),
  ];
  const result = await repo.bootstrap(bootstrapFetcher(entities), 2);
  assert.equal(result.pages, 2);
  assert.equal(result.stats.applied, 4);

  const snap = await repo.readLocalSnapshot();
  assert.equal(snap.products.length, 3);
  assert.equal(snap.categories.length, 1);
  assert.equal(snap.meta.bootstrapComplete, true);
  assert.equal(snap.meta.bootstrapCursor, 4);
  db.close();
});

test("empty bootstrap yields an empty snapshot and never seeds defaults", async () => {
  const { db, repo } = await openRepo();
  const result = await repo.bootstrap(bootstrapFetcher([]), 50);
  assert.equal(result.stats.applied, 0);
  const snap = await repo.readLocalSnapshot();
  assert.deepEqual(snap.products, []);
  assert.deepEqual(snap.categories, []);
  assert.equal(snap.storeContext, null);
  assert.equal(snap.meta.bootstrapComplete, true);
  db.close();
});

test("delta applies a product price update", async () => {
  const { db, repo } = await openRepo();
  await repo.bootstrap(bootstrapFetcher([product("p1", 1, 100)]), 50);

  const changes: ServerChange[] = [
    {
      cursor: 1,
      entityType: ReferenceEntityType.product,
      entityId: "p1",
      version: 2,
      deleted: false,
      payload: { id: "p1", name: "p1", sku: null, categoryId: "cat-1", retailPriceLak: 150, barcodes: [], units: [], stockDisplayMode: null, imageUrl: null, isActive: true },
    },
  ];
  await repo.pullDelta(deltaFetcher(changes), 50);

  const snap = await repo.readLocalSnapshot();
  assert.equal(snap.products.length, 1);
  assert.equal((snap.products[0] as { retailPriceLak: number }).retailPriceLak, 150);
  assert.equal(snap.meta.syncCursor, 1);
  db.close();
});

test("tombstone deletes a product and it never reappears from a stale re-add", async () => {
  const { db, repo } = await openRepo();
  await repo.bootstrap(bootstrapFetcher([product("p1", 1, 100), product("p2", 1, 200)]), 50);

  // Delete p1 via tombstone (version 2).
  const del: ServerChange[] = [
    { cursor: 1, entityType: ReferenceEntityType.product, entityId: "p1", version: 2, deleted: true, payload: null },
  ];
  await repo.pullDelta(deltaFetcher(del), 50);
  let snap = await repo.readLocalSnapshot();
  assert.deepEqual(snap.products.map((p) => (p as { id: string }).id), ["p2"]);

  // A stale re-add (older version 1) must NOT bring p1 back.
  const staleReadd: ServerChange[] = [
    { cursor: 2, entityType: ReferenceEntityType.product, entityId: "p1", version: 1, deleted: false, payload: { id: "p1", retailPriceLak: 100 } },
  ];
  const stats = (await repo.pullDelta(deltaFetcher(staleReadd), 50)).stats;
  assert.equal(stats.skippedStale, 1);
  snap = await repo.readLocalSnapshot();
  assert.deepEqual(snap.products.map((p) => (p as { id: string }).id), ["p2"]);
  db.close();
});

test("category deletion tombstone removes it from the snapshot", async () => {
  const { db, repo } = await openRepo();
  await repo.bootstrap(bootstrapFetcher([category("cat-1", 1), category("cat-2", 1)]), 50);
  const del: ServerChange[] = [
    { cursor: 1, entityType: ReferenceEntityType.category, entityId: "cat-1", version: 2, deleted: true, payload: null },
  ];
  await repo.pullDelta(deltaFetcher(del), 50);
  const snap = await repo.readLocalSnapshot();
  assert.deepEqual(snap.categories.map((c) => (c as { id: string }).id), ["cat-2"]);
  db.close();
});

test("stale snapshot updates are ignored (older version never overwrites)", async () => {
  const { db, repo } = await openRepo();
  await repo.bootstrap(bootstrapFetcher([product("p1", 3, 300)]), 50);

  const stale: ServerChange[] = [
    { cursor: 1, entityType: ReferenceEntityType.product, entityId: "p1", version: 2, deleted: false, payload: { id: "p1", retailPriceLak: 999 } },
  ];
  const { stats } = await repo.pullDelta(deltaFetcher(stale), 50);
  assert.equal(stats.skippedStale, 1);
  const snap = await repo.readLocalSnapshot();
  assert.equal((snap.products[0] as { retailPriceLak: number }).retailPriceLak, 300);
  db.close();
});

test("tenant isolation: entities from another company are rejected", async () => {
  const { db, repo } = await openRepo();
  const foreign = product("p9", 1, 100, { companyId: "co-2", branchId: "br-1", warehouseId: "wh-1" });
  const stats = await repo.applyEntities([foreign, product("p1", 1, 100)]);
  assert.equal(stats.rejectedScope, 1);
  assert.equal(stats.applied, 1);
  const snap = await repo.readLocalSnapshot();
  assert.deepEqual(snap.products.map((p) => (p as { id: string }).id), ["p1"]);
  db.close();
});

test("empty delta leaves the snapshot and cursor unchanged", async () => {
  const { db, repo } = await openRepo();
  await repo.bootstrap(bootstrapFetcher([product("p1", 1, 100)]), 50);
  const before = await repo.readLocalSnapshot();
  const { stats } = await repo.pullDelta(deltaFetcher([]), 50);
  assert.equal(stats.applied, 0);
  const after = await repo.readLocalSnapshot();
  assert.equal(after.products.length, before.products.length);
  assert.equal(after.meta.syncCursor, 0);
  db.close();
});

test("reference replica is isolated per namespace database", async () => {
  const backend = new MemoryOfflineBackend();
  const dbA = await OfflineDatabase.open({ namespace: NS, backend });
  const repoA = new StoreSnapshotRepository(dbA, NS);
  await repoA.applyEntities([product("p1", 1, 100)]);

  const nsB = { companyId: "co-2", branchId: "br-2", terminalId: "POS-02" };
  const dbB = await OfflineDatabase.open({ namespace: nsB, backend });
  const repoB = new StoreSnapshotRepository(dbB, nsB);
  const snapB = await repoB.readLocalSnapshot();
  assert.deepEqual(snapB.products, [], "store B must not see store A reference data");
  dbA.close();
  dbB.close();
});
