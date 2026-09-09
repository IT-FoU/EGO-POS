import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyPosCatalogueRefresh,
  isPosCatalogueStorageEvent,
  POS_CATALOGUE_CHANNEL,
  POS_CATALOGUE_INVALIDATION_KEY,
  shouldSkipPosCatalogueRefresh,
} from "../features/pos/pos-catalogue-refresh";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

const root = process.cwd();
const posClient = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const quickStockIn = readFileSync(join(root, "features/inventory/components/quick-stock-in-form.tsx"), "utf8");
const posActions = readFileSync(join(root, "features/pos/actions.ts"), "utf8");
const posRepo = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");
const productRepo = readFileSync(join(root, "features/products/prisma-repository.ts"), "utf8");

check("Create product seeds warehouse balance", () => {
  assert(productRepo.includes("seedDefaultWarehouseBalance"), "missing balance seed helper");
  assert(productRepo.includes("await seedDefaultWarehouseBalance(tx, createdProduct.id"), "create does not seed balance");
});

check("Opening stock uses writeStockIn in the create transaction", () => {
  assert(productRepo.includes("const openingQuantity = numberValue(input.initialStock?.quantity)"), "missing opening qty gate");
  assert(productRepo.includes("await writeStockIn("), "create does not call writeStockIn");
  assert(!productForm.includes("router.push(`/inventory/quick-stock-in"), "create still redirects to Quick Stock In");
});

check("POS lists active products without requiring a balance row", () => {
  assert(!posRepo.includes("balances: { some: { warehouseId: { in: sellWarehouseIds } } }"), "POS still gates on balances.some");
  assert(posRepo.includes("isActive: true"), "POS must still require active products");
});

check("Skip refresh when demo, offline, or checkout in flight", () => {
  assert(shouldSkipPosCatalogueRefresh({ checkoutInFlight: false, demoMode: true, online: true }), "demo must skip");
  assert(shouldSkipPosCatalogueRefresh({ checkoutInFlight: false, demoMode: false, online: false }), "offline must skip");
  assert(shouldSkipPosCatalogueRefresh({ checkoutInFlight: true, demoMode: false, online: true }), "checkout must skip");
  assert(!shouldSkipPosCatalogueRefresh({ checkoutInFlight: false, demoMode: false, online: true }), "online POS must refresh");
});

check("Storage invalidation key is scoped", () => {
  assert(isPosCatalogueStorageEvent({ key: POS_CATALOGUE_INVALIDATION_KEY }), "own key must match");
  assert(!isPosCatalogueStorageEvent({ key: "unrelated" }), "foreign key must not match");
  assert(POS_CATALOGUE_CHANNEL === "ego-pos-catalogue", "channel name changed");
});

check("Catalogue refresh does not mutate cart identity", () => {
  const cart = [{ id: "line-1", quantity: 3 }];
  const nextProducts = [{ id: "prd-2", stockQty: 15 }];
  const applied = applyPosCatalogueRefresh({ cart, nextProducts });
  assert(applied.cart === cart, "cart reference must stay unchanged");
  assert(applied.cart[0].quantity === 3, "cart qty must stay unchanged");
  assert(applied.products === nextProducts, "products must be the new snapshot");
});

check("POS client refreshes catalogue on focus/visibility/invalidation", () => {
  assert(posClient.includes("loadPosCatalogueAction"), "POS client does not load catalogue action");
  assert(posClient.includes("visibilitychange"), "missing visibility handler");
  assert(posClient.includes("setVisibleProducts(next.products)"), "refresh must update products only");
  assert(!posClient.includes("setCartItems(next"), "refresh must not rewrite cart");
});

check("Create Product and Quick Stock In emit invalidation", () => {
  assert(productForm.includes("signalPosCatalogueInvalidation()"), "create does not signal POS");
  assert(quickStockIn.includes("signalPosCatalogueInvalidation()"), "QSI does not signal POS");
  assert(posActions.includes("loadPosCatalogueAction"), "missing catalogue loader");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(JSON.stringify({ failed: failed.length, passed: results.filter((row) => row.status === "PASS").length, results, total: results.length }, null, 2));
if (failed.length) process.exit(1);
