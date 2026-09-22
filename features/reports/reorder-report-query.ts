import type { ReorderReason, ReorderTab } from "@/features/reports/reorder-report-math";
import { REORDER_REASONS, REORDER_TABS } from "@/features/reports/reorder-report-math";

export type ReorderTableQuery = {
  barcode?: string;
  branchId?: string;
  categoryId?: string;
  hasBarcode?: "all" | "yes" | "no";
  hasSupplier?: "all" | "yes" | "no";
  page: number;
  poStatus?: string;
  productSearch?: string;
  reason?: ReorderReason | "all";
  stockStatus?: "all" | "out_of_stock" | "low_stock";
  supplierId?: string;
  tab: ReorderTab;
  warehouseId?: string;
};

function first(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function asString(value: string | string[] | undefined) {
  const raw = first(value);
  return raw && String(raw).trim() ? String(raw).trim() : undefined;
}

function asPage(value: string | string[] | undefined) {
  const n = Number(first(value) ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function parseReorderTableQuery(
  searchParams?: Record<string, string | string[] | undefined>,
  defaults?: Partial<ReorderTableQuery>,
): ReorderTableQuery {
  const tabRaw = asString(searchParams?.tab) ?? defaults?.tab ?? "need";
  const tab = (REORDER_TABS as readonly string[]).includes(tabRaw) ? (tabRaw as ReorderTab) : "need";
  const reasonRaw = asString(searchParams?.reason) ?? "all";
  const reason =
    reasonRaw === "all" || (REORDER_REASONS as readonly string[]).includes(reasonRaw)
      ? (reasonRaw as ReorderReason | "all")
      : "all";
  const stockRaw = asString(searchParams?.stockStatus) ?? "all";
  const stockStatus =
    stockRaw === "out_of_stock" || stockRaw === "low_stock" || stockRaw === "all" ? stockRaw : "all";
  const hasBarcodeRaw = asString(searchParams?.hasBarcode) ?? "all";
  const hasBarcode = hasBarcodeRaw === "yes" || hasBarcodeRaw === "no" || hasBarcodeRaw === "all" ? hasBarcodeRaw : "all";
  const hasSupplierRaw = asString(searchParams?.hasSupplier) ?? "all";
  const hasSupplier =
    hasSupplierRaw === "yes" || hasSupplierRaw === "no" || hasSupplierRaw === "all" ? hasSupplierRaw : "all";

  return {
    barcode: asString(searchParams?.barcode) ?? defaults?.barcode,
    branchId: asString(searchParams?.branchId) ?? defaults?.branchId,
    categoryId: asString(searchParams?.categoryId) ?? defaults?.categoryId,
    hasBarcode,
    hasSupplier,
    page: asPage(searchParams?.page),
    poStatus: asString(searchParams?.poStatus) ?? defaults?.poStatus,
    productSearch: asString(searchParams?.q) ?? asString(searchParams?.productSearch) ?? defaults?.productSearch,
    reason,
    stockStatus,
    supplierId: asString(searchParams?.supplierId) ?? defaults?.supplierId,
    tab,
    warehouseId: asString(searchParams?.warehouseId) ?? defaults?.warehouseId,
  };
}

export function reorderTableHref(query: Partial<ReorderTableQuery>) {
  const params = new URLSearchParams();
  if (query.tab) params.set("tab", query.tab);
  if (query.branchId) params.set("branchId", query.branchId);
  if (query.warehouseId) params.set("warehouseId", query.warehouseId);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.supplierId) params.set("supplierId", query.supplierId);
  if (query.reason && query.reason !== "all") params.set("reason", query.reason);
  if (query.stockStatus && query.stockStatus !== "all") params.set("stockStatus", query.stockStatus);
  if (query.hasBarcode && query.hasBarcode !== "all") params.set("hasBarcode", query.hasBarcode);
  if (query.hasSupplier && query.hasSupplier !== "all") params.set("hasSupplier", query.hasSupplier);
  if (query.productSearch) params.set("q", query.productSearch);
  if (query.barcode) params.set("barcode", query.barcode);
  if (query.poStatus) params.set("poStatus", query.poStatus);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const qs = params.toString();
  return qs ? `/reports/inventory/reorder?${qs}` : "/reports/inventory/reorder";
}

export function reorderExportHref(tab: ReorderTab, query: Partial<ReorderTableQuery>) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (query.branchId) params.set("branchId", query.branchId);
  if (query.warehouseId) params.set("warehouseId", query.warehouseId);
  if (query.categoryId) params.set("categoryId", query.categoryId);
  if (query.supplierId) params.set("supplierId", query.supplierId);
  if (query.reason && query.reason !== "all") params.set("reason", query.reason);
  if (query.stockStatus && query.stockStatus !== "all") params.set("stockStatus", query.stockStatus);
  if (query.hasBarcode && query.hasBarcode !== "all") params.set("hasBarcode", query.hasBarcode);
  if (query.hasSupplier && query.hasSupplier !== "all") params.set("hasSupplier", query.hasSupplier);
  if (query.productSearch) params.set("q", query.productSearch);
  if (query.barcode) params.set("barcode", query.barcode);
  if (query.poStatus) params.set("poStatus", query.poStatus);
  return `/api/reports/inventory/reorder/export?${params.toString()}`;
}
