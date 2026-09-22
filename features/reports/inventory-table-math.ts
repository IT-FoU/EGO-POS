/**
 * R4 inventory-report semantics.
 * On Hand = inventory_balances.quantity (base).
 * Reserved = SUM ACTIVE stock_reservations.baseQuantity.
 * Available = max(0, On Hand − Reserved).
 * Reorder threshold = products.min_stock when > 0; otherwise No Reorder Level.
 * Stock Value = On Hand × current base-unit cost (base unit costPriceLak ?? product.costPriceLak).
 * Does not invent reorder quantity / target stock.
 */

export const INVENTORY_TABLE_PAGE_SIZE = 50;
export const INVENTORY_TABLE_SCAN_LIMIT = 5000;

export const INVENTORY_STOCK_STATUSES = [
  "all",
  "in_stock",
  "low_stock",
  "out_of_stock",
  "reserved",
  "no_reorder_level",
  "already_ordered",
] as const;

export type InventoryStockStatusFilter = (typeof INVENTORY_STOCK_STATUSES)[number];

export type InventoryStockClass = "in_stock" | "low_stock" | "out_of_stock" | "no_reorder_level";

export function qtyNum(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function moneyLak(value: unknown) {
  return Math.round(qtyNum(value));
}

export function hasReorderThreshold(minStock: unknown) {
  return qtyNum(minStock) > 0;
}

export function availableBaseQty(onHand: number, reserved: number) {
  return Math.max(0, qtyNum(onHand) - qtyNum(reserved));
}

export function stockValueLak(onHandBase: number, baseUnitCostLak: number) {
  return moneyLak(qtyNum(onHandBase) * qtyNum(baseUnitCostLak));
}

/**
 * Classification uses Available, not On Hand.
 * Priority: Out of Stock → Low Stock → In Stock / No Reorder Level.
 */
export function classifyInventoryStock(input: {
  available: number;
  minStock: number;
}): InventoryStockClass {
  const available = qtyNum(input.available);
  const minStock = qtyNum(input.minStock);
  if (available <= 0) return "out_of_stock";
  if (hasReorderThreshold(minStock) && available <= minStock) return "low_stock";
  if (!hasReorderThreshold(minStock)) return "no_reorder_level";
  return "in_stock";
}

export function matchesInventoryStockStatus(
  row: { available: number; alreadyOrdered?: boolean; minStock: number; reserved: number; status: InventoryStockClass },
  filter: InventoryStockStatusFilter,
) {
  if (filter === "all") return true;
  if (filter === "reserved") return qtyNum(row.reserved) > 0;
  if (filter === "already_ordered") return Boolean(row.alreadyOrdered);
  if (filter === "no_reorder_level") return row.status === "no_reorder_level" || !hasReorderThreshold(row.minStock);
  return row.status === filter;
}

export function isLowStockCandidate(status: InventoryStockClass) {
  return status === "low_stock" || status === "out_of_stock";
}

export type InventoryReportSummary = {
  alreadyOrdered: number;
  estimatedReorderCostLak: number;
  inStock: number;
  lowStock: number;
  noReorderLevel: number;
  outOfStock: number;
  productsWithoutCost: number;
  suggestedReorder: number;
  totalAvailable: number;
  totalOnHand: number;
  totalProducts: number;
  totalReserved: number;
  totalStockValueLak: number;
};

export function emptyInventorySummary(): InventoryReportSummary {
  return {
    alreadyOrdered: 0,
    estimatedReorderCostLak: 0,
    inStock: 0,
    lowStock: 0,
    noReorderLevel: 0,
    outOfStock: 0,
    productsWithoutCost: 0,
    suggestedReorder: 0,
    totalAvailable: 0,
    totalOnHand: 0,
    totalProducts: 0,
    totalReserved: 0,
    totalStockValueLak: 0,
  };
}

export function summarizeInventoryRows(
  rows: Array<{
    alreadyOrdered?: boolean;
    available: number;
    hasCost?: boolean;
    minStock: number;
    onHand: number;
    reserved: number;
    status: InventoryStockClass;
    stockValueLak: number;
    unitCostLak: number;
  }>,
): InventoryReportSummary {
  const summary = emptyInventorySummary();
  summary.totalProducts = rows.length;
  for (const row of rows) {
    summary.totalOnHand += qtyNum(row.onHand);
    summary.totalReserved += qtyNum(row.reserved);
    summary.totalAvailable += qtyNum(row.available);
    summary.totalStockValueLak += moneyLak(row.stockValueLak);
    if (row.status === "in_stock") summary.inStock += 1;
    if (row.status === "low_stock") summary.lowStock += 1;
    if (row.status === "out_of_stock") summary.outOfStock += 1;
    if (row.status === "no_reorder_level") summary.noReorderLevel += 1;
    if (row.alreadyOrdered) summary.alreadyOrdered += 1;
    if (row.hasCost === false) summary.productsWithoutCost += 1;
    if (isLowStockCandidate(row.status)) {
      summary.suggestedReorder += 1;
      // Reorder qty / target stock are not persisted — do not invent estimated cost.
    }
  }
  return summary;
}
