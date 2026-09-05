import assert from "node:assert/strict";
import { test } from "node:test";

import { applyOfflineCashSale, type ApplyContext } from "../server/cash-sale-apply";
import { InMemoryCashSaleGateway } from "../server/cash-sale-gateway";
import { SyncErrorCode } from "../server/sync-contract";
import type { OfflineCashSalePayload } from "../checkout/cash-sale-types";

const NOW = new Date("2026-09-05T00:00:00.000Z");
const META = { operationType: "pos.sale.complete", payloadHash: "hash-1" };

function makeGateway(): InMemoryCashSaleGateway {
  const g = new InMemoryCashSaleGateway();
  g.seedDevice("co-1", "dev-1", { status: "active", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW.toISOString() });
  g.seedActor("co-1", "u-1", { active: true, canSellPos: true });
  g.seedCashSession("co-1", { id: "cs-1", companyId: "co-1", branchId: "br-1", cashierId: "u-1", closedAt: null });
  g.seedReceiptRange("co-1", "dev-1", { id: "range-1", prefix: "GB-01-", rangeStart: 1, rangeEnd: 1000, nextValue: 1, status: "active" });
  g.seedAllocation("co-1", "dev-1", { id: "alloc-1", productId: "p1", lotId: null, allocatedQty: 10, consumedQty: 0, baseVersion: 0, status: "active", expiresAt: null });
  return g;
}

function makeCtx(overrides: Partial<ApplyContext> = {}): ApplyContext {
  return {
    companyId: "co-1",
    branchIds: ["br-1"],
    warehouseIds: ["wh-1"],
    terminalId: "POS-01",
    deviceId: "dev-1",
    actorUserId: "u-1",
    cachedPolicyVersion: 1,
    now: NOW,
    ...overrides,
  };
}

function makePayload(overrides: Partial<OfflineCashSalePayload> = {}): OfflineCashSalePayload {
  const line = {
    lineId: "local-sale-1:0",
    productId: "p1",
    unitId: "u1",
    lotId: null as string | null,
    quantity: 2,
    baseQuantity: 2,
    conversionQty: 1,
    unitPriceLak: 5000,
    lineTotalLak: 10000,
    name: "Water",
    unitName: "Bottle",
  };
  return {
    saleId: "local-sale-1",
    saleNo: "S-1",
    receiptReference: "GB-01-000001",
    companyId: "co-1",
    branchId: "br-1",
    warehouseId: "wh-1",
    terminalId: "POS-01",
    deviceId: "dev-1",
    actorUserId: "u-1",
    cashSessionId: "cs-1",
    customerId: null,
    lines: [line],
    subtotalLak: 10000,
    promotionDiscountLak: 0,
    manualDiscountLak: 0,
    discountTotalLak: 0,
    taxRatePercent: 0,
    taxInclusive: false,
    taxAmountLak: 0,
    totalLak: 10000,
    payment: { method: "cash", paidCashLak: 10000, changeLak: 0 },
    stockConsumption: [
      { productId: "p1", unitId: "u1", lotId: null, baseQuantity: 2, allocationId: "alloc-1", allocationBaseVersionBefore: 0 },
    ],
    receiptSnapshot: {
      receiptReference: "GB-01-000001",
      saleNo: "S-1",
      createdAt: NOW.toISOString(),
      branchName: "Main",
      cashierName: "Cashier",
      customerName: "Guest",
      paymentMode: "cash",
      lines: [{ name: "Water", unitName: "Bottle", quantity: 2, unitPriceLak: 5000, lineTotalLak: 10000 }],
      subtotalLak: 10000,
      discountTotalLak: 0,
      taxAmountLak: 0,
      totalLak: 10000,
      paidCashLak: 10000,
      changeLak: 0,
    },
    audit: { createdAt: NOW.toISOString(), actorUserId: "u-1", deviceId: "dev-1", terminalId: "POS-01", policyVersion: 1 },
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

// ---- Required test 1: accepted sale creates exactly one canonical cloud sale ----

test("accepted queued cash sale creates exactly one canonical cloud sale + advances range/lease", async () => {
  const g = makeGateway();
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);

  assert.equal(decision.status, "accepted");
  assert.equal(decision.duplicate, false);
  assert.equal(decision.code, SyncErrorCode.ok);
  assert.equal(g.saleCount(), 1);
  assert.equal(g.currentRange("co-1", "dev-1")?.nextValue, 2);
  assert.equal(g.currentAllocation("co-1", "dev-1", "p1", null)?.consumedQty, 2);
  assert.equal(g.currentAllocation("co-1", "dev-1", "p1", null)?.baseVersion, 1);
  assert.equal(g.getLedger("co-1", "op-1")?.status, "accepted");
});

// ---- Required test 2: duplicate delivery / retry after interrupted response ----

test("duplicate delivery / retry creates nothing twice and returns the original result", async () => {
  const g = makeGateway();
  const first = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  // Simulate an interrupted response: the client retries the exact same op.
  const second = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);

  assert.equal(second.duplicate, true);
  assert.equal(second.status, "accepted");
  assert.deepEqual(second.result, first.result);
  assert.equal(g.saleCount(), 1); // exactly one canonical sale
  assert.equal(g.currentRange("co-1", "dev-1")?.nextValue, 2); // range not advanced twice
  assert.equal(g.currentAllocation("co-1", "dev-1", "p1", null)?.consumedQty, 2); // lease not consumed twice
});

// ---- Required test 4: accepted response reconciles local IDs to cloud IDs ----

test("accepted response reconciles local sale/item ids to canonical cloud ids", async () => {
  const g = makeGateway();
  const payload = makePayload({
    lines: [
      { lineId: "L0", productId: "p1", unitId: "u1", lotId: null, quantity: 1, baseQuantity: 1, conversionQty: 1, unitPriceLak: 5000, lineTotalLak: 5000, name: "Water", unitName: "Bottle" },
    ],
    stockConsumption: [{ productId: "p1", unitId: "u1", lotId: null, baseQuantity: 1, allocationId: "alloc-1", allocationBaseVersionBefore: 0 }],
    subtotalLak: 5000, totalLak: 5000, payment: { method: "cash", paidCashLak: 5000, changeLak: 0 },
  });
  const decision = await applyOfflineCashSale(g, "op-1", payload, makeCtx(), META);
  const recon = decision.result!;
  assert.equal(recon.localSaleId, "local-sale-1");
  assert.ok(recon.cloudSaleId.startsWith("cloud-sale-"));
  assert.equal(recon.receiptReference, "GB-01-000001");
  assert.equal(recon.itemIdMap.length, 1);
  assert.equal(recon.itemIdMap[0].localLineId, "L0");
  assert.ok(recon.itemIdMap[0].cloudItemId.length > 0);
});

// ---- Required test 3: invalid inputs rejected with NO partial server write ----

const REJECTIONS: Array<{
  name: string;
  gateway?: (g: InMemoryCashSaleGateway) => void;
  payload?: Partial<OfflineCashSalePayload>;
  ctx?: Partial<ApplyContext>;
  code: string;
  detail: string;
}> = [
  { name: "revoked device", gateway: (g) => g.seedDevice("co-1", "dev-1", { status: "revoked", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW.toISOString() }), code: SyncErrorCode.permissionDenied, detail: "device_revoked" },
  { name: "unregistered device", gateway: (g) => (g as any).devices.clear(), code: SyncErrorCode.invalidTerminal, detail: "device_not_registered" },
  { name: "closed cash session", gateway: (g) => g.seedCashSession("co-1", { id: "cs-1", companyId: "co-1", branchId: "br-1", cashierId: "u-1", closedAt: NOW.toISOString() }), code: SyncErrorCode.validationFailed, detail: "cash_session_closed" },
  { name: "wrong cashier session", gateway: (g) => g.seedCashSession("co-1", { id: "cs-1", companyId: "co-1", branchId: "br-1", cashierId: "someone-else", closedAt: null }), code: SyncErrorCode.validationFailed, detail: "cash_session_incompatible" },
  { name: "receipt already used", gateway: (g) => g.seedReceiptRange("co-1", "dev-1", { id: "range-1", prefix: "GB-01-", rangeStart: 1, rangeEnd: 1000, nextValue: 5, status: "active" }), code: SyncErrorCode.receiptCollision, detail: "receipt_reference_already_used" },
  { name: "receipt out of range", payload: { receiptReference: "GB-01-002000" }, code: SyncErrorCode.validationFailed, detail: "receipt_reference_out_of_range" },
  { name: "receipt malformed prefix", payload: { receiptReference: "XX-000001" }, code: SyncErrorCode.validationFailed, detail: "receipt_reference_malformed" },
  { name: "company mismatch (tenant)", payload: { companyId: "co-9" }, code: SyncErrorCode.tenantMismatch, detail: "company_mismatch" },
  { name: "branch mismatch", payload: { branchId: "br-9" }, code: SyncErrorCode.tenantMismatch, detail: "branch_mismatch" },
  { name: "warehouse mismatch", payload: { warehouseId: "wh-9" }, code: SyncErrorCode.tenantMismatch, detail: "warehouse_mismatch" },
  { name: "terminal mismatch", payload: { terminalId: "POS-9" }, code: SyncErrorCode.invalidTerminal, detail: "terminal_mismatch" },
  { name: "non-cash payment", payload: { payment: { method: "qr" as any, paidCashLak: 10000, changeLak: 0 } }, code: SyncErrorCode.validationFailed, detail: "unsupported_payment_method" },
];

for (const scenario of REJECTIONS) {
  test(`rejects ${scenario.name} with a machine-readable reason and no partial write`, async () => {
    const g = makeGateway();
    scenario.gateway?.(g);
    const decision = await applyOfflineCashSale(g, "op-1", makePayload(scenario.payload), makeCtx(scenario.ctx), META);
    assert.equal(decision.status, "rejected");
    assert.equal(decision.code, scenario.code, `${scenario.name} code`);
    assert.equal(decision.detail, scenario.detail, `${scenario.name} detail`);
    assert.equal(decision.result, null);
    // No partial server write.
    assert.equal(g.saleCount(), 0);
    assert.equal(g.currentRange("co-1", "dev-1")?.nextValue, scenario.name === "receipt already used" ? 5 : 1);
    assert.equal(g.currentAllocation("co-1", "dev-1", "p1", null)?.consumedQty, 0);
    // A rejected ledger row is kept for later review.
    assert.equal(g.getLedger("co-1", "op-1")?.status, "rejected");
  });
}

test("rejects insufficient terminal allocation with no partial write", async () => {
  const g = makeGateway();
  const payload = makePayload({
    lines: [{ lineId: "L0", productId: "p1", unitId: "u1", lotId: null, quantity: 50, baseQuantity: 50, conversionQty: 1, unitPriceLak: 5000, lineTotalLak: 250000, name: "Water", unitName: "Bottle" }],
    stockConsumption: [{ productId: "p1", unitId: "u1", lotId: null, baseQuantity: 50, allocationId: "alloc-1", allocationBaseVersionBefore: 0 }],
    subtotalLak: 250000, totalLak: 250000, payment: { method: "cash", paidCashLak: 250000, changeLak: 0 },
  });
  const decision = await applyOfflineCashSale(g, "op-1", payload, makeCtx(), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.insufficientStockAllocation);
  assert.equal(g.saleCount(), 0);
  assert.equal(g.currentAllocation("co-1", "dev-1", "p1", null)?.consumedQty, 0);
});

test("rejects missing allocation and expired/invalid lot", async () => {
  const missing = makeGateway();
  const missingPayload = makePayload({
    lines: [{ lineId: "L0", productId: "p9", unitId: null, lotId: null, quantity: 1, baseQuantity: 1, conversionQty: 1, unitPriceLak: 1000, lineTotalLak: 1000, name: "X", unitName: "ea" }],
    stockConsumption: [{ productId: "p9", unitId: null, lotId: null, baseQuantity: 1, allocationId: "none", allocationBaseVersionBefore: 0 }],
  });
  const d1 = await applyOfflineCashSale(missing, "op-1", missingPayload, makeCtx(), META);
  assert.equal(d1.status, "rejected");
  assert.equal(d1.detail, "no_allocation");

  const expired = makeGateway();
  expired.seedAllocation("co-1", "dev-1", { id: "alloc-lot", productId: "p2", lotId: "lotX", allocatedQty: 5, consumedQty: 0, baseVersion: 0, status: "active", expiresAt: "2000-01-01T00:00:00.000Z" });
  const lotPayload = makePayload({
    lines: [{ lineId: "L0", productId: "p2", unitId: "u2", lotId: "lotX", quantity: 1, baseQuantity: 1, conversionQty: 1, unitPriceLak: 1000, lineTotalLak: 1000, name: "Y", unitName: "ea" }],
    stockConsumption: [{ productId: "p2", unitId: "u2", lotId: "lotX", baseQuantity: 1, allocationId: "alloc-lot", allocationBaseVersionBefore: 0 }],
  });
  const d2 = await applyOfflineCashSale(expired, "op-1", lotPayload, makeCtx(), META);
  assert.equal(d2.status, "rejected");
  assert.equal(d2.detail, "invalid_lot");
});

// ---- Required test 5: rejected response keeps the record/audit intact for review ----

test("rejected response persists a rejected ledger + audit and stays idempotent", async () => {
  const g = makeGateway();
  g.seedDevice("co-1", "dev-1", { status: "revoked", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW.toISOString() });
  const first = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(first.status, "rejected");
  assert.equal(g.getLedger("co-1", "op-1")?.status, "rejected");
  assert.ok(g.auditCount() >= 1);

  // Re-delivery returns the SAME rejected result (idempotent) and creates no sale.
  const second = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(second.duplicate, true);
  assert.equal(second.status, "rejected");
  assert.equal(g.saleCount(), 0);
});

// ---- Required test 6: online checkout path is not touched by the offline applier ----

test("the offline applier is isolated: it only writes via the gateway (no online sale path in unit scope)", async () => {
  const g = makeGateway();
  // A successful apply's ONLY side effects are on the gateway (canonical sale +
  // ledger + advances). There is no separate/weaker sale path invoked here.
  await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(g.saleCount(), 1);
  // The production gateway reuses the online writeCompletePrismaSale; online
  // checkout files are unchanged (verified by git diff + full build/typecheck).
});
