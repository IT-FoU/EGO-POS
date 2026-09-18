/** Supported LAK cash denominations for POS Cash Shift Count. Integer LAK only. */
export const CASH_DENOMINATIONS_LAK = [50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500] as const;

export type CashDenominationLak = (typeof CASH_DENOMINATIONS_LAK)[number];

export type VarianceKind = "exact" | "over" | "short";

/** Quantity map keyed by denomination LAK string (e.g. "50000": 3). Zeros omitted when normalized. */
export type DenominationCountMap = Record<string, number>;

export type CashSessionCountBreakdown = {
  closing?: DenominationCountMap;
  opening?: DenominationCountMap;
};

const ALLOWED_DENOMINATION_KEYS = new Set(CASH_DENOMINATIONS_LAK.map(String));

export function emptyDenominationCounts(): Record<number, number> {
  return Object.fromEntries(CASH_DENOMINATIONS_LAK.map((denomination) => [denomination, 0]));
}

/** quantity × denomination = line subtotal (integer LAK). UI helper; floors qty. */
export function denominationLineSubtotal(denominationLak: number, quantity: number): number {
  const denom = Math.trunc(Number(denominationLak) || 0);
  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  return denom * qty;
}

/** Sum of all denomination line subtotals (integer LAK). UI helper. */
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

/** Convert UI numeric-key counts to persisted string-key map (omit zeros). */
export function toDenominationCountMap(
  counts: Record<number, number> | Record<string, number>,
): DenominationCountMap {
  const result: DenominationCountMap = {};
  for (const denomination of CASH_DENOMINATIONS_LAK) {
    const raw = (counts as Record<number | string, number>)[denomination];
    if (raw == null) continue;
    const qty = Number(raw);
    if (!Number.isInteger(qty) || qty < 0) {
      throw new Error(`Invalid quantity for denomination ${denomination}.`);
    }
    if (qty > 0) {
      result[String(denomination)] = qty;
    }
  }
  return result;
}

/**
 * Server-side strict parse of a denomination quantity map.
 * Rejects unknown keys, NaN, floats, negatives. Omits zeros.
 */
export function parseDenominationCountMap(raw: unknown, label: string): DenominationCountMap {
  if (raw == null) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label} denomination breakdown must be an object.`);
  }

  const result: DenominationCountMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ALLOWED_DENOMINATION_KEYS.has(key)) {
      throw new Error(`${label}: unsupported denomination ${key}.`);
    }
    if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value)) {
      throw new Error(`${label}: quantity for ${key} must be a finite number.`);
    }
    if (!Number.isInteger(value)) {
      throw new Error(`${label}: quantity for ${key} must be an integer.`);
    }
    if (value < 0) {
      throw new Error(`${label}: quantity for ${key} cannot be negative.`);
    }
    if (value > 0) {
      result[key] = value;
    }
  }
  return result;
}

export function sumParsedDenominationCounts(counts: DenominationCountMap): number {
  let total = 0;
  for (const [key, qty] of Object.entries(counts)) {
    total += Number(key) * qty;
  }
  return total;
}

export function assertDenominationTotalMatches(
  counts: DenominationCountMap,
  submittedTotalLak: number,
  label: string,
) {
  const summed = sumParsedDenominationCounts(counts);
  const expected = Math.trunc(Number(submittedTotalLak) || 0);
  if (summed !== expected) {
    throw new Error(
      `${label} denomination total ${summed} does not match submitted cash ${expected}.`,
    );
  }
}

export function parseCashSessionCountBreakdown(raw: unknown): CashSessionCountBreakdown | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const breakdown: CashSessionCountBreakdown = {};
  if ("opening" in record && record.opening != null) {
    breakdown.opening = parseDenominationCountMap(record.opening, "Stored opening");
  }
  if ("closing" in record && record.closing != null) {
    breakdown.closing = parseDenominationCountMap(record.closing, "Stored closing");
  }
  return breakdown.opening || breakdown.closing ? breakdown : null;
}

/** Merge closing onto existing breakdown without dropping opening. */
export function mergeClosingCountBreakdown(
  existing: unknown,
  closing: DenominationCountMap,
): CashSessionCountBreakdown {
  const prior = parseCashSessionCountBreakdown(existing);
  const next: CashSessionCountBreakdown = {};
  if (prior?.opening && Object.keys(prior.opening).length > 0) {
    next.opening = prior.opening;
  }
  if (Object.keys(closing).length > 0) {
    next.closing = closing;
  }
  return next;
}
