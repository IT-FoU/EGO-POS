import ExcelJS from "exceljs";
import {
  buildProductExportTable,
  productExportStockRows,
  productExportUnitRows,
  type ProductExportSource,
} from "@/features/products/product-export";

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
