import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PermissionDeniedError } from "../lib/auth/permissions";
import { productsCopyKeyParity } from "../lib/i18n/products-copy";
import type { EmbeddedImageAnchor } from "../features/products/product-import-images";
import { PRODUCT_IMPORT_MAX_ROWS } from "../features/products/product-import";
import { createMemoryLargeImportStore } from "../features/products/product-import-large-store";
import { loadCachedWorkbook, previewCacheDownloads, resetPreviewCacheForTests } from "../features/products/product-import-preview-cache";
import { buildLargeImportPreview, PREVIEW_PAGE_SIZE_STORAGE_KEY, PREVIEW_RESPONSE_MAX_BYTES, readStoredPreviewPageSize } from "../features/products/product-import-preview";
import { readWorkbookPreviewSource } from "../features/products/product-import-preview-sheet";
import { readLargeImportPreview } from "../features/products/product-import-preview-service";
import { createMemoryImportProcessStore } from "../features/products/product-import-process-store";
import type { ImportProcessRecord } from "../features/products/product-import-process";
import type { LargeImportJob } from "../features/products/product-import-large";

const checks: string[] = [];
const failures: string[] = [];
function check(name: string, ok: boolean) {
  (ok ? checks : failures).push(name);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const headers = ["Product Name", "SKU", "Barcode", "Cost Price", "Selling Price", "Opening Stock"];
const data = Array.from({ length: 25 }, (_, index) => [
  index === 0 ? "Water (1×12)" : `Item ${index + 1}`,
  `SKU-${index + 1}`,
  index === 1 ? "1234567890123" : `${1000000000000 + index}`,
  "1000",
  index === 2 ? "" : "1500",
  index === 3 ? "" : index === 4 ? "0" : "5",
]);
const rows = [headers, ...data];
const catalog = [{ barcode: "1234567890123", productName: "Existing Water", sku: "OTHER", unit: "Piece" }];
const preview = buildLargeImportPreview({ catalog, pageSize: 20, rows, sheetName: "Prices" });

check("original headers stay unchanged", preview.excel.headers[0] === "Product Name" && preview.excel.rows[0]?.cells[0] === "Water (1×12)");
check("english header maps to product name", preview.columns[0]?.choice === "product_name");
check("page size 20 returns the first page only", preview.excel.rows.length === 20 && preview.excel.pageCount === 2);
check("pack notation is not turned into a pack quantity", preview.mapped.rows[0]?.name === "Water (1×12)" && preview.mapped.rows[0]?.unit === "Piece");
check("existing barcode is a duplicate with the tenant product", preview.mapped.rows[1]?.status === "duplicate" && preview.mapped.rows[1]?.match?.productName === "Existing Water");
check("missing selling price is incomplete and not zero", preview.counts.incomplete >= 1 && preview.mapped.rows[2]?.price === null && preview.mapped.rows[2]?.status === "incomplete");
check("zero stock stays distinct from missing stock", preview.mapped.rows[4]?.stock === "0" && preview.mapped.rows[4]?.status === "new" && preview.mapped.rows[3]?.stock === null);

const lao = buildLargeImportPreview({ catalog: [], rows: [["ຊື່ສິນຄ້າ", "ບາໂຄດ"], ["ນ້ຳ", "1234"]], sheetName: "Lo" });
const thai = buildLargeImportPreview({ catalog: [], rows: [["ชื่อสินค้า", "บาร์โค้ด"], ["น้ำ", "1234"]], sheetName: "Th" });
check("lao and thai headers map", lao.columns[0]?.choice === "product_name" && thai.columns[0]?.choice === "product_name" && lao.columns[1]?.choice === "piece_barcode");

const second = buildLargeImportPreview({ catalog, page: 1, pageSize: 20, rows, sheetName: "Prices" });
check("second page has the remaining rows", second.excel.rows.length === 5 && second.excel.page === 1);
const wide = buildLargeImportPreview({ catalog, pageSize: 100, rows, sheetName: "Prices" });
check("page size 100 keeps a short sheet on one page", wide.excel.pageCount === 1 && wide.excel.rows.length === 25);
check("preferred page size is restored", readStoredPreviewPageSize({ getItem: (key) => key === PREVIEW_PAGE_SIZE_STORAGE_KEY ? "50" : null }) === 50);

const ambiguous: EmbeddedImageAnchor[] = [
  { bottomRow: 2, bytes: new Uint8Array([1, 2, 3]), topRow: 1 },
  { bottomRow: 2, bytes: new Uint8Array([4, 5, 6]), topRow: 1 },
];
const missing: EmbeddedImageAnchor[] = [{ bottomRow: null, bytes: new Uint8Array([7]), topRow: null }];
const reviewed = buildLargeImportPreview({ catalog: [], images: [...ambiguous, ...missing], rows: [["Product Name"], ["Named"]], sheetName: "Images" });
check("ambiguous anchors are not assigned a product row", reviewed.counts.imageNeedsReview === 3 && reviewed.excel.rows[0]?.thumb === null && reviewed.mapped.rows[0]?.status === "needs_review");

const sameBarcode = buildLargeImportPreview({
  catalog: [],
  rows: [["Product Name", "Barcode", "Pack Barcode", "Selling Price", "Opening Stock"], ["Dual", "5555", "5555", "10", "1"]],
  sheetName: "Units",
});
check("the same barcode on two units is a duplicate", sameBarcode.mapped.rows[0]?.status === "duplicate");

const ignored = buildLargeImportPreview({
  catalog,
  choices: [
    { field: "product_name", index: 0 },
    { field: "sku", index: 1 },
    { field: "ignore", index: 2 },
    { field: "piece_cost", index: 3 },
    { field: "piece_selling_price", index: 4 },
    { field: "opening_stock", index: 5 },
  ],
  rows,
  sheetName: "Prices",
});
check("mapping change recomputes duplicate status", ignored.columns[2]?.status === "ignored" && ignored.mapped.rows[1]?.status !== "duplicate");

const counts = preview.counts;
check("status counts do not overlap", counts.newProducts + counts.duplicate + counts.needsReview + counts.incomplete === counts.totalRows);
const overSmallFileLimit = buildLargeImportPreview({
  catalog: [],
  pageSize: 20,
  rows: [["Product Name", "Selling Price", "Opening Stock"], ...Array.from({ length: 501 }, (_, index) => [`Row ${index + 1}`, "10", "1"])],
  sheetName: "Long",
});
check("sheets above the small-file row cap still classify", overSmallFileLimit.counts.totalRows === 501 && overSmallFileLimit.counts.newProducts === 501 && overSmallFileLimit.excel.rows.length === 20);

let limited = false;
try {
  buildLargeImportPreview({
    catalog: [],
    pageSize: 20,
    rows: [
      Array.from({ length: 80 }, (_, index) => `Column ${index}`),
      ...Array.from({ length: 20 }, () => Array.from({ length: 80 }, () => "x".repeat(120))),
    ],
    sheetName: "Wide",
  });
} catch (error) {
  limited = error instanceof Error && error.message === "preview_limit";
}
check("a preview response stays bounded", limited && PREVIEW_RESPONSE_MAX_BYTES === 180_000 && PRODUCT_IMPORT_MAX_ROWS === 500);

const directory = await mkdtemp(join(tmpdir(), "ego-preview-"));
const workbookPath = join(directory, "book.xlsx");
await writeFile(workbookPath, workbook());
const stock = await readWorkbookPreviewSource(workbookPath, "Stock");
const prices = await readWorkbookPreviewSource(workbookPath, "Prices");
check("sheet selection reads the requested worksheet", stock.rows[0]?.[0] === "Product Name" && stock.rows[1]?.[0] === "Rice" && prices.rows[1]?.[0] === "Soap");
check("a clear image anchor matches that row", stock.images.length === 1 && stock.images[0]?.topRow === 1);
const pictured = buildLargeImportPreview({ catalog: [], images: stock.images, rows: stock.rows, sheetName: "Stock" });
const thumb = pictured.excel.rows[0]?.thumb ?? "";
check("the thumbnail is the workbook image and stays private", thumb.startsWith("data:image/png;base64,") && !thumb.includes("supabase") && pictured.counts.imageMatched === 1);
await rm(directory, { force: true, recursive: true });

const processes = createMemoryImportProcessStore();
const uploads = createMemoryLargeImportStore();
const process: ImportProcessRecord = {
  attempt: 1,
  companyId: "company-a",
  durationMs: null,
  entryCount: null,
  errorCode: null,
  finishedAt: null,
  heartbeatAt: null,
  id: "process-1",
  oversizedImages: null,
  peakMemoryBytes: null,
  phase: "ready",
  progressPercent: 100,
  queuedAt: new Date().toISOString(),
  rowCount: 1,
  sheetCount: 1,
  sheetNames: [{ name: "Prices", rows: 1 }],
  startedAt: null,
  status: "ready",
  uncompressedBytes: null,
  uploadId: "upload-1",
  userId: "user-a",
};
const upload: LargeImportJob = {
  byteSize: 100,
  companyId: "company-a",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  fileName: "book.xlsx",
  id: "upload-1",
  idempotencyKey: "idem-1",
  objectPath: "imports/company-a/user-a/upload-1.xlsx",
  status: "uploaded",
  userId: "user-a",
  verifiedAt: new Date().toISOString(),
};
await processes.save(process);
await uploads.save(upload);
const tenant = { companyId: "company-a", userId: "user-a" };
let otherTenant = false;
try {
  await readLargeImportPreview("process-1", { ...tenant, companyId: "company-b" }, { rows, sheetName: "Prices" }, { processes, uploads });
} catch (error) {
  otherTenant = error instanceof PermissionDeniedError;
}
check("another tenant cannot read the preview", otherTenant);
process.status = "cancelled";
await processes.save(process);
let closed = false;
try {
  await readLargeImportPreview("process-1", tenant, { rows, sheetName: "Prices" }, { processes, uploads });
} catch (error) {
  closed = error instanceof Error && error.message === "preview_closed";
}
check("a cancelled workbook cannot be previewed", closed);
process.status = "ready";
await processes.save(process);
let unavailable = false;
try {
  await readLargeImportPreview("process-1", tenant, { catalog: [], sheetName: "Prices" }, { processes, uploads });
} catch (error) {
  unavailable = error instanceof Error && error.message === "preview_unavailable";
}
check("preview without the service binding stays closed", unavailable);
let boundCompany = "";
const bound = await readLargeImportPreview("process-1", tenant, { catalog: [], sheetName: "Prices" }, {
  preview: async (request) => {
    boundCompany = request.companyId;
    return buildLargeImportPreview({ catalog: [], pageSize: 20, rows, sheetName: request.sheetName });
  },
  processes,
  uploads,
});
check("the service binding receives only this tenant", boundCompany === "company-a" && bound.excel.headers[0] === "Product Name" && bound.excel.rows.length === 20);
resetPreviewCacheForTests();
let loads = 0;
const first = await loadCachedWorkbook("process-1\nPrices", async () => {
  loads += 1;
  return { images: [], rows };
});
const cachedPage = await loadCachedWorkbook("process-1\nPrices", async () => {
  loads += 1;
  return { images: [], rows: [["Changed"]] };
});
check("a later page reuses the parsed sheet", first.cacheHit === false && cachedPage.cacheHit === true && cachedPage.rows[1]?.[0] === "Water (1×12)" && loads === 1 && previewCacheDownloads() === 1);
upload.expiresAt = new Date(Date.now() - 1000).toISOString();
await uploads.save(upload);
let expired = false;
try {
  await readLargeImportPreview("process-1", tenant, { catalog: [], rows, sheetName: "Prices" }, { processes, uploads });
} catch (error) {
  expired = error instanceof Error && error.message === "preview_closed";
}
check("an expired upload cannot be previewed", expired);

const sources = [
  "features/products/product-import-preview.ts",
  "features/products/product-import-preview-service.ts",
  "features/products/product-import-preview-sheet.ts",
  "features/products/components/product-import-preview-panel.tsx",
].map((path) => readFileSync(path, "utf8")).join("\n");
check("preview does not create products or permanent images", !sources.includes("product.create") && !sources.includes("product-images"));
check("preview table uses the white grid", sources.includes("WhiteDataTable") && sources.includes("products-import-excel-table"));
const worker = readFileSync("workers/import-processor/index.ts", "utf8");
const qaConfig = readFileSync("wrangler.qa.jsonc", "utf8");
const productionConfig = readFileSync("wrangler.jsonc", "utf8");
check("QA service binding targets only the import worker", qaConfig.includes('"binding": "IMPORT_PREVIEW"') && qaConfig.includes('"service": "egopos-qa-import"') && !productionConfig.includes("IMPORT_PREVIEW"));
check("preview route checks the caller and the tenant", worker.includes("IMPORT_PREVIEW_TOKEN") && worker.includes("row.company_id !== companyId") && worker.includes("company_id = $1"));
check("copy keys match", productsCopyKeyParity());

console.log(`${checks.length}/${checks.length + failures.length} passed`);
if (failures.length > 0) process.exit(1);

function workbook() {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const pricesSheet = sheetXml(["Product Name", "Barcode"], ["Soap", "1111"]);
  const stockSheet = sheetXml(["Product Name", "Opening Stock"], ["Rice", "4"]);
  const workbookXml = Buffer.from('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheet name="Prices" r:id="rId1"/><sheet name="Stock" r:id="rId2"/></workbook>');
  const workbookRels = Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
  const sheetRels = Buffer.from('<Relationships><Relationship Id="rId1" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  const drawing = Buffer.from('<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>1</xdr:row></xdr:from><xdr:to><xdr:col>1</xdr:col><xdr:row>2</xdr:row></xdr:to><xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></xdr:twoCellAnchor></xdr:wsDr>');
  const drawingRels = Buffer.from('<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>');
  return storedZip([
    { data: workbookXml, name: "xl/workbook.xml" },
    { data: workbookRels, name: "xl/_rels/workbook.xml.rels" },
    { data: pricesSheet, name: "xl/worksheets/sheet1.xml" },
    { data: stockSheet, name: "xl/worksheets/sheet2.xml" },
    { data: sheetRels, name: "xl/worksheets/_rels/sheet2.xml.rels" },
    { data: drawing, name: "xl/drawings/drawing1.xml" },
    { data: drawingRels, name: "xl/drawings/_rels/drawing1.xml.rels" },
    { data: png, name: "xl/media/image1.png" },
  ]);
}

function sheetXml(headers: string[], values: string[]) {
  const cells = (row: string[], rowNumber: number) => row.map((value, index) => `<c r="${String.fromCharCode(65 + index)}${rowNumber}" t="inlineStr"><is><t>${value}</t></is></c>`).join("");
  return Buffer.from(`<worksheet><sheetData><row r="1">${cells(headers, 1)}</row><row r="2">${cells(values, 2)}</row></sheetData></worksheet>`);
}

function storedZip(entries: Array<{ data: Buffer; name: string }>) {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, entry.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += 30 + name.length + entry.data.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, eocd]);
}
