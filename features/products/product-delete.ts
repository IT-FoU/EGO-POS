export type ProductDeleteBalanceRef = {
  quantity: unknown;
};

export type ProductDeleteMode = "hard" | "soft";

/** Historical refs that must preserve the product row (soft-delete only). */
export function sumHistoricalProductRefs(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export function hasNonZeroInventoryBalance(balances: ProductDeleteBalanceRef[]): boolean {
  return balances.some((balance) => Number(balance.quantity) !== 0);
}

/**
 * Fresh / unused products (only zero-qty seeded balances, no transactional history)
 * may hard-delete after cleaning those balances.
 */
export function resolveProductDeleteMode(input: {
  balances: ProductDeleteBalanceRef[];
  historicalReferenceCount: number;
}): ProductDeleteMode {
  if (input.historicalReferenceCount > 0) return "soft";
  if (hasNonZeroInventoryBalance(input.balances)) return "soft";
  return "hard";
}
