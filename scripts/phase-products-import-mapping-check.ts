import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { readProductImportFile } from "../features/products/product-import-files";
import {
  emptyProductImportCatalog,
  evaluateProductImport,
  mapProductImportGrid,
  parseProductImportCsv,
  productImportDelimitedGrid,
  resolveProductImportColumns,
} from "../features/products/product-import";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ ok: boolean; name: string }> = [];
function check(name: string, ok: boolean) {
  results.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const english = resolveProductImportColumns(grid([
  ["Product Name", "SKU", "Barcode", "Cost", "Selling Price", "Category", "Brand", "Supplier"],
  ["Water", "SKU-1", "0012399", "4000", "5000", "Drinks", "Ego", "River"],
]));
check("english aliases map the main fields", english.every((column) => column.status === "mapped") && english.map((column) => column.choice).join(",") === "product_name,sku,piece_barcode,piece_cost,piece_selling_price,category,brand,supplier");

const lao = resolveProductImportColumns(grid([
  ["ຊື່ສິນຄ້າ", "ລະຫັດສິນຄ້າ", "ບາໂຄດຫຼັກ", "ລາຄາທຶນ", "ລາຄາຂາຍ", "ປະເພດສິນຄ້າ", "ຍີ່ຫໍ້", "ຜູ້ສະໜອງ"],
  ["ນ້ຳ", "SKU-1", "0012399", "4000", "5000", "ເຄື່ອງດື່ມ", "ອີໂກ", "ແມ່ນ້ຳ"],
]));
check("lao aliases map the main fields", lao.map((column) => `${column.choice}:${column.status}`).join(",") === "product_name:mapped,sku:mapped,piece_barcode:mapped,piece_cost:mapped,piece_selling_price:mapped,category:mapped,brand:mapped,supplier:mapped");

const thai = resolveProductImportColumns(grid([
  ["ชื่อสินค้า", "รหัสสินค้า", "บาร์โค้ดหลัก", "ราคาทุน", "ราคาขาย", "ประเภทสินค้า", "ยี่ห้อ", "ผู้จำหน่าย"],
  ["น้ำ", "SKU-1", "0012399", "4000", "5000", "เครื่องดื่ม", "อีโก้", "แม่น้ำ"],
]));
check("thai aliases map the main fields", thai.every((column) => column.status === "mapped") && thai[0]?.choice === "product_name" && thai[2]?.choice === "piece_barcode" && thai[7]?.choice === "supplier");

const mixed = resolveProductImportColumns(grid([
  ["Name EN", "ລະຫັດສິນຄ້າ", "บาร์โค้ดหลัก", "Unit"],
  ["ນ້ຳ Water น้ำ", "SKU-1", "0012399", "ຫົວໜ່ວຍ"],
]));
check("mixed headers keep a known name and leave unit for review", mixed[0]?.choice === "product_name" && mixed[1]?.choice === "sku" && mixed[2]?.choice === "piece_barcode" && mixed[3]?.status === "review" && mixed[3]?.choice === null);

const supplier = grid([
  ["Image", "Supplier Product Code", "Main Barcode", "Product Name"],
  ["", "SUP-01", "0012399", "ນ້ຳດື່ມ (1×12)"],
]);
const supplierColumns = resolveProductImportColumns(supplier);
const supplierParsed = mapProductImportGrid(supplier);
check("supplier layout ignores the image and maps sku barcode and name", supplierColumns.map((column) => `${column.choice}:${column.status}`).join(",") === "ignore:ignored,sku:mapped,piece_barcode:mapped,product_name:mapped" && supplierParsed.rows[0]?.values.product_name === "ນ້ຳດື່ມ (1×12)" && supplierParsed.rows[0]?.values.sku === "SUP-01" && supplierParsed.rows[0]?.values.piece_barcode === "0012399" && supplierParsed.rows[0]?.values.pack_qty === "");
check("the first supplier column is not treated as the product name", supplierColumns[0]?.choice !== "product_name");

const ratio = mapProductImportGrid(grid([
  ["Product Name", "SKU"],
  ["Water (1×6×6)", "SKU-1"],
  ["Soda (1*24)", "SKU-2"],
]));
check("pack text in the name is not a conversion quantity", ratio.rows[0]?.values.product_name === "Water (1×6×6)" && ratio.rows[0]?.values.pack_qty === "" && ratio.rows[1]?.values.product_name === "Soda (1*24)" && ratio.rows[1]?.values.box_qty === "");

const unknown = resolveProductImportColumns(grid([
  ["SKU", "Main Barcode", "Internal Note"],
  ["SKU-1", "0012399", "photo"],
]));
check("unknown headers are not guessed and the first column is not the name", unknown[0]?.choice === "sku" && unknown[2]?.status === "review" && unknown[2]?.suggestion === null && unknown.every((column) => column.choice !== "product_name"));
check("a file without product name does not validate rows", mapProductImportGrid(grid([["SKU"], ["SKU-1"]])).fileIssues.some((issue) => issue.code === "missing_header") && mapProductImportGrid(grid([["SKU"], ["SKU-1"]])).rows.length === 0);

const ambiguous = resolveProductImportColumns(grid([["Price", "Code", "Unit"], ["5000", "A-1", "Pack"]]));
check("ambiguous price code and unit stay unmapped", ambiguous.every((column) => column.status === "review" && column.choice === null && column.suggestion === null));

const override = mapProductImportGrid(grid([
  ["Internal Note", "Barcode"],
  ["Water", "0012399"],
]), 0, [
  { field: "product_name", index: 0 },
  { field: "sku", index: 1 },
]);
check("manual mapping overrides the suggestion", override.rows[0]?.values.product_name === "Water" && override.rows[0]?.values.sku === "0012399" && override.rows[0]?.values.piece_barcode === "");

const duplicateChoice = resolveProductImportColumns(grid([
  ["Product Name", "SKU", "Supplier Product Code"],
  ["Water", "SKU-1", "SKU-2"],
]), [
  { field: "product_name", index: 0 },
  { field: "sku", index: 1 },
  { field: "sku", index: 2 },
]);
const duplicateParsed = mapProductImportGrid(grid([
  ["Product Name", "SKU", "Supplier Product Code"],
  ["Water", "SKU-1", "SKU-2"],
]), 0, [
  { field: "product_name", index: 0 },
  { field: "sku", index: 1 },
  { field: "sku", index: 2 },
]);
check("a destination can be mapped only once", duplicateChoice[1]?.status === "mapped" && duplicateChoice[2]?.status === "conflict" && duplicateParsed.rows[0]?.values.sku === "SKU-1");

const punctuation = resolveProductImportColumns(grid([["Product Name:", "Name (EN)", "Barcode"], ["A", "B", "00100"]]));
check("punctuation and case still match known aliases", punctuation[0]?.status === "mapped" && punctuation[0]?.choice === "product_name" && punctuation[2]?.choice === "piece_barcode");

const legacy = parseProductImportCsv("Product Name,Piece Barcode,Image URL\nWater,0012399,https://example.test/a.jpg\n");
check("existing csv headers and ignored image still parse", legacy.rows[0]?.values.product_name === "Water" && legacy.rows[0]?.values.piece_barcode === "0012399" && legacy.fileIssues.some((issue) => issue.code === "unknown_column" && issue.detail === "Image URL"));

const evaluated = evaluateProductImport(parseProductImportCsv("Product Name,SKU,Piece Barcode\nA,SKU-1,111\nB,SKU-1,222\n"), emptyProductImportCatalog());
check("duplicate products are still blocked before save", evaluated.errorCount === 2 && evaluated.rows.every((row) => row.draft === null));

const workbook = await workbookBytes();
const firstSheet = await readProductImportFile({ bytes: workbook, fileName: "supplier.xlsx" });
const secondSheet = await readProductImportFile({ bytes: workbook, fileName: "supplier.xlsx", sheetName: "Other" });
const firstMap = resolveProductImportColumns(firstSheet.grid);
const secondMap = resolveProductImportColumns(secondSheet.grid);
check("sheet changes rebuild mapping from that sheet", firstSheet.selectedSheet === "Supplier" && firstMap[0]?.choice === "ignore" && firstMap[3]?.choice === "product_name" && secondSheet.selectedSheet === "Other" && secondMap.map((column) => column.header).join(",") === "Notes,Name" && secondMap[1]?.choice === "product_name" && secondMap[0]?.choice !== "ignore");
check("barcode text keeps leading zeros", firstSheet.parsed.rows[0]?.values.piece_barcode === "0012399");

const service = readFileSync("features/products/product-import-service.ts", "utf8");
const previewFile = service.slice(service.indexOf("export async function previewProductImportFile"), service.indexOf("export async function importProductFileBatch"));
check("mapping preview does not create products", !previewFile.includes("createPrismaProduct") && service.includes("mapProductImportGrid"));
check("confirmed import still uses the create service", service.includes("importProductFileBatch") && service.includes("createPrismaProduct"));
const actions = readFileSync("features/products/actions.ts", "utf8");
const drawer = readFileSync("features/products/components/product-import-drawer.tsx", "utf8");
check("mapping actions still require products.create", actions.includes("columns") && actions.includes("WRITE_PERMISSIONS.productsCreate"));
check("the drawer keeps one unified table", drawer.includes("<ProductImportPreviewPanel") && !drawer.includes('data-testid="products-import-mapping"') && readFileSync("features/products/components/product-import-preview-panel.tsx", "utf8").includes("products-import-adjust-columns"));
check("changing a column does not import", !drawer.includes("importProductsFileAction"));
check("a new sheet clears the previous column choices", drawer.includes("onLocalSheetChange") && drawer.includes("choices: []"));
check("confirm and save stays disabled", drawer.includes('data-testid="products-import-confirm" disabled'));
check("copy parity", productsCopyKeyParity());
check("file limit copy names 1.5 MB", tProducts("importIssue_file_too_large", "en").includes("1.5 MB") && tProducts("importIssue_file_too_large", "lo") !== tProducts("importIssue_file_too_large", "en"));
for (const key of ["importMappingTitle", "importMappingHint", "importMappingNameRequired", "importMapReview", "importMapConflict", "importMapIgnore"]) {
  check(`lo ${key}`, tProducts(key, "lo") !== key && tProducts(key, "lo") !== tProducts(key, "en"));
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);

function grid(rows: string[][]) {
  return productImportDelimitedGrid(rows.map((row) => row.join(",")).join("\n"), ",").rows;
}

async function workbookBytes() {
  const workbook = new ExcelJS.Workbook();
  const supplierSheet = workbook.addWorksheet("Supplier");
  supplierSheet.addRow(["Image", "Supplier Product Code", "Main Barcode", "Product Name"]);
  const row = supplierSheet.addRow(["", "SUP-01", "0012399", "ນ້ຳ"]);
  row.getCell(3).value = "0012399";
  const other = workbook.addWorksheet("Other");
  other.addRow(["Notes", "Name"]);
  other.addRow(["Keep", "Second"]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
