import ExcelJS from "exceljs";
import type { SupportedLocale } from "@/lib/constants";
import { tReports } from "@/lib/i18n/reports-copy";
import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import type { ShiftTableResult } from "@/features/reports/shift-table-repository";

const MONEY_FORMAT = "#,##0";
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

type ColumnKind = "text" | "int" | "money";
type ColumnSpec = { header: string; kind: ColumnKind; key: string; width: number };

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function generatedAtLabel(date = new Date()) {
  return `${businessDayLabel(date)} ${formatBusinessTimeLabel(date)}`;
}

function stamp(query: { dateFrom?: Date | string; dateTo?: Date | string }) {
  const from = query.dateFrom ? String(query.dateFrom).slice(0, 10) : "all";
  const to = query.dateTo ? String(query.dateTo).slice(0, 10) : from;
  return `${from}-to-${to}`;
}

function varianceLabel(kind: string, locale: SupportedLocale) {
  if (kind === "balanced") return t("varianceBalanced", locale);
  if (kind === "over") return t("varianceOver", locale);
  if (kind === "short") return t("varianceShort", locale);
  if (kind === "open") return t("shiftStatusOpen", locale);
  return "—";
}

function applyCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue, kind: ColumnKind, total = false) {
  cell.value = value;
  cell.border = total ? TOTAL_BORDER : BORDER;
  if (total) cell.fill = TOTAL_FILL;
  if (kind === "money") {
    cell.numFmt = MONEY_FORMAT;
    cell.alignment = { horizontal: "right" };
  } else if (kind === "int") {
    cell.alignment = { horizontal: "right" };
  }
}

function writeMeta(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
  sheet.getCell(row, 1).value = label;
  sheet.getCell(row, 2).value = value;
}

function writeSummary(sheet: ExcelJS.Worksheet, startRow: number, items: Array<{ label: string; value: number | string }>) {
  let row = startRow;
  sheet.getCell(row, 1).value = t("reportSummary", "en");
  row += 1;
  for (const item of items) {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 2).value = item.value;
    row += 1;
  }
  return row;
}

function writeTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  columns: ColumnSpec[],
  rows: Array<Record<string, ExcelJS.CellValue>>,
  total?: Record<string, ExcelJS.CellValue>,
) {
  columns.forEach((column, index) => {
    const cell = sheet.getCell(startRow, index + 1);
    cell.value = column.header;
    cell.fill = HEADER_FILL;
    cell.border = BORDER;
    cell.font = { bold: true };
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
}

async function toFile(workbook: ExcelJS.Workbook, filename: string, sheetName: string, headers: string[], rowCount: number): Promise<SalesExcelFile> {
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: buffer as ArrayBuffer,
    filename: sanitizeExportFilename(filename),
    headers,
    rowCount,
    sheetName,
    summary: {},
    totals: {},
  };
}

function buildShiftExcel(input: {
  cashierLabel?: string;
  data: ShiftTableResult;
  locale: SupportedLocale;
  reportKey: "shiftSummary" | "ownShiftHistory";
  storeName: string;
  filenamePrefix: string;
}) {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(input.reportKey === "ownShiftHistory" ? "Own Shift" : "Shift Summary");
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t(input.reportKey, locale));
  writeMeta(sheet, 3, t("dateRange", locale), stamp(data.query));
  if (input.cashierLabel) writeMeta(sheet, 4, t("cashier", locale), input.cashierLabel);
  writeMeta(sheet, input.cashierLabel ? 5 : 4, t("generatedAt", locale), generatedAtLabel());
  const summaryItems =
    input.reportKey === "ownShiftHistory"
      ? [
          { label: t("myShifts", locale), value: data.summary.totalShifts },
          { label: t("grossCashSales", locale), value: data.summary.grossCashSalesLak },
          { label: t("cashRefunds", locale), value: data.summary.cashRefundsLak },
          { label: t("cashVoids", locale), value: data.summary.cashVoidsLak },
          { label: t("cashIn", locale), value: data.summary.cashInLak },
          { label: t("cashOut", locale), value: data.summary.cashOutLak },
          { label: t("expectedDrawer", locale), value: data.summary.expectedDrawerLak },
          { label: t("countedCash", locale), value: data.summary.countedCashLak },
          { label: t("totalVariance", locale), value: data.summary.totalVarianceLak },
        ]
      : [
          { label: t("totalShifts", locale), value: data.summary.totalShifts },
          { label: t("openShifts", locale), value: data.summary.openShifts },
          { label: t("closedShifts", locale), value: data.summary.closedShifts },
          { label: t("grossCashSales", locale), value: data.summary.grossCashSalesLak },
          { label: t("cashRefunds", locale), value: data.summary.cashRefundsLak },
          { label: t("cashVoids", locale), value: data.summary.cashVoidsLak },
          { label: t("cashIn", locale), value: data.summary.cashInLak },
          { label: t("cashOut", locale), value: data.summary.cashOutLak },
          { label: t("expectedDrawer", locale), value: data.summary.expectedDrawerLak },
          { label: t("countedCash", locale), value: data.summary.countedCashLak },
          { label: t("totalVariance", locale), value: data.summary.totalVarianceLak },
        ];
  const summaryStart = writeSummary(sheet, input.cashierLabel ? 7 : 6, summaryItems);
  const includeCashier = input.reportKey === "shiftSummary";
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("shiftSession", locale), key: "session", kind: "text", width: 18 },
    { header: t("colDate", locale), key: "date", kind: "text", width: 12 },
    ...(includeCashier ? [{ header: t("cashier", locale), key: "cashier", kind: "text" as const, width: 16 }] : []),
    { header: t("branch", locale), key: "branch", kind: "text", width: 14 },
    { header: t("terminal", locale), key: "terminal", kind: "text", width: 12 },
    { header: t("openedAt", locale), key: "openedAt", kind: "text", width: 18 },
    { header: t("closedAt", locale), key: "closedAt", kind: "text", width: 18 },
    { header: t("colStatus", locale), key: "status", kind: "text", width: 10 },
    { header: t("openingCash", locale), key: "opening", kind: "money", width: 12 },
    { header: t("grossCashSales", locale), key: "gross", kind: "money", width: 12 },
    { header: t("cashRefunds", locale), key: "refunds", kind: "money", width: 12 },
    { header: t("cashVoids", locale), key: "voids", kind: "money", width: 12 },
    { header: t("cashIn", locale), key: "cashIn", kind: "money", width: 12 },
    { header: t("cashOut", locale), key: "cashOut", kind: "money", width: 12 },
    { header: t("expectedDrawer", locale), key: "expected", kind: "money", width: 12 },
    { header: t("countedCash", locale), key: "counted", kind: "money", width: 12 },
    { header: t("variance", locale), key: "variance", kind: "money", width: 12 },
  ];
  const rows = data.rows.map((row, index) => ({
    no: index + 1,
    session: row.id,
    date: row.openedAt.slice(0, 10),
    cashier: row.cashierName,
    branch: row.branchName,
    terminal: row.terminalName || "—",
    openedAt: row.openedAt.slice(0, 16).replace("T", " "),
    closedAt: row.closedAt ? row.closedAt.slice(0, 16).replace("T", " ") : "—",
    status: row.status === "open" ? t("shiftStatusOpen", locale) : t("shiftStatusClosed", locale),
    opening: row.openingCashLak,
    gross: row.grossCashSalesLak,
    refunds: row.cashRefundsLak,
    voids: row.cashVoidsLak,
    cashIn: row.cashInLak,
    cashOut: row.cashOutLak,
    expected: row.expectedDrawerLak,
    counted: row.countedCashLak ?? "",
    variance: row.varianceLak ?? "",
    varianceKind: varianceLabel(row.varianceKind, locale),
  }));
  writeTable(sheet, summaryStart + 2, columns, rows, {
    no: "",
    session: t("total", locale),
    date: data.totalRow.rowCount,
    cashier: "",
    branch: "",
    terminal: "",
    openedAt: "",
    closedAt: "",
    status: "",
    opening: data.totalRow.openingCashLak,
    gross: data.totalRow.grossCashSalesLak,
    refunds: data.totalRow.cashRefundsLak,
    voids: data.totalRow.cashVoidsLak,
    cashIn: data.totalRow.cashInLak,
    cashOut: data.totalRow.cashOutLak,
    expected: data.totalRow.expectedDrawerLak,
    counted: data.totalRow.countedCashLak,
    variance: data.totalRow.varianceLak,
  });
  return toFile(
    workbook,
    `${input.filenamePrefix}-${stamp(data.query)}.xlsx`,
    sheet.name,
    columns.map((column) => column.header),
    rows.length,
  );
}

export async function buildShiftSummaryExcel(input: {
  data: ShiftTableResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  return buildShiftExcel({
    ...input,
    filenamePrefix: "EGO-POS-Shift-Summary",
    reportKey: "shiftSummary",
  });
}

export async function buildOwnShiftHistoryExcel(input: {
  cashierLabel: string;
  data: ShiftTableResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  return buildShiftExcel({
    ...input,
    filenamePrefix: "EGO-POS-Own-Shift-History",
    reportKey: "ownShiftHistory",
  });
}
