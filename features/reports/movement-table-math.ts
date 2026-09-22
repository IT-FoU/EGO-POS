/**
 * R5 Stock Movement report semantics.
 * On Hand mutations only (stock_movements). Hold/ACTIVE reservation is NOT a movement.
 * Qty In / Qty Out derived from afterQty − beforeQty (authoritative delta).
 * Balance After = persisted afterQty.
 */
export const MOVEMENT_TABLE_PAGE_SIZE = 50;
export const MOVEMENT_TABLE_SCAN_LIMIT = 10000;

export const MOVEMENT_REPORT_KINDS = [
  "all",
  "stock_in",
  "purchase_grn",
  "sale",
  "refund",
  "void_restore",
  "adjustment_in",
  "adjustment_out",
  "stock_count",
  "exchange_out",
  "damaged",
  "expired",
  "other",
] as const;

export type MovementReportKind = (typeof MOVEMENT_REPORT_KINDS)[number];
export type MovementReportKindFilter = MovementReportKind;

export function qtyNum(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function moneyLak(value: unknown) {
  return Math.round(qtyNum(value));
}

/** Authoritative On Hand delta for a persisted movement row. */
export function movementDelta(beforeQty: unknown, afterQty: unknown) {
  return qtyNum(afterQty) - qtyNum(beforeQty);
}

export function qtyInFromDelta(delta: number) {
  return Math.max(0, qtyNum(delta));
}

export function qtyOutFromDelta(delta: number) {
  return Math.max(0, -qtyNum(delta));
}

/**
 * Classify report movement kind from persisted type + reference + note.
 * Does not invent transfer / return-to-supplier (no production writers).
 */
export function classifyMovementKind(input: {
  movementType: string;
  note?: string | null;
  referenceType?: string | null;
}): Exclude<MovementReportKind, "all"> {
  const type = String(input.movementType ?? "").toLowerCase();
  const ref = String(input.referenceType ?? "").toLowerCase();
  const note = String(input.note ?? "");

  if (ref === "stock_count") return "stock_count";
  if (ref === "goods_receipt") return "purchase_grn";
  if (ref === "quick_stock_in" || ref === "stock_in" || ref === "go_box_opening") return "stock_in";
  if (ref === "sale_exchange") return "exchange_out";
  if (type === "sale") return "sale";
  if (type === "return") {
    if (/void/i.test(note)) return "void_restore";
    return "refund";
  }
  if (type === "damaged") return "damaged";
  if (type === "expired") return "expired";
  if (type === "purchase") return ref === "goods_receipt" ? "purchase_grn" : "stock_in";
  if (type === "adjustment") return "other";
  return "other";
}

export function resolveMovementKind(input: {
  afterQty: unknown;
  beforeQty: unknown;
  movementType: string;
  note?: string | null;
  referenceType?: string | null;
}): Exclude<MovementReportKind, "all"> {
  const base = classifyMovementKind(input);
  if (base !== "other") return base;
  const type = String(input.movementType ?? "").toLowerCase();
  const ref = String(input.referenceType ?? "").toLowerCase();
  if (type === "adjustment" || ref === "stock_adjustment" || ref === "approval") {
    const delta = movementDelta(input.beforeQty, input.afterQty);
    if (delta > 0) return "adjustment_in";
    if (delta < 0) return "adjustment_out";
    return "stock_count";
  }
  return "other";
}

export function matchesMovementKind(
  kind: Exclude<MovementReportKind, "all">,
  filter: MovementReportKindFilter,
) {
  if (filter === "all") return true;
  return kind === filter;
}

export type MovementReportSummary = {
  netMovement: number;
  productsAffected: number;
  totalMovements: number;
  totalQtyIn: number;
  totalQtyOut: number;
  valueInLak: number;
  valueOutLak: number;
};

export function emptyMovementSummary(): MovementReportSummary {
  return {
    netMovement: 0,
    productsAffected: 0,
    totalMovements: 0,
    totalQtyIn: 0,
    totalQtyOut: 0,
    valueInLak: 0,
    valueOutLak: 0,
  };
}

export function summarizeMovementRows(
  rows: Array<{ movementValueLak: number; netQty: number; productId: string; qtyIn: number; qtyOut: number }>,
): MovementReportSummary {
  const summary = emptyMovementSummary();
  const products = new Set<string>();
  for (const row of rows) {
    summary.totalMovements += 1;
    summary.totalQtyIn += qtyNum(row.qtyIn);
    summary.totalQtyOut += qtyNum(row.qtyOut);
    summary.netMovement += qtyNum(row.netQty);
    if (row.netQty >= 0) summary.valueInLak += moneyLak(Math.abs(row.movementValueLak));
    else summary.valueOutLak += moneyLak(Math.abs(row.movementValueLak));
    products.add(row.productId);
  }
  summary.productsAffected = products.size;
  summary.valueInLak = moneyLak(summary.valueInLak);
  summary.valueOutLak = moneyLak(summary.valueOutLak);
  return summary;
}

/** Valuation method — Current Cost only (no FIFO/WAC). */
export const STOCK_VALUATION_METHOD = "current_cost" as const;
