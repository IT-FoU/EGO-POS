/**
 * Authoritative server application for offline CASH sales (Phase 6B).
 *
 * `applyOfflineCashSale` is the server-side handler for an accepted
 * `pos.sale.complete` operation. It:
 *   1. is idempotent by companyId + operationId (a duplicate returns the original
 *      accepted result and performs NO new writes);
 *   2. validates device, tenant/branch/warehouse/terminal scope, the referenced
 *      active-compatible cloud cash session, the terminal-reserved receipt
 *      reference, and the terminal stock allocation + lot/expiry;
 *   3. on success, commits the canonical cloud sale (+ items + cash payment +
 *      stock movement + receipt + audit), advances the receipt range + leases,
 *      and records the accepted OfflineOperation + local→cloud id mapping — ALL
 *      in one authoritative transaction (owned by the {@link CashSaleGateway});
 *   4. on failure, records a rejected OfflineOperation with a precise
 *      machine-readable reason and NEVER creates or alters a sale.
 *
 * Persistence + the canonical online sale/stock/receipt/audit logic live behind
 * the gateway so this orchestration is deterministically testable (in-memory)
 * and production reuses the existing online write path (no parallel sale path).
 *
 * CASH only.
 */

import { SyncErrorCode, type SyncErrorCodeValue } from "./sync-contract";
import {
  consumeAllocation,
  InsufficientTerminalStockError,
  isAllocationActive,
  type StockAllocationView,
} from "./stock-allocation";
import type { ReceiptRangeView } from "./receipt-range";
import {
  evaluateOfflineWriteAuthorization,
  type DeviceAuthzView,
} from "./authorization";
import { DEFAULT_OFFLINE_GRACE_DAYS, OfflineDenyReason, type OfflineDenyReasonValue, type TerminalDeviceStatus } from "./types";
import type { OfflineCashSalePayload } from "../checkout/cash-sale-types";

/** Max clock skew tolerated for a sale timestamp ahead of server time (5 min). */
export const MAX_FUTURE_SALE_SKEW_MS = 5 * 60 * 1000;

// ---- Authoritative reference views the gateway supplies ----

export interface CloudDeviceView {
  status: TerminalDeviceStatus; // "pending" | "active" | "revoked"
  policyVersion: number;
  /** The terminal this device is registered/bound to. */
  terminalId: string;
  offlineGraceDays: number;
  /** ISO timestamp of the last successful security/policy sync, if any. */
  lastPolicySyncAt: string | null;
}

/** The acting cashier's current account state. */
export interface CloudActorView {
  /** Account still enabled. */
  active: boolean;
  /** Still holds the POS sale permission. */
  canSellPos: boolean;
}

export interface CloudCashSessionView {
  id: string;
  companyId: string;
  branchId: string;
  cashierId: string;
  closedAt: string | null;
}

export interface CloudReceiptRangeView extends ReceiptRangeView {
  id: string;
}

export interface CloudAllocationView extends StockAllocationView {
  id: string;
  productId: string;
  lotId: string | null;
}

/** Local→cloud reconciliation mapping returned on acceptance. */
export interface CashSaleReconciliation {
  status: "accepted";
  localSaleId: string;
  cloudSaleId: string;
  saleNo: string;
  receiptNo: string;
  receiptReference: string;
  totalLak: number;
  itemIdMap: Array<{ localLineId: string; cloudItemId: string }>;
}

export interface StoredCashSaleResult {
  status: "accepted" | "rejected";
  code: SyncErrorCodeValue;
  detail: string | null;
  result: CashSaleReconciliation | null;
}

/** Advances computed by validation and applied atomically by the gateway. */
export interface ReceiptRangeAdvance {
  id: string;
  nextValue: number;
  status: string;
}

export interface AllocationAdvance {
  id: string;
  consumedQty: number;
  baseVersion: number;
  status: string;
}

export interface AcceptedCommitInput {
  companyId: string;
  operationId: string;
  deviceId: string;
  actorUserId: string;
  payload: OfflineCashSalePayload;
  receiptRangeAdvance: ReceiptRangeAdvance;
  allocationAdvances: AllocationAdvance[];
}

export interface RejectedRecordInput {
  companyId: string;
  operationId: string;
  deviceId: string;
  actorUserId: string;
  operationType: string;
  payloadHash: string | null;
  code: SyncErrorCodeValue;
  detail: string;
}

/**
 * The authoritative persistence + sale-application boundary. The production
 * implementation reuses the existing online sale write path and Prisma models;
 * the in-memory implementation simulates the same atomic semantics for tests.
 */
export interface CashSaleGateway {
  getExistingResult(companyId: string, operationId: string): Promise<StoredCashSaleResult | null>;
  getDevice(companyId: string, deviceId: string): Promise<CloudDeviceView | null>;
  getActor(companyId: string, userId: string): Promise<CloudActorView | null>;
  getCashSession(companyId: string, sessionId: string): Promise<CloudCashSessionView | null>;
  getReceiptRange(companyId: string, deviceId: string): Promise<CloudReceiptRangeView | null>;
  getAllocation(
    companyId: string,
    deviceId: string,
    productId: string,
    lotId: string | null,
  ): Promise<CloudAllocationView | null>;
  /** Atomic: canonical sale + advances + accepted ledger. Returns reconciliation. */
  commitAccepted(input: AcceptedCommitInput): Promise<CashSaleReconciliation>;
  /** Atomic: rejected ledger row only (no sale). */
  recordRejected(input: RejectedRecordInput): Promise<void>;
}

export interface ApplyContext {
  companyId: string;
  /** Branches this device is permitted to write for (from the resolved scope). */
  branchIds: string[];
  warehouseIds: string[];
  terminalId: string;
  deviceId: string;
  actorUserId: string;
  /** Policy version the device had cached when the op was created (envelope). */
  cachedPolicyVersion: number;
  now: Date;
}

export interface CashSaleDecision {
  status: "accepted" | "rejected";
  code: SyncErrorCodeValue;
  detail: string | null;
  duplicate: boolean;
  result: CashSaleReconciliation | null;
}

class RejectSale {
  constructor(
    public readonly code: SyncErrorCodeValue,
    public readonly detail: string,
  ) {}
}

function authzReasonToCode(reason: OfflineDenyReasonValue): SyncErrorCodeValue {
  switch (reason) {
    case OfflineDenyReason.policyStale:
    case OfflineDenyReason.graceExpired:
      return SyncErrorCode.stalePolicy;
    case OfflineDenyReason.deviceNotFound:
    case OfflineDenyReason.terminalMismatch:
      return SyncErrorCode.invalidTerminal;
    default:
      return SyncErrorCode.permissionDenied;
  }
}

/**
 * The offline sale timestamp must be within the allowed offline window and must
 * not be materially future-dated (guards a tampered/mis-set device clock).
 */
export function validateSaleTimestamp(
  createdAt: string,
  graceDays: number,
  now: Date,
): { ok: true } | { ok: false; code: SyncErrorCodeValue; detail: string } {
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) {
    return { ok: false, code: SyncErrorCode.validationFailed, detail: "sale_timestamp_invalid" };
  }
  if (t > now.getTime() + MAX_FUTURE_SALE_SKEW_MS) {
    return { ok: false, code: SyncErrorCode.validationFailed, detail: "future_dated_sale" };
  }
  const ageDays = (now.getTime() - t) / (24 * 60 * 60 * 1000);
  if (ageDays > (graceDays ?? DEFAULT_OFFLINE_GRACE_DAYS)) {
    return { ok: false, code: SyncErrorCode.stalePolicy, detail: "sale_outside_offline_window" };
  }
  return { ok: true };
}

function parseReceiptValue(reference: string, prefix: string): number | null {
  if (!reference.startsWith(prefix)) return null;
  const suffix = reference.slice(prefix.length);
  if (!/^\d+$/.test(suffix)) return null;
  return Number(suffix);
}

/**
 * Validate a client-allocated receipt reference against the terminal's reserved
 * range. It must parse under the reserved prefix, fall within [start, end], the
 * range must be active, and it must not be behind the range cursor (already
 * consumed → collision). Returns the advanced range cursor.
 */
export function validateReceiptReference(
  range: CloudReceiptRangeView,
  reference: string,
): { ok: true; value: number; advance: ReceiptRangeAdvance } | { ok: false; code: SyncErrorCodeValue; detail: string } {
  if (range.status !== "active") {
    return { ok: false, code: SyncErrorCode.receiptCollision, detail: "receipt_range_inactive" };
  }
  const value = parseReceiptValue(reference, range.prefix);
  if (value === null) {
    return { ok: false, code: SyncErrorCode.validationFailed, detail: "receipt_reference_malformed" };
  }
  if (value < range.rangeStart || value > range.rangeEnd) {
    return { ok: false, code: SyncErrorCode.validationFailed, detail: "receipt_reference_out_of_range" };
  }
  if (value < range.nextValue) {
    // Already consumed by an earlier sale — never reissue a printed number.
    return { ok: false, code: SyncErrorCode.receiptCollision, detail: "receipt_reference_already_used" };
  }
  const nextValue = value + 1;
  return {
    ok: true,
    value,
    advance: {
      id: range.id,
      nextValue,
      status: nextValue > range.rangeEnd ? "exhausted" : "active",
    },
  };
}

/** The referenced session must be the correct active compatible cloud session. */
export function validateCashSession(
  session: CloudCashSessionView | null,
  ctx: { companyId: string; branchId: string; actorUserId: string },
): { ok: true } | { ok: false; code: SyncErrorCodeValue; detail: string } {
  if (!session) return { ok: false, code: SyncErrorCode.validationFailed, detail: "cash_session_not_found" };
  if (session.closedAt !== null) return { ok: false, code: SyncErrorCode.validationFailed, detail: "cash_session_closed" };
  if (
    session.companyId !== ctx.companyId ||
    session.branchId !== ctx.branchId ||
    session.cashierId !== ctx.actorUserId
  ) {
    return { ok: false, code: SyncErrorCode.validationFailed, detail: "cash_session_incompatible" };
  }
  return { ok: true };
}

function assertScope(payload: OfflineCashSalePayload, ctx: ApplyContext): void {
  if (payload.companyId !== ctx.companyId) {
    throw new RejectSale(SyncErrorCode.tenantMismatch, "company_mismatch");
  }
  if (!ctx.branchIds.includes(payload.branchId)) {
    throw new RejectSale(SyncErrorCode.tenantMismatch, "branch_mismatch");
  }
  if (payload.terminalId !== ctx.terminalId || payload.deviceId !== ctx.deviceId) {
    throw new RejectSale(SyncErrorCode.invalidTerminal, "terminal_mismatch");
  }
  if (payload.actorUserId !== ctx.actorUserId) {
    throw new RejectSale(SyncErrorCode.permissionDenied, "actor_mismatch");
  }
  if (payload.warehouseId !== null && !ctx.warehouseIds.includes(payload.warehouseId)) {
    throw new RejectSale(SyncErrorCode.tenantMismatch, "warehouse_mismatch");
  }
}

export async function applyOfflineCashSale(
  gateway: CashSaleGateway,
  operationId: string,
  payload: OfflineCashSalePayload,
  ctx: ApplyContext,
  meta: { operationType: string; payloadHash: string | null },
): Promise<CashSaleDecision> {
  // 0) Idempotency: a duplicate returns the original result, no new writes.
  const existing = await gateway.getExistingResult(ctx.companyId, operationId);
  if (existing) {
    return {
      status: existing.status,
      code: existing.code,
      detail: existing.detail,
      duplicate: true,
      result: existing.result,
    };
  }

  try {
    // 1) CASH only.
    if (payload.payment.method !== "cash") {
      throw new RejectSale(SyncErrorCode.validationFailed, "unsupported_payment_method");
    }

    // 2) Tenant / branch / warehouse / terminal / actor scope.
    assertScope(payload, ctx);

    // 3) Device: registered AND bound to this terminal.
    const device = await gateway.getDevice(ctx.companyId, ctx.deviceId);
    if (!device) throw new RejectSale(SyncErrorCode.invalidTerminal, "device_not_registered");
    if (device.terminalId !== ctx.terminalId || device.terminalId !== payload.terminalId) {
      throw new RejectSale(SyncErrorCode.invalidTerminal, "device_terminal_unbound");
    }

    // 4) Cashier actor must still exist, be active, and hold POS-sale permission;
    //    device status + cached policy version + offline grace must be valid.
    const actor = await gateway.getActor(ctx.companyId, ctx.actorUserId);
    if (!actor) throw new RejectSale(SyncErrorCode.permissionDenied, "actor_not_found");
    const deviceView: DeviceAuthzView = {
      status: device.status,
      policyVersion: device.policyVersion,
      offlineGraceDays: device.offlineGraceDays,
      lastPolicySyncAt: device.lastPolicySyncAt,
    };
    const authz = evaluateOfflineWriteAuthorization({
      device: deviceView,
      cachedPolicyVersion: ctx.cachedPolicyVersion,
      permissionGranted: actor.canSellPos,
      userEnabled: actor.active,
      now: ctx.now,
    });
    if (!authz.allowed) throw new RejectSale(authzReasonToCode(authz.reason), authz.reason);

    // 5) Sale timestamp within the allowed offline window, not future-dated.
    const timestampCheck = validateSaleTimestamp(payload.createdAt, device.offlineGraceDays, ctx.now);
    if (!timestampCheck.ok) throw new RejectSale(timestampCheck.code, timestampCheck.detail);

    // 6) Referenced cash session must be the correct active compatible session.
    const session = await gateway.getCashSession(ctx.companyId, payload.cashSessionId);
    const sessionCheck = validateCashSession(session, {
      companyId: ctx.companyId,
      branchId: payload.branchId,
      actorUserId: ctx.actorUserId,
    });
    if (!sessionCheck.ok) throw new RejectSale(sessionCheck.code, sessionCheck.detail);

    // 5) Terminal-reserved receipt reference.
    const range = await gateway.getReceiptRange(ctx.companyId, ctx.deviceId);
    if (!range) throw new RejectSale(SyncErrorCode.validationFailed, "no_receipt_range");
    const receiptCheck = validateReceiptReference(range, payload.receiptReference);
    if (!receiptCheck.ok) throw new RejectSale(receiptCheck.code, receiptCheck.detail);

    // 6) Terminal stock allocation + lot/expiry (aggregate per lease).
    const requested = new Map<string, { productId: string; lotId: string | null; baseQuantity: number }>();
    for (const consumption of payload.stockConsumption) {
      const key = `${consumption.productId}::${consumption.lotId ?? ""}`;
      const agg = requested.get(key);
      if (agg) agg.baseQuantity += consumption.baseQuantity;
      else requested.set(key, { productId: consumption.productId, lotId: consumption.lotId, baseQuantity: consumption.baseQuantity });
    }
    const allocationAdvances: AllocationAdvance[] = [];
    for (const req of requested.values()) {
      const alloc = await gateway.getAllocation(ctx.companyId, ctx.deviceId, req.productId, req.lotId);
      if (!alloc) throw new RejectSale(SyncErrorCode.validationFailed, "no_allocation");
      if (req.lotId && !isAllocationActive(alloc, ctx.now)) {
        throw new RejectSale(SyncErrorCode.validationFailed, "invalid_lot");
      }
      try {
        const next = consumeAllocation(alloc, req.baseQuantity, alloc.baseVersion, ctx.now);
        allocationAdvances.push({
          id: alloc.id,
          consumedQty: next.consumedQty,
          baseVersion: next.baseVersion,
          status: next.status,
        });
      } catch (error) {
        if (error instanceof InsufficientTerminalStockError) {
          throw new RejectSale(SyncErrorCode.insufficientStockAllocation, "insufficient_stock_allocation");
        }
        throw new RejectSale(SyncErrorCode.staleVersion, "stale_allocation_version");
      }
    }

    // 7) Commit the canonical sale + advances + accepted ledger atomically.
    const reconciliation = await gateway.commitAccepted({
      companyId: ctx.companyId,
      operationId,
      deviceId: ctx.deviceId,
      actorUserId: ctx.actorUserId,
      payload,
      receiptRangeAdvance: receiptCheck.advance,
      allocationAdvances,
    });

    return { status: "accepted", code: SyncErrorCode.ok, detail: null, duplicate: false, result: reconciliation };
  } catch (error) {
    if (error instanceof RejectSale) {
      await gateway.recordRejected({
        companyId: ctx.companyId,
        operationId,
        deviceId: ctx.deviceId,
        actorUserId: ctx.actorUserId,
        operationType: meta.operationType,
        payloadHash: meta.payloadHash,
        code: error.code,
        detail: error.detail,
      });
      return { status: "rejected", code: error.code, detail: error.detail, duplicate: false, result: null };
    }
    throw error;
  }
}
