import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import type { ReorderPageResult } from "@/features/reports/reorder-report-repository";
import type { ReorderTab } from "@/features/reports/reorder-report-math";
import { tReports } from "@/lib/i18n/reports-copy";
import type { SupportedLocale } from "@/lib/constants";
import ExcelJS from "exceljs";

const MONEY_FORMAT = "#,##0";
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFA1A1AA" } };
const BORDER: Partial<ExcelJS.Borders> = { bottom: THIN, left: THIN, right: THIN, top: THIN };

function t(key: string, locale: SupportedLocale) {
  return tReports(key, locale);
}

function reasonLabel(reason: string, locale: SupportedLocale) {
  if (reason === "out_of_stock") return t("reasonOutOfStock", locale);
  if (reason === "reached_reorder_level") return t("reasonReachedReorderLevel", locale);
  if (reason === "only_1_2_left") return t("reasonOnlyOneTwoLeft", locale);
  if (reason === "added_manually") return t("reasonAddedManually", locale);
  return reason;
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

function writeMeta(sheet: ExcelJS.Worksheet, row: number, label: string, value: string) {
  sheet.getCell(row, 1).value = label;
  sheet.getCell(row, 2).value = value;
}

function stampDay() {
  return businessDayLabel(new Date());
}

export async function buildReorderExcel(input: {
  data: ReorderPageResult;
  locale: SupportedLocale;
  storeName: string;
  tab: ReorderTab;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName, tab } = input;
  const workbook = new ExcelJS.Workbook();
  const sheetName =
    tab === "need" ? "Need Reorder" : tab === "history" ? "Reorder History" : "Already Ordered";
  const sheet = workbook.addWorksheet(sheetName);
  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(
    sheet,
    2,
    t("report", locale),
    tab === "need" ? t("needReorder", locale) : tab === "history" ? t("history", locale) : t("alreadyOrdered", locale),
  );
  writeMeta(sheet, 3, t("generatedAt", locale), `${stampDay()} ${formatBusinessTimeLabel(new Date())}`);

  let row = 5;
  if (tab === "need") {
    const headers = [
      t("product", locale),
      t("barcode", locale),
      t("category", locale),
      t("colOnHand", locale),
      t("colReserved", locale),
      t("colAvailable", locale),
      t("colReorderLevel", locale),
      t("colTargetStock", locale),
      t("suggestedQtyBase", locale),
      t("reason", locale),
      t("orderQty", locale),
      t("orderUnit", locale),
      t("supplier", locale),
      t("unitCost", locale),
      t("estimatedCost", locale),
      t("selectedStatus", locale),
    ];
    headers.forEach((header, index) => {
      const cell = sheet.getCell(row, index + 1);
      cell.value = header;
      cell.border = BORDER;
      cell.fill = HEADER_FILL;
      cell.font = { bold: true };
    });
    row += 1;
    for (const item of data.needRows) {
      const values = [
        item.productName,
        item.barcode || t("noBarcode", locale),
        item.categoryName,
        item.onHand,
        item.reserved,
        item.available,
        item.minStock > 0 ? item.minStock : t("noReorderLevel", locale),
        item.targetStock,
        item.reorderQtyMode === "MANUAL" ? "—" : item.suggestedQtyBase,
        reasonLabel(item.reason, locale),
        "",
        "",
        item.preferredSupplierName || t("noSupplier", locale),
        "",
        "",
        "",
      ];
      values.forEach((value, index) => {
        const cell = sheet.getCell(row, index + 1);
        cell.value = value as ExcelJS.CellValue;
        cell.border = BORDER;
        if (typeof value === "number") cell.numFmt = MONEY_FORMAT;
      });
      row += 1;
    }
    return toFile(workbook, `EGO-POS-Reorder-Need-${stampDay()}.xlsx`, "Need Reorder", headers, data.needRows.length);
  }

  if (tab === "history") {
    const headers = [
      t("orderedAtHistory", locale),
      t("product", locale),
      t("barcode", locale),
      t("warehouse", locale),
      t("poNo", locale),
      t("supplier", locale),
      t("colReorderLevel", locale),
      t("colTargetStock", locale),
      t("availableAtOrder", locale),
      t("suggestedQtyBase", locale),
      t("orderedQty", locale),
      t("qtyMode", locale),
      t("livePoStatus", locale),
      t("liveReceivedQty", locale),
    ];
    headers.forEach((header, index) => {
      const cell = sheet.getCell(row, index + 1);
      cell.value = header;
      cell.border = BORDER;
      cell.fill = HEADER_FILL;
      cell.font = { bold: true };
    });
    row += 1;
    const historyRows = data.historyRows ?? [];
    for (const item of historyRows) {
      const values = [
        item.createdAt.slice(0, 16).replace("T", " "),
        item.productName,
        item.barcode || t("noBarcode", locale),
        item.warehouseName,
        item.purchaseNo || "—",
        item.supplierName || t("noSupplier", locale),
        item.reorderLevel,
        item.targetStock,
        item.availableAtOrder,
        item.suggestedQtyBase,
        item.orderedQtyBase,
        item.reorderQtyMode,
        item.livePoStatus || "—",
        item.liveReceivedQty ?? "—",
      ];
      values.forEach((value, index) => {
        const cell = sheet.getCell(row, index + 1);
        cell.value = value as ExcelJS.CellValue;
        cell.border = BORDER;
      });
      row += 1;
    }
    return toFile(
      workbook,
      `EGO-POS-Reorder-History-${stampDay()}.xlsx`,
      "Reorder History",
      headers,
      historyRows.length,
    );
  }

  const headers = [
    t("product", locale),
    t("barcode", locale),
    t("orderedQty", locale),
    t("orderUnit", locale),
    t("supplier", locale),
    t("poNo", locale),
    t("orderedDate", locale),
    t("poStatus", locale),
    t("receivedQty", locale),
    t("remaining", locale),
  ];
  headers.forEach((header, index) => {
    const cell = sheet.getCell(row, index + 1);
    cell.value = header;
    cell.border = BORDER;
    cell.fill = HEADER_FILL;
    cell.font = { bold: true };
  });
  row += 1;
  for (const item of data.alreadyRows) {
    const values = [
      item.productName,
      item.barcode || t("noBarcode", locale),
      item.orderedQty,
      item.unitName,
      item.supplierName,
      item.poNo,
      item.orderedAt.slice(0, 10),
      item.poStatus,
      item.receivedQty,
      item.remainingQty,
    ];
    values.forEach((value, index) => {
      const cell = sheet.getCell(row, index + 1);
      cell.value = value as ExcelJS.CellValue;
      cell.border = BORDER;
    });
    row += 1;
  }
  return toFile(
    workbook,
    `EGO-POS-Reorder-Already-Ordered-${stampDay()}.xlsx`,
    "Already Ordered",
    headers,
    data.alreadyRows.length,
  );
}

/**
 * Supplier-facing order Excel — Product Name, Barcode, Order Qty, Order Unit only
 * (+ company / supplier / date header). One sheet per supplier.
 * Does NOT include stock, suggested qty, cost, or other internal fields.
 */
export async function buildReorderSupplierOrderExcel(input: {
  companyName: string;
  draftRef?: string;
  locale: SupportedLocale;
  lines: Array<{
    barcode: string;
    orderQty: number;
    orderUnit: string;
    productName: string;
    supplierId: string;
    supplierName: string;
  }>;
}): Promise<SalesExcelFile> {
  const { companyName, draftRef, locale, lines } = input;
  const workbook = new ExcelJS.Workbook();
  const bySupplier = new Map<string, typeof lines>();
  for (const line of lines) {
    const key = line.supplierId || "__none__";
    const list = bySupplier.get(key) ?? [];
    list.push(line);
    bySupplier.set(key, list);
  }

  const headers = [t("product", locale), t("barcode", locale), t("orderQty", locale), t("orderUnit", locale)];
  let totalRows = 0;
  let sheetIndex = 0;

  for (const [, group] of bySupplier) {
    sheetIndex += 1;
    const supplierName = group[0]?.supplierName || t("noSupplier", locale);
    const safeName = supplierName.replace(/[\\/*?:\[\]]/g, " ").slice(0, 28) || `Supplier ${sheetIndex}`;
    const sheet = workbook.addWorksheet(safeName);
    writeMeta(sheet, 1, t("store", locale), companyName);
    writeMeta(sheet, 2, t("supplier", locale), supplierName);
    writeMeta(sheet, 3, t("generatedAt", locale), `${stampDay()} ${formatBusinessTimeLabel(new Date())}`);
    if (draftRef) writeMeta(sheet, 4, t("purchaseDraftRef", locale), draftRef);

    let row = draftRef ? 6 : 5;
    headers.forEach((header, index) => {
      const cell = sheet.getCell(row, index + 1);
      cell.value = header;
      cell.border = BORDER;
      cell.fill = HEADER_FILL;
      cell.font = { bold: true };
    });
    row += 1;
    for (const item of group) {
      const values = [item.productName, item.barcode, item.orderQty, item.orderUnit];
      values.forEach((value, index) => {
        const cell = sheet.getCell(row, index + 1);
        cell.value = value as ExcelJS.CellValue;
        cell.border = BORDER;
      });
      row += 1;
      totalRows += 1;
    }
  }

  if (sheetIndex === 0) {
    const sheet = workbook.addWorksheet("Supplier Order");
    writeMeta(sheet, 1, t("store", locale), companyName);
    writeMeta(sheet, 2, t("generatedAt", locale), `${stampDay()} ${formatBusinessTimeLabel(new Date())}`);
    headers.forEach((header, index) => {
      const cell = sheet.getCell(4, index + 1);
      cell.value = header;
      cell.border = BORDER;
      cell.fill = HEADER_FILL;
      cell.font = { bold: true };
    });
  }

  return toFile(
    workbook,
    `EGO-POS-Supplier-Order-${stampDay()}.xlsx`,
    "Supplier Order",
    headers,
    totalRows,
  );
}
