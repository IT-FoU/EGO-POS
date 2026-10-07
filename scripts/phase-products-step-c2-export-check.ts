import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import ExcelJS from "exceljs";
import { buildProductExportXlsx } from "../features/products/product-export-xlsx";
import {
  buildProductExportCsv,
  buildProductExportTable,
  productExportFilename,
  productExportStockRows,
  productExportUnitRows,
  safeImagePath,
  type ProductExportSource,
} from "../features/products/product-export";
import { PRODUCT_IMPORT_TEMPLATE_CSV, evaluateProductImport, emptyProductImportCatalog, parseProductImportCsv } from "../features/products/product-import";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const water: ProductExportSource = {
  brandName: "Ego",
  categoryName: "Drinks",
  imageUrl: "products/company/water.webp",
  minStock: 5,
  nameEn: "Water EN",
  nameLo: "Water",
  onHandQuantity: 12,
  onHandWarehouse: "Main",
  sku: "C1-WATER",
  status: "active",
  stock: [
    { quantity: 12, warehouseName: "Main" },
    { quantity: 3, warehouseName: "Back" },
  ],
  supplierName: "River",
  units: [
    { barcode: "C1-PIECE", conversionQty: 1, costPriceLak: 4000, roundingLak: 0, sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { barcode: "C1-PACK", conversionQty: 6, costPriceLak: 22000, roundingLak: 500, sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { barcode: "C1-BOX", conversionQty: 24, costPriceLak: 90000, roundingLak: 0, sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { barcode: "C1-TRAY", conversionQty: 12, costPriceLak: 45000, roundingLak: 0, sellingPriceLak: 52000, status: "active", unitName: "Tray" },
  ],
};

const table = buildProductExportTable([water]);
const header = table.headers.join(",");
const importHeader = PRODUCT_IMPORT_TEMPLATE_CSV.replace(/^\uFEFF/, "").split("\n")[0] ?? "";
const row = table.rows[0] ?? [];
const column = (name: string) => row[table.headers.indexOf(name)] ?? "";

check("import header kept", header.startsWith(importHeader));
check("piece fields", column("Piece Barcode") === "C1-PIECE" && column("Piece Cost") === "4000" && column("Piece Selling Price") === "5000" && column("Piece Rounding") === "0");
check("pack fields", column("Pack Enabled") === "yes" && column("Pack Qty in Base") === "6" && column("Pack Barcode") === "C1-PACK" && column("Pack Cost") === "22000" && column("Pack Selling Price") === "28000" && column("Pack Rounding") === "500");
check("box fields", column("Box Enabled") === "yes" && column("Box Qty in Base") === "24" && column("Box Barcode") === "C1-BOX" && column("Box Selling Price") === "110000");
check("custom unit is exported", column("Custom Unit 1 Name") === "Tray" && column("Custom Unit 1 Barcode") === "C1-TRAY" && column("Custom Unit 1 Qty in Base") === "12");
check("category brand supplier status", column("Category") === "Drinks" && column("Brand") === "Ego" && column("Supplier") === "River" && column("Status") === "active");
check("opening stock stays blank", column("Opening Stock") === "" && column("Opening Stock Unit") === "");
check("active warehouse stock is separate", column("On Hand Warehouse") === "Main" && column("On Hand") === "12");
check("stored image path kept", column("Image Path") === "products/company/water.webp");
check("signed image omitted", safeImagePath("https://cdn.example/file.webp?X-Amz-Signature=abc") === "" && safeImagePath("products/company/water.webp") === "products/company/water.webp");

const disabled = buildProductExportTable([{
  ...water,
  units: water.units?.map((unit) => unit.unitName === "Pack" ? { ...unit, allowManualUnitSelect: false, status: "inactive" } : unit),
}]);
const disabledRow = disabled.rows[0] ?? [];
const disabledColumn = (name: string) => disabledRow[disabled.headers.indexOf(name)] ?? "";
check("disabled pack barcode remains visible", disabledColumn("Pack Enabled") === "no" && disabledColumn("Pack Barcode") === "C1-PACK");

const deleted = buildProductExportTable([{ ...water, sku: "OLD", status: "deleted" }]);
check("deleted status preserved", deleted.rows[0]?.[deleted.headers.indexOf("Status")] === "deleted");

const ordered = buildProductExportTable([
  { nameLo: "Banana", sku: "B", status: "active" },
  { nameLo: "Apple", sku: "A", status: "draft" },
]);
check("export keeps the given sort", ordered.rows.map((item) => item[1]).join(",") === "B,A");

const started = performance.now();
const bulk = buildProductExportCsv(Array.from({ length: 100 }, (_, index) => ({
  ...water,
  nameLo: `Bulk ${String(index).padStart(3, "0")}`,
  sku: `BULK-${index}`,
  units: water.units?.map((unit) => ({ ...unit, barcode: `${unit.barcode}-${index}` })),
})));
check("100 product csv", bulk.split("\n").filter((line) => line.trim()).length === 101 && performance.now() - started < 1000, `${Math.round(performance.now() - started)}ms`);

const parsed = parseProductImportCsv(buildProductExportCsv([water]));
const evaluated = evaluateProductImport(parsed, {
  ...emptyProductImportCatalog(),
  brands: [{ id: "brand-1", name: "Ego" }],
  categories: [{ id: "cat-1", nameEn: "Drinks", nameLo: "Drinks" }],
  suppliers: [{ companyName: "River", id: "sup-1", name: "River" }],
});
check("csv can be read by import", evaluated.validCount + evaluated.warningCount === 1 && evaluated.errorCount === 0 && evaluated.rows[0]?.draft?.units.some((unit) => unit.unitName === "Pack" && unit.sellingPriceLak === 28000) === true);
check("import ignores extra columns", parsed.fileIssues.some((issue) => issue.code === "unknown_column" && issue.level === "warning"));

const units = productExportUnitRows([water]);
check("unit sheet keeps every barcode", ["C1-PIECE", "C1-PACK", "C1-BOX", "C1-TRAY"].every((barcode) => units.some((unit) => unit.barcode === barcode)));
const stock = productExportStockRows([water]);
check("stock sheet keeps both warehouses", stock.map((item) => `${item.warehouseName}:${item.quantity}`).join("|") === "Main:12|Back:3");

const xlsx = await buildProductExportXlsx([water]);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(xlsx);
const names = workbook.worksheets.map((sheet) => sheet.name);
check("xlsx sheets", names.join(",") === "Products,Units,Stock");
const productsSheet = workbook.getWorksheet("Products");
const xlsxHeader = productsSheet?.getRow(1).values;
const xlsxValues = Array.isArray(xlsxHeader) ? xlsxHeader.slice(1).map((value) => String(value ?? "")) : [];
check("xlsx opens with import columns", xlsxValues.join(",").startsWith(importHeader));
const unitSheet = workbook.getWorksheet("Units");
const unitBarcodes = unitSheet ? unitSheet.getColumn(8).values : [];
check("xlsx unit barcodes", ["C1-PIECE", "C1-PACK", "C1-BOX", "C1-TRAY"].every((barcode) => unitBarcodes.some((value) => String(value) === barcode)));

check("filename", productExportFilename("filtered", "csv", new Date("2026-10-07T00:00:00Z")) === "ego-products-filtered-2026-10-07.csv");

const actions = readFileSync("features/products/actions.ts", "utf8");
const service = readFileSync("features/products/product-export-service.ts", "utf8");
const exportAction = actions.slice(actions.indexOf("export async function exportProductsAction"), actions.indexOf("export async function deleteBrandAction"));
check("export requires products.view", exportAction.includes("READ_PERMISSIONS.productsView") && !exportAction.includes("productsCreate") && !exportAction.includes("productsUpdate"));
check("export is read only", service.includes("resolveProductListFilter") && service.includes("findMany") && !service.includes("createPrismaProduct") && !service.includes("update(") && !service.includes("recordEssentialActivity"));
check("filtered export uses the list filter", service.includes("resolveProductListFilter"));

const labels = ["exportProducts", "exportScope", "exportAllProducts", "exportFilteredProducts", "exportSelectedProducts", "exportExcel", "exportAction", "exportComplete", "exportNoProducts"];
check("EN labels", labels.every((key) => tProducts(key, "en") !== key));
check("LO labels", labels.filter((key) => key !== "exportExcel").every((key) => tProducts(key, "lo") !== tProducts(key, "en")));
check("copy key parity", productsCopyKeyParity());

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);
