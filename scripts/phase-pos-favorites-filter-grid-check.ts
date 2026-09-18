import { readFileSync } from "node:fs";
import { join } from "node:path";
import { selectFavoriteCatalogueProducts } from "../features/pos/favorites-client";
import { projectPosCatalogueCards } from "../features/pos/pos-cart";
import type { PosProduct } from "../features/pos/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ name: string; status: "FAIL" | "PASS"; detail?: string }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

function product(id: string, isFavorite?: boolean): PosProduct {
  return {
    id,
    name: `Product ${id}`,
    sku: `SKU-${id}`,
    barcode: null,
    categoryName: "General",
    priceLak: 1000,
    retailPriceLak: 1000,
    stockQty: 10,
    unitName: "Piece",
    unitId: `unit-${id}`,
    conversionQty: 1,
    isFavorite,
  } as PosProduct;
}

const client = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-page-client.tsx"),
  "utf8",
);

check("1. 3 products, only 1 favorited → Favorites shows exactly 1", () => {
  const products = [product("a", true), product("b", false), product("c")];
  const favorites = selectFavoriteCatalogueProducts(products);
  assert(favorites.length === 1, `expected 1 got ${favorites.length}`);
  assert(favorites[0]?.id === "a", "expected product a");
});

check("2. 3 products, 2 favorited → Favorites shows exactly 2", () => {
  const products = [product("a", true), product("b", true), product("c", false)];
  const favorites = selectFavoriteCatalogueProducts(products);
  assert(favorites.length === 2, `expected 2 got ${favorites.length}`);
  assert(favorites.every((item) => item.isFavorite), "all must be favorited");
});

check("3. zero favorites → empty list (NOT all products)", () => {
  const products = [product("a", false), product("b"), product("c", false)];
  const favorites = selectFavoriteCatalogueProducts(products);
  assert(favorites.length === 0, `expected empty got ${favorites.length}`);
  assert(favorites.length !== products.length, "must not fall back to all products");
});

check("4. unfavorite removes product from Favorites list", () => {
  let products = [product("a", true), product("b", true), product("c", false)];
  products = products.map((entry) => (entry.id === "a" ? { ...entry, isFavorite: false } : entry));
  const favorites = selectFavoriteCatalogueProducts(products);
  assert(favorites.length === 1, `expected 1 remaining got ${favorites.length}`);
  assert(favorites[0]?.id === "b", "product a must be gone");
});

check("5. desktop Favorites grid uses xl:grid-cols-6 (no auto-fit on xl)", () => {
  assert(client.includes('data-testid="pos-favorites-grid"'), "favorites grid marker");
  assert(
    client.includes(
      'className="grid grid-cols-[repeat(auto-fit,minmax(155px,1fr))] gap-3 xl:grid-cols-6"',
    ),
    "desktop xl:grid-cols-6 with responsive auto-fit below xl",
  );
  assert(!/pos-favorites-grid[\s\S]{0,200}lg:grid-cols-3/.test(client), "old 3-col favorites grid removed");
  assert(!client.includes("favorites.length >= 12"), "pad-to-catalogue fallback removed");
  assert(!client.includes("visibleProducts.slice(0, 16)"), "all-products fallback removed from favorites");
});

check("6. single favorite uses ProductGridItem and does not use stretch-to-fill grid", () => {
  const favoritesSlice = client.slice(
    client.indexOf('{favoritesOpen ?'),
    client.indexOf("{heldBillsOpen ?"),
  );
  assert(favoritesSlice.includes("<ProductGridItem"), "reuses ProductGridItem");
  assert(favoritesSlice.includes("xl:grid-cols-6"), "fixed 6 tracks on desktop");
  assert(!favoritesSlice.includes("sm:grid-cols-2 lg:grid-cols-3"), "flexible 2/3-col stretch layout removed");
  const one = selectFavoriteCatalogueProducts([product("only", true)]);
  const cards = projectPosCatalogueCards(one, "combined");
  assert(cards.length === 1, "single favorite stays one card");
});

check("7. Favorites empty state wiring present", () => {
  assert(client.includes('data-testid="pos-favorites-empty"'), "empty state marker");
  assert(client.includes('t("ui.no.favorite.products.yet")'), "empty copy");
  assert(client.includes("selectFavoriteCatalogueProducts"), "shared filter helper used");
});

console.log("");
const failed = results.filter((entry) => entry.status === "FAIL");
console.log(`Favorites regression checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
