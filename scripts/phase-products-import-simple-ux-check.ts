import { readFileSync } from "node:fs";
import { encode as encodeJpeg } from "jpeg-js";
import { buildLargeImportPreview, chooseImportSurface, readImportImagesPreference } from "../features/products/product-import-preview";
import { EGO_TEMPLATE_HEADERS } from "../features/products/product-import-methods";

const checks: string[] = [];
const failures: string[] = [];
const check = (name: string, ok: boolean, detail = "") => { if (ok) checks.push(name); else failures.push(detail ? `${name} :: ${detail}` : name); };

const drawer = readFileSync("features/products/components/product-import-drawer.tsx", "utf8");
const panel = readFileSync("features/products/components/product-import-preview-panel.tsx", "utf8");
const frame = readFileSync("features/products/components/product-list-client.tsx", "utf8");
const exported = readFileSync("features/products/components/product-export-drawer.tsx", "utf8");
const server = readFileSync("workers/import-processor/server.ts", "utf8");
const previewService = readFileSync("features/products/product-import-preview-service.ts", "utf8");
const previewSource = readFileSync("features/products/product-import-preview.ts", "utf8");
const exportService = readFileSync("features/products/product-export-service.ts", "utf8");
const legacy = [
  "products-import-template",
  "products-import-ego-template",
  "products-import-method-template",
  "products-import-method-letters",
  "products-import-method-auto",
  "products-import-letters",
  "products-import-letter-apply",
  "products-import-adjust-columns",
  "products-import-process-start",
  "products-import-preview-excel",
  "products-import-use-letters",
  "products-import-preview-only",
];

check("one capsule Choose Files control", drawer.includes('data-testid="products-import-file"') && drawer.includes("rounded-full") && drawer.includes('t("importChooseFile")') && readFileSync("lib/i18n/products-copy.ts", "utf8").includes('importChooseFile: "Choose Files"'));
check("image control is an ON/OFF switch and defaults on", drawer.includes('data-testid="products-import-images"') && drawer.includes('role="switch"') && drawer.includes('data-testid="products-import-images-state"') && drawer.includes('importImagesChecked ? "ON" : "OFF"') && readImportImagesPreference({ getItem: () => null }) === true && readImportImagesPreference({ getItem: () => "0" }) === false);
check("legacy import controls stay off the main screen", legacy.every((id) => !drawer.includes(id) && !panel.includes(id)) && !panel.includes("products-import-adjust-columns"));
check("file selection starts processing without another click", drawer.includes("await loadLocalPreview") && drawer.includes("startedProcessJob.current === largeUpload.jobId") && drawer.includes("void beginMetadata()") && !drawer.includes("products-import-process-start"));
check("small and large files share one preview table", drawer.split("<ProductImportPreviewPanel").length === 2 && chooseImportSurface("prices.csv", 100 * 1024) === "unified-parse" && chooseImportSurface("supplier.xlsx", 100 * 1024) === "unified-upload" && chooseImportSurface("supplier.xlsx", 20 * 1024 * 1024) === "unified-upload");
check("import opens with the title only", frame.includes('drawerKey === "tool_import" ? ""') && frame.includes("{description ?"));
check("the table has a separate A-K letter row and named destinations", panel.includes("products-import-destination-${letter}") && panel.includes("IMPORT_DESTINATION_LETTERS.map") && panel.includes("products-import-letter-row") && panel.includes("ego-column-names") && panel.includes("IMPORT_DESTINATION_LETTERS[index]} — {label}") && readFileSync("features/products/product-import-methods.ts", "utf8").includes('IMPORT_DESTINATION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"]'));
check("displayed sequence is separate from the source row", panel.includes("products-import-sequence-") && panel.includes("data-source-row={row.rowNumber}") && panel.includes("products-import-edit-name-${row.rowNumber}") && !panel.includes(">{row.rowNumber}<"));

const standard = buildLargeImportPreview({
  catalog: [],
  method: "auto",
  rows: [["Product Name", "Barcode", "SKU", "Quantity", "Cost Price", "Selling Price"], ["Soap", "0012399", "SKU-1", "", "", ""]],
  sheetName: "Products",
});
const standardRow = standard.mapped.rows[0];
check("recognized headers place name, barcode and SKU and leave blanks empty", standardRow?.sequence === 1 && standardRow.rowNumber !== 1 && standardRow.name === "Soap" && standardRow.barcode === "0012399" && standardRow.sku === "SKU-1" && (standardRow.stock === null || standardRow.stock === "") && (standardRow.cost === null || standardRow.cost === "") && (standardRow.price === null || standardRow.price === ""), `seq=${standardRow?.sequence} row=${standardRow?.rowNumber} name=${standardRow?.name} barcode=${standardRow?.barcode} sku=${standardRow?.sku} stock=${standardRow?.stock} cost=${standardRow?.cost} price=${standardRow?.price}`);

const template = buildLargeImportPreview({
  catalog: [],
  method: "auto",
  rows: [EGO_TEMPLATE_HEADERS, ["", "", "Soap", "0012399", "SKU-1", "", "Piece", "", "", "", ""]],
  sheetName: "Products",
});
check("an exact EGO workbook maps through the template path", template.method === "template" && template.mapped.rows[0]?.name === "Soap" && template.mapped.rows[0]?.barcode === "0012399" && template.mapped.rows[0]?.sku === "SKU-1" && template.mapped.rows[0]?.sequence === 1 && template.notices.every((notice) => notice.code !== "missing_field"));

const supplier = buildLargeImportPreview({
  catalog: [],
  method: "auto",
  rows: [["Picture", "Goods", "Art No", "Code128"], ["", "Soap", "SKU-1", "0012399"]],
  sheetName: "Supplier",
});
const supplierName = supplier.notices.find((notice) => notice.detail === "product_name");
const supplierBarcode = supplier.notices.find((notice) => notice.detail === "piece_barcode");
const supplierSku = supplier.notices.find((notice) => notice.detail === "sku");
check("an unrecognized supplier layout warns and does not invent name, barcode or SKU", supplier.mapped.rows[0]?.name === "" && supplier.mapped.rows[0]?.barcode === "" && supplier.mapped.rows[0]?.sku === "" && Boolean(supplierName?.sample.includes("Goods") && supplierName.sample.includes("Soap")) && Boolean(supplierBarcode?.sample.includes("Code128") && supplierBarcode.sample.includes("0012399")) && Boolean(supplierSku?.sample.includes("Art No") && supplierSku.sample.includes("SKU-1")), supplier.notices.map((notice) => `${notice.detail}:${notice.sample}`).join(" || "));

const continued = buildLargeImportPreview({
  catalog: [{ barcode: "0012399", productName: "Old Soap", sku: "", unit: "Piece" }],
  edits: [{ field: "product_name", rowNumber: 2, value: "Edited Soap" }],
  method: "auto",
  mappedPage: 1,
  pageSize: 20,
  rows: [["Product Name", "Barcode", "SKU"], ...Array.from({ length: 25 }, (_, index) => [index === 0 ? "Soap" : `Soap ${index + 1}`, index === 0 ? "0012399" : `1000${index}`, `SKU-${index + 1}`])],
  sheetName: "Products",
});
check("sequence continues across pages while edits stay on the source row", continued.mapped.rows[0]?.sequence === 21 && continued.mapped.rows.length === 5 && continued.mapped.pageSize === 20);
const firstPage = buildLargeImportPreview({
  catalog: [{ barcode: "0012399", productName: "Old Soap", sku: "", unit: "Piece" }],
  edits: [{ field: "product_name", rowNumber: 2, value: "Edited Soap" }],
  method: "auto",
  pageSize: 20,
  rows: [["Product Name", "Barcode", "SKU"], ...Array.from({ length: 25 }, (_, index) => [index === 0 ? "Soap" : `Soap ${index + 1}`, index === 0 ? "0012399" : `1000${index}`, `SKU-${index + 1}`])],
  sheetName: "Products",
});
check("inline edits and duplicates survive pagination", firstPage.mapped.rows[0]?.name === "Edited Soap" && firstPage.mapped.rows[0]?.status === "duplicate" && firstPage.mapped.rows[0]?.sequence === 1);

check("image processing is skipped only when the switch is off", drawer.includes("includeImages: importImages.current") && server.includes("const includeImages = body.includeImages !== false") && server.includes("const pageImages = !includeImages") && previewService.includes("includeImages: _request.includeImages") && previewService.includes("_request.includeImages === false ? []"));
const png = new Uint8Array(encodeJpeg({ data: Buffer.alloc(8 * 8 * 4, 255), height: 8, width: 8 }, 50).data);
const withImage = buildLargeImportPreview({
  catalog: [],
  images: [{ bytes: png, bottomRow: null, topRow: 1 }],
  method: "auto",
  rows: [["Product Name", "Barcode", "SKU"], ["Soap", "0012399", "SKU-1"]],
  sheetName: "Products",
});
const withoutImage = buildLargeImportPreview({
  catalog: [],
  images: [],
  method: "auto",
  rows: [["Product Name", "Barcode", "SKU"], ["Soap", "0012399", "SKU-1"]],
  sheetName: "Products",
});
check("skipping images keeps the other fields", Boolean(withImage.mapped.rows[0]?.thumb) && !withoutImage.mapped.rows[0]?.thumb && withoutImage.mapped.rows[0]?.name === "Soap" && withoutImage.mapped.rows[0]?.barcode === "0012399" && withoutImage.mapped.rows[0]?.sku === "SKU-1");

check("export preview uses the shared white table and letters for the selected columns", exported.includes('testId="products-export-preview-table"') && exported.includes("WhiteDataTable") && exported.includes('data-testid="products-export-column-letters"') && exported.includes("exportColumnLetter(index)") && exported.includes("preview.headers.map") && !exported.includes("IMPORT_DESTINATION_LETTERS") && exported.includes("toggleField") && exported.includes('t("exportUnits")'));
check("export calculations and selected fields stay in the export service", exportService.includes("buildProductExportPreview") && exportService.includes("fields") && !exportService.includes("IMPORT_DESTINATION_LETTERS"));
check("import and export preview code does not write products or stock", !previewSource.includes("product.create") && !previewSource.includes("inventoryBalance") && !previewSource.includes("stockMovement") && !drawer.includes("importProductsFileAction") && !exported.includes("product.create"));

const started = Date.now();
const large = buildLargeImportPreview({
  catalog: [],
  method: "auto",
  pageSize: 20,
  rows: [["Product Name", "Barcode", "SKU"], ...Array.from({ length: 2000 }, (_, index) => [`Soap ${index + 1}`, `000${index}`, `SKU-${index + 1}`])],
  sheetName: "Products",
});
check("two thousand recognized rows stay on one page", large.mapped.rows.length === 20 && large.mapped.pageCount === 100 && large.mapped.rows[0]?.sequence === 1 && large.mapped.rows[0]?.barcode.startsWith("000") && Date.now() - started < 2000, `ms=${Date.now() - started} rows=${large.mapped.rows.length}`);

console.log(`${checks.length}/${checks.length + failures.length} passed`);
if (failures.length > 0) {
  console.log(failures.join("\n"));
  process.exit(1);
}
