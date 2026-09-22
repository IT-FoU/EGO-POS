import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import { CASH_DENOMINATIONS_LAK } from "@/features/cash-sessions/denominations";
import type { CashCountTableResult, CashMovementTableResult } from "@/features/reports/cash-report-repository";
import { loadCashCountDetail } from "@/features/reports/cash-report-repository";
import type { TenantContext } from "@/lib/db/write-context";
import { tReports } from "@/lib/i18n/reports-copy";
import type { SupportedLocale } from "@/lib/constants";
import ExcelJS from "exceljs";

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

async function toFile(
  workbook: ExcelJS.Workbook,
  filename: string,
  sheetName: string,
  headers: string[],
  rowCount: number,
): Promise<SalesExcelFile> {
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
    cell.border = BORDER;
    cell.fill = HEADER_FILL;
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

export async function buildCashShiftCountExcel(input: {
  data: CashCountTableResult;
  locale: SupportedLocale;
  storeName: string;
  tenant?: TenantContext;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName, tenant } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cash Shift Count");
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("cashShiftCount", locale));
  writeMeta(sheet, 3, t("dateRange", locale), stamp(data.query));
  writeMeta(sheet, 4, t("generatedAt", locale), generatedAtLabel());
  const summaryEnd = writeSummary(sheet, 6, [
    { label: t("totalCounts", locale), value: data.summary.totalCounts },
    { label: t("varianceBalanced", locale), value: data.summary.balancedCounts },
    { label: t("varianceOver", locale), value: data.summary.overCounts },
    { label: t("varianceShort", locale), value: data.summary.shortCounts },
    { label: t("expectedCash", locale), value: data.summary.expectedCashLak },
    { label: t("countedCash", locale), value: data.summary.countedCashLak },
    { label: t("totalVariance", locale), value: data.summary.totalVarianceLak },
    { label: t("totalOver", locale), value: data.summary.totalOverLak },
    { label: t("totalShort", locale), value: data.summary.totalShortLak },
  ]);
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("countDateTime", locale), key: "countedAt", kind: "text", width: 18 },
    { header: t("shiftSession", locale), key: "session", kind: "text", width: 18 },
    { header: t("cashier", locale), key: "cashier", kind: "text", width: 16 },
    { header: t("branch", locale), key: "branch", kind: "text", width: 14 },
    { header: t("terminal", locale), key: "terminal", kind: "text", width: 12 },
    { header: t("expectedCash", locale), key: "expected", kind: "money", width: 12 },
    { header: t("countedCash", locale), key: "counted", kind: "money", width: 12 },
    { header: t("variance", locale), key: "variance", kind: "money", width: 12 },
    { header: t("colStatus", locale), key: "status", kind: "text", width: 12 },
    { header: t("countedBy", locale), key: "countedBy", kind: "text", width: 16 },
    { header: t("note", locale), key: "note", kind: "text", width: 16 },
  ];
  const tableRows = data.rows.map((row, index) => ({
    branch: row.branchName,
    cashier: row.countedByName,
    counted: row.countedCashLak,
    countedAt: row.countedAt ? row.countedAt.slice(0, 16).replace("T", " ") : "—",
    countedBy: row.countedByName,
    expected: row.expectedCashLak,
    no: index + 1,
    note: row.note || "—",
    session: row.id,
    status: varianceLabel(row.varianceKind, locale),
    terminal: row.terminalName || "—",
    variance: row.varianceLak,
  }));
  writeTable(sheet, summaryEnd + 1, columns, tableRows, {
    branch: "",
    cashier: "",
    counted: data.totalRow.countedCashLak,
    countedAt: "",
    countedBy: "",
    expected: data.totalRow.expectedCashLak,
    no: "",
    note: "",
    session: t("total", locale),
    status: "",
    terminal: "",
    variance: data.totalRow.varianceLak,
  });

  if (tenant) {
    const denomSheet = workbook.addWorksheet("Denomination Detail");
    writeMeta(denomSheet, 1, t("report", locale), t("denominationBreakdown", locale));
    const denomColumns: ColumnSpec[] = [
      { header: t("shiftSession", locale), key: "session", kind: "text", width: 18 },
      { header: t("denomination", locale), key: "denom", kind: "int", width: 12 },
      { header: t("qty", locale), key: "qty", kind: "int", width: 8 },
      { header: t("amount", locale), key: "amount", kind: "money", width: 12 },
    ];
    const denomRows: Array<Record<string, ExcelJS.CellValue>> = [];
    for (const row of data.rows) {
      if (!row.hasDenominationBreakdown) continue;
      const detail = await loadCashCountDetail(tenant, row.id);
      const closing = detail?.countBreakdown?.closing;
      if (!closing) continue;
      for (const denom of CASH_DENOMINATIONS_LAK) {
        const qty = Number(closing[String(denom)] ?? 0);
        if (!qty) continue;
        denomRows.push({
          amount: denom * qty,
          denom,
          qty,
          session: row.id,
        });
      }
    }
    writeTable(denomSheet, 3, denomColumns, denomRows);
  }

  return toFile(
    workbook,
    `EGO-POS-Cash-Shift-Count-${stamp(data.query)}.xlsx`,
    "Cash Counts",
    columns.map((column) => column.header),
    tableRows.length,
  );
}

export async function buildCashMovementExcel(input: {
  data: CashMovementTableResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Cash In Out");
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("cashInOut", locale));
  writeMeta(sheet, 3, t("dateRange", locale), stamp(data.query));
  writeMeta(sheet, 4, t("generatedAt", locale), generatedAtLabel());
  const summaryEnd = writeSummary(sheet, 6, [
    { label: t("totalMovements", locale), value: data.summary.totalMovements },
    { label: t("cashInTransactions", locale), value: data.summary.cashInCount },
    { label: t("cashOutTransactions", locale), value: data.summary.cashOutCount },
    { label: t("totalCashIn", locale), value: data.summary.cashInLak },
    { label: t("totalCashOut", locale), value: data.summary.cashOutLak },
    { label: t("netCashMovement", locale), value: data.summary.netMovementLak },
  ]);
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("colDateTime", locale), key: "when", kind: "text", width: 18 },
    { header: t("postSaleType", locale), key: "type", kind: "text", width: 10 },
    { header: t("amount", locale), key: "amount", kind: "money", width: 12 },
    { header: t("reason", locale), key: "reason", kind: "text", width: 18 },
    { header: t("reference", locale), key: "reference", kind: "text", width: 14 },
    { header: t("actor", locale), key: "actor", kind: "text", width: 16 },
    { header: t("shiftSession", locale), key: "session", kind: "text", width: 18 },
    { header: t("branch", locale), key: "branch", kind: "text", width: 14 },
    { header: t("terminal", locale), key: "terminal", kind: "text", width: 12 },
    { header: t("note", locale), key: "note", kind: "text", width: 14 },
  ];
  const tableRows = data.rows.map((row, index) => ({
    actor: row.actorName,
    amount: row.amountLak,
    branch: row.branchName,
    no: index + 1,
    note: row.note || "—",
    reason: row.reason || "—",
    reference: row.reference || "—",
    session: row.sessionId || t("noLinkedShift", locale),
    terminal: row.terminalName || "—",
    type: row.type === "cash_in" ? t("cashIn", locale) : t("cashOut", locale),
    when: row.createdAt.slice(0, 16).replace("T", " "),
  }));
  writeTable(sheet, summaryEnd + 1, columns, tableRows, {
    actor: `${t("totalCashIn", locale)} ${data.totalRow.cashInLak}`,
    amount: data.totalRow.netMovementLak,
    branch: "",
    no: "",
    note: "",
    reason: `${t("totalCashOut", locale)} ${data.totalRow.cashOutLak}`,
    reference: "",
    session: t("total", locale),
    terminal: "",
    type: t("netCashMovement", locale),
    when: "",
  });

  return toFile(
    workbook,
    `EGO-POS-Cash-In-Out-${stamp(data.query)}.xlsx`,
    "Cash In Out",
    columns.map((column) => column.header),
    tableRows.length,
  );
}
