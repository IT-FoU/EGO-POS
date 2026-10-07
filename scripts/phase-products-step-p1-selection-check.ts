import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const list = read("features/products/components/product-list-client.tsx");
const query = read("features/products/list-query.ts");
const actions = read("features/products/actions.ts");
const schema = read("prisma/schema.prisma");
const exportDrawer = read("features/products/components/product-export-drawer.tsx");
const barcode = read("features/products/components/product-print-barcode-drawer.tsx");
const shelf = read("features/products/components/product-print-shelf-drawer.tsx");
const bulk = read("features/products/components/product-bulk-price-drawer.tsx");

check("copy parity", productsCopyKeyParity());
for (const key of ["productsSelected", "clearSelection", "selectPage", "selectAllFiltered", "newProducts", "last30Days", "needsLabelReprint", "noProductsSelected", "selectProductsFirst"] as const) {
  const en = tProducts(key, "en");
  const lo = tProducts(key, "lo");
  check(`copy ${key}`, en.length > 0 && lo.length > 0 && en !== lo && lo !== key);
}
check("new products filter", query.includes('"new_products"') && query.includes("createdAt: { gte: createdSince }"));
check("id query capped", query.includes("const MAX_FILTERED_SELECTION = 2000") && query.includes("take: MAX_FILTERED_SELECTION"));
check("ids action", actions.includes("loadProductListIdsAction") && actions.includes("getPrismaProductListIds"));
check("page checkbox", list.includes('data-testid="products-select-page"') && list.includes('aria-label={t("selectPage")}'));
check("row checkbox", list.includes('data-testid="products-row-select"'));
check("selected bar", list.includes('data-testid="products-selected-bar"') && list.includes('data-testid="products-clear-selection"'));
check("select filtered explicit", list.includes('data-testid="products-select-filtered"') && list.includes("totalCount > paginatedProducts.length"));
check("selection required disabled", list.includes("disabled={selectionRequired}") && list.includes('data-testid="products-selection-context"'));
check("session selection", list.includes("ego-pos-product-selection"));
check("no auto select on insight", !list.includes("setSelectedProductIds") || !/applyInsightFilter[\s\S]{0,240}setSelectedProductIds/.test(list));
check("export default selected or filtered", exportDrawer.includes('useState<ExportScope>(selectedIds.length > 0 ? "selected" : "filtered")'));
check("routing counts", [exportDrawer, barcode, shelf, bulk].every((source) => source.includes("data-selected-count={selectedIds.length}")));
check("import ignores selection", read("features/products/components/product-import-drawer.tsx").includes('data-ignores-selection="true"'));
check("no schema change marker", !schema.includes("needsLabelReprint") && !schema.includes("labelPrintedAt"));

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
