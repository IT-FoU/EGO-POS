import {
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
  businessDayLabel,
} from "@/lib/datetime/business-timezone";
import {
  ATTENDANCE_REPORT_MAX_DAYS,
  ATTENDANCE_REPORT_PAGE_SIZE,
  type AttendanceDayOffFilter,
  type AttendanceEndSourceFilter,
  type AttendanceLateFilter,
  type AttendanceOtFilter,
  type AttendanceWorkStatusFilter,
} from "@/features/reports/attendance-report-math";

export type AttendanceReportDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

export type AttendanceReportViewTab = "daily" | "employee_summary";

export type AttendanceReportTableQuery = {
  branchId?: string;
  dateFrom?: Date | string;
  datePreset: AttendanceReportDatePreset;
  dateTo?: Date | string;
  dayOffStatus: AttendanceDayOffFilter;
  employeeId?: string;
  employeeQuery?: string;
  endSource: AttendanceEndSourceFilter;
  lateStatus: AttendanceLateFilter;
  otStatus: AttendanceOtFilter;
  page: number;
  view: AttendanceReportViewTab;
  workStatus: AttendanceWorkStatusFilter;
};

const ALL = "all";

function firstParam(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDatePreset(value: string, fallback: AttendanceReportDatePreset): AttendanceReportDatePreset {
  if (value === "today" || value === "yesterday" || value === "this_week" || value === "this_month" || value === "custom") {
    return value;
  }
  return fallback;
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function resolveAttendanceReportRange(
  query: Pick<AttendanceReportTableQuery, "dateFrom" | "datePreset" | "dateTo">,
  now = new Date(),
) {
  if (query.datePreset === "today") {
    return { dateFrom: startOfBusinessDay(now), dateTo: endOfBusinessDay(now) };
  }
  if (query.datePreset === "yesterday") {
    const yesterday = new Date(startOfBusinessDay(now).getTime() - 86_400_000);
    return { dateFrom: startOfBusinessDay(yesterday), dateTo: endOfBusinessDay(yesterday) };
  }
  if (query.datePreset === "this_week") {
    return { dateFrom: startOfBusinessWeek(now), dateTo: endOfBusinessDay(now) };
  }
  if (query.datePreset === "this_month") {
    return { dateFrom: startOfBusinessMonth(now), dateTo: endOfBusinessDay(now) };
  }
  return { dateFrom: query.dateFrom, dateTo: query.dateTo };
}

/** Inclusive business-date labels (YYYY-MM-DD) for a resolved range, capped. */
export function attendanceDateLabelsInRange(dateFrom?: Date | string, dateTo?: Date | string): string[] {
  const from = dateFrom instanceof Date ? dateFrom : dateFrom ? new Date(dateFrom) : null;
  const to = dateTo instanceof Date ? dateTo : dateTo ? new Date(dateTo) : null;
  if (!from || Number.isNaN(from.getTime())) return [];
  const end = to && !Number.isNaN(to.getTime()) ? to : from;
  const labels: string[] = [];
  let cursor = startOfBusinessDay(from);
  const last = startOfBusinessDay(end);
  while (cursor.getTime() <= last.getTime() && labels.length < ATTENDANCE_REPORT_MAX_DAYS) {
    labels.push(businessDayLabel(cursor));
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return labels;
}

export function toUtcDateOnly(label: string): Date {
  const [y, m, d] = label.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function parseAttendanceReportTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: AttendanceReportDatePreset } = { datePreset: "today" },
): AttendanceReportTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const locked =
    rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_week" || rawPreset === "this_month";
  const datePreset = parseDatePreset(rawPreset, defaults.datePreset);
  const dateFromRaw = get("dateFrom") || get("from");
  const dateToRaw = get("dateTo") || get("to");
  const workStatus = get("workStatus") || "all";
  const dayOffStatus = get("dayOffStatus") || "all";
  const lateStatus = get("lateStatus") || "all";
  const endSource = get("endSource") || "all";
  const otStatus = get("otStatus") || "all";
  const viewRaw = get("view");

  const query: AttendanceReportTableQuery = {
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    datePreset: locked ? datePreset : dateFromRaw || dateToRaw ? "custom" : datePreset,
    dayOffStatus: dayOffStatus as AttendanceDayOffFilter,
    employeeId: get("employeeId") && get("employeeId") !== ALL ? get("employeeId") : undefined,
    employeeQuery: get("q") || get("employee") || undefined,
    endSource: endSource as AttendanceEndSourceFilter,
    lateStatus: lateStatus as AttendanceLateFilter,
    otStatus: otStatus as AttendanceOtFilter,
    page: parsePage(get("page")),
    view: viewRaw === "employee_summary" ? "employee_summary" : "daily",
    workStatus: workStatus as AttendanceWorkStatusFilter,
  };

  if (!locked && dateFromRaw) query.dateFrom = parseBusinessDate(dateFromRaw) ?? dateFromRaw;
  if (!locked && dateToRaw) {
    const parsed = parseBusinessDate(dateToRaw);
    query.dateTo = parsed ? endOfBusinessDay(parsed) : dateToRaw;
  }
  const range = resolveAttendanceReportRange(query);
  query.dateFrom = range.dateFrom;
  query.dateTo = range.dateTo;
  return query;
}

function hrefFromParams(pathname: string, params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function attendanceReportTableHref(
  pathname: string,
  query: AttendanceReportTableQuery,
  patch: Partial<AttendanceReportTableQuery> = {},
) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.datePreset && next.datePreset !== "custom") params.set("datePreset", next.datePreset);
  if (next.datePreset === "custom") {
    if (next.dateFrom) params.set("dateFrom", String(next.dateFrom).slice(0, 10));
    if (next.dateTo) params.set("dateTo", String(next.dateTo).slice(0, 10));
  }
  if (next.branchId) params.set("branchId", next.branchId);
  if (next.employeeId) params.set("employeeId", next.employeeId);
  if (next.employeeQuery) params.set("q", next.employeeQuery);
  if (next.workStatus && next.workStatus !== "all") params.set("workStatus", next.workStatus);
  if (next.dayOffStatus && next.dayOffStatus !== "all") params.set("dayOffStatus", next.dayOffStatus);
  if (next.lateStatus && next.lateStatus !== "all") params.set("lateStatus", next.lateStatus);
  if (next.endSource && next.endSource !== "all") params.set("endSource", next.endSource);
  if (next.otStatus && next.otStatus !== "all") params.set("otStatus", next.otStatus);
  if (next.view && next.view !== "daily") params.set("view", next.view);
  if (next.page > 1) params.set("page", String(next.page));
  return hrefFromParams(pathname, params);
}

export function attendanceReportExportHref(pathname: string, query: AttendanceReportTableQuery) {
  return attendanceReportTableHref(pathname, { ...query, page: 1 });
}

export { ATTENDANCE_REPORT_PAGE_SIZE, ATTENDANCE_REPORT_MAX_DAYS };
