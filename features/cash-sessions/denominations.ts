/** Supported LAK cash denominations for POS Cash Shift Count. Integer LAK only. */
export const CASH_DENOMINATIONS_LAK = [50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500] as const;

export type CashDenominationLak = (typeof CASH_DENOMINATIONS_LAK)[number];

export type VarianceKind = "exact" | "over" | "short";

export function emptyDenominationCounts(): Record<number, number> {
  return Object.fromEntries(CASH_DENOMINATIONS_LAK.map((denomination) => [denomination, 0]));
}

/** quantity × denomination = line subtotal (integer LAK). */
export function denominationLineSubtotal(denominationLak: number, quantity: number): number {
  const denom = Math.trunc(Number(denominationLak) || 0);
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return denom * qty;
}

/** Sum of all denomination line subtotals (integer LAK). */
export function sumDenominationCounts(
  counts: Record<number, number> | Record<string, number>,
): number {
  let total = 0;
  for (const denomination of CASH_DENOMINATIONS_LAK) {
    const qty = Number((counts as Record<number | string, number>)[denomination] ?? 0);
    total += denominationLineSubtotal(denomination, qty);
  }
  return total;
}

export function varianceKind(varianceLak: number): VarianceKind {
  if (varianceLak === 0) return "exact";
  if (varianceLak > 0) return "over";
  return "short";
}
