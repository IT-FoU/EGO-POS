import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";
import { encode as encodeJpeg } from "jpeg-js";
import { buildLargeImportPreview, chooseImportSurface } from "../features/products/product-import-preview";
import { readProductImportFile } from "../features/products/product-import-files";
import { columnIndexFromLetter, EGO_TEMPLATE_HEADERS, resolveLetterMap } from "../features/products/product-import-methods";
import { buildEgoTemplateWorkbook } from "../features/products/product-import-template";
import type { EmbeddedImageAnchor } from "../features/products/product-import-images";

const checks: string[] = [];
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => { if (ok) checks.push(name); else failures.push(detail ? `${name} :: ${detail}` : name); };
const templateRow = ["1", "", "Soap", "0012399", "SKU-1", "", "Piece", "5", "1000", "1500", "Supplier A"];

check("column letters cover A, Z, AA and AB", columnIndexFromLetter("A") === 0 && columnIndexFromLetter("Z") === 25 && columnIndexFromLetter("AA") === 26 && columnIndexFromLetter("AB") === 27 && columnIndexFromLetter("A1") === null);

const blank = await buildEgoTemplateWorkbook();
const blankBook = new ExcelJS.Workbook();
await blankBook.xlsx.load(blank);
const blankSheet = blankBook.getWorksheet("Products");
const blankHeaders = EGO_TEMPLATE_HEADERS.map((_, index) => String(blankSheet?.getRow(1).getCell(index + 1).value ?? ""));
check("template download has the approved headers and no sample product", blankHeaders.join("|") === EGO_TEMPLATE_HEADERS.join("|") && blankSheet?.rowCount === 1);
check("template formats barcode, SKU and numbers", blankSheet?.getColumn(4).numFmt === "@" && blankSheet?.getColumn(5).numFmt === "@" && blankSheet?.getColumn(8).numFmt === "#,##0" && blankSheet?.getColumn(9).numFmt === "#,##0.00");

const filled = new ExcelJS.Workbook();
await filled.xlsx.load(blank);
const filledSheet = filled.getWorksheet("Products");
filledSheet?.addRow(templateRow);
filledSheet!.getCell("D2").value = "0012399";
filledSheet!.getCell("D2").numFmt = "@";
filledSheet!.getCell("E2").value = "SKU-1";
filledSheet!.getCell("E2").numFmt = "@";
const imported = await readProductImportFile({ bytes: new Uint8Array(await filled.xlsx.writeBuffer()), fileName: "ego-pos-product-template.xlsx" });
const importedRows = gridRows(imported.grid);
const reimported = buildLargeImportPreview({ catalog: [], method: "template", rows: importedRows, sheetName: imported.selectedSheet ?? "Products" });
const reimportedRow = reimported.mapped.rows[0];
check("template reimport keeps the fixed A-K fields and leading zeros", reimportedRow?.name === "Soap" && reimportedRow.barcode === "0012399" && reimportedRow.sku === "SKU-1" && reimportedRow.stock === "5" && reimportedRow.cost === "1000" && reimportedRow.price === "1500" && reimportedRow.note === "Supplier A" && reimported.notices.every((notice) => notice.code !== "template_mismatch"));

const modified = [[...EGO_TEMPLATE_HEADERS.slice(0, 3), "Code128", ...EGO_TEMPLATE_HEADERS.slice(4)], templateRow];
const modifiedPreview = buildLargeImportPreview({ catalog: [], method: "template", rows: modified, sheetName: "Products" });
const autoPreview = buildLargeImportPreview({ catalog: [], method: "auto", rows: modified, sheetName: "Products" });
check("a modified template is not silently mapped", modifiedPreview.mapped.rows[0]?.name === "" && modifiedPreview.notices.some((notice) => notice.code === "template_mismatch") && autoPreview.mapped.rows[0]?.name === "Soap");

const wide = Array.from({ length: 28 }, () => "");
wide[0] = "Soap A";
wide[25] = "Soap Z";
wide[26] = "Soap AA";
wide[27] = "0012399";
const widePreview = buildLargeImportPreview({
  catalog: [],
  letters: { piece_barcode: "AB", product_name: "AA" },
  method: "letters",
  rows: [wide],
  sheetName: "Wide",
});
check("column letters AA and AB map the destination fields", widePreview.mapped.rows[0]?.name === "Soap AA" && widePreview.mapped.rows[0]?.barcode === "0012399");
const zPreview = buildLargeImportPreview({ catalog: [], letters: { product_name: "Z" }, method: "letters", rows: [wide], sheetName: "Wide" });
check("column letter Z maps independently from A", zPreview.mapped.rows[0]?.name === "Soap Z" && zPreview.mapped.rows[0]?.barcode === "");

const supplier = [["not-a-name", "SKU-1", "0012399", "Soap", "", "carton", "abc", "12", "15"]];
const swapped = buildLargeImportPreview({
  catalog: [],
  letters: { image: "A", opening_stock: "G", opening_stock_unit: "F", piece_barcode: "C", piece_cost: "H", piece_selling_price: "I", product_name: "D", sku: "B" },
  method: "letters",
  rows: supplier,
  sheetName: "Supplier",
});
const swappedRow = swapped.mapped.rows[0];
check("headerless swapped columns keep barcode, SKU and leading zeros", swappedRow?.name === "Soap" && swappedRow.barcode === "0012399" && swappedRow.sku === "SKU-1" && swappedRow.category === null);
check("invalid numbers and packaging text stay unconverted", swappedRow?.stock === "abc" && swappedRow.issue.includes("Quantity needs review") && swappedRow.unit === "" && swappedRow.issue.includes("Unit needs review"));
check("an image source column is not read as product text", swappedRow?.name === "Soap" && !swappedRow.name.includes("not-a-name"));

const invalid = resolveLetterMap({ product_name: "A1", sku: "B" });
check("invalid column letters are rejected", invalid.notices.some((notice) => notice.code === "invalid_letter") && invalid.notices.some((notice) => notice.code === "missing_product_name"));
const duplicate = buildLargeImportPreview({ catalog: [], letters: { product_name: "A", sku: "A" }, method: "letters", rows: [["Soap"]], sheetName: "Supplier" });
check("one source column cannot fill two destinations", duplicate.mapped.rows[0]?.name === "" && duplicate.mapped.rows[0]?.sku === "" && duplicate.notices.some((notice) => notice.code === "duplicate_source"));

const pages = Array.from({ length: 25 }, (_, index) => ["", `SKU-${index}`, index === 0 ? "0012399" : `1000${index}`, `Soap ${index}`]);
pages.push(["", "SKU-0", "009900", "Soap 0"]);
const paged = buildLargeImportPreview({
  catalog: [{ barcode: "0012399", productName: "Old Soap", sku: "", unit: "Piece" }],
  edits: [{ field: "product_name", rowNumber: 2, value: "Edited Soap" }],
  letters: { piece_barcode: "C", product_name: "D", sku: "B" },
  method: "letters",
  page: 0,
  pageSize: 20,
  rows: pages,
  sheetName: "Supplier",
});
const secondPage = buildLargeImportPreview({
  catalog: [],
  letters: { piece_barcode: "C", product_name: "D", sku: "B" },
  method: "letters",
  mappedPage: 1,
  page: 1,
  pageSize: 20,
  rows: pages,
  sheetName: "Supplier",
});
check("inline edits and pagination stay on the same table", paged.mapped.rows.length === 20 && paged.mapped.rows[1]?.name === "Edited Soap" && secondPage.mapped.rows.length === 6, `len=${paged.mapped.rows.length} name=${paged.mapped.rows[1]?.name} second=${secondPage.mapped.rows.length} total=${paged.counts.totalRows}`);
check("duplicate barcode and SKU are detected", paged.mapped.rows[0]?.status === "duplicate" && paged.mapped.rows.some((row) => row.sku === "SKU-0" && row.status === "duplicate"));

const unrecognized = [
  ["Picture", "Goods", "Art No", "Code128", "Quantity", "Cost Price", "Selling Price"],
  ["", "Soap", "SKU-1", "0012399", "5", "1000", "1500"],
];
const detected = buildLargeImportPreview({ catalog: [], method: "auto", rows: unrecognized, sheetName: "Supplier" });
const recovered = buildLargeImportPreview({
  catalog: [],
  letters: { opening_stock: "E", piece_barcode: "D", piece_cost: "F", piece_selling_price: "G", product_name: "B", sku: "C" },
  method: "letters",
  rows: unrecognized,
  sheetName: "Supplier",
});
check("auto detect warns instead of guessing and column letters can take over", detected.mapped.rows[0]?.name === "" && detected.mapped.rows[0]?.stock === "5" && detected.notices.some((notice) => notice.code === "missing_field" && notice.detail === "product_name" && notice.sample.includes("Soap")) && recovered.mapped.rows[0]?.name === "Soap" && recovered.mapped.rows[0]?.barcode === "0012399" && recovered.mapped.rows[0]?.sku === "SKU-1");

const png = Buffer.from(encodeJpeg({ data: Buffer.alloc(8 * 8 * 4, 255), height: 8, width: 8 }, 50).data);
const imageRow = [["", "SKU-9", "0011111", "Soap"]];
const imageOn = buildLargeImportPreview({
  catalog: [],
  images: [{ bytes: png, bottomRow: null, topRow: 0 } satisfies EmbeddedImageAnchor],
  letters: { image: "A", piece_barcode: "C", product_name: "D", sku: "B" },
  method: "letters",
  rows: imageRow,
  sheetName: "Supplier",
});
const imageOff = buildLargeImportPreview({ catalog: [], images: [], letters: { image: "A", piece_barcode: "C", product_name: "D", sku: "B" }, method: "letters", rows: imageRow, sheetName: "Supplier" });
check("images can be included or left out without moving the product fields", Boolean(imageOn.mapped.rows[0]?.thumb) && imageOn.mapped.rows[0]?.name === "Soap" && !imageOff.mapped.rows[0]?.thumb && !imageOff.mapped.rows[0]?.issue.includes("Image needs review"), `on=${imageOn.mapped.rows[0]?.name}/${Boolean(imageOn.mapped.rows[0]?.thumb)}/${imageOn.counts.imageMatched}/${imageOn.counts.imageNeedsReview}/${imageOn.mapped.rows[0]?.issue} bytes=${png.byteLength}`);

const book = new ExcelJS.Workbook();
const prices = book.addWorksheet("Prices");
prices.addRow(["Product Name", "Barcode", "SKU"]);
prices.addRow(["Soap", "0012399", "SKU-1"]);
const stock = book.addWorksheet("Stock");
stock.addRow(["Product Name", "Barcode", "SKU"]);
stock.addRow(["Rice", "009900", "SKU-2"]);
const sheets = await readProductImportFile({ bytes: new Uint8Array(await book.xlsx.writeBuffer()), fileName: "sheets.xlsx", sheetName: "Stock" });
const stockPreview = buildLargeImportPreview({ catalog: [], method: "auto", rows: gridRows(sheets.grid), sheetName: "Stock" });
check("the selected sheet is previewed in the same table", sheets.sheets.length === 2 && stockPreview.mapped.rows[0]?.name === "Rice" && stockPreview.mapped.rows[0]?.barcode === "009900");

const started = Date.now();
const largeRows = Array.from({ length: 2000 }, (_, index) => ["", `SKU-${index}`, `000${index}`, `Soap ${index}`]);
const largePreview = buildLargeImportPreview({ catalog: [], letters: { piece_barcode: "C", product_name: "D", sku: "B" }, method: "letters", pageSize: 20, rows: largeRows, sheetName: "Supplier" });
const elapsed = Date.now() - started;
check("two thousand letter-mapped rows stay on one page of the same table", largePreview.mapped.rows.length === 20 && largePreview.mapped.pageCount === 100 && largePreview.mapped.rows[0]?.barcode.startsWith("000") && elapsed < 2000);
console.log(`letter-map-ms=${elapsed}`);

const drawer = readFileSync("features/products/components/product-import-drawer.tsx", "utf8");
const panel = readFileSync("features/products/components/product-import-preview-panel.tsx", "utf8");
const sources = ["features/products/product-import-methods.ts", "features/products/product-import-template.ts", "features/products/product-import-preview.ts", "features/products/actions.ts"].map((path) => readFileSync(path, "utf8")).join("\n");
check("small and large files still use one table", chooseImportSurface("supplier.xlsx", 100 * 1024) === "unified-upload" && chooseImportSurface("supplier.xlsx", 3 * 1024 * 1024) === "unified-upload" && chooseImportSurface("prices.csv", 100 * 1024) === "unified-parse" && drawer.split("<ProductImportPreviewPanel").length === 2);
check("the simple screen keeps one table and leaves saving disabled", drawer.includes('data-testid="products-import-file"') && drawer.includes("rounded-full") && !drawer.includes("products-import-method-") && !drawer.includes("products-import-ego-template") && !drawer.includes("products-import-letter-apply") && drawer.includes('data-testid="products-import-confirm" disabled') && !drawer.includes("importProductsFileAction") && panel.includes("products-import-excel-table") && panel.includes("products-import-destination-") && panel.includes("IMPORT_DESTINATION_LETTERS"));
check("preview code does not write products or inventory", !sources.includes("product.create") && !sources.includes("inventoryBalance") && !sources.includes("stockMovement"));

console.log(`${checks.length}/${checks.length + failures.length} passed`);
if (failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}

function gridRows(grid: Array<{ cells: string[]; lineNumber: number }>) {
  const rows: string[][] = [];
  for (const row of grid) {
    while (rows.length < row.lineNumber - 1) rows.push([]);
    rows[row.lineNumber - 1] = row.cells;
  }
  return rows;
}
