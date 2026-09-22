/**
 * R7B Cash Shift Count + Cash In/Out report math.
 * Reuses Batch H / STEP9 variance helpers. Does not change write paths.
 */
import {
  calculateVariance,
  varianceStatus,
} from "@/features/cash-sessions/cash-session-calculator";
import {
  moneyLak,
  resolveShiftVariance,
  type ShiftVarianceKind,
} from "@/features/reports/shift-table-math";

export const CASH_REPORT_PAGE_SIZE = 50;
export const CASH_REPORT_SCAN_LIMIT = 1000;

export const CASH_COUNT_STATUSES = ["all", "open", "closed"] as const;
export type CashCountStatusFilter = (typeof CASH_COUNT_STATUSES)[number];

export const CASH_COUNT_VARIANCE = ["all", "balanced", "over", "short", "open"] as const;
export type CashCountVarianceFilter = (typeof CASH_COUNT_VARIANCE)[number];

export const CASH_MOVEMENT_TYPES = ["all", "cash_in", "cash_out"] as const;
export type CashMovementTypeFilter = (typeof CASH_MOVEMENT_TYPES)[number];

export { moneyLak, resolveShiftVariance };
export type { ShiftVarianceKind };

export function resolveCountVariance(input: {
  closedAt: Date | string | null | undefined;
  countedCashLak: number | null;
  expectedCashLak: number;
  persistedVarianceLak: number | null;
}) {
  return resolveShiftVariance(input);
}

export type CashCountSummary = {
  balancedCounts: number;
  countedCashLak: number;
  expectedCashLak: number;
  overCounts: number;
  shortCounts: number;
  totalCounts: number;
  totalOverLak: number;
  totalShortLak: number;
  totalVarianceLak: number;
};

export function emptyCashCountSummary(): CashCountSummary {
  return {
    balancedCounts: 0,
    countedCashLak: 0,
    expectedCashLak: 0,
    overCounts: 0,
    shortCounts: 0,
    totalCounts: 0,
    totalOverLak: 0,
    totalShortLak: 0,
    totalVarianceLak: 0,
  };
}

export function summarizeCashCountRows(
  rows: Array<{
    countedCashLak: number | null;
    expectedCashLak: number;
    varianceKind: ShiftVarianceKind;
    varianceLak: number | null;
  }>,
): CashCountSummary {
  const summary = emptyCashCountSummary();
  for (const row of rows) {
    summary.totalCounts += 1;
    summary.expectedCashLak += moneyLak(row.expectedCashLak);
    if (row.countedCashLak != null) summary.countedCashLak += moneyLak(row.countedCashLak);
    if (row.varianceLak != null) {
      const variance = moneyLak(row.varianceLak);
      summary.totalVarianceLak += variance;
      if (variance > 0) summary.totalOverLak += variance;
      if (variance < 0) summary.totalShortLak += Math.abs(variance);
    }
    if (row.varianceKind === "balanced") summary.balancedCounts += 1;
    if (row.varianceKind === "over") summary.overCounts += 1;
    if (row.varianceKind === "short") summary.shortCounts += 1;
  }
  return summary;
}

export type CashCountTotalRow = {
  countedCashLak: number;
  expectedCashLak: number;
  rowCount: number;
  varianceLak: number;
};

export function cashCountTotalFromSummary(summary: CashCountSummary): CashCountTotalRow {
  return {
    countedCashLak: summary.countedCashLak,
    expectedCashLak: summary.expectedCashLak,
    rowCount: summary.totalCounts,
    varianceLak: summary.totalVarianceLak,
  };
}

export type CashMovementSummary = {
  cashInCount: number;
  cashInLak: number;
  cashOutCount: number;
  cashOutLak: number;
  netMovementLak: number;
  totalMovements: number;
};

export function emptyCashMovementSummary(): CashMovementSummary {
  return {
    cashInCount: 0,
    cashInLak: 0,
    cashOutCount: 0,
    cashOutLak: 0,
    netMovementLak: 0,
    totalMovements: 0,
  };
}

export function summarizeCashMovements(
  rows: Array<{ amountLak: number; type: "cash_in" | "cash_out" }>,
): CashMovementSummary {
  const summary = emptyCashMovementSummary();
  for (const row of rows) {
    summary.totalMovements += 1;
    const amount = moneyLak(row.amountLak);
    if (row.type === "cash_in") {
      summary.cashInCount += 1;
      summary.cashInLak += amount;
    } else {
      summary.cashOutCount += 1;
      summary.cashOutLak += amount;
    }
  }
  summary.netMovementLak = summary.cashInLak - summary.cashOutLak;
  return summary;
}

export type CashMovementTotalRow = {
  cashInLak: number;
  cashOutLak: number;
  netMovementLak: number;
  rowCount: number;
};

export function cashMovementTotalFromSummary(summary: CashMovementSummary): CashMovementTotalRow {
  return {
    cashInLak: summary.cashInLak,
    cashOutLak: summary.cashOutLak,
    netMovementLak: summary.netMovementLak,
    rowCount: summary.totalMovements,
  };
}

export function deriveVarianceKind(varianceLak: number): "balanced" | "over" | "short" {
  const status = varianceStatus(varianceLak);
  return status === "exact" ? "balanced" : status;
}

export function countedMinusExpected(countedCashLak: number, expectedCashLak: number) {
  return calculateVariance(countedCashLak, expectedCashLak);
}
