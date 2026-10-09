import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { readProductImportFile } from "../features/products/product-import-files";
import {
  emptyProductImportCatalog,
  evaluateProductImport,
  parseProductImportCsv,
  parseProductImportDelimited,
} from "../features/products/product-import";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ ok: boolean; name: string }> = [];
function check(name: string, ok: boolean) {
  results.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const headers = ["Product Name", "SKU", "Piece Barcode", "Piece Cost", "Piece Selling Price", "Pack Enabled", "Pack Qty in Base", "Pack Barcode", "Pack Cost", "Pack Selling Price"];
const water = ["ນ້ຳດື່ມ Water น้ำ", "ZERO-01", "0012399", "4000", "5000", "yes", "6", "000888", "22000", "28000"];

function valuesOf(parsed: Awaited<ReturnType<typeof readProductImportFile>>) {
  return parsed.parsed.rows[0]?.values;
}

const csv = `\uFEFF${headers.join(",")}\n${water.map((value) => value.includes(",") ? `"${value}"` : value).join(",")}\n`;
const csvParsed = parseProductImportCsv(csv);
check("csv keeps bom text and leading zeros", csvParsed.rows[0]?.values.product_name === "ນ້ຳດື່ມ Water น้ำ" && csvParsed.rows[0]?.values.piece_barcode === "0012399" && csvParsed.rows[0]?.values.pack_barcode === "000888" && csvParsed.fileIssues.every((issue) => issue.level !== "error"));

const quoted = parseProductImportDelimited('Product Name,SKU\n"Line\n""A"", still one",SKU-1\n', ",");
check("csv keeps quoted commas and line breaks", quoted.rows[0]?.values.product_name === 'Line\n"A", still one' && quoted.rows[0]?.values.sku === "SKU-1");

const tsv = parseProductImportDelimited("Product Name\tSKU\tPiece Barcode\n\"ນ້ຳ\tທົດສອບ\"\tSKU-1\t00100\n", "\t");
check("tsv keeps tabs quotes and lao text", tsv.rows.length === 1 && tsv.rows[0]?.values.product_name === "ນ້ຳ\tທົດສອບ" && tsv.rows[0]?.values.sku === "SKU-1" && tsv.rows[0]?.values.piece_barcode === "00100");

const duplicate = parseProductImportCsv("Product Name,Product Name,SKU\nAlpha,Beta,SKU-1\n");
check("duplicate header keeps the first column", duplicate.rows[0]?.values.product_name === "Alpha" && duplicate.rows[0]?.values.sku === "SKU-1" && duplicate.fileIssues.some((issue) => issue.code === "duplicate_header" && issue.level === "warning"));

const blank = parseProductImportCsv("Product Name,SKU\n\nWater,SKU-1\n\n");
check("blank csv rows are skipped", blank.rows.length === 1 && blank.skippedBlankRows >= 1 && blank.rows[0]?.values.product_name === "Water");

const xlsx = await workbookXlsx();
const xlsxRead = await readProductImportFile({ bytes: xlsx, fileName: "products.xlsx" });
check("xlsx reads the first non-empty sheet", xlsxRead.format === "xlsx" && xlsxRead.selectedSheet === "Prices" && xlsxRead.sheets.map((sheet) => sheet.name).join(",") === "Empty,Prices,Notes" && valuesOf(xlsxRead)?.product_name === "ນ້ຳດື່ມ Water น้ำ" && valuesOf(xlsxRead)?.piece_barcode === "0012399" && valuesOf(xlsxRead)?.sku === "2026-01-15");
check("xlsx does not merge sheets", xlsxRead.parsed.rows.length === 1 && !xlsxRead.parsed.rows.some((row) => row.values.product_name === "Other sheet"));
const notes = await readProductImportFile({ bytes: xlsx, fileName: "products.xlsx", sheetName: "Notes" });
check("xlsx sheet change recalculates one sheet", notes.selectedSheet === "Notes" && notes.parsed.rows.length === 1 && notes.parsed.rows[0]?.values.product_name === "Other sheet");
const missingSheet = await readProductImportFile({ bytes: xlsx, fileName: "products.xlsx", sheetName: "Missing" });
check("missing sheet is reported", missingSheet.parsed.fileIssues.some((issue) => issue.code === "sheet_not_found"));

const alignedCsv = parseProductImportCsv([headers.join(","), water.join(",")].join("\n"));
const sameCsv = evaluateProductImport(alignedCsv, emptyProductImportCatalog());
const sameXlsx = evaluateProductImport(xlsxRead.parsed, emptyProductImportCatalog());
check(
  "xlsx uses the same validation",
  xlsxRead.parsed.rows[0]?.values.pack_selling_price === "28000"
    && xlsxRead.parsed.rows[0]?.values.pack_cost === "22000"
    && sameXlsx.validCount === 1
    && alignedCsv.rows[0]?.values.piece_barcode === xlsxRead.parsed.rows[0]?.values.piece_barcode
    && sameCsv.rows[0]?.draft?.units[1]?.sellingPriceLak === sameXlsx.rows[0]?.draft?.units[1]?.sellingPriceLak,
);

const xls = sheetBytes("xls");
const xlsRead = await readProductImportFile({ bytes: xls, fileName: "legacy.xls" });
check("xls keeps text and leading zeros", xlsRead.format === "xls" && xlsRead.parsed.rows[0]?.values.product_name === "ນ້ຳດື່ມ Water น้ำ" && xlsRead.parsed.rows[0]?.values.piece_barcode === "0012399");

const ods = sheetBytes("ods");
const odsRead = await readProductImportFile({ bytes: ods, fileName: "sheet.ods" });
check("ods keeps text and leading zeros", odsRead.format === "ods" && odsRead.parsed.rows[0]?.values.piece_barcode === "0012399" && odsRead.parsed.rows[0]?.values.product_name === "ນ້ຳດື່ມ Water น้ำ");
const odsOther = await readProductImportFile({ bytes: ods, fileName: "sheet.ods", sheetName: "Other" });
check("ods sheet selection stays on one sheet", odsOther.parsed.rows.length === 1 && odsOther.parsed.rows[0]?.values.product_name === "Second");

const emptyBook = await emptyXlsx();
const emptyRead = await readProductImportFile({ bytes: emptyBook, fileName: "empty.xlsx" });
check("empty workbook has no product rows", emptyRead.parsed.rows.length === 0 && emptyRead.parsed.fileIssues.some((issue) => issue.code === "empty_file"));

const malformed = await readProductImportFile({ bytes: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]), fileName: "bad.xlsx" });
check("malformed xlsx is rejected", malformed.parsed.fileIssues.some((issue) => issue.code === "malformed_file"));
const mismatch = await readProductImportFile({ bytes: xlsx, fileName: "products.csv" });
check("xlsx renamed to csv is rejected", mismatch.parsed.fileIssues.some((issue) => issue.code === "format_mismatch"));
const unsupported = await readProductImportFile({ bytes: new TextEncoder().encode("hello"), fileName: "notes.pdf" });
check("unsupported extension is rejected", unsupported.parsed.fileIssues.some((issue) => issue.code === "unsupported_file"));

const scientific = await scientificXlsx();
const scientificRead = await readProductImportFile({ bytes: scientific, fileName: "science.xlsx" });
check("numeric barcode is not scientific notation", scientificRead.parsed.rows[0]?.values.piece_barcode === "8859313502907" && !String(scientificRead.parsed.rows[0]?.values.piece_barcode).toLowerCase().includes("e"));
check("formula result is used and the formula is not", scientificRead.parsed.rows[0]?.values.piece_selling_price === "5000");
check("hyperlink text keeps leading zeros", scientificRead.parsed.rows[0]?.values.pack_barcode === "00999");

const evaluated = evaluateProductImport(xlsxRead.parsed, emptyProductImportCatalog());
check("unit validation still accepts independent pack price", evaluated.validCount === 1 && evaluated.rows[0]?.draft?.units[1]?.sellingPriceLak === 28000 && evaluated.rows[0]?.draft?.units[0]?.sellingPriceLak === 5000);
const duplicateFile = evaluateProductImport(parseProductImportCsv("Product Name,SKU,Piece Barcode\nA,SKU-1,111\nB,SKU-1,222\n"), emptyProductImportCatalog());
check("duplicate sku in the file is still blocked", duplicateFile.errorCount === 2 && duplicateFile.rows.every((row) => row.issues.some((issue) => issue.code === "duplicate_sku_file")));

const service = readFileSync("features/products/product-import-service.ts", "utf8");
const previewFile = service.slice(service.indexOf("export async function previewProductImportFile"), service.indexOf("export async function importProductFileBatch"));
check("file preview does not create products", previewFile.includes("previewProductImport") && !previewFile.includes("createPrismaProduct"));
check("file import uses the same create service", service.includes("importProductFileBatch") && service.includes("createPrismaProduct"));
const actions = readFileSync("features/products/actions.ts", "utf8");
const drawer = readFileSync("features/products/components/product-import-drawer.tsx", "utf8");
check("import still requires products.create", actions.includes("previewProductImportFileAction") && actions.includes("importProductsFileAction") && actions.includes("WRITE_PERMISSIONS.productsCreate") && drawer.includes("disabled={!canImport"));
const fileChange = drawer.slice(drawer.indexOf("async function onFileChange"), drawer.indexOf("const busy"));
check("choosing a file does not import", fileChange.includes("chooseImportSurface") && !fileChange.includes("importProductsFileAction") && !drawer.includes("importProductsFileAction"));
check("sheet control is present for workbooks", drawer.includes("products-import-sheet") && drawer.includes("products-import-format"));
check("accepted formats are listed", [".csv", ".tsv", ".xlsx", ".xls", ".ods"].every((extension) => drawer.includes(extension)));
check("copy parity", productsCopyKeyParity());
for (const key of ["importFormatsHint", "importFileFormat", "importSheet", "importParsing", "importSkippedBlank", "importIssue_unsupported_file", "importIssue_malformed_file", "importIssue_format_mismatch", "importIssue_duplicate_header", "importIssue_sheet_not_found"]) {
  check(`lo ${key}`, tProducts(key, "lo") !== key && tProducts(key, "lo") !== tProducts(key, "en"));
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);

async function workbookXlsx() {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Empty");
  const prices = workbook.addWorksheet("Prices");
  prices.addRow(headers);
  const row = prices.addRow(water);
  row.getCell(2).value = new Date(Date.UTC(2026, 0, 15));
  row.getCell(3).value = "0012399";
  row.getCell(3).numFmt = "@";
  const notes = workbook.addWorksheet("Notes");
  notes.addRow(["Product Name", "SKU"]);
  notes.addRow(["Other sheet", "OTHER"]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function scientificXlsx() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Prices");
  sheet.addRow(["Product Name", "Piece Barcode", "Piece Selling Price", "Pack Barcode"]);
  const row = sheet.addRow(["Barcode", 8859313502907, { formula: "2500+2500", result: 5000 }, { text: "00999", hyperlink: "https://example.test" }]);
  row.getCell(2).numFmt = "0.00E+00";
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function emptyXlsx() {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Empty");
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

function sheetBytes(bookType: "xls" | "ods") {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Product Name", "SKU", "Piece Barcode"],
    ["ນ້ຳດື່ມ Water น้ำ", "ZERO-01", "0012399"],
  ]);
  const barcode = sheet.C2;
  if (barcode) {
    barcode.t = "s";
    barcode.v = "0012399";
  }
  XLSX.utils.book_append_sheet(book, sheet, "Products");
  const other = XLSX.utils.aoa_to_sheet([["Product Name"], ["Second"]]);
  XLSX.utils.book_append_sheet(book, other, "Other");
  return new Uint8Array(XLSX.write(book, { bookType, type: "buffer" }) as Buffer);
}
