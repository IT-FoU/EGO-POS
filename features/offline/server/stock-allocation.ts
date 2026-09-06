/**
 * Terminal stock allocation / lease (Phase 3 foundation, requirements §6.5).
 *
 * A terminal may sell only `allocated − consumed` for each product/unit/lot.
 * The design already supports multiple terminals so a later terminal cannot
 * oversell the same inventory while both are disconnected. Pure invariants here;
 * the Prisma-backed allocator persists leases and applies optimistic versions.
 */

import type { TerminalAllocationStatus } from "./types";

export interface StockAllocationView {
  allocatedQty: number;
  consumedQty: number;
  baseVersion: number;
  status: TerminalAllocationStatus;
  expiresAt: string | null;
}

export function isAllocationActive(alloc: StockAllocationView, now: Date): boolean {
  if (alloc.status !== "active") return false;
  if (alloc.expiresAt) {
    const expiry = new Date(alloc.expiresAt).getTime();
    if (!Number.isNaN(expiry) && expiry <= now.getTime()) return false;
  }
  return true;
}

/** Remaining sellable quantity for this terminal's lease. */
export function remainingSellable(alloc: StockAllocationView, now: Date): number {
  if (!isAllocationActive(alloc, now)) return 0;
  return Math.max(0, round3(alloc.allocatedQty - alloc.consumedQty));
}

export function canConsume(alloc: StockAllocationView, quantity: number, now: Date): boolean {
  if (quantity <= 0) return false;
  return quantity <= remainingSellable(alloc, now) + 1e-9;
}

export class InsufficientTerminalStockError extends Error {
  constructor(
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Insufficient terminal stock allocation: requested ${requested}, available ${available}`);
    this.name = "InsufficientTerminalStockError";
  }
}

/** Pure: consume from the lease with an optimistic base-version check. */
export function consumeAllocation(
  alloc: StockAllocationView,
  quantity: number,
  expectedBaseVersion: number,
  now: Date,
): StockAllocationView {
  if (expectedBaseVersion !== alloc.baseVersion) {
    throw new Error("Stale terminal stock allocation version");
  }
  if (!canConsume(alloc, quantity, now)) {
    throw new InsufficientTerminalStockError(quantity, remainingSellable(alloc, now));
  }
  const consumedQty = round3(alloc.consumedQty + quantity);
  const status: TerminalAllocationStatus =
    consumedQty >= alloc.allocatedQty - 1e-9 ? "exhausted" : "active";
  return { ...alloc, consumedQty, baseVersion: alloc.baseVersion + 1, status };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
