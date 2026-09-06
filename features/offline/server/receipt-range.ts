/**
 * Terminal receipt-number allocation (Phase 3 foundation, requirements §6.6).
 *
 * A terminal is issued a reserved numeric range with a stable prefix. Offline
 * receipts draw sequential references from the range; the cloud preserves the
 * printed reference on sync and never renumbers a receipt the customer holds.
 * Pure invariants here; the Prisma-backed allocator persists them.
 */

import type { TerminalReceiptRangeStatus } from "./types";

export interface ReceiptRangeView {
  prefix: string;
  rangeStart: number;
  rangeEnd: number;
  nextValue: number;
  status: TerminalReceiptRangeStatus;
}

export function receiptRangeCapacity(range: Pick<ReceiptRangeView, "rangeStart" | "rangeEnd">): number {
  return Math.max(0, range.rangeEnd - range.rangeStart + 1);
}

export function receiptRangeRemaining(range: ReceiptRangeView): number {
  if (range.status !== "active") return 0;
  return Math.max(0, range.rangeEnd - range.nextValue + 1);
}

export function canAllocateReceipt(range: ReceiptRangeView): boolean {
  return receiptRangeRemaining(range) > 0;
}

/** Format a receipt reference, e.g. prefix "GB-01-" + 42 → "GB-01-000042". */
export function formatReceiptReference(prefix: string, value: number, pad = 6): string {
  return `${prefix}${String(value).padStart(pad, "0")}`;
}

export class ReceiptRangeExhaustedError extends Error {
  constructor() {
    super("Terminal receipt range is exhausted");
    this.name = "ReceiptRangeExhaustedError";
  }
}

export interface ReceiptAllocation {
  value: number;
  reference: string;
  next: ReceiptRangeView;
}

/**
 * Pure: allocate the next receipt reference and return the advanced range.
 * Throws when the range is exhausted (never wraps or reuses a number).
 */
export function allocateNextReceipt(range: ReceiptRangeView, pad = 6): ReceiptAllocation {
  if (!canAllocateReceipt(range)) {
    throw new ReceiptRangeExhaustedError();
  }
  const value = range.nextValue;
  const nextValue = value + 1;
  const status: TerminalReceiptRangeStatus = nextValue > range.rangeEnd ? "exhausted" : "active";
  return {
    value,
    reference: formatReceiptReference(range.prefix, value, pad),
    next: { ...range, nextValue, status },
  };
}
