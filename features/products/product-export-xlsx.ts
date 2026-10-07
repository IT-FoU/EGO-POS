import ExcelJS from "exceljs";
import {
  buildDetailedProductExport,
  buildProductExportTable,
  productExportStockRows,
  productExportUnitRows,
  safeImagePath,
  type DetailedExportSheet,
  type ProductExportSource,
} from "@/features/products/product-export";
import { readExportImageNote, type PreparedExportImage } from "@/features/products/product-export-images";

const TEXT_FORMAT = "@";

export async function buildProductExportXlsx(products: ProductExportSource[]) {
  const table = buildProductExportTable(products);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EGO POS";
  writeSheet(workbook, "Products", table.headers, table.rows);
  const units = productExportUnitRows(products);
  writeSheet(
    workbook,
    "Units",
    ["Product Name", "SKU", "Unit Name", "Role", "Enabled", "Status", "Qty in Base", "Barcode", "Cost", "Selling Price", "Rounding", "Image Path"],
    units.map((unit) => [
      unit.productName,
      unit.sku,
      unit.unitName,
      unit.role,
      unit.enabled,
      unit.status,
      unit.conversionQty,
      unit.barcode,
      unit.cost,
      unit.sellingPrice,
      unit.roundingLak,
      unit.imagePath,
    ]),
  );
  const stock = productExportStockRows(products);
  writeSheet(
    workbook,
    "Stock",
    ["Product Name", "SKU", "Warehouse", "On Hand"],
    stock.map((row) => [row.productName, row.sku, row.warehouseName, row.quantity]),
  );
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

export async function buildDetailedProductExportXlsx(products: ProductExportSource[], fields?: readonly string[], images = new Map<string, PreparedExportImage>(), allowCost = true) {
  const detailed = buildDetailedProductExport(products, fields, allowCost);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "EGO POS";
  const imageNote = readExportImageNote();
  if (imageNote) workbook.subject = imageNote;
  const imageIds = new Map<string, number>();
  if (detailed.productsSheet) writeDetailedSheet(workbook, "Products", detailed.productsSheet, images, imageIds);
  if (detailed.unitsSheet) writeDetailedSheet(workbook, "Units", detailed.unitsSheet, images, imageIds);
  if (detailed.stockSheet) writeDetailedSheet(workbook, "Stock", detailed.stockSheet, images, imageIds);
  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}

function writeDetailedSheet(workbook: ExcelJS.Workbook, name: string, sheetData: DetailedExportSheet, images: Map<string, PreparedExportImage>, imageIds: Map<string, number>) {
  const headers = sheetData.headers.map(displayHeader);
  writeSheet(workbook, name, headers, sheetData.rows.map((row) => row.map((value, index) => imageCellText(sheetData.headers[index] ?? "", value, images))));
  const sheet = workbook.getWorksheet(name);
  if (!sheet) return;
  sheetData.headers.forEach((header, columnIndex) => {
    if (!isImageHeader(header)) return;
    sheet.getColumn(columnIndex + 1).width = 14;
    sheetData.rows.forEach((row, rowIndex) => {
      const path = safeImagePath(row[columnIndex]);
      const image = path ? images.get(path) : undefined;
      if (!image) return;
      const id = imageIds.get(path) ?? workbook.addImage({ buffer: image.buffer as unknown as ExcelJS.Buffer, extension: image.extension });
      imageIds.set(path, id);
      const excelRow = sheet.getRow(rowIndex + 2);
      excelRow.height = Math.max(excelRow.height ?? 15, 48);
      sheet.addImage(id, {
        editAs: "oneCell",
        ext: { height: image.height, width: image.width },
        tl: { col: columnIndex, row: rowIndex + 1 },
      });
    });
  });
}

function isImageHeader(header: string) {
  return header === "Product Image Path" || header === "Unit Image Path";
}

function displayHeader(header: string) {
  if (header === "Product Image Path") return "Product Image";
  if (header === "Unit Image Path") return "Unit Image";
  return header;
}

function imageCellText(header: string, value: string, images: Map<string, PreparedExportImage>) {
  if (!isImageHeader(header)) return value;
  const path = safeImagePath(value);
  if (!path) return value === "No Image" ? "No Image" : "";
  return images.has(path) ? "" : "No Image";
}

function writeSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: string[][]) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  headers.forEach((header, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = Math.min(36, Math.max(14, header.length + 2));
    if (/barcode|sku|name|path|warehouse|status|enabled|role/i.test(header)) {
      column.numFmt = TEXT_FORMAT;
    }
  });
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}
