import ExcelJS from "exceljs";
import type { SupportedLocale } from "@/lib/constants";
import { tReports } from "@/lib/i18n/reports-copy";
import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import type { InventoryTableQuery } from "@/features/reports/inventory-table-query";
import type { InventoryOnHandResult } from "@/features/reports/inventory-table-repository";
import { hasReorderThreshold } from "@/features/reports/inventory-table-math";

const MONEY_FORMAT = "#,##0";
const QTY_FORMAT = "#,##0.###";
const TEXT_FORMAT = "@";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
const TOTAL_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFA1A1AA" } };
const BORDER: Partial<ExcelJS.Borders> = { bottom: THIN, left: THIN, right: THIN, top: THIN };
const TOTAL_BORDER: Partial<ExcelJS.Borders> = {
  bottom: THIN,
  left: THIN,
  right: THIN,
  top: { style: "medium", color: { argb: "FF71717A" } },
};

type ColumnKind = "text" | "int" | "money" | "qty" | "center";
type ColumnSpec = { header: string; kind: ColumnKind; key: string; width: number };

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function generatedAtLabel(date = new Date()) {
  return `${businessDayLabel(date)} ${formatBusinessTimeLabel(date)}`;
}

function optionLabel(options: Array<{ id: string; label: string }>, id: string | undefined, fallback: string) {
  if (!id) return fallback;
  return options.find((row) => row.id === id)?.label ?? fallback;
}

function statusLabel(status: string, locale: SupportedLocale) {
  if (status === "out_of_stock") return t("statusOutOfStock", locale);
  if (status === "low_stock") return t("statusLowStock", locale);
  if (status === "no_reorder_level") return t("noReorderLevel", locale);
  return t("statusInStock", locale);
}

function applyCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue, kind: ColumnKind, total = false) {
  cell.value = value ?? "";
  cell.border = total ? TOTAL_BORDER : BORDER;
  const numeric = typeof value === "number";
  cell.alignment = {
    horizontal: numeric && (kind === "money" || kind === "int" || kind === "qty") ? "right" : kind === "center" ? "center" : "left",
    vertical: "middle",
  };
  if (total) {
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
  }
  if (kind === "money" && numeric) cell.numFmt = MONEY_FORMAT;
  if (kind === "qty" && numeric) cell.numFmt = QTY_FORMAT;
  if (kind === "int" && numeric) cell.numFmt = MONEY_FORMAT;
  if (kind === "text") cell.numFmt = TEXT_FORMAT;
}

function writeMeta(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
  sheet.getCell(row, 1).value = label;
  sheet.getCell(row, 1).font = { bold: true };
  sheet.getCell(row, 2).value = value;
}

function writeSummary(sheet: ExcelJS.Worksheet, startRow: number, items: Array<{ label: string; value: number }>) {
  sheet.getCell(startRow, 1).value = tReports("reportSummary");
  sheet.getCell(startRow, 1).font = { bold: true };
  items.forEach((item, index) => {
    const row = startRow + 1 + index;
    sheet.getCell(row, 1).value = item.label;
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = item.value;
    valueCell.numFmt = MONEY_FORMAT;
  });
  return startRow + 1 + items.length;
}

function writeTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  columns: ColumnSpec[],
  rows: Array<Record<string, ExcelJS.CellValue>>,
  total: Record<string, ExcelJS.CellValue> | null,
) {
  columns.forEach((column, index) => {
    const cell = sheet.getCell(startRow, index + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    sheet.getColumn(index + 1).width = column.width;
  });
  rows.forEach((row, rowIndex) => {
    columns.forEach((column, colIndex) => {
      applyCell(sheet.getCell(startRow + 1 + rowIndex, colIndex + 1), row[column.key] ?? "", column.kind);
    });
  });
  if (total) {
    const totalRow = startRow + 1 + rows.length;
    columns.forEach((column, colIndex) => {
      applyCell(sheet.getCell(totalRow, colIndex + 1), total[column.key] ?? "", column.kind, true);
    });
  }
  sheet.views = [{ activeCell: `A${startRow + 1}`, state: "frozen", ySplit: startRow }];
}

async function toFile(
  workbook: ExcelJS.Workbook,
  filename: string,
  sheetName: string,
  headers: string[],
  rowCount: number,
  summary: Record<string, number>,
  totals: Record<string, number>,
): Promise<SalesExcelFile> {
  const raw = await workbook.xlsx.writeBuffer();
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw as Uint8Array);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return {
    buffer,
    filename: sanitizeExportFilename(filename),
    headers,
    rowCount,
    sheetName,
    summary,
    totals,
  };
}

function stamp(query: InventoryTableQuery) {
  return businessDayLabel(new Date());
}

function metaBlock(
  sheet: ExcelJS.Worksheet,
  locale: SupportedLocale,
  storeName: string,
  reportName: string,
  data: InventoryOnHandResult,
) {
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), reportName);
  writeMeta(sheet, 3, t("generatedAt", locale), generatedAtLabel());
  writeMeta(sheet, 4, t("branch", locale), optionLabel(data.filterOptions.branches, data.query.branchId, t("allBranches", locale)));
  writeMeta(sheet, 5, t("warehouse", locale), optionLabel(data.filterOptions.warehouses, data.query.warehouseId, t("allWarehouses", locale)));
  writeMeta(sheet, 6, t("colCategory", locale), optionLabel(data.filterOptions.categories, data.query.categoryId, t("allCategories", locale)));
  writeMeta(sheet, 7, t("supplier", locale), optionLabel(data.filterOptions.suppliers, data.query.supplierId, t("allSuppliers", locale)));
  writeMeta(sheet, 8, t("stockStatus", locale), data.query.status);
}

export async function buildStockOnHandExcel(input: {
  data: InventoryOnHandResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stock On Hand");
  metaBlock(sheet, locale, storeName, t("stockOnHand", locale), data);
  const showCost = data.showCost;
  const summaryItems = [
    { label: t("totalProducts", locale), value: data.summary.totalProducts },
    { label: t("statusInStock", locale), value: data.summary.inStock },
    { label: t("statusLowStock", locale), value: data.summary.lowStock },
    { label: t("statusOutOfStock", locale), value: data.summary.outOfStock },
    { label: t("colOnHand", locale), value: data.summary.totalOnHand },
    { label: t("colReserved", locale), value: data.summary.totalReserved },
    { label: t("colAvailable", locale), value: data.summary.totalAvailable },
    ...(showCost ? [{ label: t("stockValue", locale), value: data.summary.totalStockValueLak }] : []),
  ];
  const tableStart = writeSummary(sheet, 10, summaryItems) + 2;
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("colProduct", locale), key: "product", kind: "text", width: 28 },
    { header: t("colSku", locale), key: "sku", kind: "text", width: 16 },
    { header: t("colCategory", locale), key: "category", kind: "text", width: 16 },
    { header: t("colBaseUnit", locale), key: "baseUnit", kind: "text", width: 12 },
    { header: t("colOnHand", locale), key: "onHand", kind: "qty", width: 12 },
    { header: t("colReserved", locale), key: "reserved", kind: "qty", width: 12 },
    { header: t("colAvailable", locale), key: "available", kind: "qty", width: 12 },
    { header: t("colReorderLevel", locale), key: "minStock", kind: "text", width: 14 },
    { header: t("status", locale), key: "status", kind: "text", width: 14 },
    ...(showCost
      ? [
          { header: t("unitCost", locale), key: "unitCost", kind: "money" as const, width: 12 },
          { header: t("stockValue", locale), key: "stockValue", kind: "money" as const, width: 14 },
        ]
      : []),
    { header: t("supplier", locale), key: "supplier", kind: "text", width: 18 },
    { header: t("colLastMovement", locale), key: "lastMovement", kind: "text", width: 20 },
  ];
  const rows = data.rows.map((row, index) => ({
    no: index + 1,
    product: row.productName,
    sku: row.sku,
    category: row.categoryName,
    baseUnit: row.baseUnit,
    onHand: row.onHand,
    reserved: row.reserved,
    available: row.available,
    minStock: hasReorderThreshold(row.minStock) ? row.minStock : t("noReorderLevel", locale),
    status: statusLabel(row.status, locale),
    unitCost: row.unitCostLak,
    stockValue: row.stockValueLak,
    supplier: row.supplierName,
    lastMovement: row.lastMovementAt ? row.lastMovementAt.slice(0, 16).replace("T", " ") : "",
  }));
  writeTable(sheet, tableStart, columns, rows, {
    no: "",
    product: t("total", locale),
    sku: "",
    category: "",
    baseUnit: "",
    onHand: data.totalRow.onHand,
    reserved: data.totalRow.reserved,
    available: data.totalRow.available,
    minStock: data.totalRow.productCount,
    status: "",
    unitCost: "",
    stockValue: showCost ? data.totalRow.stockValueLak : "",
    supplier: "",
    lastMovement: "",
  });
  return toFile(
    workbook,
    `EGO-POS-Stock-On-Hand-${stamp(data.query)}.xlsx`,
    "Stock On Hand",
    columns.map((column) => column.header),
    rows.length,
    {
      totalProducts: data.summary.totalProducts,
      inStock: data.summary.inStock,
      lowStock: data.summary.lowStock,
      outOfStock: data.summary.outOfStock,
      totalOnHand: data.summary.totalOnHand,
      totalReserved: data.summary.totalReserved,
      totalAvailable: data.summary.totalAvailable,
      ...(showCost ? { totalStockValueLak: data.summary.totalStockValueLak } : {}),
    },
    {
      productCount: data.totalRow.productCount,
      onHand: data.totalRow.onHand,
      reserved: data.totalRow.reserved,
      available: data.totalRow.available,
      ...(showCost ? { stockValueLak: data.totalRow.stockValueLak } : {}),
    },
  );
}

export async function buildLowStockExcel(input: {
  data: InventoryOnHandResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Low Stock");
  metaBlock(sheet, locale, storeName, t("lowStockReorder", locale), data);
  const showCost = data.showCost;
  const summaryItems = [
    { label: t("statusLowStock", locale), value: data.summary.lowStock },
    { label: t("statusOutOfStock", locale), value: data.summary.outOfStock },
    { label: t("suggestedReorder", locale), value: data.summary.suggestedReorder },
    { label: t("colAvailable", locale), value: data.summary.totalAvailable },
    { label: t("alreadyOrdered", locale), value: data.summary.alreadyOrdered },
  ];
  const tableStart = writeSummary(sheet, 10, summaryItems) + 2;
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("colProduct", locale), key: "product", kind: "text", width: 28 },
    { header: t("colSku", locale), key: "sku", kind: "text", width: 16 },
    { header: t("colCategory", locale), key: "category", kind: "text", width: 16 },
    { header: t("supplier", locale), key: "supplier", kind: "text", width: 18 },
    { header: t("colOnHand", locale), key: "onHand", kind: "qty", width: 12 },
    { header: t("colReserved", locale), key: "reserved", kind: "qty", width: 12 },
    { header: t("colAvailable", locale), key: "available", kind: "qty", width: 12 },
    { header: t("colReorderLevel", locale), key: "minStock", kind: "text", width: 14 },
    { header: t("reorderNeeded", locale), key: "needed", kind: "text", width: 14 },
    ...(showCost ? [{ header: t("unitCost", locale), key: "unitCost", kind: "money" as const, width: 12 }] : []),
    { header: t("status", locale), key: "status", kind: "text", width: 14 },
    { header: t("colLastReceived", locale), key: "lastReceived", kind: "text", width: 20 },
    { header: t("colLastSold", locale), key: "lastSold", kind: "text", width: 20 },
  ];
  const rows = data.rows.map((row, index) => ({
    no: index + 1,
    product: row.productName,
    sku: row.sku,
    category: row.categoryName,
    supplier: row.supplierName,
    onHand: row.onHand,
    reserved: row.reserved,
    available: row.available,
    minStock: hasReorderThreshold(row.minStock) ? row.minStock : t("noReorderLevel", locale),
    needed: row.reorderNeeded ? t("yes", locale) : t("no", locale),
    unitCost: row.unitCostLak,
    status: row.alreadyOrdered ? `${statusLabel(row.status, locale)} / ${t("alreadyOrdered", locale)}` : statusLabel(row.status, locale),
    lastReceived: row.lastReceivedAt ? row.lastReceivedAt.slice(0, 16).replace("T", " ") : "",
    lastSold: row.lastSoldAt ? row.lastSoldAt.slice(0, 16).replace("T", " ") : t("lastSoldNever", locale),
  }));
  writeTable(sheet, tableStart, columns, rows, {
    no: "",
    product: t("total", locale),
    sku: "",
    category: "",
    supplier: "",
    onHand: data.totalRow.onHand,
    reserved: data.totalRow.reserved,
    available: data.totalRow.available,
    minStock: data.totalRow.productCount,
    needed: "",
    unitCost: "",
    status: "",
    lastReceived: "",
    lastSold: "",
  });
  return toFile(
    workbook,
    `EGO-POS-Low-Stock-Reorder-${stamp(data.query)}.xlsx`,
    "Low Stock",
    columns.map((column) => column.header),
    rows.length,
    {
      lowStock: data.summary.lowStock,
      outOfStock: data.summary.outOfStock,
      suggestedReorder: data.summary.suggestedReorder,
      totalAvailable: data.summary.totalAvailable,
      alreadyOrdered: data.summary.alreadyOrdered,
    },
    {
      productCount: data.totalRow.productCount,
      onHand: data.totalRow.onHand,
      reserved: data.totalRow.reserved,
      available: data.totalRow.available,
    },
  );
}
