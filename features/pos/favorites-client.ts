export function selectFavoriteCatalogueProducts<T extends { id: string; isFavorite?: boolean }>(
  products: T[],
): T[] {
  return products.filter((product) => Boolean(product.isFavorite));
}

/** Sum sell-unit cart line quantities for one product (no base-unit conversion). */
export function sumCartQuantityForProduct(
  cartItems: Array<{ id: string; quantity: number }>,
  productId: string,
): number {
  let total = 0;
  for (const item of cartItems) {
    if (item.id === productId) total += item.quantity;
  }
  return total;
}

export type FavoriteCartQtyLine = {
  id: string;
  quantity: number;
  unitId?: string;
};

/**
 * Resolve which cart line Favorites +/- should adjust.
 * Prefer the card's unitId when present; otherwise a single product line.
 * Multiple unit lines without a matching card unit → "multi" (do not guess).
 */
export function resolveFavoriteQtyAdjustTarget(
  cartItems: FavoriteCartQtyLine[],
  product: { id: string; unitId?: string },
): { type: "line"; line: FavoriteCartQtyLine } | { type: "multi" } | { type: "none" } {
  const lines = cartItems.filter((item) => item.id === product.id);
  if (product.unitId) {
    const match = lines.find((item) => item.unitId === product.unitId);
    if (match) return { type: "line", line: match };
  }
  if (lines.length === 1) return { type: "line", line: lines[0]! };
  if (lines.length === 0) return { type: "none" };
  return { type: "multi" };
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(String(payload?.error || payload?.message || "Favorite update failed."));
  }
  return (payload?.data ?? payload) as T;
}

export async function setPosFavorite(productId: string, favorite: boolean) {
  return readJson<{ favorite: boolean; productId: string }>(
    await fetch("/api/pos/favorites", {
      body: JSON.stringify({ favorite, productId }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
}
