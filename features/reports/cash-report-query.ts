import {
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
} from "@/lib/datetime/business-timezone";
import {
  CASH_COUNT_STATUSES,
  CASH_COUNT_VARIANCE,
  CASH_MOVEMENT_TYPES,
  CASH_REPORT_PAGE_SIZE,
  type CashCountStatusFilter,
  type CashCountVarianceFilter,
  type CashMovementTypeFilter,
} from "@/features/reports/cash-report-math";

export type CashReportDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";

export type CashCountTableQuery = {
  branchId?: string;
  cashierId?: string;
  dateFrom?: Date | string;
  datePreset: CashReportDatePreset;
  dateTo?: Date | string;
  page: number;
  sessionQuery?: string;
  status: CashCountStatusFilter;
  varianceStatus: CashCountVarianceFilter;
};

export type CashMovementTableQuery = {
  actorId?: string;
  amountMax?: number;
  amountMin?: number;
  branchId?: string;
  dateFrom?: Date | string;
  datePreset: CashReportDatePreset;
  dateTo?: Date | string;
  page: number;
  reasonQuery?: string;
  sessionQuery?: string;
  type: CashMovementTypeFilter;
};

const ALL = "all";

function firstParam(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDatePreset(value: string, fallback: CashReportDatePreset): CashReportDatePreset {
  if (value === "today" || value === "yesterday" || value === "this_week" || value === "this_month" || value === "custom") {
    return value;
  }
  return fallback;
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function resolveCashReportRange(
  query: Pick<CashCountTableQuery, "dateFrom" | "datePreset" | "dateTo">,
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

export function parseCashCountTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: CashReportDatePreset },
): CashCountTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const locked =
    rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_week" || rawPreset === "this_month";
  const datePreset = parseDatePreset(rawPreset, defaults.datePreset);
  const dateFromRaw = get("dateFrom") || get("from");
  const dateToRaw = get("dateTo") || get("to");
  const statusRaw = get("status") || "all";
  const varianceRaw = get("varianceStatus") || get("variance") || "all";
  const query: CashCountTableQuery = {
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    cashierId: get("cashierId") && get("cashierId") !== ALL ? get("cashierId") : undefined,
    datePreset: locked ? datePreset : dateFromRaw || dateToRaw ? "custom" : datePreset,
    page: parsePage(get("page")),
    sessionQuery: get("q") || get("session") || undefined,
    status: (CASH_COUNT_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as CashCountStatusFilter)
      : "all",
    varianceStatus: (CASH_COUNT_VARIANCE as readonly string[]).includes(varianceRaw)
      ? (varianceRaw as CashCountVarianceFilter)
      : "all",
  };
  if (!locked && dateFromRaw) query.dateFrom = parseBusinessDate(dateFromRaw) ?? dateFromRaw;
  if (!locked && dateToRaw) {
    const parsed = parseBusinessDate(dateToRaw);
    query.dateTo = parsed ? endOfBusinessDay(parsed) : dateToRaw;
  }
  const range = resolveCashReportRange(query);
  query.dateFrom = range.dateFrom;
  query.dateTo = range.dateTo;
  return query;
}

export function parseCashMovementTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: CashReportDatePreset },
): CashMovementTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const locked =
    rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_week" || rawPreset === "this_month";
  const datePreset = parseDatePreset(rawPreset, defaults.datePreset);
  const dateFromRaw = get("dateFrom") || get("from");
  const dateToRaw = get("dateTo") || get("to");
  const typeRaw = get("type") || "all";
  const amountMin = Number.parseFloat(get("amountMin"));
  const amountMax = Number.parseFloat(get("amountMax"));
  const query: CashMovementTableQuery = {
    actorId: get("actorId") || get("cashierId") || undefined,
    amountMax: Number.isFinite(amountMax) ? amountMax : undefined,
    amountMin: Number.isFinite(amountMin) ? amountMin : undefined,
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    datePreset: locked ? datePreset : dateFromRaw || dateToRaw ? "custom" : datePreset,
    page: parsePage(get("page")),
    reasonQuery: get("reason") || get("q") || undefined,
    sessionQuery: get("session") || undefined,
    type: (CASH_MOVEMENT_TYPES as readonly string[]).includes(typeRaw)
      ? (typeRaw as CashMovementTypeFilter)
      : "all",
  };
  if (query.actorId === ALL) query.actorId = undefined;
  if (!locked && dateFromRaw) query.dateFrom = parseBusinessDate(dateFromRaw) ?? dateFromRaw;
  if (!locked && dateToRaw) {
    const parsed = parseBusinessDate(dateToRaw);
    query.dateTo = parsed ? endOfBusinessDay(parsed) : dateToRaw;
  }
  const range = resolveCashReportRange(query);
  query.dateFrom = range.dateFrom;
  query.dateTo = range.dateTo;
  return query;
}

function hrefFromParams(pathname: string, params: URLSearchParams) {
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function cashCountTableHref(pathname: string, query: CashCountTableQuery, patch: Partial<CashCountTableQuery> = {}) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.datePreset && next.datePreset !== "custom") params.set("datePreset", next.datePreset);
  if (next.datePreset === "custom") {
    if (next.dateFrom) params.set("dateFrom", String(next.dateFrom).slice(0, 10));
    if (next.dateTo) params.set("dateTo", String(next.dateTo).slice(0, 10));
  }
  if (next.branchId) params.set("branchId", next.branchId);
  if (next.cashierId) params.set("cashierId", next.cashierId);
  if (next.status && next.status !== "all") params.set("status", next.status);
  if (next.varianceStatus && next.varianceStatus !== "all") params.set("varianceStatus", next.varianceStatus);
  if (next.sessionQuery) params.set("q", next.sessionQuery);
  if (next.page > 1) params.set("page", String(next.page));
  return hrefFromParams(pathname, params);
}

export function cashMovementTableHref(
  pathname: string,
  query: CashMovementTableQuery,
  patch: Partial<CashMovementTableQuery> = {},
) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.datePreset && next.datePreset !== "custom") params.set("datePreset", next.datePreset);
  if (next.datePreset === "custom") {
    if (next.dateFrom) params.set("dateFrom", String(next.dateFrom).slice(0, 10));
    if (next.dateTo) params.set("dateTo", String(next.dateTo).slice(0, 10));
  }
  if (next.branchId) params.set("branchId", next.branchId);
  if (next.actorId) params.set("actorId", next.actorId);
  if (next.type && next.type !== "all") params.set("type", next.type);
  if (next.reasonQuery) params.set("reason", next.reasonQuery);
  if (next.sessionQuery) params.set("session", next.sessionQuery);
  if (next.amountMin != null) params.set("amountMin", String(next.amountMin));
  if (next.amountMax != null) params.set("amountMax", String(next.amountMax));
  if (next.page > 1) params.set("page", String(next.page));
  return hrefFromParams(pathname, params);
}

export function cashCountExportHref(pathname: string, query: CashCountTableQuery) {
  return cashCountTableHref(pathname, { ...query, page: 1 });
}

export function cashMovementExportHref(pathname: string, query: CashMovementTableQuery) {
  return cashMovementTableHref(pathname, { ...query, page: 1 });
}

export { CASH_REPORT_PAGE_SIZE };
