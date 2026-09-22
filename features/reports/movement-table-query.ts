import {
  endOfBusinessDay,
  parseBusinessDate,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
} from "@/lib/datetime/business-timezone";
import {
  MOVEMENT_REPORT_KINDS,
  MOVEMENT_TABLE_PAGE_SIZE,
  type MovementReportKindFilter,
} from "@/features/reports/movement-table-math";

export type MovementTableDatePreset = "today" | "yesterday" | "this_week" | "this_month" | "custom";
export type MovementTableSortDir = "asc" | "desc";

export type MovementTableQuery = {
  actorId?: string;
  branchId?: string;
  categoryId?: string;
  date?: string;
  dateFrom?: Date | string;
  datePreset: MovementTableDatePreset;
  dateTo?: Date | string;
  dir: MovementTableSortDir;
  movementKind: MovementReportKindFilter;
  page: number;
  productId?: string;
  productQuery?: string;
  referenceType?: string;
  skuQuery?: string;
  sort?: string;
  warehouseId?: string;
};

const ALL = "all";

function firstParam(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parseDatePreset(value: string, fallback: MovementTableDatePreset): MovementTableDatePreset {
  if (value === "today" || value === "yesterday" || value === "this_week" || value === "this_month" || value === "custom") {
    return value;
  }
  return fallback;
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseKind(value: string): MovementReportKindFilter {
  if ((MOVEMENT_REPORT_KINDS as readonly string[]).includes(value)) {
    return value as MovementReportKindFilter;
  }
  return "all";
}

export function resolveMovementTableRange(
  query: Pick<MovementTableQuery, "date" | "dateFrom" | "datePreset" | "dateTo">,
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

export function parseMovementTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { datePreset: MovementTableDatePreset },
): MovementTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  const rawPreset = get("datePreset");
  const locked =
    rawPreset === "today" || rawPreset === "yesterday" || rawPreset === "this_week" || rawPreset === "this_month";
  const datePreset = parseDatePreset(rawPreset, defaults.datePreset);
  const dateFromRaw = get("dateFrom") || get("from");
  const dateToRaw = get("dateTo") || get("to");
  return {
    actorId: get("actorId") && get("actorId") !== ALL ? get("actorId") : undefined,
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    categoryId: get("categoryId") && get("categoryId") !== ALL ? get("categoryId") : undefined,
    date: locked ? undefined : get("date") || undefined,
    dateFrom: !locked && dateFromRaw ? parseBusinessDate(dateFromRaw) ?? dateFromRaw : undefined,
    datePreset: locked ? datePreset : dateFromRaw || dateToRaw ? "custom" : datePreset,
    dateTo: !locked && dateToRaw ? parseBusinessDate(dateToRaw) ?? dateToRaw : undefined,
    dir: get("dir") === "asc" ? "asc" : "desc",
    movementKind: parseKind(get("movementKind") || get("type") || "all"),
    page: parsePage(get("page")),
    productId: get("productId") || undefined,
    productQuery: get("q") || get("productQuery") || undefined,
    referenceType: get("referenceType") && get("referenceType") !== ALL ? get("referenceType") : undefined,
    skuQuery: get("sku") || get("skuQuery") || undefined,
    sort: get("sort") || undefined,
    warehouseId: get("warehouseId") && get("warehouseId") !== ALL ? get("warehouseId") : undefined,
  };
}

export function movementTableHref(
  pathname: string,
  query: MovementTableQuery,
  patch: Partial<MovementTableQuery> = {},
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
  if (next.warehouseId) params.set("warehouseId", next.warehouseId);
  if (next.categoryId) params.set("categoryId", next.categoryId);
  if (next.productQuery) params.set("q", next.productQuery);
  if (next.skuQuery) params.set("sku", next.skuQuery);
  if (next.productId) params.set("productId", next.productId);
  if (next.movementKind && next.movementKind !== "all") params.set("movementKind", next.movementKind);
  if (next.referenceType) params.set("referenceType", next.referenceType);
  if (next.actorId) params.set("actorId", next.actorId);
  if (next.sort) params.set("sort", next.sort);
  if (next.dir === "asc") params.set("dir", "asc");
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function movementTableExportHref(pathname: string, query: MovementTableQuery) {
  return movementTableHref(pathname, { ...query, page: 1 });
}

export { MOVEMENT_TABLE_PAGE_SIZE };
