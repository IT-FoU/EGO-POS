import { sanitizeExportFilename, type SalesExcelFile } from "@/features/reports/sales-table-excel";
import { businessDayLabel, formatBusinessTimeLabel } from "@/lib/datetime/business-timezone";
import type { AttendanceReportTableResult } from "@/features/reports/attendance-report-repository";
import { formatHoursMinutes } from "@/features/reports/attendance-report-math";
import { tReports } from "@/lib/i18n/reports-copy";
import type { SupportedLocale } from "@/lib/constants";
import ExcelJS from "exceljs";

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

type ColumnKind = "text" | "int";
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

function clock(iso: string | null) {
  if (!iso) return "—";
  return formatBusinessTimeLabel(iso);
}

function lateLabel(minutes: number, locale: SupportedLocale) {
  if (minutes <= 0) return t("onTime", locale);
  return tReports("minutesShort", locale).replace("{n}", String(minutes));
}

function dayOffLabel(label: string, locale: SupportedLocale) {
  if (label === "weekly") return t("weeklyDayOff", locale);
  if (label === "quota") return t("quotaDayOff", locale);
  if (label === "special") return t("specialDayOff", locale);
  if (label === "worked_on_day_off") return t("workedOnDayOff", locale);
  return "—";
}

function workStatusLabel(status: string, locale: SupportedLocale) {
  if (status === "worked") return t("workStatusWorked", locale);
  if (status === "open") return t("statusOpen", locale);
  if (status === "day_off") return t("dayOff", locale);
  if (status === "no_work_record") return t("noWorkRecord", locale);
  return status;
}

function hoursLabel(minutes: number | null, locale: SupportedLocale) {
  if (minutes == null) return t("notRecorded", locale);
  return formatHoursMinutes(minutes);
}

function applyCell(cell: ExcelJS.Cell, value: ExcelJS.CellValue, kind: ColumnKind, total = false) {
  cell.value = value;
  cell.border = total ? TOTAL_BORDER : BORDER;
  if (total) cell.fill = TOTAL_FILL;
  if (kind === "int") cell.alignment = { horizontal: "right" };
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

export async function buildStaffAttendanceExcel(input: {
  data: AttendanceReportTableResult;
  locale: SupportedLocale;
  storeName: string;
}): Promise<SalesExcelFile> {
  const { data, locale, storeName } = input;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Staff Attendance");
  const rangeStamp = stamp(data.query);

  writeMeta(sheet, 1, t("store", locale), storeName);
  writeMeta(sheet, 2, t("report", locale), t("staffAttendance", locale));
  writeMeta(sheet, 3, t("dateRange", locale), rangeStamp);
  writeMeta(sheet, 4, t("branch", locale), data.query.branchId ?? t("allBranches", locale));
  writeMeta(sheet, 5, t("employee", locale), data.query.employeeId ?? data.query.employeeQuery ?? t("allEmployees", locale));
  writeMeta(sheet, 6, t("generatedAt", locale), generatedAtLabel());

  const summaryEnd = writeSummary(sheet, 8, [
    { label: t("summaryEmployees", locale), value: data.summary.employees },
    { label: t("summaryWorkDays", locale), value: data.summary.workDays },
    { label: t("summaryDayOffDays", locale), value: data.summary.dayOffDays },
    { label: t("workedOnDayOff", locale), value: data.summary.workedOnDayOffDays },
    { label: t("regularHours", locale), value: formatHoursMinutes(data.summary.regularHoursMinutes) },
    { label: t("otHours", locale), value: formatHoursMinutes(data.summary.otHoursMinutes) },
    { label: t("lateDays", locale), value: data.summary.lateDays },
    { label: t("totalLateMinutes", locale), value: data.summary.totalLateMinutes },
    { label: t("autoEndCount", locale), value: data.summary.autoEndCount },
    { label: t("openAttendance", locale), value: data.summary.openSessions },
  ]);

  const columns: ColumnSpec[] = [
    { header: t("colNo", locale), key: "no", kind: "int", width: 6 },
    { header: t("colDate", locale), key: "date", kind: "text", width: 12 },
    { header: t("employee", locale), key: "employee", kind: "text", width: 18 },
    { header: t("branch", locale), key: "branch", kind: "text", width: 14 },
    { header: t("scheduledStart", locale), key: "schedStart", kind: "text", width: 12 },
    { header: t("scheduledEnd", locale), key: "schedEnd", kind: "text", width: 12 },
    { header: t("startWork", locale), key: "start", kind: "text", width: 10 },
    { header: t("endWork", locale), key: "end", kind: "text", width: 10 },
    { header: t("regularHours", locale), key: "regular", kind: "text", width: 12 },
    { header: `${t("regularHours", locale)} (min)`, key: "regularMin", kind: "int", width: 12 },
    { header: t("otHours", locale), key: "ot", kind: "text", width: 10 },
    { header: `${t("otHours", locale)} (min)`, key: "otMin", kind: "int", width: 10 },
    { header: t("late", locale), key: "late", kind: "text", width: 10 },
    { header: t("dayOff", locale), key: "dayOff", kind: "text", width: 16 },
    { header: t("autoEnd", locale), key: "autoEnd", kind: "text", width: 10 },
    { header: t("workStatus", locale), key: "workStatus", kind: "text", width: 14 },
    { header: t("note", locale), key: "note", kind: "text", width: 20 },
  ];

  const tableRows = data.rows.map((row, index) => ({
    autoEnd: row.autoEnd ? t("yes", locale) : t("no", locale),
    branch: row.branchName,
    date: row.businessDate,
    dayOff: dayOffLabel(row.dayOffLabel, locale),
    employee: row.employeeName,
    end: row.workStatus === "open" ? t("statusOpen", locale) : clock(row.endedAt),
    late: row.workStatus === "worked" || row.workStatus === "open" ? lateLabel(row.lateMinutes, locale) : "—",
    no: index + 1,
    note: row.note || "—",
    ot: hoursLabel(row.otMinutes, locale),
    otMin: row.otMinutes ?? "",
    regular: hoursLabel(row.regularMinutes, locale),
    regularMin: row.regularMinutes ?? "",
    schedEnd: row.scheduledEnd || "—",
    schedStart: row.scheduledStart || "—",
    start: clock(row.startedAt),
    workStatus: workStatusLabel(row.workStatus, locale),
  }));

  writeTable(sheet, summaryEnd + 1, columns, tableRows, {
    autoEnd: data.summary.autoEndCount,
    branch: "",
    date: t("total", locale),
    dayOff: data.summary.dayOffDays,
    employee: data.summary.employees,
    end: "",
    late: data.summary.totalLateMinutes,
    no: data.rows.length,
    note: "",
    ot: formatHoursMinutes(data.summary.otHoursMinutes),
    otMin: data.summary.otHoursMinutes,
    regular: formatHoursMinutes(data.summary.regularHoursMinutes),
    regularMin: data.summary.regularHoursMinutes,
    schedEnd: "",
    schedStart: "",
    start: "",
    workStatus: data.summary.workDays,
  });

  const summarySheet = workbook.addWorksheet("Employee Summary");
  writeMeta(summarySheet, 1, t("store", locale), storeName);
  writeMeta(summarySheet, 2, t("report", locale), t("employeeSummary", locale));
  writeMeta(summarySheet, 3, t("dateRange", locale), rangeStamp);
  writeMeta(summarySheet, 4, t("generatedAt", locale), generatedAtLabel());

  const empColumns: ColumnSpec[] = [
    { header: t("employee", locale), key: "employee", kind: "text", width: 18 },
    { header: t("trackedDays", locale), key: "tracked", kind: "int", width: 12 },
    { header: t("summaryWorkDays", locale), key: "workDays", kind: "int", width: 10 },
    { header: t("dayOffUsed", locale), key: "dayOffUsed", kind: "int", width: 12 },
    { header: t("dayOffRemaining", locale), key: "dayOffRemaining", kind: "int", width: 14 },
    { header: t("workedOnDayOff", locale), key: "workedOnDayOff", kind: "int", width: 16 },
    { header: t("regularHours", locale), key: "regular", kind: "text", width: 12 },
    { header: t("otHours", locale), key: "ot", kind: "text", width: 10 },
    { header: t("lateDays", locale), key: "lateDays", kind: "int", width: 10 },
    { header: t("totalLateMinutes", locale), key: "lateMin", kind: "int", width: 14 },
    { header: t("autoEndCount", locale), key: "autoEnd", kind: "int", width: 12 },
  ];

  writeTable(
    summarySheet,
    6,
    empColumns,
    data.employeeSummaries.map((row) => ({
      autoEnd: row.autoEndCount,
      dayOffRemaining: row.quotaSnapshotExists ? (row.dayOffRemaining ?? "—") : t("noQuotaActivity", locale),
      dayOffUsed: row.dayOffUsed ?? "—",
      employee: row.employeeName,
      lateDays: row.lateDays,
      lateMin: row.lateMinutes,
      ot: formatHoursMinutes(row.otMinutes),
      regular: formatHoursMinutes(row.regularMinutes),
      tracked: row.trackedDays,
      workDays: row.workDays,
      workedOnDayOff: row.workedOnDayOffDays,
    })),
  );

  return toFile(
    workbook,
    `EGO-POS-Staff-Attendance-${rangeStamp}.xlsx`,
    "Staff Attendance",
    columns.map((c) => c.header),
    data.rows.length,
  );
}
