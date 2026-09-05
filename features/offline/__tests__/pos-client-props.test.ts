import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { StoreSnapshotRepository } from "../replica/store-snapshot-repository";
import { assertReplicaScope } from "../pos-read/pos-read-repository";
import { posSnapshotToReadModel, type OnlineSnapshotInput } from "../pos-read/pos-read-types";
import { posReadModelToPosClientProps } from "../pos-read/pos-client-props";
import { ReferenceEntityType, type ReferenceEntity } from "../replica/reference-types";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const SCOPE = { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1" };
const CTX = { branchId: "br-1", branchName: "Main", warehouseId: "wh-1", cashierName: "C", terminalId: "POS-01" };

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
  ],
  customers: [{ id: "cu1", customerCode: "MEM-1", name: "Bob", phone: "20", membershipLevelId: "m1", discountPercent: 5, pointsBalance: 40 }],
  promotions: [{ id: "pr1", promotionName: "Sale", promotionType: "percentage", status: "active", discountPercent: 10 }],
  cashSession: { sessionId: "cs1", status: "open", openedAt: "2026-09-05T00:00:00.000Z", openingCashLak: 500 },
};

test("the SAME component props are produced from online snapshot data", () => {
  const model = posSnapshotToReadModel(ONLINE_SNAPSHOT);
  const props = posReadModelToPosClientProps(model, CTX);
  assert.equal(props.products.length, 1);
  assert.equal(props.products[0].id, "p1");
  assert.equal(props.products[0].priceLak, 1000);
  assert.equal(props.products[0].barcode, "111");
  assert.equal(props.products[0].categoryName, "Drinks");
  assert.equal(props.products[0].stockQty, 5);
  assert.equal(props.customers[0].customerCode, "MEM-1");
  assert.equal(props.customers[0].pointsBalance, 40);
  assert.equal(props.taxRatePercent, 7);
  assert.equal(props.receiptSettings.receiptPrefix, "GB");
});

// Build an equivalent offline replica (same cloud state).
function ent(type: any, id: string, payload: unknown, version = 1, deleted = false): ReferenceEntity {
  return { entityType: type, entityId: id, version, deleted, scope: SCOPE, payload };
}
async function offlineModel(entities: ReferenceEntity[]) {
  const db = await OfflineDatabase.open({ namespace: NS, backend: new MemoryOfflineBackend() });
  const repo = new StoreSnapshotRepository(db, NS);
  await repo.applyEntities(entities);
  const snapshot = await repo.readLocalSnapshot();
  const model = assertReplicaScope(snapshot, { ...NS, warehouseId: "wh-1" });
  return { db, model };
}

test("the SAME component props are produced (equivalently) from offline replica data", async () => {
  const { db, model } = await offlineModel([
    ent(ReferenceEntityType.storeContext, "current", { companyId: "co-1", companyName: "GB", branchId: "br-1", branchName: "Main", warehouseId: "wh-1", terminalId: "POS-01", deviceId: "dev-1" }),
    ent(ReferenceEntityType.settings, "current", { taxRatePercent: 7, taxInclusive: false, receiptPrefix: "GB", receiptHeader: null, receiptFooter: null, loyaltyEnabled: true, loyaltySpendPerPointLak: 1000, baseCurrency: "LAK" }),
    ent(ReferenceEntityType.category, "c1", { id: "c1", name: "Drinks", parentId: null }),
    ent(ReferenceEntityType.product, "p1", { id: "p1", name: "Water", sku: "SKU1", categoryId: "c1", retailPriceLak: 1000, barcodes: ["111"], units: [{ unitId: "u1", name: "Bottle", factor: 1, priceLak: 1000, barcode: "111" }], stockDisplayMode: null, imageUrl: null, isActive: true }),
    ent(ReferenceEntityType.stockLevel, "p1::wh-1", { productId: "p1", warehouseId: "wh-1", available: 5, lots: [], terminalAllocatedQty: null }),
    ent(ReferenceEntityType.customer, "cu1", { id: "cu1", code: "MEM-1", name: "Bob", phone: "20", membershipLevelId: "m1", discountPercent: 5, pointsBalance: 40 }),
    ent(ReferenceEntityType.promotion, "pr1", { id: "pr1", name: "Sale", version: 1, type: "percentage", status: "active", effectiveFrom: null, effectiveTo: null, rules: { discountPercent: 10 } }),
    ent(ReferenceEntityType.cashSession, "current", { id: "cs1", status: "open", openedAt: "2026-09-05T00:00:00.000Z", openingFloatLak: 500 }),
  ]);
  const props = posReadModelToPosClientProps(model, CTX);

  const online = posReadModelToPosClientProps(posSnapshotToReadModel(ONLINE_SNAPSHOT), CTX);
  assert.deepEqual(props.products.map((p) => [p.id, p.priceLak, p.barcode, p.categoryName, p.stockQty]), online.products.map((p) => [p.id, p.priceLak, p.barcode, p.categoryName, p.stockQty]));
  assert.deepEqual(props.customers.map((c) => [c.customerCode, c.pointsBalance]), online.customers.map((c) => [c.customerCode, c.pointsBalance]));
  assert.equal(props.taxRatePercent, online.taxRatePercent);
  assert.equal(props.cashSession.sessionId, "cs1");
  db.close();
});

test("offline props are read-only (all write actions denied)", () => {
  const props = posReadModelToPosClientProps(posSnapshotToReadModel(ONLINE_SNAPSHOT), CTX);
  assert.equal(props.posPermissionPolicy.permissions.create_sale, false);
  assert.equal(props.posPermissionPolicy.permissions.hold_bill, false);
  assert.equal(props.posPermissionPolicy.permissions.void_bill, false);
  assert.equal(props.posPermissionPolicy.maxDiscountPercent, 0);
  assert.equal(props.nextSaleNo, "");
});

test("tombstoned product/category are absent from the mapped props", async () => {
  const { db, model } = await offlineModel([
    ent(ReferenceEntityType.storeContext, "current", { companyId: "co-1", companyName: "GB", branchId: "br-1", branchName: "Main", warehouseId: "wh-1", terminalId: "POS-01", deviceId: "dev-1" }),
    ent(ReferenceEntityType.category, "c1", { id: "c1", name: "Drinks", parentId: null }),
    ent(ReferenceEntityType.product, "p1", { id: "p1", name: "Water", sku: "SKU1", categoryId: "c1", retailPriceLak: 1000, barcodes: ["111"], units: [], stockDisplayMode: null, imageUrl: null, isActive: true }),
    ent(ReferenceEntityType.product, "p1", null, 2, true),
    ent(ReferenceEntityType.category, "c1", null, 2, true),
  ]);
  const props = posReadModelToPosClientProps(model, CTX);
  assert.deepEqual(props.products, []);
  db.close();
});
