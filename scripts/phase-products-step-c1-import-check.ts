import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_TEMPLATE_CSV,
  buildProductImportCsv,
  emptyProductImportCatalog,
  evaluateProductImport,
  parseProductImportCsv,
  type ProductImportCatalog,
  type ProductImportColumn,
} from "../features/products/product-import";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function cells(partial: Partial<Record<ProductImportColumn, string>>) {
  return PRODUCT_IMPORT_COLUMNS.map((column) => partial[column] ?? "");
}

function evaluate(partials: Array<Partial<Record<ProductImportColumn, string>>>, catalog: ProductImportCatalog = emptyProductImportCatalog()) {
  return evaluateProductImport(parseProductImportCsv(buildProductImportCsv(partials.map(cells))), catalog);
}

const piece = {
  piece_barcode: "C1-PIECE",
  piece_cost: "4000",
  piece_selling_price: "5000",
  product_name: "Water",
  sku: "C1-WATER",
  status: "active",
};

const one = evaluate([piece]);
check("1. valid one product", one.validCount === 1 && one.errorCount === 0 && one.rows[0]?.draft?.units.length === 1);
check("3. piece conversion is 1", one.rows[0]?.draft?.units[0]?.unitName === "Piece" && one.rows[0]?.draft?.units[0]?.conversionQty === 1 && one.rows[0]?.draft?.units[0]?.pricingMode === "manual");

const pack = evaluate([{
  ...piece,
  pack_barcode: "C1-PACK",
  pack_cost: "22000",
  pack_enabled: "yes",
  pack_qty: "6",
  pack_selling_price: "28000",
}]);
const packUnits = pack.rows[0]?.draft?.units ?? [];
check("4. piece + pack", pack.validCount === 1 && packUnits.map((unit) => unit.unitName).join(",") === "Piece,Pack");
check("4b. pack price is independent", packUnits[1]?.sellingPriceLak === 28000 && packUnits[1]?.costPriceLak === 22000 && packUnits[1]?.sellingPriceLak !== 5000 * 6);

const both = evaluate([{
  ...piece,
  box_barcode: "C1-BOX",
  box_cost: "90000",
  box_enabled: "yes",
  box_qty: "24",
  box_selling_price: "110000",
  opening_stock: "2",
  opening_stock_unit: "Pack",
  pack_barcode: "C1-PACK",
  pack_cost: "22000",
  pack_enabled: "yes",
  pack_qty: "6",
  pack_selling_price: "28000",
}]);
const bothUnits = both.rows[0]?.draft?.units ?? [];
check("5. piece + pack + box", bothUnits.map((unit) => `${unit.unitName}:${unit.conversionQty}:${unit.sellingPriceLak}`).join("|") === "Piece:1:5000|Pack:6:28000|Box:24:110000");
check("6. opening stock keeps the selected unit", both.rows[0]?.draft?.initialStock?.quantity === 2 && both.rows[0]?.draft?.initialStock?.unitName === "Pack" && bothUnits.find((unit) => unit.unitName === "Pack")?.conversionQty === 6);

const duplicateSku = evaluate([piece, { ...piece, piece_barcode: "C1-OTHER", product_name: "Other" }]);
check("7. duplicate SKU in file", duplicateSku.errorCount === 2 && duplicateSku.rows.every((row) => row.draft === null && row.issues.some((issue) => issue.code === "duplicate_sku_file")));

const duplicateBarcode = evaluate([
  piece,
  { ...piece, piece_barcode: "C1-PIECE", product_name: "Other", sku: "C1-OTHER" },
]);
check("8. duplicate barcode in file", duplicateBarcode.errorCount === 2 && duplicateBarcode.rows.every((row) => row.issues.some((issue) => issue.code === "duplicate_barcode_file")));

const sameRow = evaluate([{ ...piece, pack_barcode: "C1-PIECE", pack_cost: "1", pack_enabled: "yes", pack_qty: "6", pack_selling_price: "2" }]);
check("8b. duplicate barcode across units", sameRow.rows[0]?.issues.some((issue) => issue.code === "duplicate_barcode_row") === true && sameRow.rows[0]?.draft === null);

const existing = evaluate([piece], { ...emptyProductImportCatalog(), barcodes: ["C1-PIECE"] });
check("9. existing barcode conflict", existing.rows[0]?.draft === null && existing.rows[0]?.issues.some((issue) => issue.code === "barcode_exists") === true);

const existingSku = evaluate([piece], { ...emptyProductImportCatalog(), skus: ["C1-WATER"] });
check("9b. existing SKU conflict", existingSku.rows[0]?.issues.some((issue) => issue.code === "sku_exists") === true);

const badNumber = evaluate([{ ...piece, piece_cost: "abc" }]);
check("10. invalid numeric field", badNumber.rows[0]?.draft === null && badNumber.rows[0]?.issues.some((issue) => issue.code === "invalid_number" && issue.field === "piece_cost") === true);

const negative = evaluate([{ ...piece, pack_enabled: "yes", pack_qty: "-2" }]);
check("10b. negative quantity", negative.rows[0]?.issues.some((issue) => issue.code === "negative_number") === true);

const zeroStock = evaluate([{ ...piece, opening_stock: "0", opening_stock_unit: "Piece" }]);
check("11. zero opening stock has no movement input", zeroStock.rows[0]?.draft?.initialStock === undefined);

const positive = evaluate([{ ...piece, opening_stock: "3", opening_stock_unit: "Piece" }]);
check("12. positive opening stock is carried to create", positive.rows[0]?.draft?.initialStock?.quantity === 3 && positive.rows[0]?.draft?.initialStock?.unitName === "Piece");

const missingName = evaluate([{ ...piece, product_name: "" }]);
check("missing name", missingName.rows[0]?.issues.some((issue) => issue.code === "missing_name") === true);

const badStatus = evaluate([{ ...piece, status: "deleted" }]);
check("invalid status", badStatus.rows[0]?.issues.some((issue) => issue.code === "invalid_status") === true);

const badFlag = evaluate([{ ...piece, pack_enabled: "maybe" }]);
check("invalid enable flag", badFlag.rows[0]?.issues.some((issue) => issue.code === "invalid_enable") === true);

const badQty = evaluate([{ ...piece, pack_enabled: "yes", pack_qty: "1.5" }]);
check("invalid conversion", badQty.rows[0]?.issues.some((issue) => issue.code === "invalid_conversion") === true);

const disabledPack = evaluate([{ ...piece, pack_barcode: "C1-PACK", pack_cost: "10", pack_enabled: "no", pack_selling_price: "20" }]);
check("disabled pack is a warning and is not created", disabledPack.warningCount === 1 && disabledPack.rows[0]?.draft?.units.length === 1 && disabledPack.rows[0]?.issues.some((issue) => issue.code === "ignored_disabled_unit") === true);

const missingCategory = evaluate([{ ...piece, category: "Missing Category" }], {
  ...emptyProductImportCatalog(),
  categories: [{ id: "cat-1", nameEn: "Drinks", nameLo: "ເຄື່ອງດື່ມ" }],
});
check("missing category is not created", missingCategory.rows[0]?.draft === null && missingCategory.rows[0]?.issues.some((issue) => issue.code === "category_not_found") === true);

const linked = evaluate([{ ...piece, brand: "Ego", category: "ເຄື່ອງດື່ມ", supplier: "River" }], {
  ...emptyProductImportCatalog(),
  brands: [{ id: "brand-1", name: "Ego" }],
  categories: [{ id: "cat-1", nameEn: "Drinks", nameLo: "ເຄື່ອງດື່ມ" }],
  suppliers: [{ companyName: "River Co", id: "sup-1", name: "River" }],
});
check("existing category brand supplier are linked", linked.rows[0]?.draft?.categoryId === "cat-1" && linked.rows[0]?.draft?.brandId === "brand-1" && linked.rows[0]?.draft?.supplierId === "sup-1");

const custom = parseProductImportCsv("Product Name,Tray Name\nWater,Tray\n");
const customEval = evaluateProductImport(custom, emptyProductImportCatalog());
check("custom unit column is not imported", custom.fileIssues.some((issue) => issue.code === "unknown_column") && customEval.rows[0]?.draft?.units.length === 1 && customEval.rows[0]?.draft?.units[0]?.unitName === "Piece");

const image = parseProductImportCsv("Product Name,Image URL\nWater,https://example.test/a.jpg\n");
check("image column is ignored", image.fileIssues.some((issue) => issue.code === "unknown_column" && issue.detail === "Image URL"));

const started = performance.now();
const bulk = evaluate(Array.from({ length: 100 }, (_, index) => ({
  ...piece,
  piece_barcode: `C1-BULK-${index}`,
  product_name: `Bulk ${index}`,
  sku: `C1-BULK-${index}`,
})));
check("15. 100 rows validate", bulk.validCount === 100 && bulk.errorCount === 0 && performance.now() - started < 1000, `${Math.round(performance.now() - started)}ms`);

const template = parseProductImportCsv(PRODUCT_IMPORT_TEMPLATE_CSV);
const templateHeaders = PRODUCT_IMPORT_TEMPLATE_CSV.replace(/^\uFEFF/, "").split("\n")[0] ?? "";
check("template columns", [
  "Product Name",
  "SKU",
  "Category",
  "Brand",
  "Supplier",
  "Status",
  "Piece Barcode",
  "Piece Cost",
  "Piece Selling Price",
  "Pack Enabled",
  "Pack Qty in Base",
  "Pack Barcode",
  "Box Enabled",
  "Box Qty in Base",
  "Opening Stock",
  "Opening Stock Unit",
  "Reorder Level",
].every((header) => templateHeaders.includes(header)) && !templateHeaders.includes("Target Stock") && !/image/i.test(templateHeaders));
check("template sample parses", template.rows.length === 1 && template.fileIssues.every((issue) => issue.level !== "error"));

const actions = readFileSync("features/products/actions.ts", "utf8");
const service = readFileSync("features/products/product-import-service.ts", "utf8");
const drawer = readFileSync("features/products/components/product-import-drawer.tsx", "utf8");
check("13. import requires products.create", actions.includes("previewProductImportAction") && actions.includes("importProductsAction") && actions.includes("WRITE_PERMISSIONS.productsCreate") && drawer.includes("importPermissionDenied") && drawer.includes("disabled={!canImport"));
const previewBody = service.slice(service.indexOf("export async function previewProductImport"), service.indexOf("export async function importProductCsvBatch"));
check("preview does not create products", previewBody.includes("previewProductImport") && !previewBody.includes("createPrismaProduct"));
check("import uses the product create service", service.includes("createPrismaProduct") && !service.includes("inventoryBalance"));
check("csv only", !readFileSync("features/products/product-import.ts", "utf8").includes("exceljs"));

const labels = ["importProducts", "importDownloadTemplate", "importUploadFile", "importValidate", "preview", "importValid", "importWarning", "importError", "import", "importComplete", "importCreated", "importSkipped", "importFailed"];
check("16. EN labels", labels.every((key) => tProducts(key, "en") !== key && !tProducts(key, "en").includes("importIssue_")));
check("17. LO labels", labels.every((key) => tProducts(key, "lo") !== key && tProducts(key, "lo") !== tProducts(key, "en") || ["preview", "import", "sku"].includes(key) ? tProducts(key, "lo") !== key : tProducts(key, "lo") !== tProducts(key, "en")));
check("copy key parity", productsCopyKeyParity());

const loImport = labels.filter((key) => key.startsWith("import")).every((key) => tProducts(key, "lo") !== tProducts(key, "en"));
check("17b. Lao import labels are translated", loImport);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
