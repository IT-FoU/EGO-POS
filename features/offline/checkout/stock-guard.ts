/**
 * Pure terminal-allocation cart guard (Phase 6A).
 *
 * Enforces the terminal sellable lease + lot/expiry on cart quantities BEFORE
 * checkout (and is reused by the atomic commit for the final check). Prevents a
 * cart from exceeding what this terminal may sell offline, so local available
 * stock can never go negative.
 */

import {
  isAllocationActive,
  remainingSellable,
  type StockAllocationView,
} from "../server/stock-allocation";
import { allocationKey } from "./terminal-provisioning";

export interface CartQuantityLine {
  productId: string;
  lotId?: string | null;
  /** Requested quantity in BASE units. */
  baseQuantity: number;
}

export type CartAllocationViolation =
  | { productId: string; lotId: string | null; reason: "no_allocation" }
  | { productId: string; lotId: string | null; reason: "invalid_lot" }
  | { productId: string; lotId: string | null; reason: "insufficient"; requested: number; available: number };

export interface CartAllocationResult {
  ok: boolean;
  violations: CartAllocationViolation[];
}

/**
 * Validate aggregated cart quantities against the terminal's leases. Multiple
 * lines of the same product/lot are summed against a single lease.
 */
export function validateCartAllocations(
  lines: CartQuantityLine[],
  allocations: Map<string, StockAllocationView>,
  now: Date = new Date(),
): CartAllocationResult {
  const requested = new Map<string, { productId: string; lotId: string | null; baseQuantity: number }>();
  for (const line of lines) {
    const lotId = line.lotId ?? null;
    const key = allocationKey(line.productId, lotId);
    const agg = requested.get(key);
    if (agg) agg.baseQuantity += line.baseQuantity;
    else requested.set(key, { productId: line.productId, lotId, baseQuantity: line.baseQuantity });
  }

  const violations: CartAllocationViolation[] = [];
  for (const [key, req] of requested) {
    const alloc = allocations.get(key);
    if (!alloc) {
      violations.push({ productId: req.productId, lotId: req.lotId, reason: "no_allocation" });
      continue;
    }
    if (req.lotId && !isAllocationActive(alloc, now)) {
      violations.push({ productId: req.productId, lotId: req.lotId, reason: "invalid_lot" });
      continue;
    }
    const available = remainingSellable(alloc, now);
    if (req.baseQuantity > available + 1e-9) {
      violations.push({
        productId: req.productId,
        lotId: req.lotId,
        reason: "insufficient",
        requested: req.baseQuantity,
        available,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
