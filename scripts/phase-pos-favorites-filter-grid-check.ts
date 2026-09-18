import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  resolveFavoriteQtyAdjustTarget,
  selectFavoriteCatalogueProducts,
  sumCartQuantityForProduct,
} from "../features/pos/favorites-client";
import { projectPosCatalogueCards, removePosCartLine, updatePosCartQuantity } from "../features/pos/pos-cart";
import type { PosCartItem, PosProduct } from "../features/pos/types";

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

function product(id: string, isFavorite?: boolean, unitId?: string): PosProduct {
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
    unitId: unitId ?? `unit-${id}`,
    conversionQty: 1,
    isFavorite,
  } as PosProduct;
}

function cartLine(id: string, quantity: number, unitId: string, stockQty = 100): PosCartItem {
  return {
    id,
    quantity,
    unitId,
    stockQty,
    conversionQty: 1,
    nameEn: id,
    nameLo: id,
    sku: id,
    barcode: "",
    categoryName: "General",
    imageKey: "",
    unitName: unitId,
    priceLak: 1000,
    retailPriceLak: 1000,
  } as PosCartItem;
}

const client = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-page-client.tsx"),
  "utf8",
);
const smallModal = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-small-modal.tsx"),
  "utf8",
);
const workspaceModal = readFileSync(
  join(process.cwd(), "features", "pos", "components", "pos-workspace-modal.tsx"),
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

const favoritesModalSlice = client.slice(
  client.indexOf('{favoritesOpen ?'),
  client.indexOf("{heldBillsOpen ?"),
);

check("8. Issue 3: Favorites product click does NOT auto-close after add", () => {
  assert(favoritesModalSlice.includes("selectProductForSale(product)"), "product click still adds via selectProductForSale");
  assert(
    !/selectProductForSale\(product\);\s*setFavoritesOpen\(false\)/.test(favoritesModalSlice),
    "must not close Favorites immediately after selectProductForSale",
  );
  assert(
    favoritesModalSlice.includes('onClose={() => setFavoritesOpen(false)}'),
    "explicit Close still wired",
  );
  const autoCloseCalls = [...favoritesModalSlice.matchAll(/setFavoritesOpen\(false\)/g)];
  assert(autoCloseCalls.length === 1, `expected exactly 1 close setter (onClose), got ${autoCloseCalls.length}`);
});

check("9. Issue 3: unfavorite stays inside open Favorites (toggle only)", () => {
  assert(
    favoritesModalSlice.includes("onToggleFavorite={() => void toggleFavorite(product)}"),
    "star uses toggleFavorite",
  );
  assert(!/toggleFavorite[\s\S]{0,80}setFavoritesOpen\(false\)/.test(favoritesModalSlice), "unfavorite must not close Favorites");
});

check("10. Issue 3: Unit Selector does not dismiss Favorites parent", () => {
  assert(client.includes("setUnitSelectionProduct(product)"), "multi-unit opens Unit Selector");
  assert(client.includes("unitSelectionIntent"), "unit selection intent for add/decrement");
  const unitBlockStart = client.indexOf("{unitSelectionProduct ?");
  const unitBlock = client.slice(unitBlockStart, unitBlockStart + 900);
  assert(unitBlock.includes("<UnitSelectorModal"), "Unit Selector modal used");
  assert(!unitBlock.includes("setFavoritesOpen"), "Unit Selector must not touch Favorites open state");
});

check("11. Issue 3: multi-add supported (Favorites stays open between additions)", () => {
  assert(
    favoritesModalSlice.includes("selectProductForSale(product)"),
    "Favorites click path only selects product",
  );
  assert(!favoritesModalSlice.includes("setFavoritesOpen(false);\n"), "no inline auto-close after click");
});

check("12. Cart badge: product absent from cart → quantity 0 (hidden)", () => {
  assert(sumCartQuantityForProduct([], "pepsi") === 0, "empty cart");
  assert(
    sumCartQuantityForProduct([{ id: "other", quantity: 2 }], "pepsi") === 0,
    "other product must not count",
  );
});

check("13. Cart badge: product qty 1 → badge 1", () => {
  assert(sumCartQuantityForProduct([{ id: "pepsi", quantity: 1 }], "pepsi") === 1, "qty 1");
});

check("14. Cart badge: product qty 3 → badge 3", () => {
  assert(sumCartQuantityForProduct([{ id: "pepsi", quantity: 3 }], "pepsi") === 3, "qty 3");
});

check("15. Cart badge: Piece 2 + Pack 1 → badge 3 (no conversion)", () => {
  const cart = [
    { id: "pepsi", quantity: 2 },
    { id: "pepsi", quantity: 1 },
  ];
  assert(sumCartQuantityForProduct(cart, "pepsi") === 3, "sum sell-unit qtys");
});

check("16. Cart badge: quantity decrease / remove updates", () => {
  let cart = [
    { id: "pepsi", quantity: 3 },
    { id: "water", quantity: 1 },
  ];
  assert(sumCartQuantityForProduct(cart, "pepsi") === 3, "start at 3");
  cart = [{ id: "pepsi", quantity: 1 }, { id: "water", quantity: 1 }];
  assert(sumCartQuantityForProduct(cart, "pepsi") === 1, "decreased to 1");
  cart = [{ id: "water", quantity: 1 }];
  assert(sumCartQuantityForProduct(cart, "pepsi") === 0, "removed → hidden");
});

check("17. Cart badge: Favorites-only wiring (main grid unchanged)", () => {
  assert(favoritesModalSlice.includes("cartQuantity="), "Favorites passes cartQuantity");
  assert(favoritesModalSlice.includes("onCartQuantityDelta="), "Favorites passes qty stepper handler");
  assert(
    favoritesModalSlice.includes("favoriteCartQtyByProductId.get(product.id)"),
    "badge qty derived from cart map",
  );
  assert(client.includes('data-testid="pos-favorites-cart-qty-stepper"'), "stepper marker");
  assert(client.includes('data-testid="pos-favorites-cart-qty-badge"'), "badge marker");
  assert(client.includes("absolute left-2 top-2"), "control top-left");
  const mainGridSlice = client.slice(
    client.indexOf("{productGridVisible ?"),
    client.indexOf("{favoritesOpen ?"),
  );
  assert(mainGridSlice.includes("<ProductGridItem"), "main grid still uses ProductGridItem");
  assert(!mainGridSlice.includes("cartQuantity"), "main Product Grid has no quantity badge prop");
  assert(!mainGridSlice.includes("onCartQuantityDelta"), "main Product Grid has no stepper");
});

check("18. Favorite star remains independent of cart badge", () => {
  assert(favoritesModalSlice.includes("onToggleFavorite={() => void toggleFavorite(product)}"), "star toggle intact");
  assert(client.includes("absolute right-2 top-2 z-20 grid size-9"), "star stays top-right");
});

check("19. Qty stepper: single-line qty 1 minus → removed / hidden", () => {
  let cart: PosCartItem[] = [cartLine("pepsi", 1, "piece")];
  const target = resolveFavoriteQtyAdjustTarget(cart, { id: "pepsi" });
  assert(target.type === "line", "single line target");
  if (target.type === "line") {
    cart = removePosCartLine(cart, target.line.id, target.line.unitId);
  }
  assert(sumCartQuantityForProduct(cart, "pepsi") === 0, "line removed");
});

check("20. Qty stepper: single-line qty 2 minus → 1", () => {
  let cart: PosCartItem[] = [cartLine("pepsi", 2, "piece")];
  const target = resolveFavoriteQtyAdjustTarget(cart, { id: "pepsi" });
  assert(target.type === "line", "single line");
  if (target.type === "line") {
    cart = updatePosCartQuantity(cart, target.line.id, target.line.quantity - 1, target.line.unitId);
  }
  assert(sumCartQuantityForProduct(cart, "pepsi") === 1, "qty 1");
});

check("21. Qty stepper: plus increases single-line quantity", () => {
  let cart: PosCartItem[] = [cartLine("pepsi", 1, "piece")];
  const target = resolveFavoriteQtyAdjustTarget(cart, { id: "pepsi" });
  assert(target.type === "line", "single line");
  if (target.type === "line") {
    cart = updatePosCartQuantity(cart, target.line.id, target.line.quantity + 1, target.line.unitId);
  }
  assert(sumCartQuantityForProduct(cart, "pepsi") === 2, "qty 2");
});

check("22. Qty stepper: +/- stopPropagation wiring present", () => {
  assert(client.includes('data-testid="pos-favorites-cart-qty-minus"'), "minus button");
  assert(client.includes('data-testid="pos-favorites-cart-qty-plus"'), "plus button");
  assert(client.includes("onCartQuantityDelta(-1)"), "minus delta");
  assert(client.includes("onCartQuantityDelta(1)"), "plus delta");
  assert(client.includes("event.stopPropagation()"), "stopPropagation used");
  assert(client.includes("adjustFavoriteCartQuantity"), "favorites adjust handler");
});

check("23. Qty stepper: Favorites stays open during adjustments", () => {
  assert(client.includes("function adjustFavoriteCartQuantity"), "adjust helper");
  assert(!/adjustFavoriteCartQuantity[\s\S]{0,400}setFavoritesOpen\(false\)/.test(client), "adjust must not close Favorites");
});

check("24. Unit Selector nested above Favorites (z-[70] over z-[60])", () => {
  assert(workspaceModal.includes("z-[60]"), "Favorites/workspace layer z-[60]");
  assert(smallModal.includes('className={cn("fixed inset-0 z-50 grid place-items-center p-4 bg-black/60", overlayClassName)}'), "default z-50 + overlayClassName");
  assert(client.includes('overlayClassName={favoritesOpen ? "z-[70]" : undefined}'), "elevated Unit Selector when Favorites open");
  assert(smallModal.includes("stopImmediatePropagation"), "nested Escape closes Unit Selector first");
  assert(smallModal.includes('addEventListener("keydown", handleKeyDown, true)'), "Escape capture listener");
});

check("25. Unit selection closes selector only; Favorites intent preserved", () => {
  assert(client.includes('unitSelectionIntent === "decrement"'), "decrement path via unit pick");
  assert(client.includes('setUnitSelectionIntent("add")'), "intent reset after close/select");
  const unitBlockStart = client.indexOf("{unitSelectionProduct ?");
  const unitBlock = client.slice(unitBlockStart, unitBlockStart + 900);
  assert(!unitBlock.includes("setFavoritesOpen"), "unit select does not close Favorites");
});

check("26. Multi-unit decrement does not guess unit identity", () => {
  const cart = [cartLine("pepsi", 2, "piece"), cartLine("pepsi", 1, "pack")];
  const target = resolveFavoriteQtyAdjustTarget(cart, { id: "pepsi" });
  assert(target.type === "multi", "multi-unit requires explicit unit pick");
  const withCardUnit = resolveFavoriteQtyAdjustTarget(cart, { id: "pepsi", unitId: "pack" });
  assert(withCardUnit.type === "line", "card unitId pins the line");
  if (withCardUnit.type === "line") {
    assert(withCardUnit.line.unitId === "pack", "pack line retained");
    assert(withCardUnit.line.quantity === 1, "pack qty intact");
  }
});

console.log("");
console.log("NOTE: Browser click / Unit Selector overlay stacking / stepper visuals require Owner Interaction QA.");
const failed = results.filter((entry) => entry.status === "FAIL");
console.log(`Favorites regression checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
