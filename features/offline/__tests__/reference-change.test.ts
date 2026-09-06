import assert from "node:assert/strict";
import { test } from "node:test";

import {
  categoryPayloadFromRow,
  customerPayloadFromRow,
  emitReferenceChanges,
  MemoryRevisionAllocator,
  productPayloadFromRow,
  promotionPayloadFromRow,
  referenceScopeKey,
  settingsPayloadFromRow,
  stockLevelEntityId,
  stockLevelPayloadFromRow,
  tombstone,
  type ReferenceChangeInput,
  type ReferenceChangeTx,
} from "../server/reference-change";
import { ReferenceEntityType } from "../replica/reference-types";

function fakeTx() {
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

test("emitReferenceChanges assigns strictly-newer per-scope versions", async () => {
  const tx = fakeTx();
  const allocator = new MemoryRevisionAllocator();
  const upsert = (id: string): ReferenceChangeInput => ({
    entityType: ReferenceEntityType.product,
    entityId: id,
    deleted: false,
    branchId: "br-1",
    warehouseId: null,
    payload: { id },
  });

  await emitReferenceChanges(tx, "co-1", [upsert("p1")], allocator);
  await emitReferenceChanges(tx, "co-1", [upsert("p1")], allocator);
  await emitReferenceChanges(tx, "co-1", [upsert("p2")], allocator);

  const p1Versions = tx.rows.filter((r) => r.entityId === "p1").map((r) => r.version);
  assert.deepEqual(p1Versions, [1, 2]);
  const p2Versions = tx.rows.filter((r) => r.entityId === "p2").map((r) => r.version);
  assert.deepEqual(p2Versions, [1]);
});

test("scope key includes company, branch, warehouse, kind, id", () => {
  const key = referenceScopeKey("co-1", {
    branchId: "br-1",
    warehouseId: "wh-1",
    entityType: "stock_level",
    entityId: stockLevelEntityId("p1", "wh-1"),
  });
  assert.equal(key, "co-1::br-1::wh-1::stock_level::p1::wh-1");
  // Same product, different warehouse -> different scope key.
  const other = referenceScopeKey("co-1", {
    branchId: "br-1",
    warehouseId: "wh-2",
    entityType: "stock_level",
    entityId: stockLevelEntityId("p1", "wh-2"),
  });
  assert.notEqual(key, other);
});

test("tombstone emits deleted change with null payload", async () => {
  const tx = fakeTx();
  await emitReferenceChanges(
    tx,
    "co-1",
    [tombstone(ReferenceEntityType.product, "p1", { branchId: "br-1" })],
    new MemoryRevisionAllocator(),
  );
  assert.equal(tx.rows[0].deleted, true);
  assert.equal(tx.rows[0].payload, null);
  assert.equal(tx.rows[0].version, 1);
  assert.equal(tx.rows[0].branchId, "br-1");
});

test("productPayloadFromRow maps units/barcodes/price and active flag", () => {
  const payload = productPayloadFromRow({
    id: "p1",
    nameEn: "Water",
    nameLo: "ນ້ຳ",
    sku: "SKU1",
    barcode: "111",
    categoryId: "c1",
    sellingPriceLak: 900,
    stockDisplayMode: "exact",
    imageUrl: null,
    isActive: true,
    status: "active",
    units: [
      { id: "u1", unitName: "Bottle", conversionQty: 1, sellingPriceLak: 1000, barcode: "222", isDefaultSaleUnit: true, sortOrder: 0, status: "active" },
    ],
  });
  assert.equal(payload.id, "p1");
  assert.equal(payload.name, "Water");
  assert.equal(payload.retailPriceLak, 1000);
  assert.deepEqual(payload.barcodes.sort(), ["111", "222"]);
  assert.equal(payload.units[0].unitId, "u1");
  assert.equal(payload.isActive, true);
});

test("deleted/archived product row maps to isActive false", () => {
  const payload = productPayloadFromRow({ id: "p1", nameEn: "X", isActive: false, status: "deleted", units: [] });
  assert.equal(payload.isActive, false);
});

test("category/customer/promotion/settings/stock builders shape payloads", () => {
  assert.deepEqual(categoryPayloadFromRow({ id: "c1", nameEn: "Drinks", parentId: null }), {
    id: "c1",
    name: "Drinks",
    parentId: null,
  });
  const customer = customerPayloadFromRow({ id: "cu1", customerCode: "MEM-1", fullName: "Bob", phone: "20", membershipLevelId: "m1", discountPercent: 5, pointsBalance: 30 });
  assert.equal(customer.code, "MEM-1");
  assert.equal(customer.pointsBalance, 30);
  const promo = promotionPayloadFromRow({ id: "pr1", promotionName: "Sale", promotionType: "percentage", status: "active", startDate: null, endDate: null, discountPercent: 10 });
  assert.equal(promo.name, "Sale");
  assert.equal((promo.rules as { discountPercent: number }).discountPercent, 10);
  const settings = settingsPayloadFromRow({ baseCurrency: "LAK" }, { vatEnabled: true, vatRate: 7, receiptPrefix: "GB", loyaltyEnabled: true, loyaltySpendPerPointLak: 1000 });
  assert.equal(settings.taxRatePercent, 7);
  assert.equal(settings.receiptPrefix, "GB");
  const stock = stockLevelPayloadFromRow("p1", "wh-1", 12, [{ lotId: "l1", quantity: 12, expiryDate: null }]);
  assert.equal(stock.available, 12);
  assert.equal(stock.lots[0].lotId, "l1");
});
