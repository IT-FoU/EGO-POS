import {
  INVENTORY_STOCK_STATUSES,
  INVENTORY_TABLE_PAGE_SIZE,
  type InventoryStockStatusFilter,
} from "@/features/reports/inventory-table-math";

export type InventoryTableSortDir = "asc" | "desc";

export type InventoryTableQuery = {
  branchId?: string;
  categoryId?: string;
  dir: InventoryTableSortDir;
  page: number;
  productId?: string;
  productQuery?: string;
  skuQuery?: string;
  sort?: string;
  status: InventoryStockStatusFilter;
  supplierId?: string;
  warehouseId?: string;
};

const ALL = "all";

function firstParam(input: Record<string, string | string[] | undefined>, key: string) {
  const value = input[key];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parsePage(value: string) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parseStatus(value: string, fallback: InventoryStockStatusFilter): InventoryStockStatusFilter {
  if ((INVENTORY_STOCK_STATUSES as readonly string[]).includes(value)) {
    return value as InventoryStockStatusFilter;
  }
  return fallback;
}

export function parseInventoryTableQuery(
  input: Record<string, string | string[] | undefined> | undefined,
  defaults: { status: InventoryStockStatusFilter },
): InventoryTableQuery {
  const get = (key: string) => firstParam(input ?? {}, key).trim();
  return {
    branchId: get("branchId") && get("branchId") !== ALL ? get("branchId") : undefined,
    categoryId: get("categoryId") && get("categoryId") !== ALL ? get("categoryId") : undefined,
    dir: get("dir") === "asc" ? "asc" : "desc",
    page: parsePage(get("page")),
    productId: get("productId") || undefined,
    productQuery: get("q") || get("productQuery") || undefined,
    skuQuery: get("sku") || get("skuQuery") || undefined,
    sort: get("sort") || undefined,
    status: parseStatus(get("status"), defaults.status),
    supplierId: get("supplierId") && get("supplierId") !== ALL ? get("supplierId") : undefined,
    warehouseId: get("warehouseId") && get("warehouseId") !== ALL ? get("warehouseId") : undefined,
  };
}

export function inventoryTableHref(
  pathname: string,
  query: InventoryTableQuery,
  patch: Partial<InventoryTableQuery> = {},
) {
  const next = { ...query, ...patch };
  const params = new URLSearchParams();
  if (next.branchId) params.set("branchId", next.branchId);
  if (next.warehouseId) params.set("warehouseId", next.warehouseId);
  if (next.categoryId) params.set("categoryId", next.categoryId);
  if (next.supplierId) params.set("supplierId", next.supplierId);
  if (next.productQuery) params.set("q", next.productQuery);
  if (next.skuQuery) params.set("sku", next.skuQuery);
  if (next.status && next.status !== "all") params.set("status", next.status);
  if (next.productId) params.set("productId", next.productId);
  if (next.sort) params.set("sort", next.sort);
  if (next.dir === "asc") params.set("dir", "asc");
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function inventoryTableExportHref(pathname: string, query: InventoryTableQuery) {
  return inventoryTableHref(pathname, { ...query, page: 1 });
}

export { INVENTORY_TABLE_PAGE_SIZE };
