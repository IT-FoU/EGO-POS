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
import { loadAnchorsForRows, readWorkbookPreviewSource } from "../features/products/product-import-preview-sheet";
import { downscalePreviewImage } from "../features/products/product-import-preview-image";
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
const picturedImages = await loadAnchorsForRows(workbookPath, stock.images, [2], [2]);
const pictured = buildLargeImportPreview({ catalog: [], images: picturedImages, rows: stock.rows, sheetName: "Stock" });
const thumb = pictured.excel.rows[0]?.thumb ?? "";
check("the thumbnail is the workbook image and stays private", thumb.startsWith("data:image/jpeg;base64,") && !thumb.includes("supabase") && pictured.counts.imageMatched === 1);
check("the product row shows its own thumbnail", pictured.mapped.rows[0]?.name === "Rice" && pictured.mapped.rows[0]?.thumb === thumb);

const laoRows = [
  ["ລາຍງານຜູ້ສະໜອງ"],
  ["ລຳດັບ", "ຊື່ສິນຄ້າ", "ບາໂຄດ", "ລະຫັດສິນຄ້າ", "ປະເພດ", "ຫົວໜ່ວຍ", "ຈຳນວນ", "ລາຄາທຶນ", "ລາຄາຂາຍ"],
  ["1", "ນ້ຳດື່ມ", "00123", "SKU-01", "ເຄື່ອງດື່ມ", "ຊິ້ນ", "", "", ""],
  ["2", "ເບຍ", "00456", "SKU-02", "ບໍ່ມີໝວດ", "1×12", "1×24", "", "0"],
];
const laoSupplier = buildLargeImportPreview({ catalog: [], categories: ["ເຄື່ອງດື່ມ"], rows: laoRows, sheetName: "Lao" });
check("a Lao header row is found under a title", laoSupplier.excel.headers[1] === "ຊື່ສິນຄ້າ" && laoSupplier.mapped.rows[0]?.name === "ນ້ຳດື່ມ");
check("a sequence column is not the product name", laoSupplier.columns[0]?.status === "ignored" && laoSupplier.mapped.rows[0]?.name !== "1" && laoSupplier.mapped.rows[1]?.name === "ເບຍ");
check("barcode and sku keep leading zeros", laoSupplier.mapped.rows[0]?.barcode === "00123" && laoSupplier.mapped.rows[0]?.sku === "SKU-01");
check("only an existing category is filled", laoSupplier.mapped.rows[0]?.category === "ເຄື່ອງດື່ມ" && laoSupplier.mapped.rows[1]?.category === null && (laoSupplier.mapped.rows[1]?.issue ?? "").includes("Category was not matched"));
check("missing price and stock stay blank", laoSupplier.mapped.rows[0]?.price === null && laoSupplier.mapped.rows[0]?.cost === null && laoSupplier.mapped.rows[0]?.stock === null && laoSupplier.mapped.rows[0]?.unit === "Piece");
check("packaging text is not a unit or a quantity", laoSupplier.mapped.rows[1]?.unit === "" && laoSupplier.mapped.rows[1]?.stock === null && laoSupplier.mapped.rows[1]?.status === "needs_review" && laoSupplier.mapped.rows[1]?.price === "0");

const edited = buildLargeImportPreview({
  catalog,
  edits: [{ field: "piece_barcode", rowNumber: 2, value: "1234567890123" }],
  rows: [["Product Name", "Barcode", "Selling Price", "Opening Stock"], ["Fresh", "0099", "10", "1"]],
  sheetName: "Edits",
});
check("editing a barcode reruns duplicate detection", edited.mapped.rows[0]?.barcode === "1234567890123" && edited.mapped.rows[0]?.status === "duplicate" && edited.counts.duplicate === 1);
const pagedRows = [["Product Name", "Selling Price", "Opening Stock"], ...Array.from({ length: 21 }, (_, index) => [`Item ${index + 1}`, "10", "1"])];
const keptEdit = [{ field: "product_name" as const, rowNumber: 2, value: "Kept" }];
const laterPage = buildLargeImportPreview({ catalog: [], edits: keptEdit, mappedPage: 1, pageSize: 20, rows: pagedRows, sheetName: "Pages" });
const firstPage = buildLargeImportPreview({ catalog: [], edits: keptEdit, mappedPage: 0, pageSize: 20, rows: pagedRows, sheetName: "Pages" });
check("an inline edit stays with its source row across pages", laterPage.mapped.rows.every((row) => row.name !== "Kept") && firstPage.mapped.rows[0]?.name === "Kept");
const sourceRows = [["Product Name", "Barcode"], ["Soap", "00111"]];
const source = buildLargeImportPreview({ catalog: [], rows: sourceRows, sheetName: "Map" });
const ignoredName = buildLargeImportPreview({
  catalog: [],
  choices: source.columns.map((column) => ({ field: column.choice === "product_name" ? "ignore" as const : column.choice, index: column.index })),
  rows: sourceRows,
  sheetName: "Map",
});
const restored = buildLargeImportPreview({ catalog: [], rows: sourceRows, sheetName: "Map" });
check("a mapping change rebuilds the preview without changing the source", ignoredName.mapped.rows[0]?.name === "" && restored.mapped.rows[0]?.name === "Soap" && restored.mapped.rows[0]?.barcode === "00111");
const automatic = buildLargeImportPreview({ catalog: [], choices: [], rows: [["Product Name", "SKU", "Barcode"], ["Soap", "SKU-1", "00111"]], sheetName: "Auto" });
check("an empty choice list keeps automatic column mapping", automatic.mapped.rows[0]?.name === "Soap" && automatic.mapped.rows[0]?.sku === "SKU-1" && automatic.mapped.rows[0]?.barcode === "00111");

const headerless = buildLargeImportPreview({
  catalog: [],
  rows: [
    ["", "SUP-01", "0012399", "ນ້ຳດື່ມ"],
    ["", "SUP-02", "8850123456789", "ສະບູ"],
  ],
  sheetName: "Headerless",
});
check("a headerless supplier sheet keeps the first product row", headerless.mapped.rows.length === 2 && headerless.mapped.rows[0]?.name === "ນ້ຳດື່ມ" && headerless.mapped.rows[0]?.sku === "SUP-01" && headerless.mapped.rows[0]?.barcode === "0012399" && headerless.excel.rows[0]?.rowNumber === 1);
const mixedHeaderless = buildLargeImportPreview({
  catalog: [],
  rows: [["", "SUP-01", "0012399", "Water 12"], ["", "SKU-2", "ABC-99", "Soap"]],
  sheetName: "Mixed",
});
check("ambiguous headerless values stay unmapped", mixedHeaderless.columns[2]?.status === "review" && mixedHeaderless.mapped.rows[0]?.barcode === "" && mixedHeaderless.mapped.rows[1]?.name === "Soap");
const coded = buildLargeImportPreview({
  catalog: [],
  rows: [["Item No", "Barcode No", "Product Name"], ["SKU-77", "0012399", "Soap"]],
  sheetName: "Codes",
});
check("Barcode No maps and a coded Item No stays a SKU", coded.columns[0]?.choice === "sku" && coded.columns[1]?.choice === "piece_barcode" && coded.mapped.rows[0]?.sku === "SKU-77" && coded.mapped.rows[0]?.barcode === "0012399" && coded.mapped.rows[0]?.name === "Soap");
const sequenced = buildLargeImportPreview({
  catalog: [],
  rows: [["Item No", "EAN-13", "UPC-A", "Product Name"], ["1", "8850123456789", "012345678905", "Soap"], ["2", "8850000000017", "012345678912", "Next"]],
  sheetName: "Sequence",
});
check("a numeric Item No stays a sequence", sequenced.columns[0]?.status === "ignored" && sequenced.mapped.rows[0]?.sku === "" && sequenced.mapped.rows[0]?.name === "Soap");
check("EAN and UPC headers map as barcodes", sequenced.columns[1]?.choice === "piece_barcode" && sequenced.columns[2]?.status === "conflict");
const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const tall = buildLargeImportPreview({
  catalog: [],
  images: [{ bottomRow: 6, bytes: png, topRow: 1 }],
  rows: [["Product Name", "Barcode"], ["Only", "0012399"]],
  sheetName: "Tall",
});
check("a tall image over one product row maps to that row", tall.counts.imageMatched === 1 && tall.mapped.rows[0]?.thumb?.startsWith("data:image/jpeg;base64,") && tall.mapped.rows[0]?.name === "Only");
const spannedRows = buildLargeImportPreview({
  catalog: [],
  images: [{ bottomRow: 6, bytes: png, topRow: 1 }],
  rows: [["Product Name"], ["One"], ["Two"]],
  sheetName: "Span",
});
check("a tall image over several products is not copied onto each row", spannedRows.counts.imageMatched === 0 && spannedRows.mapped.rows.every((row) => row.thumb === null) && spannedRows.mapped.rows.length === 2);
const oneCell = buildLargeImportPreview({
  catalog: [],
  images: [{ bottomRow: null, bytes: png, topRow: 1 }],
  rows: [["Product Name"], ["Rice"]],
  sheetName: "OneCell",
});
check("a one-cell anchor maps to its product row", oneCell.counts.imageMatched === 1 && oneCell.mapped.rows[0]?.thumb?.startsWith("data:image/jpeg;base64,"));
const pageImages = Array.from({ length: 20 }, (_, index) => ({ bottomRow: index + 2, bytes: png, topRow: index + 1 }));
const pageRows = [["Product Name"], ...Array.from({ length: 20 }, (_, index) => [`Photo ${index + 1}`])];
const photoPage = buildLargeImportPreview({ catalog: [], images: pageImages, pageSize: 20, rows: pageRows, sheetName: "Photos" });
check("twenty thumbnails stay on one preview page", photoPage.mapped.rows.length === 20 && photoPage.mapped.rows.every((row) => row.thumb?.startsWith("data:image/jpeg;base64,")) && Buffer.byteLength(JSON.stringify(photoPage)) <= PREVIEW_RESPONSE_MAX_BYTES);
const noisy = new Uint8Array(180 * 180 * 4);
for (let index = 0; index < noisy.length; index += 4) {
  noisy[index] = index % 251;
  noisy[index + 1] = (index * 3) % 251;
  noisy[index + 2] = (index * 7) % 251;
  noisy[index + 3] = 255;
}
const { encode } = await import("jpeg-js");
const largeJpeg = Uint8Array.from(encode({ data: noisy, height: 180, width: 180 }, 90).data);
const reduced = downscalePreviewImage(largeJpeg);
check("a large embedded image is downscaled before the response is measured", reduced?.startsWith("data:image/jpeg;base64,") === true && Buffer.byteLength(reduced ?? "") < largeJpeg.byteLength);
const heavyImages = Array.from({ length: 40 }, (_, index) => ({ bottomRow: index + 2, bytes: largeJpeg, topRow: index + 1 }));
const heavyRows = [["Product Name", ...Array.from({ length: 7 }, (_, index) => `Note ${index}`)], ...Array.from({ length: 40 }, () => ["Product", ...Array.from({ length: 7 }, () => "x".repeat(80))])];
const heavy = buildLargeImportPreview({ catalog: [], images: heavyImages, pageSize: 50, rows: heavyRows, sheetName: "Heavy" });
check("thumbnails that do not fit return the product rows", heavy.mapped.rows.length === 40 && heavy.mapped.rows.every((row) => row.thumb === null) && (heavy.mapped.rows[0]?.issue ?? "").includes("Image needs review"));
for (const count of [190, 272, 274]) {
  const manyRows = [["Product Name", "Barcode"], ...Array.from({ length: count }, (_, index) => [`Item ${index + 1}`, `8850${String(index).padStart(9, "0")}`])];
  const many = buildLargeImportPreview({ catalog: [], pageSize: 20, rows: manyRows, sheetName: "Many" });
  const page50 = buildLargeImportPreview({ catalog: [], pageSize: 50, rows: manyRows, sheetName: "Many" });
  const page100 = buildLargeImportPreview({ catalog: [], pageSize: 100, rows: manyRows, sheetName: "Many" });
  const last = buildLargeImportPreview({ catalog: [], mappedPage: many.mapped.pageCount - 1, page: many.excel.pageCount - 1, pageSize: 20, rows: manyRows, sheetName: "Many" });
  check(`a worksheet with ${count} products stays previewable`, many.counts.totalRows === count && many.excel.rows.length === 20 && page50.excel.rows.length === 50 && page100.excel.rows.length === 100 && last.mapped.rows.at(-1)?.name === `Item ${count}`);
}
const duplicateSheet = buildLargeImportPreview({
  catalog: [],
  rows: [["Product Name", "Barcode", "SKU", "Selling Price", "Opening Stock"], ["A", "11112222", "SKU-1", "10", "1"], ["B", "11112222", "SKU-2", "10", "1"]],
  sheetName: "Dup",
});
check("duplicate barcodes in the sheet stay marked", duplicateSheet.counts.duplicate === 2 && duplicateSheet.mapped.rows.every((row) => (row.issue ?? "").includes("Duplicate")));

const formatPath = join(directory, "formats.xlsx");
const formatSheet = Buffer.from('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Barcode</t></is></c></row><row r="2"><c r="A2" s="0"><v>123</v></c></row><row r="3"><c r="B3" t="inlineStr"><is><t>00123</t></is></c></row><row r="4"><c r="A4"><v>8.85012345678901E+12</v></c></row></sheetData></worksheet>');
const styles = Buffer.from('<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="00000"/></numFmts><cellXfs count="1"><xf numFmtId="164"/></cellXfs></styleSheet>');
const formatBook = Buffer.from('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheet name="Codes" r:id="rId1"/></workbook>');
const formatRels = Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="styles" Target="styles.xml"/></Relationships>');
await writeFile(formatPath, storedZip([
  { data: formatBook, name: "xl/workbook.xml" },
  { data: formatRels, name: "xl/_rels/workbook.xml.rels" },
  { data: formatSheet, name: "xl/worksheets/sheet1.xml" },
  { data: styles, name: "xl/styles.xml" },
]));
const formatted = await readWorkbookPreviewSource(formatPath, "Codes");
check("Excel zero formats and text barcodes keep their digits", formatted.rows[1]?.[0] === "00123" && formatted.rows[2]?.[1] === "00123" && formatted.rows[3]?.[0] === "8.85012345678901E+12");
const formattedPreview = buildLargeImportPreview({ catalog: [], rows: formatted.rows, sheetName: "Codes" });
check("a numeric barcode that Excel stored in scientific notation needs review", formattedPreview.mapped.rows[2]?.barcode === "8.85012345678901E+12" && (formattedPreview.mapped.rows[2]?.issue ?? "").includes("Barcode needs review"));
const oneCellPath = join(directory, "onecell.xlsx");
const oneCellSheet = sheetXml(["Product Name"], ["Rice"]);
const oneCellDrawing = Buffer.from('<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:row>1</xdr:row></xdr:from><xdr:pic><xdr:blipFill><a:blip r:embed="rId1"/></xdr:blipFill></xdr:pic></xdr:oneCellAnchor></xdr:wsDr>');
const oneCellRels = Buffer.from('<Relationships><Relationship Id="rId1" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>');
const oneCellDrawingRels = Buffer.from('<Relationships><Relationship Id="rId1" Target="../media/image1.png"/></Relationships>');
const oneCellBook = Buffer.from('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheet name="Stock" r:id="rId1"/></workbook>');
const oneCellBookRels = Buffer.from('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
await writeFile(oneCellPath, storedZip([
  { data: oneCellBook, name: "xl/workbook.xml" },
  { data: oneCellBookRels, name: "xl/_rels/workbook.xml.rels" },
  { data: oneCellSheet, name: "xl/worksheets/sheet1.xml" },
  { data: oneCellRels, name: "xl/worksheets/_rels/sheet1.xml.rels" },
  { data: oneCellDrawing, name: "xl/drawings/drawing1.xml" },
  { data: oneCellDrawingRels, name: "xl/drawings/_rels/drawing1.xml.rels" },
  { data: Buffer.from(png), name: "xl/media/image1.png" },
]));
const oneCellSource = await readWorkbookPreviewSource(oneCellPath, "Stock");
const oneCellLoaded = await loadAnchorsForRows(oneCellPath, oneCellSource.images, [2], [2]);
const oneCellPreview = buildLargeImportPreview({ catalog: [], images: oneCellLoaded, rows: oneCellSource.rows, sheetName: "Stock" });
check("a worksheet one-cell anchor is read for the requested row", oneCellSource.images[0]?.bottomRow === null && oneCellPreview.mapped.rows[0]?.thumb?.startsWith("data:image/jpeg;base64,"));
const limitedPath = join(directory, "limited.xlsx");
const limitedSheet = sheetXml(["Product Name"], ["Rice"]);
await writeFile(limitedPath, storedZip([
  { data: oneCellBook, name: "xl/workbook.xml" },
  { data: oneCellBookRels, name: "xl/_rels/workbook.xml.rels" },
  { data: limitedSheet, name: "xl/worksheets/sheet1.xml", uncompressedSize: 64 * 1024 * 1024 + 1 },
]));
let worksheetLimited = false;
try {
  await readWorkbookPreviewSource(limitedPath, "Stock");
} catch (error) {
  worksheetLimited = error instanceof Error && error.message === "worksheet_limit";
}
check("an oversized worksheet entry has its own limit", worksheetLimited);

const panelSource = readFileSync("features/products/components/product-import-preview-panel.tsx", "utf8");
check("only the page size is stored in the browser", panelSource.includes("PREVIEW_PAGE_SIZE_STORAGE_KEY") && panelSource.split("localStorage.setItem").length === 2 && readFileSync("features/products/components/product-import-drawer.tsx", "utf8").includes("previewRequest"));
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

function storedZip(entries: Array<{ data: Buffer; name: string; uncompressedSize?: number }>) {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.uncompressedSize ?? entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, entry.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.uncompressedSize ?? entry.data.length, 24);
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
