import {
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
} from "@/lib/datetime/business-timezone";
import {
  POSTSALE_EVENT_TYPES,
  POSTSALE_TABLE_PAGE_SIZE,
  type PostSaleEventTypeFilter,
} from "@/features/reports/postsale-table-math";
import {
  SALES_TABLE_PAYMENT_METHODS,
  SALES_TABLE_STATUSES,
  isSalesTableStatus,
  type SalesTablePaymentMethod,
  type SalesTableStatus,
} from "@/features/reports/sales-table-math";

export type PostSaleDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";
export type PostSaleSortDir = "asc" | "desc";

export type PostSaleTableQuery = {
  approverId?: string;
  branchId?: string;
  cashierId?: string;
  customerQuery?: string;
  date?: string;
  dateFrom?: Date | string;
  datePreset: PostSaleDatePreset;
  dateTo?: Date | string;
  dir: PostSaleSortDir;
  eventType: PostSaleEventTypeFilter;
  page: number;
  paymentMethod?: SalesTablePaymentMethod;
  productQuery?: string;
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

function parseDatePreset(value: string, fallback: PostSaleDatePreset): PostSaleDatePreset {
  if (value === "today" || value === "yesterday" || value === "this_week" || value === "this_month" || value === "custom") {
    return value;
  }
  return fallback;
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseEventType(value: string): PostSaleEventTypeFilter {
  if ((POSTSALE_EVENT_TYPES as readonly string[]).includes(value)) {
    return value as PostSaleEventTypeFilter;
  }
  return "all";
}

export function resolvePostSaleTableRange(
  query: Pick<PostSaleTableQuery, "date" | "dateFrom" | "datePreset" | "dateTo">,
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

export function parsePostSaleTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: PostSaleDatePreset },
): PostSaleTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const locked =
    rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_week" || rawPreset === "this_month";
  const datePreset = parseDatePreset(rawPreset, defaults.datePreset);
  const dateFromRaw = get("dateFrom") || get("from");
  const dateToRaw = get("dateTo") || get("to");
  const paymentMethod = get("paymentMethod");
  const status = get("status");
  const query: PostSaleTableQuery = {
    approverId: get("approverId") && get("approverId") !== ALL ? get("approverId") : undefined,
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    cashierId: get("cashierId") && get("cashierId") !== ALL ? get("cashierId") : undefined,
    customerQuery: get("customer") || get("customerQuery") || undefined,
    date: locked ? undefined : get("date") || undefined,
    datePreset: locked ? datePreset : dateFromRaw || dateToRaw ? "custom" : datePreset,
    dir: get("dir") === "asc" ? "asc" : "desc",
    eventType: parseEventType(get("eventType") || get("type") || "all"),
    page: parsePage(get("page")),
    productQuery: get("product") || get("barcode") || get("productQuery") || undefined,
    receiptQuery: get("q") || get("receipt") || undefined,
    saleId: get("sale") || get("saleId") || undefined,
    sort: get("sort") || undefined,
  };
  if (!locked && dateFromRaw) query.dateFrom = parseBusinessDate(dateFromRaw) ?? dateFromRaw;
  if (!locked && dateToRaw) {
    const parsed = parseBusinessDate(dateToRaw);
    query.dateTo = parsed ? endOfBusinessDay(parsed) : dateToRaw;
  }
  if ((SALES_TABLE_PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) {
    query.paymentMethod = paymentMethod as SalesTablePaymentMethod;
  }
  if (isSalesTableStatus(status) || (SALES_TABLE_STATUSES as readonly string[]).includes(status)) {
    query.status = status as SalesTableStatus;
  }
  const range = resolvePostSaleTableRange(query);
  query.dateFrom = range.dateFrom;
  query.dateTo = range.dateTo;
  return query;
}

export function postSaleTableHref(
  pathname: string,
  query: PostSaleTableQuery,
  patch: Partial<PostSaleTableQuery> = {},
) {
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
  if (next.approverId) params.set("approverId", next.approverId);
  if (next.paymentMethod) params.set("paymentMethod", next.paymentMethod);
  if (next.status) params.set("status", next.status);
  if (next.eventType && next.eventType !== "all") params.set("eventType", next.eventType);
  if (next.receiptQuery) params.set("q", next.receiptQuery);
  if (next.customerQuery) params.set("customer", next.customerQuery);
  if (next.productQuery) params.set("product", next.productQuery);
  if (next.saleId) params.set("sale", next.saleId);
  if (next.sort) params.set("sort", next.sort);
  if (next.dir === "asc") params.set("dir", "asc");
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function postSaleTableExportHref(pathname: string, query: PostSaleTableQuery) {
  return postSaleTableHref(pathname, { ...query, page: 1, saleId: undefined });
}

export { POSTSALE_TABLE_PAGE_SIZE };
