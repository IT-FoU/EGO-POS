/**
 * R8 Reorder / Purchase Suggestion math.
 * Available = max(0, On Hand − ACTIVE Reserved) — same as R4/R5.
 * Configured Reorder Level: Available <= min_stock.
 * No Reorder Level: Available <= 2 (R8-only; does not change R4).
 * Active PO exclusion: draft | ordered | partial.
 */
import { availableBaseQty, hasReorderThreshold, moneyLak, qtyNum } from "@/features/reports/inventory-table-math";

export const REORDER_PAGE_SIZE = 50;
export const REORDER_SCAN_LIMIT = 5000;
export const REORDER_NO_THRESHOLD_AVAILABLE_MAX = 2;

export const R8_ACTIVE_PO_STATUSES = ["draft", "ordered", "partial"] as const;
export type R8ActivePoStatus = (typeof R8_ACTIVE_PO_STATUSES)[number];

export const REORDER_REASONS = [
  "out_of_stock",
  "reached_reorder_level",
  "only_1_2_left",
  "added_manually",
] as const;
export type ReorderReason = (typeof REORDER_REASONS)[number];

export const REORDER_TABS = ["need", "already"] as const;
export type ReorderTab = (typeof REORDER_TABS)[number];

export { availableBaseQty, hasReorderThreshold, moneyLak, qtyNum };

export function isR8ActivePoStatus(status: unknown): status is R8ActivePoStatus {
  return typeof status === "string" && (R8_ACTIVE_PO_STATUSES as readonly string[]).includes(status);
}

export function qualifiesAutoNeedReorder(input: { available: number; minStock: number }) {
  const available = qtyNum(input.available);
  const minStock = qtyNum(input.minStock);
  if (hasReorderThreshold(minStock)) return available <= minStock;
  return available <= REORDER_NO_THRESHOLD_AVAILABLE_MAX;
}

/**
 * Classification priority for display reason:
 * Out of Stock → Reached Reorder Level → Only 1–2 Left → Added Manually
 */
export function classifyReorderReason(input: {
  available: number;
  isManual: boolean;
  minStock: number;
}): ReorderReason | null {
  const available = qtyNum(input.available);
  const minStock = qtyNum(input.minStock);
  const auto = qualifiesAutoNeedReorder({ available, minStock });
  if (!auto && !input.isManual) return null;
  if (available <= 0) return "out_of_stock";
  if (hasReorderThreshold(minStock) && available <= minStock) return "reached_reorder_level";
  if (!hasReorderThreshold(minStock) && available > 0 && available <= REORDER_NO_THRESHOLD_AVAILABLE_MAX) {
    return "only_1_2_left";
  }
  if (input.isManual) return "added_manually";
  return null;
}

export function remainingOrderedQty(orderedQty: number, receivedQty: number) {
  return Math.max(0, qtyNum(orderedQty) - qtyNum(receivedQty));
}

export function estimatedLineCostLak(orderQty: number, unitCostLak: number | null | undefined) {
  if (unitCostLak == null || !Number.isFinite(Number(unitCostLak))) return null;
  return moneyLak(qtyNum(orderQty) * qtyNum(unitCostLak));
}

export type NeedReorderSummary = {
  alreadyOrdered: number;
  estimatedOrderCostLak: number | null;
  lowStock: number;
  needReorder: number;
  outOfStock: number;
  selected: number;
};

export function emptyNeedReorderSummary(): NeedReorderSummary {
  return {
    alreadyOrdered: 0,
    estimatedOrderCostLak: null,
    lowStock: 0,
    needReorder: 0,
    outOfStock: 0,
    selected: 0,
  };
}
