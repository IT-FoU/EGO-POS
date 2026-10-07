import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import ExcelJS from "exceljs";
import { buildDetailedProductExportXlsx } from "../features/products/product-export-xlsx";
import { prepareExportThumbnail } from "../features/products/product-export-images";
import {
  buildDetailedProductExport,
  buildProductExportCsv,
  DEFAULT_PRODUCT_EXPORT_FIELDS,
  normalizeProductExportFields,
  orderExportSources,
  productExportFilename,
  type ProductExportSource,
} from "../features/products/product-export";
import { PRODUCT_IMPORT_TEMPLATE_CSV, emptyProductImportCatalog, evaluateProductImport, parseProductImportCsv } from "../features/products/product-import";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const water: ProductExportSource = {
  brandName: "Ego",
  categoryName: "Drinks",
  createdAt: "2026-10-07T00:02:29.352Z",
  id: "water",
  imageUrl: "products/company/water/main.webp",
  minStock: 5,
  nameEn: "Water EN",
  nameLo: "Water",
  onHandQuantity: 12,
  onHandWarehouse: "Main",
  productCode: "W-1",
  sku: "C1-WATER",
  status: "active",
  stock: [
    { quantity: 12, warehouseName: "Main" },
    { quantity: 3, warehouseName: "Back" },
  ],
  supplierName: "River",
  units: [
    { barcode: "C1-PIECE", conversionQty: 1, costPriceLak: 4000, imageUrl: "products/company/water/units/piece/main.webp", roundingLak: 0, sellingPriceLak: 5000, status: "active", unitName: "Piece" },
    { barcode: "C1-PACK", conversionQty: 6, costPriceLak: 22000, roundingLak: 500, sellingPriceLak: 28000, status: "active", unitName: "Pack" },
    { barcode: "C1-BOX", conversionQty: 24, costPriceLak: 90000, roundingLak: 0, sellingPriceLak: 110000, status: "active", unitName: "Box" },
    { barcode: "C1-TRAY", conversionQty: 12, costPriceLak: 45000, roundingLak: 0, sellingPriceLak: 52000, status: "active", unitName: "Tray" },
  ],
};

const defaults = normalizeProductExportFields();
check("default fields", ["productName", "sku", "category", "brand", "status", "unitName", "sellingPrice", "barcode", "onHand"].every((field) => defaults.includes(field as never)) && !defaults.includes("cost") && !defaults.includes("supplier") && !defaults.includes("productImage") && !defaults.includes("unitImage"));
check("default list matches", [...defaults].sort().join() === [...DEFAULT_PRODUCT_EXPORT_FIELDS].sort().join());

const nameOnly = buildDetailedProductExport([water], ["productName"]);
check("name only", nameOnly.headers.join("|") === "Product Name" && nameOnly.rows.length === 1 && nameOnly.unitsSheet === null && nameOnly.rows[0]?.[0] === "Water");

const priced = buildDetailedProductExport([water], ["productName", "sellingPrice"]);
check("price keeps unit name", priced.headers.includes("Unit Name") && priced.headers.includes("Selling Price") && priced.rows.some((row) => row.includes("Pack") && row.includes("28000")) && priced.rows.some((row) => row.includes("Piece") && row.includes("5000")));
check("piece pack box custom", ["Piece", "Pack", "Box", "Tray"].every((name) => priced.unitsSheet?.rows.some((row) => row.includes(name))));

const barcode = buildDetailedProductExport([water], ["barcode"]);
check("barcode export", barcode.headers.includes("Barcode") && barcode.rows.some((row) => row.includes("C1-BOX")));

const stock = buildDetailedProductExport([water], ["productName", "onHand"]);
check("stock export", stock.headers.includes("On Hand Warehouse") && stock.headers.includes("On Hand") && stock.stockSheet?.rows.map((row) => row[2] + ":" + row[3]).join("|") === "Main:12|Back:3" && !stock.rows.some((row) => row.includes("15")));

const images = buildDetailedProductExport([water], ["productName", "productImage", "unitImage"]);
check("csv image path", images.rows.some((row) => row.includes("products/company/water/main.webp")) && images.csv.includes("products/company/water/units/piece/main.webp") && !images.csv.includes("https://") && !images.csv.includes("X-Amz-"));

const missing = buildDetailedProductExport([{ nameLo: "Plain", sku: "PLAIN" }], ["productName", "productImage"]);
check("missing image", missing.rows[0]?.includes("No Image") === true && missing.productCount === 1);

const started = performance.now();
const bulk = buildDetailedProductExport(Array.from({ length: 100 }, (_, index) => ({ ...water, nameLo: `Bulk ${index}`, sku: `BULK-${index}` })), ["productName", "sku", "sellingPrice"]);
check("100 product metadata", bulk.productCount === 100 && bulk.unitCount === 400 && performance.now() - started < 1000, `${Math.round(performance.now() - started)}ms`);

const ordered = orderExportSources([{ id: "b", sku: "B" }, { id: "a", sku: "A" }], ["a", "b"]);
check("selection order", ordered.map((item) => item.sku).join(",") === "A,B");

const imported = parseProductImportCsv(buildProductExportCsv([water]));
const evaluated = evaluateProductImport(imported, {
  ...emptyProductImportCatalog(),
  brands: [{ id: "brand-1", name: "Ego" }],
  categories: [{ id: "cat-1", nameEn: "Drinks", nameLo: "Drinks" }],
  suppliers: [{ companyName: "River", id: "sup-1", name: "River" }],
});
const importHeader = PRODUCT_IMPORT_TEMPLATE_CSV.replace(/^\uFEFF/, "").split("\n")[0] ?? "";
check("import-compatible csv", buildProductExportCsv([water]).includes(importHeader) && evaluated.errorCount === 0 && evaluated.rows[0]?.draft?.units.some((unit) => unit.unitName === "Tray" || unit.unitName === "Pack"));

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const prepared = await prepareExportThumbnail(png);
const workbookFile = await buildDetailedProductExportXlsx([water], ["productName", "sku", "productImage"], new Map([["products/company/water/main.webp", prepared!]]));
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(workbookFile);
const names = workbook.worksheets.map((sheet) => sheet.name);
const productsSheet = workbook.getWorksheet("Products");
const embedded = productsSheet?.getImages().length ?? 0;
check("xlsx sheets follow fields", names.join(",") === "Products" && embedded === 1, names.join(","));
check("xlsx thumbnail fitted", prepared?.width === 1 && prepared?.height === 1 && prepared?.extension === "png");

const fullXlsx = await buildDetailedProductExportXlsx([water], ["productName", "sku", "unitName", "sellingPrice", "onHand"]);
const fullBook = new ExcelJS.Workbook();
await fullBook.xlsx.load(fullXlsx);
check("xlsx product unit stock sheets", fullBook.worksheets.map((sheet) => sheet.name).join(",") === "Products,Units,Stock");

check("filename", productExportFilename("selected", "xlsx", new Date("2026-10-07T00:00:00Z")) === "ego-products-selected-2026-10-07.xlsx" && productExportFilename("filtered", "csv", new Date("2026-10-07T00:00:00Z")) === "ego-products-filtered-2026-10-07.csv");

const drawer = readFileSync("features/products/components/product-export-drawer.tsx", "utf8");
const service = readFileSync("features/products/product-export-service.ts", "utf8");
const actions = readFileSync("features/products/actions.ts", "utf8");
check("no silent all products", drawer.includes('useState<ExportScope>(selectedIds.length > 0 ? "selected" : "filtered")') && !drawer.includes('useState<ExportScope>("all")'));
check("preview before export", drawer.includes("products-export-preview") && drawer.includes("previewReady"));
check("export requires products.view", actions.includes("previewProductExportAction") && actions.includes("READ_PERMISSIONS.productsView"));
check("export stays read only", !service.includes("recordEssentialActivity") && !service.includes(".update(") && !service.includes(".create("));
check("filtered query is passed through", service.includes("resolveProductListFilter") && service.includes("input.query"));

const keys = ["exportProducts", "exportScope", "exportSelectedProducts", "exportFilteredProducts", "chooseFields", "includeImages", "preview", "exportAction", "exportUnits", "noImage", "exportOnHand", "importCompatibleCsv", "detailedExport"] as const;
check("EN labels", keys.every((key) => tProducts(key, "en") !== key));
check("LO labels", keys.filter((key) => key !== "preview").every((key) => tProducts(key, "lo") !== tProducts(key, "en")));
check("copy parity", productsCopyKeyParity());
check("no schema marker", !readFileSync("prisma/schema.prisma", "utf8").includes("exportField"));

const failed = results.filter((row) => !row.ok);
console.log(`\n${results.length - failed.length}/${results.length}`);
if (failed.length) process.exit(1);
