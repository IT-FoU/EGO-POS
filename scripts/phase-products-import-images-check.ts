import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { classifyEmbeddedImages } from "../features/products/product-import-images";
import { readProductImportFile } from "../features/products/product-import-files";
import { mapProductImportGrid, productImportDelimitedGrid } from "../features/products/product-import";
import { inspectZipCentralDirectory } from "../features/products/product-import-zip";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ ok: boolean; name: string }> = [];
function check(name: string, ok: boolean) {
  results.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const classified = classifyEmbeddedImages([
  { bottomRow: 2, bytes: png, topRow: 1 },
  { bottomRow: 4, bytes: png, topRow: 1 },
  { bottomRow: 3, bytes: png, topRow: 2 },
  { bottomRow: 3, bytes: png, topRow: 2 },
  { bottomRow: null, bytes: png, topRow: 9 },
], [2, 3]);
check("one-row anchor maps to that product row", classified.some((image) => image.status === "mapped" && image.rowNumber === 2 && image.mime === "image/png" && image.dataUrl?.startsWith("data:image/png")));
check("an image covering several rows is not guessed", classified.some((image) => image.reason === "spanned"));
check("two images on one row stay in review", classified.filter((image) => image.rowNumber === 3 && image.reason === "ambiguous").length === 2);
check("an image outside the data rows is unassigned", classified.some((image) => image.reason === "unassigned"));

const bomb = zipBomb();
const bombRead = await readProductImportFile({ bytes: bomb, fileName: "bomb.xlsx" });
check("zip bomb is rejected before parsing", bombRead.parsed.fileIssues.some((issue) => issue.code === "unsafe_workbook") && bombRead.images.length === 0 && inspectZipCentralDirectory(bomb).ok === false);

const workbook = await imageWorkbook();
const read = await readProductImportFile({ bytes: workbook, fileName: "images.xlsx" });
const other = await readProductImportFile({ bytes: workbook, fileName: "images.xlsx", sheetName: "Other" });
check("embedded image stays on its worksheet row", read.selectedSheet === "Products" && read.images.some((image) => image.status === "mapped" && image.rowNumber === 2) && read.parsed.rows[0]?.values.piece_barcode === "0012399" && read.parsed.rows[0]?.values.product_name === "ນ້ຳ (1×12)");
check("another sheet does not inherit the image", other.selectedSheet === "Other" && other.images.length === 0 && other.parsed.rows[0]?.values.product_name === "Second");
check("pack text is still not a conversion", read.parsed.rows[0]?.values.pack_qty === "");

const tooMany = mapProductImportGrid(productImportDelimitedGrid(["Product Name", ...Array.from({ length: 501 }, (_, index) => `Item ${index}`)].join("\n"), ",").rows);
check("row limit stays at 500", tooMany.fileIssues.some((issue) => issue.code === "too_many_rows") && tooMany.rows.length === 0);

const drawer = readFileSync("features/products/components/product-import-drawer.tsx", "utf8");
const service = readFileSync("features/products/product-import-service.ts", "utf8");
check("the import screen does not save products or images", !drawer.includes("importProductsFileAction") && !drawer.includes("uploadProductImageAction") && !drawer.includes('data-testid="products-import-include-images"'));
check("image save remains available only after a created product", service.includes("productId: createdProduct.id") && service.includes("importProductFileBatch"));
const preview = service.slice(service.indexOf("export async function previewProductImportFile"), service.indexOf("export async function importProductFileBatch"));
check("preview still does not create products or images", !preview.includes("createPrismaProduct") && !preview.includes("uploadAndAttachProductImages"));
check("import returns the created product id for a later image save", service.includes("productId: createdProduct.id"));
const actions = readFileSync("features/products/actions.ts", "utf8");
check("image save still uses the product update permission", actions.includes("uploadProductImageAction") && actions.includes("WRITE_PERMISSIONS.productsUpdate") && actions.includes("WRITE_PERMISSIONS.productsCreate"));
check("copy parity", productsCopyKeyParity());
check("lo unsafe workbook", tProducts("importIssue_unsafe_workbook", "lo") !== tProducts("importIssue_unsafe_workbook", "en"));
check("lo include images", tProducts("importIncludeImages", "lo") !== tProducts("importIncludeImages", "en"));
check("lo image review reasons", ["ambiguous", "oversized", "spanned", "unassigned", "unsupported"].every((reason) => tProducts(`importImageReason_${reason}`, "lo") !== tProducts(`importImageReason_${reason}`, "en")));
check("preview shows the file size", drawer.includes("products-import-filesize"));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);

function zipBomb() {
  const name = Buffer.from("xl/workbook.xml");
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt32LE(100, 20);
  header.writeUInt32LE(200_000_000, 24);
  header.writeUInt16LE(name.length, 28);
  const central = Buffer.concat([header, name]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(0, 16);
  return new Uint8Array(Buffer.concat([central, eocd]));
}

async function imageWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const products = workbook.addWorksheet("Products");
  products.addRow(["Product Name", "Piece Barcode"]);
  const row = products.addRow(["ນ້ຳ (1×12)", "0012399"]);
  row.getCell(2).value = "0012399";
  const imageId = workbook.addImage({ buffer: Buffer.from(png), extension: "png" });
  products.addImage(imageId, { tl: { col: 0, row: 1 }, br: { col: 1, row: 2 } });
  const other = workbook.addWorksheet("Other");
  other.addRow(["Product Name"]);
  other.addRow(["Second"]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
