import assert from "node:assert/strict";
import { test } from "node:test";

import { applyOfflineCashSale, validateSaleTimestamp, type ApplyContext } from "../server/cash-sale-apply";
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
  const line = { lineId: "local-sale-1:0", productId: "p1", unitId: "u1", lotId: null as string | null, quantity: 2, baseQuantity: 2, conversionQty: 1, unitPriceLak: 5000, lineTotalLak: 10000, name: "Water", unitName: "Bottle" };
  return {
    saleId: "local-sale-1", saleNo: "S-1", receiptReference: "GB-01-000001",
    companyId: "co-1", branchId: "br-1", warehouseId: "wh-1", terminalId: "POS-01", deviceId: "dev-1", actorUserId: "u-1",
    cashSessionId: "cs-1", customerId: null, lines: [line],
    subtotalLak: 10000, promotionDiscountLak: 0, manualDiscountLak: 0, discountTotalLak: 0,
    taxRatePercent: 0, taxInclusive: false, taxAmountLak: 0, totalLak: 10000,
    payment: { method: "cash", paidCashLak: 10000, changeLak: 0 },
    stockConsumption: [{ productId: "p1", unitId: "u1", lotId: null, baseQuantity: 2, allocationId: "alloc-1", allocationBaseVersionBefore: 0 }],
    receiptSnapshot: {
      receiptReference: "GB-01-000001", saleNo: "S-1", createdAt: NOW.toISOString(), branchName: "Main", cashierName: "Cashier", customerName: "Guest", paymentMode: "cash",
      lines: [{ name: "Water", unitName: "Bottle", quantity: 2, unitPriceLak: 5000, lineTotalLak: 10000 }],
      subtotalLak: 10000, discountTotalLak: 0, taxAmountLak: 0, totalLak: 10000, paidCashLak: 10000, changeLak: 0,
    },
    audit: { createdAt: NOW.toISOString(), actorUserId: "u-1", deviceId: "dev-1", terminalId: "POS-01", policyVersion: 1 },
    createdAt: NOW.toISOString(),
    ...overrides,
  };
}

function assertNoWrite(g: InMemoryCashSaleGateway): void {
  assert.equal(g.saleCount(), 0);
  assert.equal(g.currentRange("co-1", "dev-1")?.nextValue, 1);
  assert.equal(g.currentAllocation("co-1", "dev-1", "p1", null)?.consumedQty, 0);
  assert.equal(g.getLedger("co-1", "op-1")?.status, "rejected");
}

// ---- Pure timestamp validator ----

test("sale timestamp validator flags future-dated and out-of-window sales", () => {
  assert.equal(validateSaleTimestamp(NOW.toISOString(), 7, NOW).ok, true);
  const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(); // +1h
  const f = validateSaleTimestamp(future, 7, NOW);
  assert.equal(f.ok, false);
  assert.equal((f as any).detail, "future_dated_sale");
  const old = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(); // -30d
  const o = validateSaleTimestamp(old, 7, NOW);
  assert.equal(o.ok, false);
  assert.equal((o as any).detail, "sale_outside_offline_window");
  // Small skew within tolerance is accepted.
  const skew = new Date(NOW.getTime() + 60 * 1000).toISOString(); // +1min
  assert.equal(validateSaleTimestamp(skew, 7, NOW).ok, true);
});

// ---- Required test 1: disabled cashier ----

test("disabled cashier is rejected with no write", async () => {
  const g = makeGateway();
  g.seedActor("co-1", "u-1", { active: false, canSellPos: true });
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.permissionDenied);
  assert.equal(decision.detail, "user_disabled");
  assertNoWrite(g);
});

test("cashier without POS-sale permission is rejected", async () => {
  const g = makeGateway();
  g.seedActor("co-1", "u-1", { active: true, canSellPos: false });
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.permissionDenied);
  assert.equal(decision.detail, "permission_denied");
  assertNoWrite(g);
});

// ---- Required test 2: stale policy version ----

test("stale cached policy version is rejected with no write", async () => {
  const g = makeGateway();
  g.seedDevice("co-1", "dev-1", { status: "active", policyVersion: 3, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW.toISOString() });
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx({ cachedPolicyVersion: 1 }), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.stalePolicy);
  assert.equal(decision.detail, "policy_stale");
  assertNoWrite(g);
});

// ---- Required test 3: expired offline grace ----

test("expired offline grace window is rejected with no write", async () => {
  const g = makeGateway();
  g.seedDevice("co-1", "dev-1", { status: "active", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: "2026-08-01T00:00:00.000Z" });
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.stalePolicy);
  assert.equal(decision.detail, "grace_expired");
  assertNoWrite(g);
});

// ---- Required test 4: revoked device ----

test("revoked device is rejected with no write", async () => {
  const g = makeGateway();
  g.seedDevice("co-1", "dev-1", { status: "revoked", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW.toISOString() });
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.permissionDenied);
  assert.equal(decision.detail, "device_revoked");
  assertNoWrite(g);
});

test("device not bound to the terminal is rejected", async () => {
  const g = makeGateway();
  g.seedDevice("co-1", "dev-1", { status: "active", policyVersion: 1, terminalId: "POS-99", offlineGraceDays: 7, lastPolicySyncAt: NOW.toISOString() });
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.invalidTerminal);
  assert.equal(decision.detail, "device_terminal_unbound");
  assertNoWrite(g);
});

// ---- Required test 5: future-dated sale ----

test("materially future-dated sale is rejected with no write", async () => {
  const g = makeGateway();
  const future = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(); // +1 day
  const decision = await applyOfflineCashSale(g, "op-1", makePayload({ createdAt: future }), makeCtx(), META);
  assert.equal(decision.status, "rejected");
  assert.equal(decision.code, SyncErrorCode.validationFailed);
  assert.equal(decision.detail, "future_dated_sale");
  assertNoWrite(g);
});

// ---- Required test 6: valid policy path still accepts exactly one sale ----

test("valid authorization path still accepts exactly one canonical sale", async () => {
  const g = makeGateway();
  const decision = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(decision.status, "accepted");
  assert.equal(decision.code, SyncErrorCode.ok);
  assert.equal(g.saleCount(), 1);
  assert.equal(g.getLedger("co-1", "op-1")?.status, "accepted");
});

// ---- Idempotency preserved: repeat returns stored result, no re-validation ----

test("idempotency: a repeat of a rejected auth op returns the stored result without re-running", async () => {
  const g = makeGateway();
  g.seedActor("co-1", "u-1", { active: false, canSellPos: true });
  const first = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(first.status, "rejected");

  // Even if the actor is later re-enabled, the stored rejection is returned as-is.
  g.seedActor("co-1", "u-1", { active: true, canSellPos: true });
  const second = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(second.duplicate, true);
  assert.equal(second.status, "rejected");
  assert.equal(g.saleCount(), 0);
});

test("idempotency: a repeat of an accepted op returns the stored result, no second sale", async () => {
  const g = makeGateway();
  const first = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(first.status, "accepted");
  // Revoke the device afterwards; the accepted op must still return accepted.
  g.seedDevice("co-1", "dev-1", { status: "revoked", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW.toISOString() });
  const second = await applyOfflineCashSale(g, "op-1", makePayload(), makeCtx(), META);
  assert.equal(second.duplicate, true);
  assert.equal(second.status, "accepted");
  assert.deepEqual(second.result, first.result);
  assert.equal(g.saleCount(), 1);
});
