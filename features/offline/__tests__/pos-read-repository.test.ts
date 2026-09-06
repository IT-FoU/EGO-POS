import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { StoreSnapshotRepository } from "../replica/store-snapshot-repository";
import {
  OfflinePosReadRepository,
  OnlinePosReadRepository,
  PosReplicaScopeError,
  assertReplicaScope,
} from "../pos-read/pos-read-repository";
import { ReferenceEntityType, type ReferenceEntity } from "../replica/reference-types";
import type { OnlineSnapshotInput } from "../pos-read/pos-read-types";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const SCOPE = { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" };

const ONLINE_SNAPSHOT: OnlineSnapshotInput = {
  branchId: "br-1",
  branchName: "Main",
  warehouseId: "wh-1",
  taxRatePercent: 7,
  taxInclusive: false,
  loyaltySettings: { loyaltyEnabled: true, loyaltySpendPerPointLak: 1000 },
  receiptSettings: { receiptPrefix: "GB" },
  products: [
    { id: "p1", nameEn: "Water", sku: "SKU1", barcode: "111", categoryId: "c1", categoryName: "Drinks", priceLak: 1000, stockQty: 5, units: [{ id: "u1", unitName: "Bottle", conversionQty: 1, sellingPriceLak: 1000, barcode: "111" }] },
    { id: "p2", nameEn: "Soda", sku: "SKU2", barcode: "222", categoryId: "c1", categoryName: "Drinks", priceLak: 2000, stockQty: 3, units: [] },
  ],
  customers: [
    { id: "cu1", customerCode: "MEM-1", name: "Bob", phone: "2055", membershipLevelId: "m1", discountPercent: 5, pointsBalance: 40 },
  ],
  promotions: [{ id: "pr1", promotionName: "Sale", promotionType: "percentage", status: "active", discountPercent: 10 }],
  cashSession: { sessionId: "cs1", status: "open", openedAt: "2026-09-05T00:00:00.000Z", openingCashLak: 500 },
};

test("online adapter reads product search, barcode, category, price, member, stock, cash, settings", async () => {
  const repo = new OnlinePosReadRepository(ONLINE_SNAPSHOT);
  assert.equal(repo.source, "online");

  const search = await repo.searchProducts("wat");
  assert.deepEqual(search.map((p) => p.id), ["p1"]);

  const byBarcode = await repo.lookupBarcode("222");
  assert.equal(byBarcode?.id, "p2");

  const categories = await repo.listCategories();
  assert.deepEqual(categories.map((c) => c.id), ["c1"]);

  const product = await repo.getProduct("p1");
  assert.equal(product?.retailPriceLak, 1000);
  assert.equal(product?.units[0].unitId, "u1");

  const members = await repo.searchCustomers("bob");
  assert.equal(members[0]?.code, "MEM-1");
  assert.equal(members[0]?.pointsBalance, 40);

  const promos = await repo.listPromotions();
  assert.equal(promos[0]?.name, "Sale");

  const stock = await repo.getStock("p1", "wh-1");
  assert.equal(stock?.available, 5);

  const cash = await repo.getCashSession();
  assert.equal(cash?.id, "cs1");

  const settings = await repo.getSettings();
  assert.equal(settings?.taxRatePercent, 7);
  assert.equal(settings?.receiptPrefix, "GB");
});

// ---- offline replica helpers ----

function storeContextEntity(): ReferenceEntity {
  return {
    entityType: ReferenceEntityType.storeContext,
    entityId: "current",
    version: 1,
    deleted: false,
    scope: SCOPE,
    payload: { companyId: "co-1", companyName: "GB", branchId: "br-1", branchName: "Main", warehouseId: "wh-1", terminalId: "POS-01", deviceId: "dev-1" },
  };
}
function productEntity(id: string, price: number, barcode: string, name = id): ReferenceEntity {
  return {
    entityType: ReferenceEntityType.product,
    entityId: id,
    version: 1,
    deleted: false,
    scope: SCOPE,
    payload: { id, name, sku: id.toUpperCase(), categoryId: "c1", retailPriceLak: price, barcodes: [barcode], units: [], stockDisplayMode: null, imageUrl: null, isActive: true },
  };
}
function categoryEntity(id: string): ReferenceEntity {
  return { entityType: ReferenceEntityType.category, entityId: id, version: 1, deleted: false, scope: SCOPE, payload: { id, name: "Drinks", parentId: null } };
}

async function seededReplica(entities: ReferenceEntity[]) {
  const db = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
  const repo = new StoreSnapshotRepository(db, NS);
  await repo.applyEntities(entities);
  return { db, repo };
}

test("offline adapter reads from the local replica", async () => {
  const { db, repo } = await seededReplica([
    storeContextEntity(),
    categoryEntity("c1"),
    productEntity("p1", 1000, "111", "Water"),
    productEntity("p2", 2000, "222", "Soda"),
  ]);
  const offline = await OfflinePosReadRepository.load(repo, { ...NS, warehouseId: "wh-1" });
  assert.equal(offline.source, "offline");
  assert.deepEqual((await offline.searchProducts("wat")).map((p) => p.id), ["p1"]);
  assert.equal((await offline.lookupBarcode("222"))?.id, "p2");
  assert.deepEqual((await offline.listCategories()).map((c) => c.id), ["c1"]);
  assert.equal((await offline.getProduct("p1"))?.retailPriceLak, 1000);
  db.close();
});

test("offline adapter enforces terminal/company/branch scope at the boundary", async () => {
  const { db, repo } = await seededReplica([storeContextEntity(), productEntity("p1", 1000, "111")]);
  // Wrong company/branch/terminal must be rejected.
  await assert.rejects(
    OfflinePosReadRepository.load(repo, { companyId: "co-2", branchId: "br-1", terminalId: "POS-01" }),
    PosReplicaScopeError,
  );
  await assert.rejects(
    OfflinePosReadRepository.load(repo, { companyId: "co-1", branchId: "br-9", terminalId: "POS-01" }),
    PosReplicaScopeError,
  );
  await assert.rejects(
    OfflinePosReadRepository.load(repo, { companyId: "co-1", branchId: "br-1", terminalId: "POS-99" }),
    PosReplicaScopeError,
  );
  db.close();
});

test("missing store context (never bootstrapped) blocks offline reads", () => {
  assert.throws(
    () =>
      assertReplicaScope(
        { storeContext: null, securitySnapshot: null, settings: null, categories: [], products: [], customers: [], promotions: [], qrBanks: [], stockLevels: [], cashSession: null, meta: { bootstrapCursor: 0, syncCursor: 0, bootstrapComplete: false, lastSyncAt: null, deviceStatus: null, policyVersion: null } },
        { ...NS, warehouseId: "wh-1" },
      ),
    PosReplicaScopeError,
  );
});

test("tombstone hides a deleted product/category from the offline adapter", async () => {
  const { db, repo } = await seededReplica([
    storeContextEntity(),
    categoryEntity("c1"),
    productEntity("p1", 1000, "111", "Water"),
  ]);
  // Delete via a higher-version tombstone (as delta would).
  await repo.applyEntities([
    { entityType: ReferenceEntityType.product, entityId: "p1", version: 2, deleted: true, scope: SCOPE, payload: null },
    { entityType: ReferenceEntityType.category, entityId: "c1", version: 2, deleted: true, scope: SCOPE, payload: null },
  ]);
  const offline = await OfflinePosReadRepository.load(repo, { ...NS, warehouseId: "wh-1" });
  assert.deepEqual(await offline.searchProducts(""), []);
  assert.equal(await offline.getProduct("p1"), null);
  assert.deepEqual(await offline.listCategories(), []);
  db.close();
});
