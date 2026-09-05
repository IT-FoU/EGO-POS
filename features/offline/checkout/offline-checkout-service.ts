/**
 * Offline CASH checkout service (Phase 6C, client).
 *
 * Thin orchestration over the Phase 6A atomic `commitOfflineCashSale`:
 * - runs the local commit for one checkout attempt (one operationId),
 * - maps domain errors to exact, safe user messages (cart is kept unchanged on
 *   failure by the caller),
 * - exposes helpers to transition a local sale pending → synced / rejected after
 *   the outbox flush reconciles with the cloud.
 *
 * CASH only; never performs any network I/O.
 */

import { OfflineDatabase } from "../local-db/database";
import { OfflineStore } from "../local-db/schema";
import {
  commitOfflineCashSale,
  InsufficientPaymentError,
  InvalidLotError,
  NoTerminalAllocationError,
  type CommitCashSaleInput,
} from "./commit-cash-sale";
import { NoOpenCashSessionError } from "./cash-session-guard";
import { InsufficientTerminalStockError } from "../server/stock-allocation";
import { ReceiptRangeExhaustedError } from "../server/receipt-range";
import type { LocalSaleEntity } from "./cash-sale-types";

export type OfflineCheckoutResult =
  | { ok: true; duplicate: boolean; saleId: string; operationId: string; receiptReference: string; saleNo: string }
  | { ok: false; code: string; error: string };

function mapError(error: unknown): { code: string; error: string } {
  if (error instanceof NoOpenCashSessionError) {
    return { code: "no_cash_session", error: "No open cash session on this terminal. Open a shift before selling." };
  }
  if (error instanceof InsufficientTerminalStockError) {
    return { code: "insufficient_stock_allocation", error: "Not enough allocated stock on this terminal for the cart." };
  }
  if (error instanceof NoTerminalAllocationError) {
    return { code: "no_allocation", error: "A product in the cart has no terminal stock allocation." };
  }
  if (error instanceof InvalidLotError) {
    return { code: "invalid_lot", error: "A selected lot is expired or invalid." };
  }
  if (error instanceof ReceiptRangeExhaustedError) {
    return { code: "receipt_range_exhausted", error: "Offline receipt numbers are exhausted. Reconnect to refresh the range." };
  }
  if (error instanceof InsufficientPaymentError) {
    return { code: "insufficient_payment", error: "Cash tendered is less than the total due." };
  }
  return { code: "checkout_failed", error: "Sale could not be completed offline. The cart was not changed." };
}

/**
 * Commit one offline CASH sale. On any validation failure NOTHING is written
 * (the underlying transaction rolls back) and a safe error is returned so the
 * caller can keep the cart unchanged.
 */
export async function runOfflineCashCheckout(
  db: OfflineDatabase,
  input: CommitCashSaleInput,
): Promise<OfflineCheckoutResult> {
  try {
    const result = await commitOfflineCashSale(db, input);
    return {
      ok: true,
      duplicate: result.duplicate,
      saleId: result.sale.id,
      operationId: input.operationId,
      receiptReference: result.receiptReference,
      saleNo: result.sale.saleNo,
    };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function readLocalSale(db: OfflineDatabase, saleId: string): Promise<LocalSaleEntity | null> {
  const sale = await db.read<LocalSaleEntity>(OfflineStore.sales, saleId);
  return sale ?? null;
}

export async function listLocalSales(db: OfflineDatabase): Promise<LocalSaleEntity[]> {
  const sales = await db.readAll<LocalSaleEntity>(OfflineStore.sales);
  return sales.sort((a, b) => (a.localUpdatedAt < b.localUpdatedAt ? 1 : -1));
}

/** Transition a local sale pending → synced with the canonical cloud ids. */
export async function markLocalSaleSynced(
  db: OfflineDatabase,
  saleId: string,
  reconciliation: { cloudSaleId?: string | null; canonicalSaleNo?: string | null },
  now = new Date().toISOString(),
): Promise<void> {
  await db.transaction([OfflineStore.sales], "readwrite", async (tx) => {
    const sale = await tx.get<LocalSaleEntity>(OfflineStore.sales, saleId);
    if (!sale) return;
    await tx.put(OfflineStore.sales, {
      ...sale,
      status: "synced",
      syncStatus: "synced",
      cloudSaleId: reconciliation.cloudSaleId ?? sale.cloudSaleId ?? null,
      canonicalSaleNo: reconciliation.canonicalSaleNo ?? sale.canonicalSaleNo ?? null,
      syncedAt: now,
      localUpdatedAt: now,
    });
  });
}

/** Transition a local sale pending → rejected, keeping the immutable receipt. */
export async function markLocalSaleRejected(
  db: OfflineDatabase,
  saleId: string,
  reason: string,
  now = new Date().toISOString(),
): Promise<void> {
  await db.transaction([OfflineStore.sales], "readwrite", async (tx) => {
    const sale = await tx.get<LocalSaleEntity>(OfflineStore.sales, saleId);
    if (!sale) return;
    // The receiptSnapshot + audit are preserved as-is (immutable); only status changes.
    await tx.put(OfflineStore.sales, {
      ...sale,
      status: "rejected",
      syncStatus: "rejected",
      rejectedReason: reason,
      rejectedAt: now,
      localUpdatedAt: now,
    });
  });
}
