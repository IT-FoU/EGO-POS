import ExcelJS from "exceljs";
import type { SupportedLocale } from "@/lib/constants";
import { tReports } from "@/lib/i18n/reports-copy";
import { saleStatusCopyKey } from "@/features/reports/sales-table-math";
import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import type { ProductTableQuery } from "@/features/reports/product-table-query";
import type {
  CategorySalesTableResult,
  ProductPerformanceResult,
  ProductSalesTableResult,
} from "@/features/reports/product-table-repository";

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
type ColumnSpec = { header: string; kind: ColumnKind; key: string; width: number };

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function asDay(value?: Date | string) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return Number.isNaN(value.getTime()) ? "" : businessDayLabel(value);
}

export function productReportRangeStamp(query: ProductTableQuery) {
  const from = query.date || asDay(query.dateFrom);
  const to = query.date || asDay(query.dateTo);
  if (from && to && from !== to) return `${from}-to-${to}`;
  return from || to || businessDayLabel(new Date());
}

function generatedAtLabel(date = new Date()) {
  return `${businessDayLabel(date)} ${formatBusinessTimeLabel(date)}`;
}

function optionLabel(options: Array<{ id: string; label: string }>, id: string | undefined, fallback: string) {
  if (!id) return fallback;
  return options.find((row) => row.id === id)?.label ?? fallback;
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
  if ((kind === "money" || kind === "int") && numeric) cell.numFmt = MONEY_FORMAT;
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

async function toFile(workbook: ExcelJS.Workbook, filename: string, sheetName: string, headers: string[], rowCount: number, summary: Record<string, number>, totals: Record<string, number>): Promise<SalesExcelFile> {
  const raw = await workbook.xlsx.writeBuffer();
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : new Uint8Array(raw as Uint8Array);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { buffer, filename, headers, rowCount, sheetName, summary, totals };
}

function moneyColumns(showCost: boolean, locale: SupportedLocale): ColumnSpec[] {
  return showCost
    ? [
        { header: t("colCost", locale), key: "cost", kind: "money", width: 12 },
        { header: t("colProfit", locale), key: "profit", kind: "money", width: 12 },
      ]
    : [];
}

export async function buildProductSalesExcel(input: {
  data: ProductSalesTableResult;
  generatedAt?: Date;
  locale: SupportedLocale;
  storeName: string;
}) {
  const { data, locale, storeName } = input;
  const showCost = data.showCostProfit;
  const stamp = productReportRangeStamp(data.query);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("productSales", locale).slice(0, 31));
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("productSales", locale));
  writeMeta(sheet, 3, t("date", locale), stamp);
  writeMeta(sheet, 4, t("branch", locale), optionLabel(data.filterOptions.branches, data.query.branchId, t("allBranches", locale)));
  writeMeta(sheet, 5, t("categoryFilter", locale), optionLabel(data.filterOptions.categories, data.query.categoryId, t("allCategories", locale)));
  writeMeta(sheet, 6, t("generatedAt", locale), generatedAtLabel(input.generatedAt));
  const afterSummary = writeSummary(sheet, 8, [
    { label: t("productsSold", locale), value: data.summary.productsSold },
    { label: t("unitsSold", locale), value: data.summary.baseQty },
    { label: t("bills", locale), value: data.summary.bills },
    { label: t("grossSales", locale), value: data.summary.grossLak },
    { label: t("refunds", locale), value: data.summary.refundLak },
    { label: t("voids", locale), value: data.summary.voidLak },
    { label: t("netSales", locale), value: data.summary.netLak },
    ...(showCost
      ? [
          { label: t("cost", locale), value: data.summary.costLak },
          { label: t("profit", locale), value: data.summary.profitLak },
        ]
      : []),
  ]);
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 8 },
    { header: t("colProduct", locale), key: "product", kind: "text", width: 28 },
    { header: t("colSku", locale), key: "sku", kind: "text", width: 14 },
    { header: t("colCategory", locale), key: "category", kind: "text", width: 16 },
    { header: t("colUnit", locale), key: "unit", kind: "text", width: 12 },
    { header: t("colQtySold", locale), key: "qty", kind: "int", width: 10 },
    { header: t("colBaseQty", locale), key: "baseQty", kind: "int", width: 10 },
    { header: t("colRefundQty", locale), key: "refundQty", kind: "int", width: 10 },
    { header: t("colVoidQty", locale), key: "voidQty", kind: "int", width: 10 },
    { header: t("colNetQty", locale), key: "netQty", kind: "int", width: 10 },
    { header: t("colBills", locale), key: "bills", kind: "int", width: 8 },
    { header: t("colGross", locale), key: "gross", kind: "money", width: 12 },
    { header: t("colRefund", locale), key: "refund", kind: "money", width: 12 },
    { header: t("colVoid", locale), key: "void", kind: "money", width: 12 },
    { header: t("colNetSales", locale), key: "net", kind: "money", width: 12 },
    ...moneyColumns(showCost, locale),
  ];
  const rows = data.rows.map((row, index) => ({
    baseQty: row.baseQty,
    bills: row.bills,
    category: row.categoryName || t("uncategorized", locale),
    cost: row.costLak,
    gross: row.grossLak,
    net: row.netLak,
    netQty: row.netQty,
    no: index + 1,
    product: row.name,
    profit: row.profitLak,
    qty: row.qtySold,
    refund: row.refundLak,
    refundQty: row.refundQty,
    sku: row.sku,
    unit: row.unitLabel === "Mixed" ? t("mixedUnits", locale) : row.unitLabel,
    void: row.voidLak,
    voidQty: row.voidQty,
  }));
  writeTable(sheet, afterSummary + 2, columns, rows, {
    baseQty: data.totalRow.baseQty,
    bills: data.totalRow.bills,
    category: "",
    cost: showCost ? data.totalRow.costLak : "",
    gross: data.totalRow.grossLak,
    net: data.totalRow.netLak,
    netQty: data.totalRow.netQty,
    no: t("total", locale),
    product: "",
    profit: showCost ? data.totalRow.profitLak : "",
    qty: data.totalRow.qtySold,
    refund: data.totalRow.refundLak,
    refundQty: data.totalRow.refundQty,
    sku: "",
    unit: "",
    void: data.totalRow.voidLak,
    voidQty: data.totalRow.voidQty,
  });
  if (data.detailRows.length > 0) {
    const detailStart = afterSummary + 4 + rows.length + 2;
    writeMeta(sheet, detailStart, t("selectedProduct", locale), data.selectedProduct?.name ?? "");
    writeTable(
      sheet,
      detailStart + 2,
      [
        { header: t("colDateTime", locale), key: "when", kind: "text", width: 18 },
        { header: t("colReceipt", locale), key: "receipt", kind: "text", width: 18 },
        { header: t("cashier", locale), key: "cashier", kind: "text", width: 16 },
        { header: t("colUnit", locale), key: "unit", kind: "text", width: 10 },
        { header: t("colQtySold", locale), key: "qty", kind: "int", width: 8 },
        { header: t("colGross", locale), key: "gross", kind: "money", width: 12 },
        { header: t("colRefund", locale), key: "refund", kind: "money", width: 12 },
        { header: t("colVoid", locale), key: "void", kind: "money", width: 12 },
        { header: t("colNet", locale), key: "net", kind: "money", width: 12 },
        ...moneyColumns(showCost, locale),
        { header: t("colStatus", locale), key: "status", kind: "center", width: 14 },
      ],
      data.detailRows.map((row) => ({
        cashier: row.cashierName,
        cost: row.costLak,
        gross: row.grossLak,
        net: row.netLak,
        profit: row.profitLak,
        qty: row.qty,
        receipt: row.receipt,
        refund: row.refundLak,
        status: t(saleStatusCopyKey(row.status), locale),
        unit: row.unitLabel,
        void: row.voidLak,
        when: `${asDay(row.createdAt)} ${formatBusinessTimeLabel(row.createdAt)}`,
      })),
      null,
    );
  }
  return toFile(
    workbook,
    sanitizeExportFilename(`EGO-POS-Product-Sales-${stamp}.xlsx`),
    t("productSales", locale),
    columns.map((column) => column.header),
    rows.length,
    { bills: data.summary.bills, netLak: data.summary.netLak },
    { netLak: data.totalRow.netLak },
  );
}

export async function buildCategorySalesExcel(input: {
  data: CategorySalesTableResult;
  generatedAt?: Date;
  locale: SupportedLocale;
  storeName: string;
}) {
  const { data, locale, storeName } = input;
  const showCost = data.showCostProfit;
  const stamp = productReportRangeStamp(data.query);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(t("categorySales", locale).slice(0, 31));
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("categorySales", locale));
  writeMeta(sheet, 3, t("date", locale), stamp);
  writeMeta(sheet, 4, t("branch", locale), optionLabel(data.filterOptions.branches, data.query.branchId, t("allBranches", locale)));
  writeMeta(sheet, 5, t("generatedAt", locale), generatedAtLabel(input.generatedAt));
  const afterSummary = writeSummary(sheet, 7, [
    { label: t("categoriesSold", locale), value: data.summary.categoriesSold },
    { label: t("productsSold", locale), value: data.summary.productsSold },
    { label: t("unitsSold", locale), value: data.summary.baseQty },
    { label: t("bills", locale), value: data.summary.bills },
    { label: t("grossSales", locale), value: data.summary.grossLak },
    { label: t("refunds", locale), value: data.summary.refundLak },
    { label: t("voids", locale), value: data.summary.voidLak },
    { label: t("netSales", locale), value: data.summary.netLak },
    ...(showCost ? [{ label: t("cost", locale), value: data.summary.costLak }, { label: t("profit", locale), value: data.summary.profitLak }] : []),
  ]);
  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 8 },
    { header: t("colCategory", locale), key: "category", kind: "text", width: 22 },
    { header: t("colProducts", locale), key: "products", kind: "int", width: 10 },
    { header: t("unitsSold", locale), key: "units", kind: "int", width: 12 },
    { header: t("colBills", locale), key: "bills", kind: "int", width: 8 },
    { header: t("colGross", locale), key: "gross", kind: "money", width: 12 },
    { header: t("colRefund", locale), key: "refund", kind: "money", width: 12 },
    { header: t("colVoid", locale), key: "void", kind: "money", width: 12 },
    { header: t("colNetSales", locale), key: "net", kind: "money", width: 12 },
    ...moneyColumns(showCost, locale),
  ];
  const rows = data.rows.map((row, index) => ({
    bills: row.bills,
    category: row.categoryName || t("uncategorized", locale),
    cost: row.costLak,
    gross: row.grossLak,
    net: row.netLak,
    no: index + 1,
    products: row.products,
    profit: row.profitLak,
    refund: row.refundLak,
    units: row.unitsSold,
    void: row.voidLak,
  }));
  writeTable(sheet, afterSummary + 2, columns, rows, {
    bills: data.totalRow.bills,
    category: t("total", locale),
    cost: showCost ? data.totalRow.costLak : "",
    gross: data.totalRow.grossLak,
    net: data.totalRow.netLak,
    no: "",
    products: data.totalRow.products,
    profit: showCost ? data.totalRow.profitLak : "",
    refund: data.totalRow.refundLak,
    units: data.totalRow.unitsSold,
    void: data.totalRow.voidLak,
  });
  return toFile(
    workbook,
    sanitizeExportFilename(`EGO-POS-Category-Sales-${stamp}.xlsx`),
    t("categorySales", locale),
    columns.map((column) => column.header),
    rows.length,
    { netLak: data.summary.netLak },
    { netLak: data.totalRow.netLak },
  );
}

export async function buildProductPerformanceExcel(input: {
  data: ProductPerformanceResult;
  generatedAt?: Date;
  locale: SupportedLocale;
  storeName: string;
}) {
  const { data, locale, storeName } = input;
  const showCost = data.showCostProfit;
  const stamp = productReportRangeStamp(data.query);
  const workbook = new ExcelJS.Workbook();
  const title = data.query.view === "slow" ? t("slowSellers", locale) : t("bestSellers", locale);
  const sheet = workbook.addWorksheet(title.slice(0, 31));
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("bestSlowSellers", locale));
  writeMeta(sheet, 3, t("performanceView", locale), title);
  writeMeta(sheet, 4, t("rankMetric", locale), t(`rank_${data.query.rankMetric}`, locale));
  writeMeta(sheet, 5, t("topN", locale), String(data.query.topN));
  writeMeta(sheet, 6, t("date", locale), stamp);
  writeMeta(sheet, 7, t("generatedAt", locale), generatedAtLabel(input.generatedAt));
  const afterSummary = writeSummary(sheet, 9, [
    { label: t("productsSold", locale), value: data.summary.productsSold },
    { label: t("unitsSold", locale), value: data.summary.baseQty },
    { label: t("bills", locale), value: data.summary.bills },
    { label: t("netSales", locale), value: data.summary.netLak },
    ...(showCost ? [{ label: t("profit", locale), value: data.summary.profitLak }] : []),
  ]);
  const columns: ColumnSpec[] = [
    { header: t("colRank", locale), key: "rank", kind: "int", width: 8 },
    { header: t("colProduct", locale), key: "product", kind: "text", width: 28 },
    { header: t("colSku", locale), key: "sku", kind: "text", width: 14 },
    { header: t("colCategory", locale), key: "category", kind: "text", width: 16 },
    { header: t("unitsSold", locale), key: "units", kind: "int", width: 12 },
    { header: t("colBills", locale), key: "bills", kind: "int", width: 8 },
    { header: t("colNetSales", locale), key: "net", kind: "money", width: 12 },
    ...moneyColumns(showCost, locale),
    { header: t("colLastSold", locale), key: "lastSold", kind: "text", width: 16 },
    { header: t("zeroSales", locale), key: "zero", kind: "center", width: 12 },
  ];
  const rows = data.rows.map((row) => ({
    bills: row.bills,
    category: row.categoryName || t("uncategorized", locale),
    cost: row.costLak,
    lastSold: row.lastSoldAt ? asDay(row.lastSoldAt) : t("lastSoldNever", locale),
    net: row.netLak,
    product: row.name,
    profit: row.profitLak,
    rank: row.zeroSale ? "" : row.rank,
    sku: row.sku,
    units: row.baseQty,
    zero: row.zeroSale ? t("zeroSales", locale) : "",
  }));
  writeTable(sheet, afterSummary + 2, columns, rows, null);
  return toFile(
    workbook,
    sanitizeExportFilename(`EGO-POS-Product-Performance-${stamp}.xlsx`),
    title,
    columns.map((column) => column.header),
    rows.length,
    { netLak: data.summary.netLak },
    { netLak: data.summary.netLak },
  );
}
