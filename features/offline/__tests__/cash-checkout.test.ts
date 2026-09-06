import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { OfflineStore } from "../local-db/schema";
import { topologicalOrder } from "../operations/envelope";
import {
  computeSaleTotals,
  safePromotionDiscountLak,
  cashChangeLak,
} from "../checkout/cart-math";
import { validateCartAllocations } from "../checkout/stock-guard";
import { saveReceiptRange, saveStockAllocation, readActiveReceiptRange, readStockAllocation } from "../checkout/terminal-provisioning";
import { saveLocalCashSession } from "../checkout/cash-session-guard";
import {
  commitOfflineCashSale,
  NoTerminalAllocationError,
  InvalidLotError,
  InsufficientPaymentError,
  type CommitCashSaleInput,
} from "../checkout/commit-cash-sale";
import { NoOpenCashSessionError } from "../checkout/cash-session-guard";
import { InsufficientTerminalStockError } from "../server/stock-allocation";
import type { LocalSaleEntity, LocalStockMovementEntity } from "../checkout/cash-sale-types";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const NOW = "2026-09-05T00:00:00.000Z";

async function provisionedDb(backend = new MemoryOfflineBackend(), namespace = NS) {
  const db = await OfflineDatabase.open({ namespace, backend });
  await saveLocalCashSession(db, {
    id: "cs-1",
    companyId: namespace.companyId,
    branchId: namespace.branchId,
    terminalId: namespace.terminalId,
    status: "open",
    openedAt: NOW,
    openingFloatLak: 100000,
    operationId: "op-cash-open",
  });
  await saveReceiptRange(db, {
    companyId: namespace.companyId,
    branchId: namespace.branchId,
    terminalDeviceId: "dev-1",
    prefix: "GB-01-",
    rangeStart: 1,
    rangeEnd: 1000,
    nextValue: 1,
    status: "active",
  });
  await saveStockAllocation(db, {
    companyId: namespace.companyId,
    branchId: namespace.branchId,
    warehouseId: "wh-1",
    terminalDeviceId: "dev-1",
    productId: "p1",
    unitId: "u1",
    lotId: null,
    allocatedQty: 10,
    consumedQty: 0,
    baseVersion: 0,
    status: "active",
    expiresAt: null,
  });
  return db;
}

function baseInput(overrides: Partial<CommitCashSaleInput> = {}): CommitCashSaleInput {
  return {
    operationId: "op-sale-1",
    companyId: "co-1",
    branchId: "br-1",
    warehouseId: "wh-1",
    terminalId: "POS-01",
    deviceId: "dev-1",
    actorUserId: "u-1",
    cashSessionId: "cs-1",
    saleNo: "S-1",
    lines: [
      { productId: "p1", unitId: "u1", lotId: null, quantity: 2, conversionQty: 1, unitPriceLak: 5000, name: "Water", unitName: "Bottle" },
    ],
    taxRatePercent: 0,
    taxInclusive: false,
    paidCashLak: 10000,
    branchName: "Main",
    cashierName: "Cashier",
    dependsOn: ["op-cash-open"],
    now: NOW,
    ...overrides,
  };
}

async function counts(db: OfflineDatabase) {
  const [sales, movements, outbox] = await Promise.all([
    db.readAll<LocalSaleEntity>(OfflineStore.sales),
    db.readAll<LocalStockMovementEntity>(OfflineStore.inventoryEvents),
    db.readAll(OfflineStore.outbox),
  ]);
  return { sales: sales.length, movements: movements.length, outbox: outbox.length, salesList: sales };
}

// ---- Pure math + guards ----

test("cart math: tax-exclusive, tax-inclusive, discount cap, change", () => {
  const lines = [{ unitPriceLak: 5000, quantity: 2 }];
  const excl = computeSaleTotals({ lines, taxRatePercent: 10, taxInclusive: false });
  assert.equal(excl.subtotalLak, 10000);
  assert.equal(excl.taxAmountLak, 1000);
  assert.equal(excl.totalLak, 11000);

  const incl = computeSaleTotals({ lines, taxRatePercent: 10, taxInclusive: true });
  assert.equal(incl.subtotalLak, 10000);
  assert.equal(incl.taxAmountLak, 909); // 10000 - 10000/1.1
  assert.equal(incl.totalLak, 10000);

  const discounted = computeSaleTotals({ lines, taxRatePercent: 0, taxInclusive: false, manualDiscountLak: 999999 });
  assert.equal(discounted.discountTotalLak, 10000); // capped at subtotal
  assert.equal(discounted.totalLak, 0);

  assert.equal(cashChangeLak(11000, 20000), 9000);
  assert.equal(cashChangeLak(11000, 11000), 0);
});

test("safe promotion is non-stacking best single active order-level discount", () => {
  const promotions = [
    { id: "a", status: "active", discountPercent: 10 },
    { id: "b", status: "active", discountAmountLak: 3000 },
    { id: "c", status: "inactive", discountPercent: 90 },
  ];
  // subtotal 10000: 10% = 1000 vs 3000 fixed -> best 3000 (not 4000 stacked).
  assert.equal(safePromotionDiscountLak(10000, promotions, new Date(NOW)), 3000);
});

test("stock guard flags no_allocation, invalid_lot, insufficient, and ok", () => {
  const now = new Date(NOW);
  const allocations = new Map([
    ["p1", { allocatedQty: 5, consumedQty: 0, baseVersion: 0, status: "active" as const, expiresAt: null }],
    ["p2::lotX", { allocatedQty: 5, consumedQty: 0, baseVersion: 0, status: "active" as const, expiresAt: "2000-01-01T00:00:00.000Z" }],
  ]);
  const result = validateCartAllocations(
    [
      { productId: "p1", baseQuantity: 3 },
      { productId: "p1", baseQuantity: 4 }, // aggregates to 7 > 5 -> insufficient
      { productId: "p2", lotId: "lotX", baseQuantity: 1 }, // expired lot -> invalid_lot
      { productId: "p9", baseQuantity: 1 }, // no allocation
    ],
    allocations,
    now,
  );
  const reasons = result.violations.map((v) => `${v.productId}:${v.reason}`).sort();
  assert.deepEqual(reasons, ["p1:insufficient", "p2:invalid_lot", "p9:no_allocation"]);
  assert.equal(result.ok, false);

  const okResult = validateCartAllocations([{ productId: "p1", baseQuantity: 5 }], allocations, now);
  assert.equal(okResult.ok, true);
});

// ---- Required test 1: valid cash sale commits sale + outbox atomically ----

test("valid offline cash sale commits local sale + outbox + movement + advances range/lease", async () => {
  const db = await provisionedDb();
  const result = await commitOfflineCashSale(db, baseInput());

  assert.equal(result.duplicate, false);
  assert.equal(result.receiptReference, "GB-01-000001");
  assert.equal(result.sale.totalLak, 10000);
  assert.equal(result.sale.payment.changeLak, 0);
  assert.equal(result.sale.status, "pending");

  const c = await counts(db);
  assert.equal(c.sales, 1);
  assert.equal(c.movements, 1);
  assert.equal(c.outbox, 1);

  const outbox = (await db.readAll<any>(OfflineStore.outbox))[0];
  assert.equal(outbox.envelope.operationType, "pos.sale.complete");
  assert.equal(outbox.status, "pending");

  const range = await readActiveReceiptRange(db);
  assert.equal(range?.nextValue, 2);
  const alloc = await readStockAllocation(db, "p1");
  assert.equal(alloc?.consumedQty, 2);
  assert.equal(alloc?.baseVersion, 1);

  const movement = (await db.readAll<LocalStockMovementEntity>(OfflineStore.inventoryEvents))[0];
  assert.equal(movement.baseQuantity, 2);
  assert.equal(movement.direction, "out");
});

// ---- Required test 2: duplicate submit / reload is idempotent ----

test("duplicate submit and reload create no duplicate sale, receipt, or stock movement", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await provisionedDb(backend);

  const first = await commitOfflineCashSale(db, baseInput());
  const second = await commitOfflineCashSale(db, baseInput()); // same operationId

  assert.equal(second.duplicate, true);
  assert.equal(second.receiptReference, first.receiptReference);

  let c = await counts(db);
  assert.equal(c.sales, 1);
  assert.equal(c.movements, 1);
  assert.equal(c.outbox, 1);
  assert.equal((await readActiveReceiptRange(db))?.nextValue, 2);
  assert.equal((await readStockAllocation(db, "p1"))?.consumedQty, 2);

  // Simulate reload: reopen the SAME database and resubmit.
  db.close();
  const reopened = await OfflineDatabase.open({ namespace: NS, backend });
  const third = await commitOfflineCashSale(reopened, baseInput());
  assert.equal(third.duplicate, true);
  assert.equal(third.receiptReference, first.receiptReference);
  c = await counts(reopened);
  assert.equal(c.sales, 1);
  assert.equal(c.movements, 1);
  assert.equal(c.outbox, 1);
  assert.equal((await readActiveReceiptRange(reopened))?.nextValue, 2);
  assert.equal((await readStockAllocation(reopened, "p1"))?.consumedQty, 2);
});

// ---- Required test 3: missing / closed cash session rejected ----

test("missing or closed cash session is rejected with no write", async () => {
  const db = await provisionedDb();
  await assert.rejects(
    commitOfflineCashSale(db, baseInput({ cashSessionId: "does-not-exist" })),
    NoOpenCashSessionError,
  );
  // Close the session and try again.
  await saveLocalCashSession(db, {
    id: "cs-1", companyId: "co-1", branchId: "br-1", terminalId: "POS-01",
    status: "closed", openedAt: NOW, openingFloatLak: 100000,
  });
  await assert.rejects(commitOfflineCashSale(db, baseInput()), NoOpenCashSessionError);

  const c = await counts(db);
  assert.equal(c.sales, 0);
  assert.equal(c.movements, 0);
  assert.equal(c.outbox, 0);
  assert.equal((await readActiveReceiptRange(db))?.nextValue, 1); // range untouched
  assert.equal((await readStockAllocation(db, "p1"))?.consumedQty, 0);
});

// ---- Required test 4: insufficient allocation / invalid lot rejected, no partial write ----

test("insufficient terminal allocation is rejected with NO partial write", async () => {
  const db = await provisionedDb();
  await assert.rejects(
    commitOfflineCashSale(db, baseInput({ lines: [{ productId: "p1", unitId: "u1", lotId: null, quantity: 50, conversionQty: 1, unitPriceLak: 5000, name: "Water", unitName: "Bottle" }], paidCashLak: 999999 })),
    InsufficientTerminalStockError,
  );
  const c = await counts(db);
  assert.equal(c.sales, 0);
  assert.equal(c.movements, 0);
  assert.equal(c.outbox, 0);
  assert.equal((await readActiveReceiptRange(db))?.nextValue, 1); // no receipt consumed
  assert.equal((await readStockAllocation(db, "p1"))?.consumedQty, 0);
  assert.equal((await readStockAllocation(db, "p1"))?.baseVersion, 0);
});

test("missing allocation and invalid/expired lot are rejected", async () => {
  const db = await provisionedDb();
  // No allocation for p9.
  await assert.rejects(
    commitOfflineCashSale(db, baseInput({ lines: [{ productId: "p9", unitId: null, lotId: null, quantity: 1, conversionQty: 1, unitPriceLak: 1000, name: "X", unitName: "ea" }] })),
    NoTerminalAllocationError,
  );
  // Expired lot-scoped lease -> invalid lot.
  await saveStockAllocation(db, {
    companyId: "co-1", branchId: "br-1", warehouseId: "wh-1", terminalDeviceId: "dev-1",
    productId: "p2", unitId: "u2", lotId: "lotX",
    allocatedQty: 5, consumedQty: 0, baseVersion: 0, status: "active", expiresAt: "2000-01-01T00:00:00.000Z",
  });
  await assert.rejects(
    commitOfflineCashSale(db, baseInput({ lines: [{ productId: "p2", unitId: "u2", lotId: "lotX", quantity: 1, conversionQty: 1, unitPriceLak: 1000, name: "Y", unitName: "ea" }] })),
    InvalidLotError,
  );

  const c = await counts(db);
  assert.equal(c.sales, 0);
  assert.equal(c.outbox, 0);
});

test("insufficient cash payment is rejected", async () => {
  const db = await provisionedDb();
  await assert.rejects(
    commitOfflineCashSale(db, baseInput({ paidCashLak: 5000 })), // total 10000
    InsufficientPaymentError,
  );
});

// ---- Required test 5: receipt snapshot immutable after later price/promotion change ----

test("receipt snapshot is immutable and not recomputed from later price/promotion changes", async () => {
  const db = await provisionedDb();
  const first = await commitOfflineCashSale(db, baseInput());
  assert.equal(first.sale.receiptSnapshot.totalLak, 10000);
  assert.equal(first.sale.receiptSnapshot.lines[0].unitPriceLak, 5000);
  assert.equal(Object.isFrozen(first.sale.receiptSnapshot), true);

  // A LATER sale at a different price / with a promotion must not alter sale 1.
  await commitOfflineCashSale(db, baseInput({
    operationId: "op-sale-2",
    saleId: "sale-2",
    saleNo: "S-2",
    lines: [{ productId: "p1", unitId: "u1", lotId: null, quantity: 1, conversionQty: 1, unitPriceLak: 7000, name: "Water", unitName: "Bottle" }],
    promotions: [{ id: "promo", status: "active", discountPercent: 50 }],
    paidCashLak: 7000,
  }));

  const reloaded = await db.read<LocalSaleEntity>(OfflineStore.sales, "op-sale-1");
  assert.equal(reloaded?.receiptSnapshot.totalLak, 10000);
  assert.equal(reloaded?.receiptSnapshot.lines[0].unitPriceLak, 5000);
  assert.equal(reloaded?.receiptReference, "GB-01-000001");
});

// ---- Required test 6: dependency ordering + tenant/branch/warehouse/terminal isolation ----

test("operation carries dependencies and orders after its cash session open", async () => {
  const db = await provisionedDb();
  const result = await commitOfflineCashSale(db, baseInput({ dependsOn: ["op-cash-open"] }));
  assert.deepEqual(result.envelope.dependencies, ["op-cash-open"]);

  const cashOpen = { operationId: "op-cash-open", sequence: 1, dependencies: [] as string[] };
  const sale = { operationId: result.envelope.operationId, sequence: result.envelope.sequence, dependencies: result.envelope.dependencies };
  const ordered = topologicalOrder([sale, cashOpen]).map((op) => op.operationId);
  assert.deepEqual(ordered, ["op-cash-open", result.envelope.operationId]);
});

test("sales are isolated per company/branch/terminal namespace", async () => {
  const backend = new MemoryOfflineBackend();
  const dbA = await provisionedDb(backend, NS);
  await commitOfflineCashSale(dbA, baseInput());
  assert.equal((await counts(dbA)).sales, 1);

  // A different terminal namespace on the SAME browser backend sees nothing.
  const NS_B = { companyId: "co-1", branchId: "br-1", terminalId: "POS-02" };
  const dbB = await OfflineDatabase.open({ namespace: NS_B, backend });
  assert.equal((await counts(dbB)).sales, 0);

  // And it cannot consume terminal A's lease: provision B with session + range
  // but NO allocation -> the sale is rejected (isolation, no cross-terminal leak).
  await saveLocalCashSession(dbB, { id: "cs-1", companyId: "co-1", branchId: "br-1", terminalId: "POS-02", status: "open", openedAt: NOW, openingFloatLak: 0 });
  await saveReceiptRange(dbB, { companyId: "co-1", branchId: "br-1", terminalDeviceId: "dev-2", prefix: "GB-02-", rangeStart: 1, rangeEnd: 100, nextValue: 1, status: "active" });
  await assert.rejects(
    commitOfflineCashSale(dbB, baseInput({ terminalId: "POS-02" })),
    NoTerminalAllocationError,
  );
  // The committed sale entity carries the correct scope.
  const saleA = (await counts(dbA)).salesList[0];
  assert.equal(saleA.companyId, "co-1");
  assert.equal(saleA.branchId, "br-1");
  assert.equal(saleA.warehouseId, "wh-1");
});
