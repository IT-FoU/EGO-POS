/**
 * R7A Shift Summary + Own Shift History.
 * Reuses Batch H / STEP9 cash-session calculator. Does not change write paths.
 */
import {
  calculateVariance,
  varianceStatus,
} from "@/features/cash-sessions/cash-session-calculator";

export const SHIFT_TABLE_PAGE_SIZE = 50;
export const SHIFT_TABLE_SCAN_LIMIT = 500;

export const SHIFT_STATUSES = ["all", "open", "closed"] as const;
export type ShiftStatusFilter = (typeof SHIFT_STATUSES)[number];

export const VARIANCE_STATUSES = ["all", "balanced", "over", "short", "open"] as const;
export type VarianceStatusFilter = (typeof VARIANCE_STATUSES)[number];

export type ShiftVarianceKind = "balanced" | "over" | "short" | "open" | "unknown";

export function moneyLak(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export function shiftStatusOf(closedAt: Date | string | null | undefined): "open" | "closed" {
  return closedAt ? "closed" : "open";
}

export function resolveShiftVariance(input: {
  closedAt: Date | string | null | undefined;
  countedCashLak: number | null;
  expectedCashLak: number;
  persistedVarianceLak: number | null;
}): { kind: ShiftVarianceKind; varianceLak: number | null } {
  if (!input.closedAt) {
    return { kind: "open", varianceLak: null };
  }
  if (input.persistedVarianceLak != null) {
    const varianceLak = moneyLak(input.persistedVarianceLak);
    const status = varianceStatus(varianceLak);
    return {
      kind: status === "exact" ? "balanced" : status,
      varianceLak,
    };
  }
  if (input.countedCashLak == null) {
    return { kind: "unknown", varianceLak: null };
  }
  const varianceLak = calculateVariance(input.countedCashLak, input.expectedCashLak);
  const status = varianceStatus(varianceLak);
  return {
    kind: status === "exact" ? "balanced" : status,
    varianceLak,
  };
}

export type ShiftTableSummary = {
  cashInLak: number;
  cashOutLak: number;
  cashRefundsLak: number;
  cashVoidsLak: number;
  closedShifts: number;
  countedCashLak: number;
  expectedDrawerLak: number;
  grossCashSalesLak: number;
  openShifts: number;
  totalShifts: number;
  totalVarianceLak: number;
};

export function emptyShiftTableSummary(): ShiftTableSummary {
  return {
    cashInLak: 0,
    cashOutLak: 0,
    cashRefundsLak: 0,
    cashVoidsLak: 0,
    closedShifts: 0,
    countedCashLak: 0,
    expectedDrawerLak: 0,
    grossCashSalesLak: 0,
    openShifts: 0,
    totalShifts: 0,
    totalVarianceLak: 0,
  };
}

export function summarizeShiftRows(
  rows: Array<{
    cashInLak: number;
    cashOutLak: number;
    cashRefundsLak: number;
    cashVoidsLak: number;
    countedCashLak: number | null;
    expectedDrawerLak: number;
    grossCashSalesLak: number;
    openingCashLak: number;
    status: "open" | "closed";
    varianceLak: number | null;
  }>,
): ShiftTableSummary {
  const summary = emptyShiftTableSummary();
  for (const row of rows) {
    summary.totalShifts += 1;
    if (row.status === "open") summary.openShifts += 1;
    else summary.closedShifts += 1;
    summary.grossCashSalesLak += moneyLak(row.grossCashSalesLak);
    summary.cashRefundsLak += moneyLak(row.cashRefundsLak);
    summary.cashVoidsLak += moneyLak(row.cashVoidsLak);
    summary.cashInLak += moneyLak(row.cashInLak);
    summary.cashOutLak += moneyLak(row.cashOutLak);
    summary.expectedDrawerLak += moneyLak(row.expectedDrawerLak);
    if (row.countedCashLak != null) summary.countedCashLak += moneyLak(row.countedCashLak);
    if (row.varianceLak != null) summary.totalVarianceLak += moneyLak(row.varianceLak);
  }
  return summary;
}

export type ShiftTableTotalRow = {
  cashInLak: number;
  cashOutLak: number;
  cashRefundsLak: number;
  cashVoidsLak: number;
  countedCashLak: number;
  expectedDrawerLak: number;
  grossCashSalesLak: number;
  openingCashLak: number;
  rowCount: number;
  varianceLak: number;
};

export function totalRowFromSummary(
  summary: ShiftTableSummary,
  openingCashLak: number,
): ShiftTableTotalRow {
  return {
    cashInLak: summary.cashInLak,
    cashOutLak: summary.cashOutLak,
    cashRefundsLak: summary.cashRefundsLak,
    cashVoidsLak: summary.cashVoidsLak,
    countedCashLak: summary.countedCashLak,
    expectedDrawerLak: summary.expectedDrawerLak,
    grossCashSalesLak: summary.grossCashSalesLak,
    openingCashLak,
    rowCount: summary.totalShifts,
    varianceLak: summary.totalVarianceLak,
  };
}
