import {
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
} from "@/lib/datetime/business-timezone";
import {
  SHIFT_STATUSES,
  SHIFT_TABLE_PAGE_SIZE,
  VARIANCE_STATUSES,
  type ShiftStatusFilter,
  type VarianceStatusFilter,
} from "@/features/reports/shift-table-math";

export type ShiftDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";
export type ShiftSortDir = "asc" | "desc";

export type ShiftTableQuery = {
  branchId?: string;
  cashierId?: string;
  date?: string;
  dateFrom?: Date | string;
  datePreset: ShiftDatePreset;
  dateTo?: Date | string;
  dir: ShiftSortDir;
  page: number;
  sessionQuery?: string;
  shiftId?: string;
  sort?: string;
  status: ShiftStatusFilter;
  varianceStatus: VarianceStatusFilter;
};

const ALL = "all";

function firstParam(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDatePreset(value: string, fallback: ShiftDatePreset): ShiftDatePreset {
  if (value === "today" || value === "yesterday" || value === "this_week" || value === "this_month" || value === "custom") {
    return value;
  }
  return fallback;
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseStatus(value: string): ShiftStatusFilter {
  if ((SHIFT_STATUSES as readonly string[]).includes(value)) return value as ShiftStatusFilter;
  return "all";
}

function parseVariance(value: string): VarianceStatusFilter {
  if ((VARIANCE_STATUSES as readonly string[]).includes(value)) return value as VarianceStatusFilter;
  return "all";
}

export function resolveShiftTableRange(
  query: Pick<ShiftTableQuery, "date" | "dateFrom" | "datePreset" | "dateTo">,
  now = new Date(),
) {
  if (query.date) {
    const parsed = parseBusinessDate(query.date);
    if (parsed) return { dateFrom: startOfBusinessDay(parsed), dateTo: endOfBusinessDay(parsed) };
  }
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

export function parseShiftTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: ShiftDatePreset },
): ShiftTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const locked =
    rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_week" || rawPreset === "this_month";
  const datePreset = parseDatePreset(rawPreset, defaults.datePreset);
  const dateFromRaw = get("dateFrom") || get("from");
  const dateToRaw = get("dateTo") || get("to");
  const query: ShiftTableQuery = {
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    cashierId: get("cashierId") && get("cashierId") !== ALL ? get("cashierId") : undefined,
    date: locked ? undefined : get("date") || undefined,
    datePreset: locked ? datePreset : dateFromRaw || dateToRaw ? "custom" : datePreset,
    dir: get("dir") === "asc" ? "asc" : "desc",
    page: parsePage(get("page")),
    sessionQuery: get("q") || get("session") || undefined,
    shiftId: get("shift") || get("shiftId") || undefined,
    sort: get("sort") || undefined,
    status: parseStatus(get("status") || "all"),
    varianceStatus: parseVariance(get("varianceStatus") || get("variance") || "all"),
  };
  if (!locked && dateFromRaw) query.dateFrom = parseBusinessDate(dateFromRaw) ?? dateFromRaw;
  if (!locked && dateToRaw) {
    const parsed = parseBusinessDate(dateToRaw);
    query.dateTo = parsed ? endOfBusinessDay(parsed) : dateToRaw;
  }
  const range = resolveShiftTableRange(query);
  query.dateFrom = range.dateFrom;
  query.dateTo = range.dateTo;
  return query;
}

export function shiftTableHref(pathname: string, query: ShiftTableQuery, patch: Partial<ShiftTableQuery> = {}) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.datePreset && next.datePreset !== "custom") params.set("datePreset", next.datePreset);
  if (next.datePreset === "custom") {
    if (next.dateFrom) params.set("dateFrom", String(next.dateFrom).slice(0, 10));
    if (next.dateTo) params.set("dateTo", String(next.dateTo).slice(0, 10));
  }
  if (next.date) params.set("date", next.date);
  if (next.branchId) params.set("branchId", next.branchId);
  if (next.cashierId) params.set("cashierId", next.cashierId);
  if (next.status && next.status !== "all") params.set("status", next.status);
  if (next.varianceStatus && next.varianceStatus !== "all") params.set("varianceStatus", next.varianceStatus);
  if (next.sessionQuery) params.set("q", next.sessionQuery);
  if (next.shiftId) params.set("shift", next.shiftId);
  if (next.sort) params.set("sort", next.sort);
  if (next.dir === "asc") params.set("dir", "asc");
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function shiftTableExportHref(pathname: string, query: ShiftTableQuery) {
  return shiftTableHref(pathname, { ...query, page: 1, shiftId: undefined });
}

export { SHIFT_TABLE_PAGE_SIZE };
