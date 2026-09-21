/**
 * R2.1 Excel workbooks for live sales tables.
 * Reuses the same filtered dataset and R2 accounting as the on-screen reports.
 * Does not export internal IDs, secrets, or hidden Cost/Profit columns.
 */
import ExcelJS from "exceljs";
import type { SupportedLocale } from "@/lib/constants";
import { paymentMethodLabel, tReports } from "@/lib/i18n/reports-copy";
import {
  saleStatusCopyKey,
} from "@/features/reports/sales-table-math";
import type { SalesTableQuery } from "@/features/reports/sales-table-query";
import type {
  DailySalesTableResult,
  MonthlySalesTableResult,
  PaymentMethodTableResult,
} from "@/features/reports/sales-table-repository";
import {
  businessDayLabel,
  formatBusinessDateTimeLabel,
  formatBusinessTimeLabel,
} from "@/lib/datetime/business-timezone";

const MONEY_FORMAT = "#,##0";
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

type ColumnKind = "text" | "int" | "money" | "center";

type ColumnSpec = {
  header: string;
  kind: ColumnKind;
  key: string;
  width: number;
};

export type SalesExcelFile = {
  buffer: ArrayBuffer;
  filename: string;
  headers: string[];
  rowCount: number;
  sheetName: string;
  summary: Record<string, number>;
  totals: Record<string, number>;
};

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

export function sanitizeExportFilename(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function asDay(value?: Date | string) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
    if (match) return match[1];
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : businessDayLabel(parsed);
  }
  if (Number.isNaN(value.getTime())) return "";
  return businessDayLabel(value);
}

function optionLabel(options: Array<{ id: string; label: string }>, id: string | undefined, fallback: string) {
  if (!id) return fallback;
  return options.find((row) => row.id === id)?.label ?? fallback;
}

export function dailySalesExportFilename(query: SalesTableQuery) {
  const day = query.date || asDay(query.dateFrom) || businessDayLabel(new Date());
  return sanitizeExportFilename(`EGO-POS-Daily-Sales-${day}.xlsx`);
}

export function monthlySalesExportFilename(month: string) {
  return sanitizeExportFilename(`EGO-POS-Monthly-Sales-${month}.xlsx`);
}

export function paymentMethodsExportFilename(query: SalesTableQuery) {
  const from = query.date || asDay(query.dateFrom);
  const to = query.date || asDay(query.dateTo);
  const stamp = from && to && from !== to ? `${from}-to-${to}` : from || to || businessDayLabel(new Date());
  return sanitizeExportFilename(`EGO-POS-Payment-Methods-${stamp}.xlsx`);
}

function generatedAtLabel(date = new Date()) {
  return `${businessDayLabel(date)} ${formatBusinessTimeLabel(date)}`;
}

function queryDateRange(query: SalesTableQuery, locale: SupportedLocale) {
  if (query.date) return query.date;
  const from = asDay(query.dateFrom);
  const to = asDay(query.dateTo);
  if (from && to && from !== to) return `${from} ${t("to", locale).toLowerCase()} ${to}`;
  return from || to || "";
}

function applyCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue, kind: ColumnKind, total = false) {
  cell.value = value ?? "";
  cell.border = total ? TOTAL_BORDER : BORDER;
  const numeric = typeof value === "number";
  cell.alignment = {
    horizontal: numeric && (kind === "money" || kind === "int") ? "right" : kind === "center" ? "center" : "left",
    vertical: "middle",
  };
  if (total) {
    cell.font = { bold: true };
    cell.fill = TOTAL_FILL;
  }
  if (kind === "money" && numeric) cell.numFmt = MONEY_FORMAT;
  if (kind === "int" && numeric) cell.numFmt = MONEY_FORMAT;
  if (kind === "text") cell.numFmt = TEXT_FORMAT;
}

function writeMeta(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
  const labelCell = sheet.getCell(row, 1);
  labelCell.value = label;
  labelCell.font = { bold: true };
  sheet.getCell(row, 2).value = value;
}

function writeSummary(sheet: ExcelJS.Worksheet, startRow: number, items: Array<{ label: string; value: number }>, locale: SupportedLocale) {
  sheet.getCell(startRow, 1).value = t("reportSummary", locale);
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
    cell.alignment = { vertical: "middle", wrapText: true };
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

async function toFile(workbook: ExcelJS.Workbook, filename: string, sheetName: string, headers: string[], rowCount: number, summary: Record<string, number>, totals: Record<string, number>): Promise<SalesExcelFile> {
  const raw = await workbook.xlsx.writeBuffer();
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw as Uint8Array);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { buffer, filename, headers, rowCount, sheetName, summary, totals };
}

export async function buildDailySalesExcel(input: {
  data: DailySalesTableResult;
  generatedAt?: Date;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const sheetName = t("dailySales", locale).slice(0, 31);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const query = data.query;
  const showCost = data.showCostProfit;
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("dailySales", locale));
  writeMeta(sheet, 3, t("date", locale), query.date || queryDateRange(query, locale));
  writeMeta(sheet, 4, t("branch", locale), optionLabel(data.filterOptions.branches, query.branchId, t("allBranches", locale)));
  writeMeta(sheet, 5, t("cashierFilter", locale), optionLabel(data.filterOptions.cashiers, query.cashierId, t("allCashiers", locale)));
  writeMeta(sheet, 6, t("paymentFilter", locale), query.paymentMethod ? paymentMethodLabel(query.paymentMethod, locale) : t("allPaymentMethods", locale));
  writeMeta(sheet, 7, t("statusFilter", locale), query.status ? t(saleStatusCopyKey(query.status), locale) : t("allStatuses", locale));
  writeMeta(sheet, 8, t("generatedAt", locale), generatedAtLabel(input.generatedAt));

  const summaryItems = [
    { label: t("bills", locale), value: data.summary.bills },
    { label: t("itemsSold", locale), value: data.summary.itemsSold },
    { label: t("grossSales", locale), value: data.summary.grossLak },
    { label: t("discounts", locale), value: data.summary.discountLak },
    { label: t("refunds", locale), value: data.summary.refundLak },
    { label: t("voids", locale), value: data.summary.voidLak },
    { label: t("netSales", locale), value: data.summary.netLak },
    ...(showCost
      ? [
          { label: t("cost", locale), value: data.summary.costLak },
          { label: t("profit", locale), value: data.summary.profitLak },
        ]
      : []),
  ];
  const afterSummary = writeSummary(sheet, 10, summaryItems, locale);
  const tableStart = afterSummary + 2;
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 8 },
    { header: t("colTime", locale), key: "time", kind: "text", width: 12 },
    { header: t("colReceipt", locale), key: "receipt", kind: "text", width: 20 },
    { header: t("cashier", locale), key: "cashier", kind: "text", width: 18 },
    { header: t("colItems", locale), key: "items", kind: "int", width: 10 },
    { header: t("colGross", locale), key: "gross", kind: "money", width: 14 },
    { header: t("colDiscount", locale), key: "discount", kind: "money", width: 12 },
    { header: t("colRefund", locale), key: "refund", kind: "money", width: 12 },
    { header: t("colVoid", locale), key: "void", kind: "money", width: 12 },
    { header: t("colNet", locale), key: "net", kind: "money", width: 14 },
    { header: t("colPayment", locale), key: "payment", kind: "text", width: 18 },
    ...(showCost
      ? [
          { header: t("colCost", locale), key: "cost", kind: "money" as const, width: 12 },
          { header: t("colProfit", locale), key: "profit", kind: "money" as const, width: 12 },
        ]
      : []),
    { header: t("colStatus", locale), key: "status", kind: "center", width: 16 },
  ];
  const rows = data.rows.map((row, index) => ({
    cashier: row.cashierName,
    cost: row.costLak,
    discount: row.discountLak,
    gross: row.grossLak,
    items: row.items,
    net: row.netLak,
    no: index + 1,
    payment: row.paymentMethods.map((method) => paymentMethodLabel(method, locale)).join(" + "),
    profit: row.profitLak,
    receipt: row.receipt,
    refund: row.refundLak,
    status: t(saleStatusCopyKey(row.status), locale),
    time: formatBusinessTimeLabel(row.createdAt),
    void: row.voidLak,
  }));
  const total: Record<string, ExcelJS.CellValue> = {
    cashier: "",
    cost: showCost ? data.summary.costLak : "",
    discount: data.summary.discountLak,
    gross: data.summary.grossLak,
    items: data.summary.itemsSold,
    net: data.summary.netLak,
    no: t("total", locale),
    payment: "",
    profit: showCost ? data.summary.profitLak : "",
    receipt: "",
    refund: data.summary.refundLak,
    status: "",
    time: "",
    void: data.summary.voidLak,
  };
  writeTable(sheet, tableStart, columns, rows, total);
  return toFile(
    workbook,
    dailySalesExportFilename(query),
    sheetName,
    columns.map((column) => column.header),
    data.rows.length,
    {
      bills: data.summary.bills,
      costLak: data.summary.costLak,
      discountLak: data.summary.discountLak,
      grossLak: data.summary.grossLak,
      itemsSold: data.summary.itemsSold,
      netLak: data.summary.netLak,
      profitLak: data.summary.profitLak,
      refundLak: data.summary.refundLak,
      voidLak: data.summary.voidLak,
    },
    {
      costLak: data.summary.costLak,
      discountLak: data.summary.discountLak,
      grossLak: data.summary.grossLak,
      itemsSold: data.summary.itemsSold,
      netLak: data.summary.netLak,
      profitLak: data.summary.profitLak,
      refundLak: data.summary.refundLak,
      voidLak: data.summary.voidLak,
    },
  );
}

export async function buildMonthlySalesExcel(input: {
  data: MonthlySalesTableResult;
  generatedAt?: Date;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const sheetName = t("monthlySales", locale).slice(0, 31);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const query = data.query;
  const showCost = data.showCostProfit;
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("monthlySales", locale));
  writeMeta(sheet, 3, t("month", locale), data.month);
  writeMeta(sheet, 4, t("branch", locale), optionLabel(data.filterOptions.branches, query.branchId, t("allBranches", locale)));
  writeMeta(sheet, 5, t("cashier", locale), optionLabel(data.filterOptions.cashiers, query.cashierId, t("allCashiers", locale)));
  writeMeta(sheet, 6, t("generatedAt", locale), generatedAtLabel(input.generatedAt));

  const summaryItems = [
    { label: t("bills", locale), value: data.summary.bills },
    { label: t("colItems", locale), value: data.summary.itemsSold },
    { label: t("grossSales", locale), value: data.summary.grossLak },
    { label: t("discounts", locale), value: data.summary.discountLak },
    { label: t("refunds", locale), value: data.summary.refundLak },
    { label: t("voids", locale), value: data.summary.voidLak },
    { label: t("netSales", locale), value: data.summary.netLak },
    ...(showCost
      ? [
          { label: t("cost", locale), value: data.summary.costLak },
          { label: t("profit", locale), value: data.summary.profitLak },
        ]
      : []),
  ];
  const afterSummary = writeSummary(sheet, 8, summaryItems, locale);
  const tableStart = afterSummary + 2;
  const columns: ColumnSpec[] = [
    { header: t("colDate", locale), key: "date", kind: "text", width: 14 },
    { header: t("bills", locale), key: "bills", kind: "int", width: 10 },
    { header: t("colItems", locale), key: "items", kind: "int", width: 10 },
    { header: t("colGross", locale), key: "gross", kind: "money", width: 14 },
    { header: t("colDiscount", locale), key: "discount", kind: "money", width: 12 },
    { header: t("colRefund", locale), key: "refund", kind: "money", width: 12 },
    { header: t("colVoid", locale), key: "void", kind: "money", width: 12 },
    { header: t("netSales", locale), key: "net", kind: "money", width: 14 },
    { header: t("paymentCash", locale), key: "cash", kind: "money", width: 12 },
    { header: t("paymentQr", locale), key: "qr", kind: "money", width: 12 },
    { header: t("paymentTransfer", locale), key: "transfer", kind: "money", width: 12 },
    { header: t("paymentCard", locale), key: "card", kind: "money", width: 12 },
    ...(showCost
      ? [
          { header: t("colCost", locale), key: "cost", kind: "money" as const, width: 12 },
          { header: t("colProfit", locale), key: "profit", kind: "money" as const, width: 12 },
        ]
      : []),
  ];
  const rows = data.rows.map((row) => ({
    bills: row.bills,
    card: row.cardLak,
    cash: row.cashLak,
    cost: row.costLak,
    date: row.date,
    discount: row.discountLak,
    gross: row.grossLak,
    items: row.itemsSold,
    net: row.netLak,
    profit: row.profitLak,
    qr: row.qrLak,
    refund: row.refundLak,
    transfer: row.transferLak,
    void: row.voidLak,
  }));
  const total: Record<string, ExcelJS.CellValue> = {
    bills: data.summary.bills,
    card: data.summary.cardLak,
    cash: data.summary.cashLak,
    cost: showCost ? data.summary.costLak : "",
    date: t("total", locale),
    discount: data.summary.discountLak,
    gross: data.summary.grossLak,
    items: data.summary.itemsSold,
    net: data.summary.netLak,
    profit: showCost ? data.summary.profitLak : "",
    qr: data.summary.qrLak,
    refund: data.summary.refundLak,
    transfer: data.summary.transferLak,
    void: data.summary.voidLak,
  };
  writeTable(sheet, tableStart, columns, rows, total);
  return toFile(
    workbook,
    monthlySalesExportFilename(data.month),
    sheetName,
    columns.map((column) => column.header),
    data.rows.length,
    {
      bills: data.summary.bills,
      costLak: data.summary.costLak,
      discountLak: data.summary.discountLak,
      grossLak: data.summary.grossLak,
      itemsSold: data.summary.itemsSold,
      netLak: data.summary.netLak,
      profitLak: data.summary.profitLak,
      refundLak: data.summary.refundLak,
      voidLak: data.summary.voidLak,
    },
    {
      bills: data.summary.bills,
      cardLak: data.summary.cardLak,
      cashLak: data.summary.cashLak,
      costLak: data.summary.costLak,
      discountLak: data.summary.discountLak,
      grossLak: data.summary.grossLak,
      itemsSold: data.summary.itemsSold,
      netLak: data.summary.netLak,
      profitLak: data.summary.profitLak,
      qrLak: data.summary.qrLak,
      refundLak: data.summary.refundLak,
      transferLak: data.summary.transferLak,
      voidLak: data.summary.voidLak,
    },
  );
}

export async function buildPaymentMethodSalesExcel(input: {
  data: PaymentMethodTableResult;
  generatedAt?: Date;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const sheetName = t("paymentMethodsSheet", locale).slice(0, 31);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const query = data.query;
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("paymentMethodsSheet", locale));
  writeMeta(sheet, 3, t("dateRange", locale), query.date || queryDateRange(query, locale));
  writeMeta(sheet, 4, t("branch", locale), optionLabel(data.filterOptions.branches, query.branchId, t("allBranches", locale)));
  writeMeta(sheet, 5, t("cashier", locale), optionLabel(data.filterOptions.cashiers, query.cashierId, t("allCashiers", locale)));
  writeMeta(sheet, 6, t("paymentMethod", locale), query.paymentMethod ? paymentMethodLabel(query.paymentMethod, locale) : t("allPaymentMethods", locale));
  writeMeta(sheet, 7, t("status", locale), query.status ? t(saleStatusCopyKey(query.status), locale) : t("allStatuses", locale));
  writeMeta(sheet, 8, t("generatedAt", locale), generatedAtLabel(input.generatedAt));

  const summaryItems = [
    { label: t("paymentCash", locale), value: data.summary.cashLak },
    { label: t("paymentQr", locale), value: data.summary.qrLak },
    { label: t("paymentTransfer", locale), value: data.summary.transferLak },
    { label: t("paymentVisa", locale), value: data.summary.visaLak },
    { label: t("paymentMastercard", locale), value: data.summary.mastercardLak },
    { label: t("totalPaid", locale), value: data.summary.totalPaidLak },
    { label: t("bills", locale), value: data.summary.bills },
  ];
  const afterSummary = writeSummary(sheet, 10, summaryItems, locale);
  const tableStart = afterSummary + 2;
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 8 },
    { header: t("colDateTime", locale), key: "datetime", kind: "text", width: 18 },
    { header: t("colReceipt", locale), key: "receipt", kind: "text", width: 20 },
    { header: t("cashier", locale), key: "cashier", kind: "text", width: 18 },
    { header: t("paymentMethod", locale), key: "method", kind: "text", width: 16 },
    { header: t("colPaymentAmount", locale), key: "paymentAmount", kind: "money", width: 16 },
    { header: t("colSaleTotal", locale), key: "saleTotal", kind: "money", width: 14 },
    { header: t("colRefundAmount", locale), key: "refund", kind: "money", width: 14 },
    { header: t("colStatus", locale), key: "status", kind: "center", width: 16 },
  ];
  const rows = data.rows.map((row, index) => ({
    cashier: row.cashierName,
    datetime: formatBusinessDateTimeLabel(row.createdAt),
    method: paymentMethodLabel(row.paymentMethod, locale),
    no: index + 1,
    paymentAmount: row.paymentAmountLak,
    receipt: row.receipt,
    refund: row.refundLak,
    saleTotal: row.saleTotalLak,
    status: t(saleStatusCopyKey(row.status), locale),
  }));
  const total: Record<string, ExcelJS.CellValue> = {
    cashier: "",
    datetime: "",
    method: "",
    no: t("total", locale),
    paymentAmount: data.summary.totalPaidLak,
    receipt: "",
    refund: data.totalRefundLak,
    saleTotal: data.totalSaleLak,
    status: "",
  };
  writeTable(sheet, tableStart, columns, rows, total);
  return toFile(
    workbook,
    paymentMethodsExportFilename(query),
    sheetName,
    columns.map((column) => column.header),
    data.rows.length,
    {
      bills: data.summary.bills,
      cashLak: data.summary.cashLak,
      mastercardLak: data.summary.mastercardLak,
      qrLak: data.summary.qrLak,
      totalPaidLak: data.summary.totalPaidLak,
      transferLak: data.summary.transferLak,
      visaLak: data.summary.visaLak,
    },
    {
      paymentAmountLak: data.summary.totalPaidLak,
      refundLak: data.totalRefundLak,
      saleTotalLak: data.totalSaleLak,
    },
  );
}
