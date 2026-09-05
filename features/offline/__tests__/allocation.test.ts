import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allocateNextReceipt,
  canAllocateReceipt,
  formatReceiptReference,
  receiptRangeRemaining,
  ReceiptRangeExhaustedError,
  type ReceiptRangeView,
} from "../server/receipt-range";
import {
  canConsume,
  consumeAllocation,
  InsufficientTerminalStockError,
  remainingSellable,
  type StockAllocationView,
} from "../server/stock-allocation";
import {
  applyRedemption,
  canRedeem,
  LoyaltyAllowanceError,
  remainingPoints,
  type LoyaltyAllowanceView,
} from "../server/loyalty-allowance";

const NOW = new Date("2026-09-05T00:00:00.000Z");

// ---- receipt ranges ----

function range(overrides: Partial<ReceiptRangeView> = {}): ReceiptRangeView {
  return { prefix: "GB-01-", rangeStart: 1, rangeEnd: 3, nextValue: 1, status: "active", ...overrides };
}

test("receipt reference formats with zero padding", () => {
  assert.equal(formatReceiptReference("GB-01-", 42), "GB-01-000042");
});

test("receipt range remaining + allocation advances without reuse", () => {
  let r = range();
  assert.equal(receiptRangeRemaining(r), 3);
  const a1 = allocateNextReceipt(r);
  assert.equal(a1.reference, "GB-01-000001");
  r = a1.next;
  const a2 = allocateNextReceipt(r);
  assert.equal(a2.value, 2);
  r = a2.next;
  const a3 = allocateNextReceipt(r);
  assert.equal(a3.value, 3);
  r = a3.next;
  assert.equal(r.status, "exhausted");
  assert.equal(canAllocateReceipt(r), false);
  assert.throws(() => allocateNextReceipt(r), ReceiptRangeExhaustedError);
});

// ---- terminal stock allocation ----

function alloc(overrides: Partial<StockAllocationView> = {}): StockAllocationView {
  return { allocatedQty: 10, consumedQty: 0, baseVersion: 0, status: "active", expiresAt: null, ...overrides };
}

test("remaining sellable respects allocated minus consumed", () => {
  assert.equal(remainingSellable(alloc({ consumedQty: 3 }), NOW), 7);
  assert.equal(canConsume(alloc({ consumedQty: 3 }), 7, NOW), true);
  assert.equal(canConsume(alloc({ consumedQty: 3 }), 8, NOW), false);
});

test("expired allocation is not sellable", () => {
  const expired = alloc({ expiresAt: "2026-09-04T00:00:00.000Z" });
  assert.equal(remainingSellable(expired, NOW), 0);
});

test("consume advances consumed + version and exhausts", () => {
  const first = consumeAllocation(alloc(), 4, 0, NOW);
  assert.equal(first.consumedQty, 4);
  assert.equal(first.baseVersion, 1);
  assert.equal(first.status, "active");
  const rest = consumeAllocation(first, 6, 1, NOW);
  assert.equal(rest.status, "exhausted");
});

test("consume rejects oversell and stale version", () => {
  assert.throws(() => consumeAllocation(alloc(), 11, 0, NOW), InsufficientTerminalStockError);
  assert.throws(() => consumeAllocation(alloc(), 1, 5, NOW), /Stale terminal stock allocation/);
});

// ---- loyalty allowance ----

function allowance(overrides: Partial<LoyaltyAllowanceView> = {}): LoyaltyAllowanceView {
  return {
    maxPoints: 100,
    usedPoints: 0,
    maxAmountLak: 50000,
    usedAmountLak: 0,
    status: "active",
    expiresAt: null,
    ...overrides,
  };
}

test("redemption blocked without an allowance", () => {
  assert.equal(canRedeem(null, { points: 10, amountLak: 1000 }, NOW), false);
});

test("redemption respects point and amount caps", () => {
  assert.equal(remainingPoints(allowance(), NOW), 100);
  assert.equal(canRedeem(allowance(), { points: 100, amountLak: 50000 }, NOW), true);
  assert.equal(canRedeem(allowance(), { points: 101, amountLak: 1000 }, NOW), false);
  assert.equal(canRedeem(allowance(), { points: 10, amountLak: 60000 }, NOW), false);
});

test("expired allowance blocks redemption", () => {
  const expired = allowance({ expiresAt: "2026-09-04T00:00:00.000Z" });
  assert.equal(canRedeem(expired, { points: 10, amountLak: 1000 }, NOW), false);
});

test("applyRedemption advances usage and prevents double-spend", () => {
  const after = applyRedemption(allowance(), { points: 100, amountLak: 50000 }, NOW);
  assert.equal(after.usedPoints, 100);
  assert.equal(after.status, "used");
  assert.throws(() => applyRedemption(after, { points: 1, amountLak: 1 }, NOW), LoyaltyAllowanceError);
});
