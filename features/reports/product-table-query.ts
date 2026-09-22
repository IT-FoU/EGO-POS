import {
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
} from "@/lib/datetime/business-timezone";
import { isSalesTableStatus, type SalesTableStatus } from "@/features/reports/sales-table-math";
import {
  PRODUCT_RANK_METRICS,
  PRODUCT_TABLE_PAGE_SIZE,
  PRODUCT_TOP_N_OPTIONS,
  type ProductPerformanceView,
  type ProductRankMetric,
} from "@/features/reports/product-table-math";

export type ProductTableDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";
export type ProductTableSortDir = "asc" | "desc";

export type ProductTableQuery = {
  branchId?: string;
  cashierId?: string;
  categoryId?: string;
  date?: string;
  dateFrom?: Date | string;
  datePreset: ProductTableDatePreset;
  dateTo?: Date | string;
  dir: ProductTableSortDir;
  includeZeroSales?: boolean;
  page: number;
  productId?: string;
  productQuery?: string;
  rankMetric: ProductRankMetric;
  skuQuery?: string;
  sort?: string;
  status?: SalesTableStatus;
  topN: number;
  view: ProductPerformanceView;
};

const ALL = "all";

function firstParam(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDatePreset(value: string, fallback: ProductTableDatePreset): ProductTableDatePreset {
  if (value === "today" || value === "yesterday" || value === "this_week" || value === "this_month" || value === "custom") {
    return value;
  }
  return fallback;
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseTopN(value: string) {
  const parsed = Number.parseInt(value, 10);
  return (PRODUCT_TOP_N_OPTIONS as readonly number[]).includes(parsed) ? parsed : 20;
}

function toIsoDate(value?: Date | string) {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  if (Number.isNaN(value.getTime())) return "";
  return value.toISOString().slice(0, 10);
}

export function resolveProductTableRange(query: Pick<ProductTableQuery, "date" | "dateFrom" | "datePreset" | "dateTo">, now = new Date()) {
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

export function parseProductTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: ProductTableDatePreset },
): ProductTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const locked = rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_week" || rawPreset === "this_month";
  const date = locked ? "" : get("date");
  const customFrom = locked ? undefined : parseBusinessDate(get("dateFrom"));
  const customTo = locked ? undefined : parseBusinessDate(get("dateTo"));
  const status = get("status");
  const metric = get("metric") || get("rankMetric");
  const view = get("view");
  const datePreset = date || customFrom || customTo
    ? parseDatePreset(rawPreset, "custom")
    : parseDatePreset(rawPreset, defaults.datePreset);

  const query: ProductTableQuery = {
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    cashierId: get("cashierId") && get("cashierId") !== ALL ? get("cashierId") : undefined,
    categoryId: get("categoryId") && get("categoryId") !== ALL ? get("categoryId") : undefined,
    date: date || undefined,
    datePreset,
    dir: get("dir") === "asc" ? "asc" : "desc",
    includeZeroSales: get("includeZero") === "1" || get("includeZero") === "true",
    page: parsePage(get("page")),
    productId: get("productId") || undefined,
    productQuery: get("product") || get("q") || undefined,
    rankMetric: (PRODUCT_RANK_METRICS as readonly string[]).includes(metric) ? metric as ProductRankMetric : "units",
    skuQuery: get("sku") || get("barcode") || undefined,
    sort: get("sort") || undefined,
    topN: parseTopN(get("topN")),
    view: view === "slow" ? "slow" : "best",
  };
  if (customFrom) query.dateFrom = customFrom;
  if (customTo) query.dateTo = endOfBusinessDay(customTo);
  if (isSalesTableStatus(status)) query.status = status;
  const range = resolveProductTableRange(query);
  query.dateFrom = range.dateFrom;
  query.dateTo = range.dateTo;
  return query;
}

export function productTableQueryToSearchParams(query: ProductTableQuery, defaults: { datePreset: ProductTableDatePreset }) {
  const params = new URLSearchParams();
  if (query.datePreset !== defaults.datePreset) params.set("datePreset", query.datePreset);
  if (query.date) params.set("date", query.date);
  if (query.datePreset === "custom" && !query.date) {
    const from = toIsoDate(query.dateFrom);
    const to = toIsoDate(query.dateTo);
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
  }
  if (query.branchId) params.set("branchId", query.branchId);
  if (query.cashierId) params.set("cashierId", query.cashierId);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.productId) params.set("productId", query.productId);
  if (query.productQuery) params.set("product", query.productQuery);
  if (query.skuQuery) params.set("sku", query.skuQuery);
  if (query.status) params.set("status", query.status);
  if (query.sort) params.set("sort", query.sort);
  if (query.sort && query.dir) params.set("dir", query.dir);
  if (query.page > 1) params.set("page", String(query.page));
  if (query.rankMetric !== "units") params.set("metric", query.rankMetric);
  if (query.view === "slow") params.set("view", "slow");
  if (query.topN !== 20) params.set("topN", String(query.topN));
  if (query.includeZeroSales) params.set("includeZero", "1");
  return params;
}

export function productTableHref(
  pathname: string,
  query: ProductTableQuery,
  defaults: { datePreset: ProductTableDatePreset },
  overrides: Partial<ProductTableQuery> = {},
) {
  const params = productTableQueryToSearchParams({ ...query, ...overrides }, defaults);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function productTableExportHref(
  report: "sales" | "categories" | "performance",
  query: ProductTableQuery,
  defaults: { datePreset: ProductTableDatePreset },
) {
  const params = productTableQueryToSearchParams({ ...query, page: 1 }, defaults);
  params.delete("page");
  const search = params.toString();
  return search ? `/api/reports/products/${report}/export?${search}` : `/api/reports/products/${report}/export`;
}

export function selectProductTableRows<T>(sorted: T[], page: number, pageSize = PRODUCT_TABLE_PAGE_SIZE, allRows = false) {
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(sorted.length / size) || 1);
  const current = Math.min(Math.max(page, 1), pageCount);
  const start = (current - 1) * size;
  return {
    page: current,
    pageCount,
    rows: allRows ? sorted : sorted.slice(start, start + size),
  };
}
