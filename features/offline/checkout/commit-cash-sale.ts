/**
 * Atomic offline CASH-sale commit (Phase 6A).
 *
 * `commitOfflineCashSale` writes the local sale (+ items + cash payment +
 * immutable receipt snapshot + audit), the terminal stock-consumption movements,
 * the advanced receipt range, the advanced stock leases, AND the queued operation
 * envelope + outbox record — all inside ONE transaction. Either everything
 * commits or nothing does.
 *
 * Idempotency: keyed by `operationId`. A retry/reload with the same operationId
 * returns the ALREADY-committed sale and performs NO new writes, so it can never
 * create a duplicate sale, duplicate receipt reference, or duplicate stock
 * movement.
 *
 * Scope: CASH sales only. No QR/transfer/card, no refund/void/return/hold, no
 * cash movement, no sync application. The cloud remains the final authority and
 * re-validates every amount + stock effect on sync.
 */

import { OfflineDatabase } from "../local-db/database";
import { OfflineStore } from "../local-db/schema";
import type { OfflineBackendTransaction } from "../local-db/backend";
import {
  buildOperationEnvelope,
  type OfflineOperationEnvelope,
} from "../operations/envelope";
import { createOutboxRecord, getOutboxRecord, type OutboxRecord } from "../outbox/outbox";
import { OperationType } from "../types";
import type { BaseLocalEntity, EntitySource } from "../types";
import {
  allocateNextReceipt,
  type ReceiptRangeView,
} from "../server/receipt-range";
import {
  consumeAllocation,
  isAllocationActive,
} from "../server/stock-allocation";
import {
  cashChangeLak,
  cashCovers,
  computeSaleTotals,
  lineBaseQuantity,
  lineTotalLak,
  type SafePromotion,
} from "./cart-math";
import {
  txReadReceiptRange,
  txReadStockAllocation,
  type LocalReceiptRangeRecord,
  type LocalStockAllocationRecord,
} from "./terminal-provisioning";
import {
  isCompatibleOpenSession,
  NoOpenCashSessionError,
  txReadCashSession,
} from "./cash-session-guard";
import type {
  LocalSaleEntity,
  LocalStockMovementEntity,
  OfflineCashPayment,
  OfflineCashSalePayload,
  OfflineReceiptSnapshot,
  OfflineSaleLine,
  OfflineStockConsumption,
} from "./cash-sale-types";

export class NoTerminalAllocationError extends Error {
  constructor(public readonly productId: string, lotId: string | null) {
    super(`No terminal stock allocation for product ${productId}${lotId ? ` lot ${lotId}` : ""}`);
    this.name = "NoTerminalAllocationError";
  }
}

export class InvalidLotError extends Error {
  constructor(public readonly productId: string, public readonly lotId: string) {
    super(`Invalid or expired lot ${lotId} for product ${productId}`);
    this.name = "InvalidLotError";
  }
}

export class InsufficientPaymentError extends Error {
  constructor(public readonly totalLak: number, public readonly paidCashLak: number) {
    super(`Insufficient cash payment: paid ${paidCashLak}, required ${totalLak}`);
    this.name = "InsufficientPaymentError";
  }
}

/** A cart line as supplied to checkout. */
export interface CashSaleLineInput {
  productId: string;
  unitId?: string | null;
  lotId?: string | null;
  quantity: number;
  conversionQty?: number;
  unitPriceLak: number;
  name: string;
  unitName: string;
}

export interface CommitCashSaleInput {
  /** Idempotency key. Reusing it returns the prior sale with no new writes. */
  operationId: string;
  companyId: string;
  branchId: string;
  warehouseId: string | null;
  terminalId: string;
  deviceId: string;
  actorUserId: string;
  policyVersion?: number | null;
  cashSessionId: string;
  customerId?: string | null;
  saleId?: string;
  saleNo: string;
  lines: CashSaleLineInput[];
  taxRatePercent: number;
  taxInclusive: boolean;
  manualDiscountLak?: number;
  promotions?: SafePromotion[];
  paidCashLak: number;
  /** Receipt-snapshot context (denormalized, non-secret). */
  branchName: string;
  cashierName: string;
  customerName?: string;
  /** operationIds this sale depends on (e.g. the cash.session.open op). */
  dependsOn?: string[];
  now?: string;
}

export interface CommitCashSaleResult {
  duplicate: boolean;
  sale: LocalSaleEntity;
  receiptReference: string;
  movements: LocalStockMovementEntity[];
  envelope: OfflineOperationEnvelope<OfflineCashSalePayload>;
  outbox: OutboxRecord;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function baseFields(
  id: string,
  companyId: string,
  branchId: string | null,
  warehouseId: string | null,
  source: EntitySource,
  now: string,
): BaseLocalEntity {
  return {
    id,
    companyId,
    branchId,
    warehouseId,
    updatedAt: null,
    localUpdatedAt: now,
    localVersion: 1,
    serverVersion: null,
    syncStatus: "pending_create",
    deleted: false,
    source,
  };
}

const TOUCHED_STORES = [
  OfflineStore.meta,
  OfflineStore.outbox,
  OfflineStore.sales,
  OfflineStore.inventoryEvents,
  OfflineStore.cashSessions,
  OfflineStore.receiptRanges,
  OfflineStore.stockAllocations,
];

export async function commitOfflineCashSale(
  db: OfflineDatabase,
  input: CommitCashSaleInput,
): Promise<CommitCashSaleResult> {
  const now = input.now ?? new Date().toISOString();
  const nowDate = new Date(now);
  const saleId = input.saleId ?? input.operationId;
  const source: EntitySource = {
    deviceId: input.deviceId,
    terminalId: input.terminalId,
    fromServer: false,
  };

  return db.transaction(TOUCHED_STORES, "readwrite", async (tx) => {
    // --- Idempotency: a repeat operationId returns the prior sale, no writes. ---
    const existingOp = await getOutboxRecord(tx, input.operationId);
    if (existingOp) {
      const priorSale = await tx.get<LocalSaleEntity>(OfflineStore.sales, saleId);
      const movements = await readMovementsForSale(tx, saleId);
      return {
        duplicate: true,
        sale: priorSale as LocalSaleEntity,
        receiptReference: priorSale?.receiptReference ?? "",
        movements,
        envelope: existingOp.envelope as OfflineOperationEnvelope<OfflineCashSalePayload>,
        outbox: existingOp,
      };
    }

    // --- Precondition: an open, compatible local cash session must exist. ---
    const session = await txReadCashSession(tx, input.cashSessionId);
    if (
      !isCompatibleOpenSession(session, {
        companyId: input.companyId,
        branchId: input.branchId,
        terminalId: input.terminalId,
      })
    ) {
      throw new NoOpenCashSessionError();
    }

    // --- Totals (pure). Cloud remains authoritative on sync. ---
    const mathLines = input.lines.map((line) => ({
      unitPriceLak: line.unitPriceLak,
      quantity: line.quantity,
      conversionQty: line.conversionQty ?? 1,
    }));
    const totals = computeSaleTotals({
      lines: mathLines,
      taxRatePercent: input.taxRatePercent,
      taxInclusive: input.taxInclusive,
      manualDiscountLak: input.manualDiscountLak,
      promotions: input.promotions,
      now: nowDate,
    });
    if (!cashCovers(totals.totalLak, input.paidCashLak)) {
      throw new InsufficientPaymentError(totals.totalLak, input.paidCashLak);
    }

    // --- Compute stock consumption first (validate everything before writing). ---
    // Aggregate requested base quantity per allocation key so multiple lines of
    // the same product/lot are checked against a single lease.
    const requestedByAllocation = new Map<string, { productId: string; unitId: string | null; lotId: string | null; baseQuantity: number }>();
    const saleLines: OfflineSaleLine[] = input.lines.map((line, index) => {
      const conversionQty = line.conversionQty ?? 1;
      const baseQuantity = lineBaseQuantity({ unitPriceLak: line.unitPriceLak, quantity: line.quantity, conversionQty });
      const lotId = line.lotId ?? null;
      const key = `${line.productId}::${lotId ?? ""}`;
      const agg = requestedByAllocation.get(key);
      if (agg) agg.baseQuantity += baseQuantity;
      else requestedByAllocation.set(key, { productId: line.productId, unitId: line.unitId ?? null, lotId, baseQuantity });
      return {
        lineId: `${saleId}:${index}`,
        productId: line.productId,
        unitId: line.unitId ?? null,
        lotId,
        quantity: line.quantity,
        baseQuantity,
        conversionQty,
        unitPriceLak: line.unitPriceLak,
        lineTotalLak: lineTotalLak({ unitPriceLak: line.unitPriceLak, quantity: line.quantity }),
        name: line.name,
        unitName: line.unitName,
      };
    });

    const updatedAllocations: LocalStockAllocationRecord[] = [];
    const stockConsumption: OfflineStockConsumption[] = [];
    for (const req of requestedByAllocation.values()) {
      const alloc = await txReadStockAllocation(tx, req.productId, req.lotId);
      if (!alloc) {
        throw new NoTerminalAllocationError(req.productId, req.lotId);
      }
      // A lot-scoped lease that is inactive/expired is an invalid lot.
      if (req.lotId && !isAllocationActive(alloc, nowDate)) {
        throw new InvalidLotError(req.productId, req.lotId);
      }
      // Pure consume (throws InsufficientTerminalStockError; never negative).
      const next = consumeAllocation(alloc, req.baseQuantity, alloc.baseVersion, nowDate);
      updatedAllocations.push({ ...alloc, ...next });
      stockConsumption.push({
        productId: req.productId,
        unitId: req.unitId,
        lotId: req.lotId,
        baseQuantity: req.baseQuantity,
        allocationId: alloc.id,
        allocationBaseVersionBefore: alloc.baseVersion,
      });
    }

    // --- Allocate a permanent receipt reference from the reserved range. ---
    const range = await txReadReceiptRange(tx);
    if (!range) {
      throw new Error("No active terminal receipt range is provisioned on this device");
    }
    const rangeView: ReceiptRangeView = {
      prefix: range.prefix,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      nextValue: range.nextValue,
      status: range.status,
    };
    const allocation = allocateNextReceipt(rangeView); // throws when exhausted
    const advancedRange: LocalReceiptRangeRecord = { ...range, ...allocation.next };

    // --- Build the immutable payment, receipt snapshot, and sale entity. ---
    const payment: OfflineCashPayment = {
      method: "cash",
      paidCashLak: Math.round(input.paidCashLak),
      changeLak: cashChangeLak(totals.totalLak, input.paidCashLak),
    };

    const receiptSnapshot: OfflineReceiptSnapshot = deepFreeze({
      receiptReference: allocation.reference,
      saleNo: input.saleNo,
      createdAt: now,
      branchName: input.branchName,
      cashierName: input.cashierName,
      customerName: input.customerName || "Guest",
      paymentMode: "cash",
      lines: saleLines.map((line) => ({
        name: line.name,
        unitName: line.unitName,
        quantity: line.quantity,
        unitPriceLak: line.unitPriceLak,
        lineTotalLak: line.lineTotalLak,
      })),
      subtotalLak: totals.subtotalLak,
      discountTotalLak: totals.discountTotalLak,
      taxAmountLak: totals.taxAmountLak,
      totalLak: totals.totalLak,
      paidCashLak: payment.paidCashLak,
      changeLak: payment.changeLak,
    });

    const audit = {
      createdAt: now,
      actorUserId: input.actorUserId,
      deviceId: input.deviceId,
      terminalId: input.terminalId,
      policyVersion: input.policyVersion ?? null,
    };

    const movementEntities: LocalStockMovementEntity[] = stockConsumption.map((consumption, index) => ({
      ...baseFields(`${saleId}:mv:${index}`, input.companyId, input.branchId, input.warehouseId, source, now),
      saleId,
      operationId: input.operationId,
      productId: consumption.productId,
      unitId: consumption.unitId,
      lotId: consumption.lotId,
      baseQuantity: consumption.baseQuantity,
      direction: "out",
      reason: "pos_sale",
    }));

    const payload: OfflineCashSalePayload = {
      saleId,
      saleNo: input.saleNo,
      receiptReference: allocation.reference,
      companyId: input.companyId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      terminalId: input.terminalId,
      deviceId: input.deviceId,
      actorUserId: input.actorUserId,
      cashSessionId: input.cashSessionId,
      customerId: input.customerId ?? null,
      lines: saleLines,
      subtotalLak: totals.subtotalLak,
      promotionDiscountLak: totals.promotionDiscountLak,
      manualDiscountLak: totals.manualDiscountLak,
      discountTotalLak: totals.discountTotalLak,
      taxRatePercent: totals.taxRatePercent,
      taxInclusive: totals.taxInclusive,
      taxAmountLak: totals.taxAmountLak,
      totalLak: totals.totalLak,
      payment,
      stockConsumption,
      receiptSnapshot,
      audit,
      createdAt: now,
    };

    const sale: LocalSaleEntity = {
      ...baseFields(saleId, input.companyId, input.branchId, input.warehouseId, source, now),
      saleNo: input.saleNo,
      receiptReference: allocation.reference,
      cashSessionId: input.cashSessionId,
      customerId: input.customerId ?? null,
      operationId: input.operationId,
      status: "pending",
      lines: saleLines,
      payment,
      subtotalLak: totals.subtotalLak,
      discountTotalLak: totals.discountTotalLak,
      taxAmountLak: totals.taxAmountLak,
      totalLak: totals.totalLak,
      receiptSnapshot,
      audit,
    };

    // --- Build the operation envelope (deterministic ordering + dependencies). ---
    const sequence = await OfflineDatabase.nextSequence(tx);
    const envelope = buildOperationEnvelope<OfflineCashSalePayload>({
      operationId: input.operationId,
      deviceId: input.deviceId,
      terminalId: input.terminalId,
      companyId: input.companyId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      actorUserId: input.actorUserId,
      policyVersion: input.policyVersion ?? null,
      createdAt: now,
      sequence,
      operationType: OperationType.posSaleComplete,
      dependencies: input.dependsOn ?? [],
      clientEntityIds: [saleId, ...movementEntities.map((m) => m.id)],
      payload,
    });
    const outbox = createOutboxRecord(envelope, now);

    // --- Persist everything atomically. ---
    await tx.put(OfflineStore.receiptRanges, advancedRange);
    for (const alloc of updatedAllocations) {
      await tx.put(OfflineStore.stockAllocations, alloc);
    }
    await tx.put(OfflineStore.sales, sale);
    for (const movement of movementEntities) {
      await tx.put(OfflineStore.inventoryEvents, movement);
    }
    await tx.put(OfflineStore.outbox, outbox);

    return {
      duplicate: false,
      sale,
      receiptReference: allocation.reference,
      movements: movementEntities,
      envelope,
      outbox,
    };
  });
}

async function readMovementsForSale(
  tx: OfflineBackendTransaction,
  saleId: string,
): Promise<LocalStockMovementEntity[]> {
  const all = await tx.getAll<LocalStockMovementEntity>(OfflineStore.inventoryEvents);
  return all.filter((movement) => movement.saleId === saleId).sort((a, b) => (a.id < b.id ? -1 : 1));
}
