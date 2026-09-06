/**
 * Local terminal provisioning records (Phase 6A): the server-reserved receipt
 * range and the server-issued terminal stock leases, stored on-device and
 * consumed atomically during an offline cash sale.
 *
 * These records are provisioned by the cloud (Phase 3 models) and mirrored into
 * the local DB by the sync layer in a later slice. This module owns their local
 * shape + read/save helpers and the deterministic keys used to look them up.
 */

import { OfflineDatabase } from "../local-db/database";
import { OfflineStore } from "../local-db/schema";
import type { OfflineBackendTransaction } from "../local-db/backend";
import type { ReceiptRangeView } from "../server/receipt-range";
import type { StockAllocationView } from "../server/stock-allocation";

/** One active receipt range per terminal database. */
export const ACTIVE_RECEIPT_RANGE_ID = "active";

export interface LocalReceiptRangeRecord extends ReceiptRangeView {
  id: string;
  companyId: string;
  branchId: string;
  terminalDeviceId: string;
}

export interface LocalStockAllocationRecord extends StockAllocationView {
  id: string;
  companyId: string;
  branchId: string;
  warehouseId: string;
  terminalDeviceId: string;
  productId: string;
  unitId: string | null;
  lotId: string | null;
}

/** Deterministic allocation key. A lot-scoped lease is distinct per lot. */
export function allocationKey(productId: string, lotId?: string | null): string {
  return lotId ? `${productId}::${lotId}` : productId;
}

// ---- DB-level helpers (provisioning + tests) ----

export async function saveReceiptRange(
  db: OfflineDatabase,
  record: Omit<LocalReceiptRangeRecord, "id"> & { id?: string },
): Promise<void> {
  const id = record.id ?? ACTIVE_RECEIPT_RANGE_ID;
  await db.transaction([OfflineStore.receiptRanges], "readwrite", async (tx) => {
    await tx.put(OfflineStore.receiptRanges, { ...record, id });
  });
}

export async function readActiveReceiptRange(
  db: OfflineDatabase,
): Promise<LocalReceiptRangeRecord | null> {
  const record = await db.read<LocalReceiptRangeRecord>(
    OfflineStore.receiptRanges,
    ACTIVE_RECEIPT_RANGE_ID,
  );
  return record ?? null;
}

export async function saveStockAllocation(
  db: OfflineDatabase,
  record: Omit<LocalStockAllocationRecord, "id"> & { id?: string },
): Promise<void> {
  const id = record.id ?? allocationKey(record.productId, record.lotId);
  await db.transaction([OfflineStore.stockAllocations], "readwrite", async (tx) => {
    await tx.put(OfflineStore.stockAllocations, { ...record, id });
  });
}

export async function readStockAllocation(
  db: OfflineDatabase,
  productId: string,
  lotId?: string | null,
): Promise<LocalStockAllocationRecord | null> {
  const record = await db.read<LocalStockAllocationRecord>(
    OfflineStore.stockAllocations,
    allocationKey(productId, lotId),
  );
  return record ?? null;
}

// ---- Transaction-scoped helpers (used inside the atomic sale commit) ----

export async function txReadReceiptRange(
  tx: OfflineBackendTransaction,
): Promise<LocalReceiptRangeRecord | undefined> {
  return tx.get<LocalReceiptRangeRecord>(OfflineStore.receiptRanges, ACTIVE_RECEIPT_RANGE_ID);
}

export async function txReadStockAllocation(
  tx: OfflineBackendTransaction,
  productId: string,
  lotId?: string | null,
): Promise<LocalStockAllocationRecord | undefined> {
  return tx.get<LocalStockAllocationRecord>(
    OfflineStore.stockAllocations,
    allocationKey(productId, lotId),
  );
}
