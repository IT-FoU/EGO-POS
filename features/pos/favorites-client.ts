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
