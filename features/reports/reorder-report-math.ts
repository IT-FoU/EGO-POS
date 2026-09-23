/**
 * R8 Reorder / Purchase Suggestion math.
 * Available = max(0, On Hand − ACTIVE Reserved) — same as R4/R5.
 * Configured Reorder Level: Available <= min_stock.
 * No Reorder Level: Available <= 2 (R8-only; does not change R4).
 * Active PO exclusion: draft | ordered | partial.
 *
 * R10-B Suggested Qty (AUTO):
 * Effective Stock = Available + Remaining Open PO Qty (base)
 * Suggested Qty Base = max(Target Stock − Effective Stock, 0)
 *
 * NOTE: R8 Need Reorder still EXCLUDES products with active draft|ordered|partial POs.
 * Remaining Open PO Qty is used for Already Ordered / Effective Stock when computing
 * suggestions for eligible Need rows (typically openPoRemaining=0) and for history.
 * Do not reintroduce active-PO products into Need merely to show Suggested Qty.
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

export const REORDER_TABS = ["need", "already", "history"] as const;
export type ReorderTab = (typeof REORDER_TABS)[number];

export type ReorderQtyMode = "AUTO" | "MANUAL";

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

/** Remaining open PO quantity in BASE units. */
export function remainingOpenPoQtyBase(input: {
  conversionQty: number;
  orderedQty: number;
  receivedQty: number;
}) {
  const remainingPurchase = remainingOrderedQty(input.orderedQty, input.receivedQty);
  const conversion = Math.max(qtyNum(input.conversionQty) || 1, 1e-9);
  return remainingPurchase * conversion;
}

export function effectiveStockBase(input: { available: number; openPoRemainingBase: number }) {
  return Math.max(0, qtyNum(input.available)) + Math.max(0, qtyNum(input.openPoRemainingBase));
}

/**
 * AUTO Suggested Qty in BASE units.
 * MANUAL mode returns 0 (Owner enters Order Qty; do not force a suggestion).
 */
export function suggestedQtyBase(input: {
  available: number;
  openPoRemainingBase?: number;
  reorderQtyMode?: ReorderQtyMode | string | null;
  targetStock: number;
}) {
  if (input.reorderQtyMode === "MANUAL") return 0;
  const effective = effectiveStockBase({
    available: input.available,
    openPoRemainingBase: input.openPoRemainingBase ?? 0,
  });
  return Math.max(0, qtyNum(input.targetStock) - effective);
}

/**
 * Convert base suggestion to whole purchase units.
 * Rounds UP so Target Stock is not underfilled when Pack/Box cannot represent exact base.
 */
export function suggestedPurchaseQtyFromBase(suggestedBase: number, conversionQty: number) {
  const conversion = Math.max(qtyNum(conversionQty) || 1, 1e-9);
  const base = Math.max(0, qtyNum(suggestedBase));
  if (base <= 0) return 0;
  return Math.ceil(base / conversion - 1e-12);
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
