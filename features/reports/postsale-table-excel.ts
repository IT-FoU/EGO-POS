import ExcelJS from "exceljs";
import type { SupportedLocale } from "@/lib/constants";
import { paymentMethodLabel, tReports } from "@/lib/i18n/reports-copy";
import { saleStatusCopyKey } from "@/features/reports/sales-table-math";
import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import type { PostSaleEventResult, ReceiptSalesResult } from "@/features/reports/postsale-table-repository";

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

function eventTypeLabel(type: string, locale: SupportedLocale) {
  const map: Record<string, string> = {
    refund: t("postSaleTypeRefund", locale),
    partial_refund: t("postSaleTypePartialRefund", locale),
    full_refund: t("postSaleTypeFullRefund", locale),
    void: t("postSaleTypeVoid", locale),
    exchange: t("postSaleTypeExchange", locale),
  };
  return map[type] || type;
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
  sheet.getCell(row, 1).value = tReports("reportSummary", "en");
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

function stamp(query: { dateFrom?: Date | string; dateTo?: Date | string }) {
  const from = query.dateFrom ? String(query.dateFrom).slice(0, 10) : "all";
  const to = query.dateTo ? String(query.dateTo).slice(0, 10) : from;
  return `${from}-to-${to}`;
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
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: buffer as ArrayBuffer,
    filename: sanitizeExportFilename(filename),
    headers,
    rowCount,
    sheetName,
    summary,
    totals,
  };
}

export async function buildRefundVoidExcel(input: {
  data: PostSaleEventResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Refund Void");
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("refundVoidReport", locale));
  writeMeta(sheet, 3, t("dateRange", locale), stamp(data.query));
  writeMeta(sheet, 4, t("generatedAt", locale), generatedAtLabel());
  const summaryStart = writeSummary(sheet, 6, [
    { label: t("refundTransactions", locale), value: data.summary.refundTransactions },
    { label: t("voidTransactions", locale), value: data.summary.voidTransactions },
    { label: t("refundAmount", locale), value: data.summary.refundAmountLak },
    { label: t("cashRefunds", locale), value: data.summary.cashRefundLak },
    { label: t("noncashRefunds", locale), value: data.summary.noncashRefundLak },
    { label: t("voidAmount", locale), value: data.summary.voidAmountLak },
    { label: t("itemsReturned", locale), value: data.summary.itemsReturned },
    { label: t("netPostSaleEffect", locale), value: data.summary.netPostSaleEffectLak },
  ]);
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("colDateTime", locale), key: "eventAt", kind: "text", width: 18 },
    { header: t("colReceipt", locale), key: "receipt", kind: "text", width: 16 },
    { header: t("originalSaleDate", locale), key: "originalSaleAt", kind: "text", width: 18 },
    { header: t("cashier", locale), key: "cashier", kind: "text", width: 16 },
    { header: t("approver", locale), key: "approver", kind: "text", width: 16 },
    { header: t("postSaleType", locale), key: "type", kind: "text", width: 14 },
    { header: t("colItems", locale), key: "items", kind: "int", width: 8 },
    { header: t("colSaleTotal", locale), key: "originalTotal", kind: "money", width: 12 },
    { header: t("refundAmount", locale), key: "refund", kind: "money", width: 12 },
    { header: t("cashRefund", locale), key: "cashRefund", kind: "money", width: 12 },
    { header: t("noncashRefund", locale), key: "noncashRefund", kind: "money", width: 12 },
    { header: t("voidAmount", locale), key: "voidAmount", kind: "money", width: 12 },
    { header: t("colPayment", locale), key: "payment", kind: "text", width: 14 },
    { header: t("reason", locale), key: "reason", kind: "text", width: 20 },
    { header: t("colStatus", locale), key: "status", kind: "text", width: 14 },
    { header: t("stockRestored", locale), key: "stockRestored", kind: "text", width: 12 },
  ];
  const rows = data.rows.map((row, index) => ({
    no: index + 1,
    eventAt: row.eventAt.slice(0, 16).replace("T", " "),
    receipt: row.receipt,
    originalSaleAt: row.originalSaleAt.slice(0, 16).replace("T", " "),
    cashier: row.cashierName,
    approver: row.approverName,
    type: eventTypeLabel(row.type, locale),
    items: row.items,
    originalTotal: row.originalTotalLak,
    refund: row.refundLak,
    cashRefund: row.cashRefundLak,
    noncashRefund: row.noncashRefundLak,
    voidAmount: row.voidLak,
    payment: row.paymentMethods.map((method) => paymentMethodLabel(method, locale)).join(" + "),
    reason: row.reason,
    status: t(saleStatusCopyKey(row.status), locale),
    stockRestored: row.stockRestoredBaseQty == null ? "" : row.stockRestoredBaseQty,
  }));
  writeTable(sheet, summaryStart + 2, columns, rows, {
    no: "",
    eventAt: t("total", locale),
    receipt: data.totalRow.rowCount,
    originalSaleAt: "",
    cashier: "",
    approver: "",
    type: "",
    items: data.totalRow.items,
    originalTotal: "",
    refund: data.totalRow.refundLak,
    cashRefund: data.totalRow.cashRefundLak,
    noncashRefund: data.totalRow.noncashRefundLak,
    voidAmount: data.totalRow.voidLak,
    payment: "",
    reason: "",
    status: "",
    stockRestored: "",
  });
  return toFile(
    workbook,
    `EGO-POS-Refund-Void-${stamp(data.query)}.xlsx`,
    "Refund Void",
    columns.map((column) => column.header),
    rows.length,
    {
      refundTransactions: data.summary.refundTransactions,
      voidTransactions: data.summary.voidTransactions,
      refundAmountLak: data.summary.refundAmountLak,
      cashRefundLak: data.summary.cashRefundLak,
      noncashRefundLak: data.summary.noncashRefundLak,
      voidAmountLak: data.summary.voidAmountLak,
    },
    {
      refundLak: data.totalRow.refundLak,
      voidLak: data.totalRow.voidLak,
      items: data.totalRow.items,
    },
  );
}

export async function buildReceiptSalesExcel(input: {
  data: ReceiptSalesResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Receipt Sales");
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("receiptsSalesDetail", locale));
  writeMeta(sheet, 3, t("dateRange", locale), stamp(data.query));
  writeMeta(sheet, 4, t("generatedAt", locale), generatedAtLabel());
  const summaryStart = writeSummary(sheet, 6, [
    { label: t("bills", locale), value: data.summary.bills },
    { label: t("totalItems", locale), value: data.summary.itemsSold },
    { label: t("grossSales", locale), value: data.summary.grossLak },
    { label: t("refunds", locale), value: data.summary.refundLak },
    { label: t("voids", locale), value: data.summary.voidLak },
    { label: t("netSales", locale), value: data.summary.netLak },
    { label: t("averageBill", locale), value: data.summary.averageBillLak },
    { label: t("paymentCash", locale), value: data.summary.cashLak },
    { label: t("paymentQr", locale), value: data.summary.qrLak },
    { label: t("paymentTransfer", locale), value: data.summary.transferLak },
    { label: t("paymentCard", locale), value: data.summary.cardLak },
  ]);
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("colDateTime", locale), key: "createdAt", kind: "text", width: 18 },
    { header: t("colReceipt", locale), key: "receipt", kind: "text", width: 16 },
    { header: t("cashier", locale), key: "cashier", kind: "text", width: 16 },
    { header: t("customer", locale), key: "customer", kind: "text", width: 18 },
    { header: t("colItems", locale), key: "items", kind: "int", width: 8 },
    { header: t("colGross", locale), key: "gross", kind: "money", width: 12 },
    { header: t("colDiscount", locale), key: "discount", kind: "money", width: 12 },
    { header: t("colRefund", locale), key: "refund", kind: "money", width: 12 },
    { header: t("colVoid", locale), key: "voidAmount", kind: "money", width: 12 },
    { header: t("colNet", locale), key: "net", kind: "money", width: 12 },
    { header: t("colPayment", locale), key: "payment", kind: "text", width: 14 },
    { header: t("colStatus", locale), key: "status", kind: "text", width: 14 },
  ];
  const rows = data.rows.map((row, index) => ({
    no: index + 1,
    createdAt: row.createdAt.slice(0, 16).replace("T", " "),
    receipt: row.receipt,
    cashier: row.cashierName,
    customer: row.customerName,
    items: row.items,
    gross: row.grossLak,
    discount: row.discountLak,
    refund: row.refundLak,
    voidAmount: row.voidLak,
    net: row.netLak,
    payment:
      row.paymentLabel === "mixed"
        ? t("paymentMixed", locale)
        : paymentMethodLabel(row.paymentLabel, locale),
    status: t(saleStatusCopyKey(row.status), locale),
  }));
  writeTable(sheet, summaryStart + 2, columns, rows, {
    no: "",
    createdAt: t("total", locale),
    receipt: data.totalRow.bills,
    cashier: "",
    customer: "",
    items: data.totalRow.items,
    gross: data.totalRow.grossLak,
    discount: data.totalRow.discountLak,
    refund: data.totalRow.refundLak,
    voidAmount: data.totalRow.voidLak,
    net: data.totalRow.netLak,
    payment: "",
    status: "",
  });
  return toFile(
    workbook,
    `EGO-POS-Receipt-Sales-${stamp(data.query)}.xlsx`,
    "Receipt Sales",
    columns.map((column) => column.header),
    rows.length,
    {
      bills: data.summary.bills,
      grossLak: data.summary.grossLak,
      refundLak: data.summary.refundLak,
      voidLak: data.summary.voidLak,
      netLak: data.summary.netLak,
    },
    {
      bills: data.totalRow.bills,
      items: data.totalRow.items,
      grossLak: data.totalRow.grossLak,
      netLak: data.totalRow.netLak,
    },
  );
}
