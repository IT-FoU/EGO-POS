/**
 * STEP 1 shared white table visual standard. Source structure only.
 */
import { readFileSync } from "node:fs";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const table = readFileSync("features/products/components/selected-products-list.tsx", "utf8");
check("white surface", table.includes("#FFFFFF") && table.includes("color-scheme: light"));
check("dark main text", table.includes("#111827"));
check("secondary text", table.includes("#475569"));
check("header surface", table.includes("#F8FAFC") && table.includes("font-weight: 650"));
check("grid and scroll", table.includes("border: 1px solid #CBD5E1") && table.includes("overflow-auto") && table.includes("minWidth"));
check("focus and hover", table.includes(":focus-visible") && table.includes("tbody tr:hover td"));
check("name stays available", table.includes("text-overflow: ellipsis") && table.includes("title={children}"));

const targets = [
  ["barcode", "features/products/components/product-print-barcode-drawer.tsx"],
  ["shelf", "features/products/components/product-print-shelf-drawer.tsx"],
  ["bulk", "features/products/components/product-bulk-price-drawer.tsx"],
  ["export", "features/products/components/product-export-drawer.tsx"],
  ["audit", "features/products/components/product-barcode-audit-drawer.tsx"],
] as const;
for (const [name, path] of targets) {
  const source = readFileSync(path, "utf8");
  check(`${name} uses shared table`, source.includes("WhiteDataTable"));
}

const barcode = readFileSync("features/products/components/product-print-barcode-drawer.tsx", "utf8");
const shelf = readFileSync("features/products/components/product-print-shelf-drawer.tsx", "utf8");
const bulk = readFileSync("features/products/components/product-bulk-price-drawer.tsx", "utf8");
const exported = readFileSync("features/products/components/product-export-drawer.tsx", "utf8");
const audit = readFileSync("features/products/components/product-barcode-audit-drawer.tsx", "utf8");
check("barcode columns stay", barcode.includes('t("productName")') && barcode.includes('t("action")') && barcode.includes("products-print-qty") && barcode.includes("products-print-remove-product"));
check("shelf print behavior stays", shelf.includes("window.print()") && shelf.includes("break-after: page") && !shelf.includes("update(") && !shelf.includes("create(") && !shelf.includes("delete("));
check("bulk preview still does not write", (() => {
  const slice = bulk.slice(bulk.indexOf("products-bulk-preview"), bulk.indexOf("products-bulk-preview") + 400);
  return slice.includes('setPhase("preview")') && !slice.includes("applyBulkSellingPricesAction") && bulk.includes('t("bulkAmount")');
})());
check("export preview is a real table", exported.includes("products-export-preview-table") && exported.includes("preview.headers.map") && !exported.includes('preview.headers.join(", ")'));
check("audit empty state stays in the table", audit.includes("products-barcode-audit-empty") && audit.includes('t("auditNoIssues")') && audit.includes('t("action")'));
check("pagination helpers stay", readFileSync("features/products/label-preview-page.ts", "utf8").includes("LABEL_PREVIEW_PAGE_SIZES = [12, 24, 48]"));
check("amount rounding stays directional", readFileSync("features/products/bulk-price.ts", "utf8").includes("floorToLakIncrement") && readFileSync("features/products/bulk-price.ts", "utf8").includes("ceilToLakIncrement"));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
