import ExcelJS from "exceljs";
import type { SupportedLocale } from "@/lib/constants";
import { tReports } from "@/lib/i18n/reports-copy";
import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import type { MovementTableResult } from "@/features/reports/movement-table-repository";

const MONEY_FORMAT = "#,##0";
const QTY_FORMAT = "#,##0.###";
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

function kindLabel(kind: string, locale: SupportedLocale) {
  const map: Record<string, string> = {
    stock_in: t("movementStockIn", locale),
    purchase_grn: t("movementPurchaseGrn", locale),
    sale: t("movementSale", locale),
    refund: t("movementRefund", locale),
    void_restore: t("movementVoidRestore", locale),
    adjustment_in: t("movementAdjustmentIn", locale),
    adjustment_out: t("movementAdjustmentOut", locale),
    stock_count: t("movementStockCount", locale),
    exchange_out: t("movementExchangeOut", locale),
    damaged: t("movementDamaged", locale),
    expired: t("movementExpired", locale),
    other: t("movementOther", locale),
  };
  return map[kind] || kind;
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
}

function writeMeta(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
  sheet.getCell(row, 1).value = label;
  sheet.getCell(row, 1).font = { bold: true };
  sheet.getCell(row, 2).value = value;
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

function rangeStamp(data: MovementTableResult) {
  const from = data.range.dateFrom ? String(data.range.dateFrom).slice(0, 10) : businessDayLabel(new Date());
  const to = data.range.dateTo ? String(data.range.dateTo).slice(0, 10) : from;
  return `${from}-to-${to}`;
}

export async function buildStockMovementExcel(input: {
  data: MovementTableResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stock Movement");
  const showCost = data.showCost;
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("stockMovement", locale));
  writeMeta(sheet, 3, t("generatedAt", locale), generatedAtLabel());
  writeMeta(sheet, 4, t("dateRange", locale), rangeStamp(data));
  writeMeta(sheet, 5, t("branch", locale), data.query.branchId || t("allBranches", locale));
  writeMeta(sheet, 6, t("warehouse", locale), data.query.warehouseId || t("allWarehouses", locale));
  writeMeta(sheet, 7, t("movementType", locale), data.query.movementKind);

  let row = 9;
  sheet.getCell(row, 1).value = t("reportSummary", locale);
  sheet.getCell(row, 1).font = { bold: true };
  const summaryItems = [
    { label: t("totalMovements", locale), value: data.summary.totalMovements },
    { label: t("qtyIn", locale), value: data.summary.totalQtyIn },
    { label: t("qtyOut", locale), value: data.summary.totalQtyOut },
    { label: t("netMovement", locale), value: data.summary.netMovement },
    { label: t("productsAffected", locale), value: data.summary.productsAffected },
    ...(showCost
      ? [
          { label: t("valueIn", locale), value: data.summary.valueInLak },
          { label: t("valueOut", locale), value: data.summary.valueOutLak },
        ]
      : []),
  ];
  summaryItems.forEach((item, index) => {
    sheet.getCell(row + 1 + index, 1).value = item.label;
    const cell = sheet.getCell(row + 1 + index, 2);
    cell.value = item.value;
    cell.numFmt = MONEY_FORMAT;
  });
  const tableStart = row + 2 + summaryItems.length;
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("colDateTime", locale), key: "createdAt", kind: "text", width: 18 },
    { header: t("colProduct", locale), key: "product", kind: "text", width: 28 },
    { header: t("colSku", locale), key: "sku", kind: "text", width: 14 },
    { header: t("colCategory", locale), key: "category", kind: "text", width: 14 },
    { header: t("warehouse", locale), key: "warehouse", kind: "text", width: 16 },
    { header: t("movementType", locale), key: "kind", kind: "text", width: 16 },
    { header: t("qtyIn", locale), key: "qtyIn", kind: "qty", width: 10 },
    { header: t("qtyOut", locale), key: "qtyOut", kind: "qty", width: 10 },
    { header: t("netMovement", locale), key: "netQty", kind: "qty", width: 10 },
    { header: t("balanceAfter", locale), key: "balanceAfter", kind: "qty", width: 12 },
    ...(showCost
      ? [
          { header: t("unitCost", locale), key: "unitCost", kind: "money" as const, width: 12 },
          { header: t("movementValue", locale), key: "value", kind: "money" as const, width: 14 },
        ]
      : []),
    { header: t("reference", locale), key: "reference", kind: "text", width: 18 },
    { header: t("user", locale), key: "actor", kind: "text", width: 14 },
    { header: t("note", locale), key: "note", kind: "text", width: 20 },
  ];
  columns.forEach((column, index) => {
    const cell = sheet.getCell(tableStart, index + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    sheet.getColumn(index + 1).width = column.width;
  });
  const rows = data.rows.map((row, index) => ({
    no: index + 1,
    createdAt: row.createdAt.slice(0, 16).replace("T", " "),
    product: row.productName,
    sku: row.sku,
    category: row.categoryName,
    warehouse: row.warehouseName,
    kind: kindLabel(row.kind, locale),
    qtyIn: row.qtyIn,
    qtyOut: row.qtyOut,
    netQty: row.netQty,
    balanceAfter: row.balanceAfter,
    unitCost: row.hasCost ? row.unitCostLak : t("noCost", locale),
    value: row.hasCost ? row.movementValueLak : "",
    reference: row.referenceLabel,
    actor: row.actorName,
    note: row.note,
  }));
  rows.forEach((row, rowIndex) => {
    columns.forEach((column, colIndex) => {
      applyCell(sheet.getCell(tableStart + 1 + rowIndex, colIndex + 1), (row as any)[column.key] ?? "", column.kind);
    });
  });
  const totalRow = tableStart + 1 + rows.length;
  const total: Record<string, ExcelJS.CellValue> = {
    no: "",
    createdAt: t("total", locale),
    product: data.totalRow.rowCount,
    sku: "",
    category: "",
    warehouse: "",
    kind: "",
    qtyIn: data.totalRow.qtyIn,
    qtyOut: data.totalRow.qtyOut,
    netQty: data.totalRow.netQty,
    balanceAfter: "",
    unitCost: "",
    value: showCost ? data.totalRow.movementValueLak : "",
    reference: "",
    actor: "",
    note: "",
  };
  columns.forEach((column, colIndex) => {
    applyCell(sheet.getCell(totalRow, colIndex + 1), total[column.key] ?? "", column.kind, true);
  });
  sheet.views = [{ activeCell: `A${tableStart + 1}`, state: "frozen", ySplit: tableStart }];

  return toFile(
    workbook,
    `EGO-POS-Stock-Movement-${rangeStamp(data)}.xlsx`,
    "Stock Movement",
    columns.map((column) => column.header),
    rows.length,
    {
      totalMovements: data.summary.totalMovements,
      totalQtyIn: data.summary.totalQtyIn,
      totalQtyOut: data.summary.totalQtyOut,
      netMovement: data.summary.netMovement,
      productsAffected: data.summary.productsAffected,
      ...(showCost ? { valueInLak: data.summary.valueInLak, valueOutLak: data.summary.valueOutLak } : {}),
    },
    {
      rowCount: data.totalRow.rowCount,
      qtyIn: data.totalRow.qtyIn,
      qtyOut: data.totalRow.qtyOut,
      netQty: data.totalRow.netQty,
      ...(showCost ? { movementValueLak: data.totalRow.movementValueLak } : {}),
    },
  );
}
