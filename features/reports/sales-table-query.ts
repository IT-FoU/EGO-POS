import {
  endOfBusinessDay,
  endOfBusinessMonth,
  parseBusinessDate,
  parseBusinessMonth,
  startOfBusinessDay,
  startOfBusinessMonth,
} from "@/lib/datetime/business-timezone";
import {
  SALES_TABLE_PAGE_SIZE,
  SALES_TABLE_PAYMENT_METHODS,
  isSalesTableStatus,
  type SalesTablePaymentMethod,
  type SalesTableStatus,
} from "@/features/reports/sales-table-math";

export type SalesTableDatePreset = "today" | "yesterday" | "this_month" | "custom";
export type SalesTableSortDir = "asc" | "desc";

function toIsoDate(value?: Date | string) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

export type SalesTableQuery = {
  branchId?: string;
  cashierId?: string;
  date?: string;
  dateFrom?: Date | string;
  datePreset: SalesTableDatePreset;
  dateTo?: Date | string;
  dir: SalesTableSortDir;
  month?: string;
  page: number;
  paymentMethod?: SalesTablePaymentMethod;
  receiptQuery?: string;
  saleId?: string;
  sort?: string;
  status?: SalesTableStatus;
};

const ALL = "all";

function firstParam(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDatePreset(value: string, fallback: SalesTableDatePreset): SalesTableDatePreset {
  if (value === "today" || value === "yesterday" || value === "this_month" || value === "custom") {
    return value;
  }
  return fallback;
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseDir(value: string): SalesTableSortDir {
  return value === "asc" ? "asc" : "desc";
}

export function resolveSalesTableRange(query: Pick<SalesTableQuery, "date" | "dateFrom" | "datePreset" | "dateTo" | "month">, now = new Date()) {
  if (query.date) {
    const parsed = parseBusinessDate(query.date);
    if (parsed) {
      return { dateFrom: startOfBusinessDay(parsed), dateTo: endOfBusinessDay(parsed) };
    }
  }
  if (query.month) {
    const parsed = parseBusinessMonth(query.month);
    if (parsed) {
      return { dateFrom: startOfBusinessMonth(parsed), dateTo: endOfBusinessMonth(parsed) };
    }
  }
  if (query.datePreset === "today") {
    return { dateFrom: startOfBusinessDay(now), dateTo: endOfBusinessDay(now) };
  }
  if (query.datePreset === "yesterday") {
    const yesterday = new Date(startOfBusinessDay(now).getTime() - 86_400_000);
    return { dateFrom: startOfBusinessDay(yesterday), dateTo: endOfBusinessDay(yesterday) };
  }
  if (query.datePreset === "this_month") {
    return { dateFrom: startOfBusinessMonth(now), dateTo: endOfBusinessDay(now) };
  }
  return {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
}

export function parseSalesTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: SalesTableDatePreset },
): SalesTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const presetLocked = rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_month";
  const date = presetLocked ? "" : get("date");
  const month = get("month");
  const customFrom = presetLocked ? undefined : parseBusinessDate(get("dateFrom"));
  const customTo = presetLocked ? undefined : parseBusinessDate(get("dateTo"));
  const paymentMethod = get("paymentMethod");
  const status = get("status");
  const datePreset = date || (!month && (customFrom || customTo))
    ? parseDatePreset(rawPreset, "custom")
    : parseDatePreset(rawPreset, defaults.datePreset);

  const query: SalesTableQuery = {
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    cashierId: get("cashierId") && get("cashierId") !== ALL ? get("cashierId") : undefined,
    date: date || undefined,
    datePreset,
    dir: parseDir(get("dir")),
    month: month || undefined,
    page: parsePage(get("page")),
    receiptQuery: get("q") || get("receipt") || undefined,
    saleId: get("sale") || undefined,
    sort: get("sort") || undefined,
  };

  if (customFrom) query.dateFrom = customFrom;
  if (customTo) query.dateTo = endOfBusinessDay(customTo);
  if ((SALES_TABLE_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    query.paymentMethod = paymentMethod as SalesTablePaymentMethod;
  }
  if (isSalesTableStatus(status)) {
    query.status = status;
  }

  const range = resolveSalesTableRange(query);
  query.dateFrom = range.dateFrom;
  query.dateTo = range.dateTo;
  return query;
}

export function salesTableQueryToSearchParams(query: SalesTableQuery, defaults: { datePreset: SalesTableDatePreset }) {
  const params = new URLSearchParams();
  if (query.datePreset !== defaults.datePreset) params.set("datePreset", query.datePreset);
  if (query.date) params.set("date", query.date);
  if (query.month) params.set("month", query.month);
  if (query.datePreset === "custom" && !query.date && !query.month) {
    const from = toIsoDate(query.dateFrom);
    const to = toIsoDate(query.dateTo);
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
  }
  if (query.branchId) params.set("branchId", query.branchId);
  if (query.cashierId) params.set("cashierId", query.cashierId);
  if (query.paymentMethod) params.set("paymentMethod", query.paymentMethod);
  if (query.status) params.set("status", query.status);
  if (query.receiptQuery) params.set("q", query.receiptQuery);
  if (query.sort) params.set("sort", query.sort);
  if (query.dir && query.sort) params.set("dir", query.dir);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.saleId) params.set("sale", query.saleId);
  return params;
}

export function salesTableHref(
  pathname: string,
  query: SalesTableQuery,
  defaults: { datePreset: SalesTableDatePreset },
  overrides: Partial<SalesTableQuery> = {},
) {
  const params = salesTableQueryToSearchParams({ ...query, ...overrides }, defaults);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function salesTableExportHref(
  report: "daily" | "monthly" | "payment-methods",
  query: SalesTableQuery,
  defaults: { datePreset: SalesTableDatePreset },
) {
  const params = salesTableQueryToSearchParams({ ...query, page: 1, saleId: undefined }, defaults);
  params.delete("page");
  params.delete("sale");
  const search = params.toString();
  return search ? `/api/reports/sales/${report}/export?${search}` : `/api/reports/sales/${report}/export`;
}

export function selectSalesTableRows<T>(sorted: T[], page: number, pageSize: number, allRows = false) {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size));
  const current = Math.min(Math.max(page, 1), pageCount);
  const start = (current - 1) * size;
  return {
    page: current,
    pageCount,
    rows: allRows ? sorted : sorted.slice(start, start + size),
  };
}

export const SALES_TABLE_DEFAULT_PAGE_SIZE = SALES_TABLE_PAGE_SIZE;
