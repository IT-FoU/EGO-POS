import assert from "node:assert/strict";
import { test } from "node:test";

import { OfflineDatabase } from "../local-db/database";
import { MemoryOfflineBackend } from "../local-db/memory-backend";
import { OfflineStore } from "../local-db/schema";
import { saveReceiptRange, saveStockAllocation, readActiveReceiptRange, readStockAllocation } from "../checkout/terminal-provisioning";
import { saveLocalCashSession } from "../checkout/cash-session-guard";
import { runOfflineCashCheckout, listLocalSales, readLocalSale } from "../checkout/offline-checkout-service";
import { flushOutbox, type PushFetcher } from "../checkout/outbox-flush";
import type { CommitCashSaleInput } from "../checkout/commit-cash-sale";
import type { LocalSaleEntity } from "../checkout/cash-sale-types";
import { applyOfflineCashSale } from "../server/cash-sale-apply";
import { InMemoryCashSaleGateway } from "../server/cash-sale-gateway";
import { offlineCashCheckoutPosPolicy } from "../pos-read/pos-client-props";
import { evaluatePosPermission } from "@/features/pos/permissions";
import type { OutboxRecord } from "../outbox/outbox";
import type { OfflineCashSalePayload } from "../checkout/cash-sale-types";

const NS = { companyId: "co-1", branchId: "br-1", terminalId: "POS-01" };
const NOW = "2026-09-05T00:00:00.000Z";

async function provisionedDb(backend = new MemoryOfflineBackend()) {
  const db = await OfflineDatabase.open({ namespace: NS, backend });
  await saveLocalCashSession(db, { id: "cs-1", companyId: "co-1", branchId: "br-1", terminalId: "POS-01", status: "open", openedAt: NOW, openingFloatLak: 100000 });
  await saveReceiptRange(db, { companyId: "co-1", branchId: "br-1", terminalDeviceId: "dev-1", prefix: "GB-01-", rangeStart: 1, rangeEnd: 1000, nextValue: 1, status: "active" });
  await saveStockAllocation(db, { companyId: "co-1", branchId: "br-1", warehouseId: "wh-1", terminalDeviceId: "dev-1", productId: "p1", unitId: "u1", lotId: null, allocatedQty: 10, consumedQty: 0, baseVersion: 0, status: "active", expiresAt: null });
  return db;
}

function checkoutInput(overrides: Partial<CommitCashSaleInput> = {}): CommitCashSaleInput {
  return {
    operationId: "op-1", companyId: "co-1", branchId: "br-1", warehouseId: "wh-1", terminalId: "POS-01", deviceId: "dev-1", actorUserId: "u-1",
    cashSessionId: "cs-1", saleNo: "S-1",
    lines: [{ productId: "p1", unitId: "u1", lotId: null, quantity: 2, conversionQty: 1, unitPriceLak: 5000, name: "Water", unitName: "Bottle" }],
    taxRatePercent: 0, taxInclusive: false, paidCashLak: 10000, branchName: "Main", cashierName: "Cashier", now: NOW,
    ...overrides,
  };
}

function makeGateway(): InMemoryCashSaleGateway {
  const g = new InMemoryCashSaleGateway();
  g.seedDevice("co-1", "dev-1", { status: "active", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW });
  g.seedActor("co-1", "u-1", { active: true, canSellPos: true });
  g.seedCashSession("co-1", { id: "cs-1", companyId: "co-1", branchId: "br-1", cashierId: "u-1", closedAt: null });
  g.seedReceiptRange("co-1", "dev-1", { id: "range-1", prefix: "GB-01-", rangeStart: 1, rangeEnd: 1000, nextValue: 1, status: "active" });
  g.seedAllocation("co-1", "dev-1", { id: "alloc-1", productId: "p1", lotId: null, allocatedQty: 100, consumedQty: 0, baseVersion: 0, status: "active", expiresAt: null });
  return g;
}

function gatewayPush(gateway: InMemoryCashSaleGateway): PushFetcher {
  return async (envelopes) => {
    const results = [];
    for (const env of envelopes) {
      const decision = await applyOfflineCashSale(
        gateway,
        env.operationId,
        env.payload as OfflineCashSalePayload,
        { companyId: "co-1", branchIds: ["br-1"], warehouseIds: ["wh-1"], terminalId: "POS-01", deviceId: "dev-1", actorUserId: env.actorUserId, cachedPolicyVersion: Number(env.policyVersion ?? 1), now: new Date(NOW) },
        { operationType: env.operationType, payloadHash: env.payloadHash ?? null },
      );
      results.push({ operationId: env.operationId, status: decision.status, code: decision.code, detail: decision.detail, duplicate: decision.duplicate, result: decision.result ?? undefined });
    }
    return results;
  };
}

async function outboxStatus(db: OfflineDatabase, opId: string): Promise<string | undefined> {
  const rec = await db.read<OutboxRecord>(OfflineStore.outbox, opId);
  return rec?.status;
}
async function counts(db: OfflineDatabase) {
  const [sales, movements, outbox] = await Promise.all([
    db.readAll<LocalSaleEntity>(OfflineStore.sales),
    db.readAll(OfflineStore.inventoryEvents),
    db.readAll(OfflineStore.outbox),
  ]);
  return { sales: sales.length, movements: movements.length, outbox: outbox.length };
}

// ---- Test 7: offline policy disables non-cash + unrelated write actions ----

test("offline cash-checkout policy allows only cart edit + cash sale; everything else denied", () => {
  const policy = offlineCashCheckoutPosPolicy({ branchId: "br-1", branchName: "Main", warehouseId: "wh-1", cashierName: "C", terminalId: "POS-01" });
  assert.equal(evaluatePosPermission(policy, "create_sale").allowed, true);
  assert.equal(evaluatePosPermission(policy, "delete_item_from_bill").allowed, true);
  for (const action of ["split_payment", "multi_currency_payment", "hold_bill", "resume_bill", "void_bill", "refund_bill", "apply_discount", "cash_in", "cash_out", "view_recent_sales"] as const) {
    const d = evaluatePosPermission(policy, action);
    assert.equal(d.allowed, false, `${action} must be denied offline`);
    assert.equal(d.approvalRequired, false, `${action} must not open an approval path`);
  }
});

// ---- Test 2: offline cash checkout creates exactly one local pending sale + receipt ----

test("offline cash checkout creates exactly one local pending sale + receipt + outbox op", async () => {
  const db = await provisionedDb();
  const result = await runOfflineCashCheckout(db, checkoutInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.receiptReference, "GB-01-000001");

  const c = await counts(db);
  assert.equal(c.sales, 1);
  assert.equal(c.movements, 1);
  assert.equal(c.outbox, 1);
  const sale = (await listLocalSales(db))[0];
  assert.equal(sale.status, "pending");
  assert.equal(sale.receiptReference, "GB-01-000001");
  assert.equal(await outboxStatus(db, "op-1"), "pending");
});

// ---- Test 3: reload/retry creates no duplicate ----

test("re-submitting the same operationId (reload/retry) creates no duplicate", async () => {
  const backend = new MemoryOfflineBackend();
  const db = await provisionedDb(backend);
  await runOfflineCashCheckout(db, checkoutInput());
  const second = await runOfflineCashCheckout(db, checkoutInput()); // same operationId
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.duplicate, true);
  const c = await counts(db);
  assert.deepEqual([c.sales, c.movements, c.outbox], [1, 1, 1]);
  assert.equal((await readActiveReceiptRange(db))?.nextValue, 2);
  assert.equal((await readStockAllocation(db, "p1"))?.consumedQty, 2);
});

// ---- Test 8: no network write while offline ----

test("flush performs NO network request while offline", async () => {
  const db = await provisionedDb();
  await runOfflineCashCheckout(db, checkoutInput());
  let pushCalls = 0;
  const push: PushFetcher = async () => {
    pushCalls += 1;
    return [];
  };
  const res = await flushOutbox(db, { push, isOnline: () => false });
  assert.equal(res.ran, false);
  assert.equal(res.reason, "offline");
  assert.equal(pushCalls, 0);
  assert.equal(await outboxStatus(db, "op-1"), "pending"); // untouched
});

// ---- Test 4: reconnect flush creates one canonical cloud sale + reconciles ----

test("reconnect flush creates one canonical cloud sale and reconciles local ids (pending -> synced)", async () => {
  const db = await provisionedDb();
  await runOfflineCashCheckout(db, checkoutInput());
  const gateway = makeGateway();

  const res = await flushOutbox(db, { push: gatewayPush(gateway), isOnline: () => true });
  assert.equal(res.accepted, 1);
  assert.equal(gateway.saleCount(), 1);
  assert.equal(await outboxStatus(db, "op-1"), "synced");

  const sale = await readLocalSale(db, "op-1");
  assert.equal(sale?.status, "synced");
  assert.ok(sale?.cloudSaleId && sale.cloudSaleId.startsWith("cloud-sale-"));
});

// ---- Test 5: interrupted response safely retries with the same operationId ----

test("interrupted response is retried with the same operationId (no duplicate cloud sale)", async () => {
  const db = await provisionedDb();
  await runOfflineCashCheckout(db, checkoutInput());
  const gateway = makeGateway();
  const inner = gatewayPush(gateway);
  let calls = 0;
  const flaky: PushFetcher = async (envs) => {
    calls += 1;
    const results = await inner(envs); // server commits on the first call
    if (calls === 1) throw new Error("network dropped after commit");
    return results;
  };

  const first = await flushOutbox(db, { push: flaky, isOnline: () => true });
  assert.equal(first.retried, 1);
  assert.equal(gateway.saleCount(), 1); // committed once server-side
  assert.equal(await outboxStatus(db, "op-1"), "retryable");

  const second = await flushOutbox(db, { push: flaky, isOnline: () => true });
  assert.equal(second.accepted, 1);
  assert.equal(gateway.saleCount(), 1); // still exactly one (idempotent duplicate)
  assert.equal(await outboxStatus(db, "op-1"), "synced");
  assert.equal((await readLocalSale(db, "op-1"))?.status, "synced");
});

// ---- Test 6: rejected sync remains visible and intact locally ----

test("rejected sync marks the local sale rejected but keeps the immutable receipt; no silent retry", async () => {
  const db = await provisionedDb();
  await runOfflineCashCheckout(db, checkoutInput());
  const gateway = makeGateway();
  // Revoke the device server-side so the push is rejected.
  gateway.seedDevice("co-1", "dev-1", { status: "revoked", policyVersion: 1, terminalId: "POS-01", offlineGraceDays: 7, lastPolicySyncAt: NOW });

  const res = await flushOutbox(db, { push: gatewayPush(gateway), isOnline: () => true });
  assert.equal(res.rejected, 1);
  assert.equal(gateway.saleCount(), 0);
  assert.equal(await outboxStatus(db, "op-1"), "rejected");

  const sale = await readLocalSale(db, "op-1");
  assert.equal(sale?.status, "rejected");
  assert.equal(sale?.rejectedReason, "device_revoked");
  // Immutable receipt is preserved (not deleted / not recomputed).
  assert.equal(sale?.receiptReference, "GB-01-000001");
  assert.equal(sale?.receiptSnapshot.totalLak, 10000);

  // A subsequent flush does NOT retry a terminal rejection.
  const again = await flushOutbox(db, { push: gatewayPush(gateway), isOnline: () => true });
  assert.deepEqual([again.accepted, again.rejected, again.retried], [0, 0, 0]);
  assert.equal(await outboxStatus(db, "op-1"), "rejected");
});

// ---- Prevent parallel flush (single-flight) ----

test("a second concurrent flush is skipped (single-flight)", async () => {
  const db = await provisionedDb();
  await runOfflineCashCheckout(db, checkoutInput());
  const gateway = makeGateway();
  let resolveInner: (() => void) | null = null;
  const gate = new Promise<void>((r) => (resolveInner = r));
  const inner = gatewayPush(gateway);
  const slow: PushFetcher = async (envs) => {
    await gate;
    return inner(envs);
  };
  const p1 = flushOutbox(db, { push: slow, isOnline: () => true });
  const p2 = await flushOutbox(db, { push: slow, isOnline: () => true }); // starts while p1 in-flight
  assert.equal(p2.ran, false);
  assert.equal(p2.reason, "already_flushing");
  resolveInner!();
  const r1 = await p1;
  assert.equal(r1.accepted, 1);
  assert.equal(gateway.saleCount(), 1);
});
