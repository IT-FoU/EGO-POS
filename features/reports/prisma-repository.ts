import { prisma } from "@/lib/db/prisma";
import { mapPrismaCustomer } from "@/features/customers/dto-mapper";
import { mapPrismaInventoryBalance } from "@/features/inventory/dto-mapper";
import { mapPrismaSupplier, mapPrismaSupplierPurchaseOrder } from "@/features/suppliers/dto-mapper";
import { buildAnalyticsHub, type CategoryBreakdownRow } from "@/features/reports/build-analytics-hub";
import { buildReportAnalytics } from "@/features/reports/dto-mapper";
import type { ReportFilterOptions, ReportFilters } from "@/features/reports/report-filters";
import { resolveReportDateRange } from "@/features/reports/report-filters";
import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import {
  businessDayLabel,
  businessHour,
  businessMonthLabel,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
  startOfBusinessYear,
} from "@/lib/datetime/business-timezone";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
import type { InventoryItem } from "@/features/inventory/types";
import type { Product } from "@/features/products/types";
import type { SupplierPurchaseOrder, SupplierReceiving } from "@/features/suppliers/types";
import type {
  ProductReportRow,
  PurchaseTrendPoint,
  ReportDataQuality,
  ReportDataQualityWarning,
  SalesMetric,
  SupplierPayableSummary,
  TrendPoint,
} from "@/features/reports/types";

const db = prisma as any;

function logPrismaQueryFailure(functionName: string, queryName: string, error: unknown, critical: boolean) {
  const message = error instanceof Error ? error.message : String(error);
  const log = critical ? console.error : console.warn;
  log(`[${functionName}] ${queryName} failed: ${message}`);
}

type ReportQueryResult<T> =
  | { critical: boolean; ok: true; scope: string; value: T }
  | { critical: boolean; ok: false; scope: string; warning: ReportDataQualityWarning };

async function settleReportQuery<T>(
  scope: string,
  critical: boolean,
  queryFn: () => Promise<T>,
): Promise<ReportQueryResult<T>> {
  try {
    return { critical, ok: true, scope, value: await queryFn() };
  } catch (error) {
    logPrismaQueryFailure("getPrismaReportsSnapshot", scope, error, critical);
    return {
      critical,
      ok: false,
      scope,
      warning: {
        code: critical ? "reports_critical_query_failed" : "reports_secondary_query_failed",
        message: critical
          ? "A critical reports query failed. KPI values from this snapshot should be treated as unavailable."
          : "A secondary reports query failed. Some report lists or supporting charts may be incomplete.",
        scope,
        severity: critical ? "error" : "warning",
      },
    };
  }
}

function resultOrFallback<T>(result: ReportQueryResult<unknown>, fallbackValue: T): T {
  return result.ok ? result.value as T : fallbackValue;
}

function buildReportDataQuality(results: Array<ReportQueryResult<unknown>>): ReportDataQuality {
  const warnings = results.flatMap((result) => (result.ok ? [] : [result.warning]));
  const failedScopes = warnings.map((warning) => warning.scope);
  const criticalFailed = results.some((result) => result.critical && !result.ok);

  return {
    failedScopes,
    status: criticalFailed ? "unavailable" : warnings.length > 0 ? "partial" : "complete",
    warnings,
  };
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function netReportLifecycle(refunds: Array<Record<string, any>>, saleItems: Array<Record<string, any>>) {
  const itemById = new Map(saleItems.map((item) => [String(item.id), item]));
  const net = { cogsLak: 0, profitLak: 0, quantitySold: 0, revenueLak: 0 };
  for (const refund of refunds) {
    const kind = String(refund.kind ?? "refund");
    const refundAmt = amount(refund.refundAmount) || (kind === "refund" ? amount(refund.totalAmount) : 0);
    if (kind === "refund") {
      net.revenueLak -= refundAmt;
    } else {
      net.revenueLak += amount(refund.paymentAmount) - refundAmt;
    }
    for (const row of refund.items ?? []) {
      const qty = amount(row.quantity);
      const item = itemById.get(String(row.saleItemId));
      net.quantitySold -= qty;
      if (item) {
        net.cogsLak -= amount(item.costPrice) * qty;
        const originalQty = amount(item.quantity) || 1;
        net.profitLak -= amount(item.profitAmount) * (qty / originalQty);
      }
    }
    for (const row of refund.exchangeItems ?? []) {
      const qty = amount(row.quantity);
      const lineTotal = amount(row.totalAmount);
      const lineCost = amount(row.costPrice) * qty;
      net.quantitySold += qty;
      net.cogsLak += lineCost;
      net.profitLak += lineTotal - lineCost;
    }
  }
  return net;
}

function refundAmountOf(refund: Record<string, any>) {
  const kind = String(refund.kind ?? "refund");
  return amount(refund.refundAmount) || (kind === "refund" ? amount(refund.totalAmount) : 0);
}

function groupRefundsBySaleId(refunds: Array<Record<string, any>>) {
  const grouped = new Map<string, Array<Record<string, any>>>();
  for (const refund of refunds) {
    const saleId = String(refund.saleId ?? "");
    if (!saleId) continue;
    const current = grouped.get(saleId) ?? [];
    current.push(refund);
    grouped.set(saleId, current);
  }
  return grouped;
}

function applyLifecycleToSaleRows(
  sales: Array<Record<string, any>>,
  refunds: Array<Record<string, any>>,
  saleItems: Array<Record<string, any>>,
) {
  const refundsBySale = groupRefundsBySaleId(refunds);
  return sales.map((row) => {
    const net = netReportLifecycle(refundsBySale.get(String(row.id)) ?? [], saleItems);
    return {
      ...row,
      profitAmount: amount(row.profitAmount) + net.profitLak,
      totalAmount: amount(row.totalAmount) + net.revenueLak,
    };
  });
}

function buildNettedProductTotals(saleItems: Array<Record<string, any>>, refunds: Array<Record<string, any>>) {
  const itemById = new Map(saleItems.map((item) => [String(item.id), item]));
  const totals = new Map<string, { profitLak: number; quantitySold: number; revenueLak: number }>();
  const bump = (productId: string, delta: { profitLak: number; quantitySold: number; revenueLak: number }) => {
    if (!productId) return;
    const current = totals.get(productId) ?? { profitLak: 0, quantitySold: 0, revenueLak: 0 };
    current.profitLak += delta.profitLak;
    current.quantitySold += delta.quantitySold;
    current.revenueLak += delta.revenueLak;
    totals.set(productId, current);
  };

  for (const item of saleItems) {
    bump(String(item.productId ?? ""), {
      profitLak: amount(item.profitAmount),
      quantitySold: amount(item.quantity),
      revenueLak: amount(item.totalAmount),
    });
  }

  for (const refund of refunds) {
    for (const row of refund.items ?? []) {
      const qty = amount(row.quantity);
      const item = itemById.get(String(row.saleItemId));
      const originalQty = amount(item?.quantity) || 1;
      bump(String(row.productId || item?.productId || ""), {
        profitLak: item ? -amount(item.profitAmount) * (qty / originalQty) : 0,
        quantitySold: -qty,
        revenueLak: amount(row.amount)
          ? -amount(row.amount)
          : item
            ? -amount(item.totalAmount) * (qty / originalQty)
            : 0,
      });
    }
    for (const row of refund.exchangeItems ?? []) {
      const qty = amount(row.quantity);
      const lineTotal = amount(row.totalAmount);
      const lineCost = amount(row.costPrice) * qty;
      bump(String(row.productId ?? ""), {
        profitLak: lineTotal - lineCost,
        quantitySold: qty,
        revenueLak: lineTotal,
      });
    }
  }

  return totals;
}

function paymentTotalsFromRows(paymentRows: Array<Record<string, any>>) {
  const totals = new Map<string, number>();
  for (const row of paymentRows) {
    const method = String(row.paymentMethod ?? "cash");
    const net = method === "cash"
      ? amount(row.amount) - amount(row.changeAmount)
      : amount(row.amount);
    totals.set(method, (totals.get(method) ?? 0) + net);
  }
  return Array.from(totals.entries()).map(([paymentMethod, value]) => ({
    paymentMethod,
    _sum: { amount: value },
  }));
}

function netPaymentGroups(paymentGroups: Array<Record<string, any>>, refunds: Array<Record<string, any>>) {
  const totals = new Map<string, number>();
  for (const row of paymentGroups) {
    const method = String(row.paymentMethod ?? "cash");
    totals.set(method, (totals.get(method) ?? 0) + amount(row._sum?.amount));
  }
  for (const refund of refunds) {
    const method = String(refund.refundMethod ?? "cash");
    const kind = String(refund.kind ?? "refund");
    totals.set(method, (totals.get(method) ?? 0) - refundAmountOf(refund));
    if (kind === "exchange") {
      totals.set(method, (totals.get(method) ?? 0) + amount(refund.paymentAmount));
    }
  }
  return Array.from(totals.entries()).map(([paymentMethod, value]) => ({
    paymentMethod,
    _sum: { amount: value },
  }));
}

function clampReportFilters(scope: BranchScope, filters: ReportFilters): ReportFilters {
  const next = { ...filters };
  if (!scope.isOwner) {
    next.branchId = scope.branchId;
    if (next.warehouseId && !scope.warehouseIds.includes(next.warehouseId)) {
      next.warehouseId = scope.warehouseId;
    }
    return next;
  }
  if (next.branchId && !scope.branchIds.includes(next.branchId)) {
    next.branchId = scope.branchId;
  }
  if (next.warehouseId && !scope.warehouseIds.includes(next.warehouseId)) {
    next.warehouseId = scope.warehouseId;
  }
  return next;
}

function monthLabel(value: Date) {
  return businessMonthLabel(value);
}

function dayLabel(value: Date) {
  return businessDayLabel(value);
}

function resolveEffectiveFilters(filters?: ReportFilters): ReportFilters {
  const preset = filters?.datePreset ?? "this_month";
  const presetRange = resolveReportDateRange(preset);
  return {
    datePreset: preset,
    ...filters,
    dateFrom: filters?.dateFrom ?? presetRange.dateFrom,
    dateTo: filters?.dateTo ?? presetRange.dateTo,
  };
}

function buildSaleWhere(
  scope: { branchId: string; companyId: string },
  filters: ReportFilters,
) {
  const where: Record<string, unknown> = {
    branchId: filters.branchId ?? scope.branchId,
    companyId: scope.companyId,
    saleStatus: { in: [...REPORT_SALE_STATUSES] },
  };

  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  if (filters.customerId) {
    where.customerId = filters.customerId;
  }

  if (filters.cashierId) {
    where.createdBy = filters.cashierId;
  }

  if (filters.paymentMethod) {
    where.payments = { some: { paymentMethod: filters.paymentMethod } };
  }

  return where;
}

function buildSaleItemWhere(saleFilter: Record<string, unknown>, filters: ReportFilters) {
  const where: Record<string, unknown> = { sale: saleFilter };
  if (filters.categoryId) {
    where.product = { categoryId: filters.categoryId };
  }
  return where;
}

function buildPurchaseWhere(
  scope: { companyId: string; warehouseIds: string[] },
  filters: ReportFilters,
) {
  const warehouseFilter = filters.warehouseId
    ? filters.warehouseId
    : { in: scope.warehouseIds };

  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    status: { not: "cancelled" },
    warehouseId: warehouseFilter,
  };

  if (filters.supplierId) {
    where.supplierId = filters.supplierId;
  }

  if (filters.dateFrom || filters.dateTo) {
    where.purchaseDate = {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    };
  }

  return where;
}

function filterInventoryByWarehouse(items: InventoryItem[], filters: ReportFilters): InventoryItem[] {
  if (!filters.warehouseId) return items;
  return items.filter((item) => item.warehouseId === filters.warehouseId);
}

function filterPurchaseOrders(orders: SupplierPurchaseOrder[], filters: ReportFilters): SupplierPurchaseOrder[] {
  return orders.filter((order) => {
    if (filters.supplierId && order.supplierId !== filters.supplierId) return false;
    if (!filters.dateFrom && !filters.dateTo) return true;
    const purchaseDate = order.purchaseDate ? new Date(order.purchaseDate) : undefined;
    if (!purchaseDate) return true;
    if (filters.dateFrom && purchaseDate < filters.dateFrom) return false;
    if (filters.dateTo && purchaseDate > filters.dateTo) return false;
    return true;
  });
}

function formatCustomerFilterLabel(row: {
  customerCode?: string | null;
  fullName: string;
  phone?: string | null;
}) {
  if (row.customerCode) {
    return `${row.fullName} (${row.customerCode})`;
  }
  if (row.phone) {
    return `${row.fullName} (${row.phone})`;
  }
  return row.fullName;
}

function reportsLoadTimingEnabled() {
  return process.env.IGO_REPORTS_LOAD_TIMING === "1";
}

async function timedReportsLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!reportsLoadTimingEnabled()) {
    return fn();
  }
  const started = Date.now();
  try {
    return await fn();
  } finally {
    console.info(`[reports-load] ${label} ${Date.now() - started}ms`);
  }
}

function slimReportProduct(row: Record<string, any>): Product {
  return {
    barcode: String(row.barcode ?? ""),
    brandName: "",
    categoryId: String(row.categoryId ?? ""),
    categoryName: row.category?.nameEn || row.category?.nameLo || "Uncategorized",
    costPriceLak: 0,
    id: String(row.id),
    minStock: 0,
    nameEn: String(row.nameEn ?? ""),
    nameLo: String(row.nameLo ?? ""),
    sellingPriceLak: 0,
    sku: String(row.sku ?? ""),
    status: "active",
    supplierName: "",
    units: [],
    updatedAt: "",
  };
}

function lastSaleByProduct(rows: Array<{ productId: string; sale: { createdAt: Date } }>) {
  const map = new Map<string, Date>();
  for (const row of rows) {
    if (!map.has(row.productId)) {
      map.set(row.productId, row.sale.createdAt);
    }
  }
  return map;
}

function toReportFilterOptions(
  scope: BranchScope,
  lookups: {
    branches: Array<{ id: string; name: string }>;
    cashiers: Array<{ fullName: string; id: string; username: string }>;
    categories: Array<{ id: string; nameEn: string; nameLo: string }>;
    customers: Array<{ customerCode: string | null; fullName: string; id: string; phone: string | null }>;
    suppliers: Array<{ companyName?: string | null; id: string; name: string }>;
    warehouses: Array<{ id: string; name: string }>;
  },
): ReportFilterOptions {
  const scopedBranches = scope.isOwner
    ? lookups.branches
    : lookups.branches.filter((row) => row.id === scope.branchId);

  return {
    branches: scopedBranches.map((row) => ({ id: row.id, label: row.name })),
    cashiers: lookups.cashiers.map((row) => ({
      id: row.id,
      label: row.fullName || row.username,
    })),
    categories: lookups.categories.map((row) => ({
      id: row.id,
      label: row.nameEn || row.nameLo || row.id,
    })),
    customers: lookups.customers.slice(0, 200).map((row) => ({
      id: row.id,
      label: formatCustomerFilterLabel(row),
    })),
    suppliers: lookups.suppliers.map((row) => ({
      id: row.id,
      label: row.companyName || row.name,
    })),
    warehouses: lookups.warehouses.map((row) => ({ id: row.id, label: row.name })),
  };
}

export async function getReportFilterOptions(tenant: TenantContext, client: any = db): Promise<ReportFilterOptions> {
  const scope = await resolveTenantScope(tenant, client);
  const [branches, warehouses, categories, suppliers, customers, cashiers] = await Promise.all([
    client.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { companyId: scope.companyId },
    }),
    client.warehouse.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    }),
    client.category.findMany({
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameLo: true },
      where: { companyId: scope.companyId },
    }),
    client.supplier.findMany({
      orderBy: { name: "asc" },
      select: { companyName: true, id: true, name: true },
      where: { companyId: scope.companyId },
    }),
    client.customer.findMany({
      orderBy: { fullName: "asc" },
      select: { customerCode: true, fullName: true, id: true, phone: true },
      take: 200,
      where: { companyId: scope.companyId },
    }),
    client.user.findMany({
      orderBy: { username: "asc" },
      select: { fullName: true, id: true, username: true },
      where: { companies: { some: { companyId: scope.companyId } } },
    }),
  ]);

  return toReportFilterOptions(scope, {
    branches,
    cashiers,
    categories,
    customers,
    suppliers,
    warehouses,
  });
}

function reportPaymentLabel(method: string) {
  if (method === "visa" || method === "card") return "Card";
  if (method === "transfer") return "Transfer";
  if (method === "qr") return "QR";
  return "Cash";
}

export type DashboardSalesKpis = {
  cogsLak: number;
  discountLak: number;
  grossSalesLak: number;
  itemsSold: number;
  missingSaleLineCosts: boolean;
  nettedSales: Array<{
    createdAt: Date;
    id: string;
    paymentMethod: string;
    profitAmount: number;
    saleNo: string;
    saleStatus: string;
    totalAmount: number;
  }>;
  paymentBreakdown: Array<{ label: string; totalLak: number }>;
  paymentRows: Array<{ amount: unknown; changeAmount: unknown; paymentMethod: string; saleId: string }>;
  productRows: Array<{ name: string; quantity: number; totalLak: number }>;
  refundLak: number;
  totalProfit: number;
  totalRevenue: number;
  totalTransactions: number;
};

export function assembleDashboardSalesKpis(input: {
  paymentRows: DashboardSalesKpis["paymentRows"];
  products: Array<{ id: string; nameEn: string; nameLo: string }>;
  refundRows: Array<Record<string, any>>;
  saleItemCostRows: Array<Record<string, any>>;
  salesByPeriod: Array<Record<string, any>>;
}): DashboardSalesKpis {
  const { paymentRows, products, refundRows, saleItemCostRows, salesByPeriod } = input;
  const lifecycleNet = netReportLifecycle(refundRows, saleItemCostRows);
  const nettedSalesByPeriod = applyLifecycleToSaleRows(salesByPeriod, refundRows, saleItemCostRows);
  const grossSalesLak = salesByPeriod.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.totalAmount),
    0,
  );
  const discountLak = salesByPeriod.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.discountAmount),
    0,
  );
  const totalRevenue = grossSalesLak + lifecycleNet.revenueLak;
  const totalProfit = salesByPeriod.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.profitAmount),
    0,
  ) + lifecycleNet.profitLak;
  const totalCogsLak = saleItemCostRows.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.costPrice) * amount(row.quantity),
    0,
  ) + lifecycleNet.cogsLak;
  const itemsSold = saleItemCostRows.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.quantity),
    0,
  ) + lifecycleNet.quantitySold;
  const productById = new Map<string, { nameEn: string; nameLo: string }>(
    products.map((product) => [product.id, product]),
  );
  const nettedProductTotals = buildNettedProductTotals(saleItemCostRows, refundRows);
  const productRows = Array.from(nettedProductTotals.entries())
    .map(([productId, totals]) => {
      const product = productById.get(productId);
      return {
        name: product?.nameEn || product?.nameLo || productId,
        quantity: totals.quantitySold,
        totalLak: Math.round(totals.revenueLak),
      };
    })
    .sort((left, right) => right.totalLak - left.totalLak)
    .slice(0, 10);
  const nettedPaymentGroups = netPaymentGroups(paymentTotalsFromRows(paymentRows), refundRows);
  const paymentBreakdown = nettedPaymentGroups.map((row: Record<string, any>) => ({
    label: reportPaymentLabel(String(row.paymentMethod ?? "cash")),
    totalLak: Math.round(amount(row._sum.amount)),
  }));

  return {
    cogsLak: Math.round(totalCogsLak),
    discountLak,
    grossSalesLak,
    itemsSold,
    missingSaleLineCosts: saleItemCostRows.some(
      (row: Record<string, any>) => row.costPrice == null || !Number.isFinite(Number(row.costPrice)),
    ),
    nettedSales: nettedSalesByPeriod.map((row: Record<string, any>) => ({
      createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
      id: String(row.id),
      paymentMethod: String(row.payments?.[0]?.paymentMethod ?? "cash"),
      profitAmount: amount(row.profitAmount),
      saleNo: String(row.saleNo ?? ""),
      saleStatus: String(row.saleStatus ?? ""),
      totalAmount: amount(row.totalAmount),
    })),
    paymentBreakdown,
    paymentRows,
    productRows,
    refundLak: Math.round(refundRows.reduce((total: number, refund: Record<string, any>) => total + refundAmountOf(refund), 0)),
    totalProfit,
    totalRevenue,
    totalTransactions: salesByPeriod.length,
  };
}

export async function getPrismaDashboardSalesKpis(
  scope: BranchScope,
  range: { dateFrom: Date; dateTo: Date },
  client: any,
): Promise<DashboardSalesKpis> {
  const filters = clampReportFilters(scope, resolveEffectiveFilters({
    branchId: scope.branchId,
    dateFrom: range.dateFrom,
    datePreset: "custom",
    dateTo: range.dateTo,
    warehouseId: scope.warehouseId || undefined,
  }));
  const saleFilter = buildSaleWhere(scope, filters);
  const saleItemFilter = buildSaleItemWhere(saleFilter, filters);

  const [salesByPeriod, saleItemCostRows, refundRows, paymentRows, products] = await Promise.all([
    client.sale.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        discountAmount: true,
        id: true,
        profitAmount: true,
        saleNo: true,
        saleStatus: true,
        taxAmount: true,
        totalAmount: true,
        payments: { select: { paymentMethod: true }, take: 1 },
      },
      where: saleFilter,
    }),
    client.saleItem.findMany({
      select: {
        costPrice: true,
        id: true,
        productId: true,
        profitAmount: true,
        quantity: true,
        totalAmount: true,
      },
      where: saleItemFilter,
    }),
    client.refund.findMany({
      select: {
        exchangeItems: { select: { costPrice: true, productId: true, quantity: true, totalAmount: true } },
        items: { select: { amount: true, productId: true, quantity: true, saleItemId: true } },
        kind: true,
        paymentAmount: true,
        refundAmount: true,
        refundMethod: true,
        saleId: true,
        totalAmount: true,
      },
      where: { sale: saleFilter },
    }),
    client.salePayment.findMany({
      select: { amount: true, changeAmount: true, paymentMethod: true, saleId: true },
      where: { sale: saleFilter },
    }),
    client.product.findMany({
      select: { id: true, nameEn: true, nameLo: true },
      where: { companyId: scope.companyId },
    }),
  ]);

  return assembleDashboardSalesKpis({
    paymentRows,
    products,
    refundRows,
    saleItemCostRows,
    salesByPeriod,
  });
}

export async function getPrismaReportsSnapshot(
  tenant: TenantContext,
  rawFilters?: ReportFilters,
  client: any = db,
) {
  await timedReportsLoad("permission", () => assertPermission(tenant, READ_PERMISSIONS.reportsView, client));
  const scope = await timedReportsLoad("scope", () => resolveTenantScope(tenant, client));
  const filters = clampReportFilters(scope, resolveEffectiveFilters(rawFilters));
  const saleFilter = buildSaleWhere(scope, filters);
  const saleItemFilter = buildSaleItemWhere(saleFilter, filters);
  const purchaseFilter = buildPurchaseWhere(scope, filters);
  const now = new Date();
  const monthStart = startOfBusinessMonth(now);
  const weekStart = startOfBusinessWeek(now);
  const yearStart = startOfBusinessYear(now);
  const trendStart = new Date(startOfBusinessDay(now).getTime() - 6 * 86_400_000);

  const branchWhere = branchOwnedWhere(scope);

  const [
    salesByPeriodResult,
    saleItemCostRowsResult,
    refundRowsResult,
    purchasesByPeriodResult,
    paymentGroupsResult,
    payableGroupsResult,
    customersResult,
    productsResult,
    inventoryResult,
    lastSaleRowsResult,
    suppliersResult,
    branchesResult,
    warehousesResult,
    categoriesResult,
    cashiersResult,
  ] = await timedReportsLoad("parallel-reads", () => Promise.all([
    settleReportQuery("salesByPeriod", true, () => client.sale.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        discountAmount: true,
        id: true,
        profitAmount: true,
        taxAmount: true,
        totalAmount: true,
      },
      where: saleFilter,
    })),
    settleReportQuery("saleItemCostRows", true, () => client.saleItem.findMany({
      select: {
        costPrice: true,
        id: true,
        productId: true,
        profitAmount: true,
        quantity: true,
        totalAmount: true,
      },
      where: saleItemFilter,
    })),
    settleReportQuery("refundRows", true, () => client.refund.findMany({
      select: {
        exchangeItems: { select: { costPrice: true, productId: true, quantity: true, totalAmount: true } },
        items: { select: { amount: true, productId: true, quantity: true, saleItemId: true } },
        kind: true,
        paymentAmount: true,
        refundAmount: true,
        refundMethod: true,
        saleId: true,
        totalAmount: true,
      },
      where: { sale: saleFilter },
    })),
    settleReportQuery("purchasesByPeriod", false, () => client.purchase.findMany({
      orderBy: { purchaseDate: "asc" },
      select: {
        id: true,
        purchaseDate: true,
        purchaseNo: true,
        status: true,
        supplierId: true,
        totalAmount: true,
        warehouse: { select: { name: true } },
      },
      where: purchaseFilter,
    })),
    settleReportQuery("paymentGroups", false, () => client.salePayment.findMany({
      select: { amount: true, changeAmount: true, paymentMethod: true },
      where: { sale: saleFilter },
    })),
    settleReportQuery("payableGroups", false, () => client.supplierPayable.groupBy({
      by: ["supplierId"],
      _sum: { balanceAmount: true },
      where: { companyId: scope.companyId },
    })),
    settleReportQuery("customersSnapshot", false, () => client.customer.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        address: true,
        birthday: true,
        creditLimit: true,
        customerCode: true,
        email: true,
        fullName: true,
        id: true,
        loyaltyPointLedger: { select: { pointType: true, points: true } },
        membershipLevel: { select: { name: true } },
        notes: true,
        openingBalance: true,
        outstandingBalance: true,
        phone: true,
        pointsBalance: true,
        status: true,
        totalSpent: true,
      },
      where: { companyId: scope.companyId, ...branchWhere },
    })),
    settleReportQuery("productsSnapshot", false, () => client.product.findMany({
      select: {
        barcode: true,
        category: { select: { nameEn: true, nameLo: true } },
        categoryId: true,
        id: true,
        nameEn: true,
        nameLo: true,
        sku: true,
      },
      where: { companyId: scope.companyId },
    })),
    settleReportQuery("inventorySnapshot", true, () => client.inventoryBalance.findMany({
      select: {
        id: true,
        product: {
          select: {
            barcode: true,
            category: { select: { nameEn: true, nameLo: true } },
            costPriceLak: true,
            imageUrl: true,
            inventoryLots: {
              orderBy: { expiryDate: "asc" },
              select: { expiryDate: true, receivedAt: true },
              take: 1,
            },
            minStock: true,
            nameEn: true,
            nameLo: true,
            productCode: true,
            sku: true,
            supplier: { select: { companyName: true, name: true } },
            supplierId: true,
            units: {
              select: {
                barcode: true,
                conversionQty: true,
                costPriceLak: true,
                id: true,
                imageUrl: true,
                isBaseUnit: true,
                isPurchaseUnit: true,
                status: true,
                unitName: true,
              },
            },
          },
        },
        productId: true,
        quantity: true,
        updatedAt: true,
        warehouseId: true,
      },
      where: { companyId: scope.companyId, warehouseId: { in: scope.warehouseIds } },
    })),
    settleReportQuery("lastSaleRows", false, () => client.saleItem.findMany({
      orderBy: { sale: { createdAt: "desc" } },
      select: { productId: true, sale: { select: { createdAt: true } } },
      where: {
        sale: {
          branchId: scope.branchId,
          companyId: scope.companyId,
          saleStatus: { in: [...REPORT_SALE_STATUSES] },
        },
      },
    })),
    settleReportQuery("suppliersSnapshot", false, () => client.supplier.findMany({
      orderBy: { name: "asc" },
      where: { companyId: scope.companyId, ...branchWhere },
    })),
    settleReportQuery("filterBranches", false, () => client.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { companyId: scope.companyId },
    })),
    settleReportQuery("filterWarehouses", false, () => client.warehouse.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    })),
    settleReportQuery("filterCategories", false, () => client.category.findMany({
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameLo: true },
      where: { companyId: scope.companyId },
    })),
    settleReportQuery("filterCashiers", false, () => client.user.findMany({
      orderBy: { username: "asc" },
      select: { fullName: true, id: true, username: true },
      where: { companies: { some: { companyId: scope.companyId } } },
    })),
  ]));

  const customerRows = resultOrFallback(customersResult, [] as Array<Record<string, any>>);
  const productRowsRaw = resultOrFallback(productsResult, [] as Array<Record<string, any>>);
  const inventoryBalances = resultOrFallback(inventoryResult, [] as Array<Record<string, any>>);
  const lastSaleRows = resultOrFallback(lastSaleRowsResult, [] as Array<{ productId: string; sale: { createdAt: Date } }>);
  const supplierRows = resultOrFallback(suppliersResult, [] as Array<Record<string, any>>);
  const salesByPeriod: Array<Record<string, any>> = resultOrFallback(salesByPeriodResult, []);
  const saleItemCostRows: Array<Record<string, any>> = resultOrFallback(saleItemCostRowsResult, []);
  const refundRows: Array<Record<string, any>> = resultOrFallback(refundRowsResult, []);
  const purchasesByPeriod: Array<Record<string, any>> = resultOrFallback(purchasesByPeriodResult, []);
  const paymentRows: Array<Record<string, any>> = resultOrFallback(paymentGroupsResult, []);
  const payableGroups: Array<Record<string, any>> = resultOrFallback(payableGroupsResult, []);
  const dataQuality = buildReportDataQuality([
    salesByPeriodResult,
    saleItemCostRowsResult,
    refundRowsResult,
    purchasesByPeriodResult,
    paymentGroupsResult,
    payableGroupsResult,
    customersResult,
    productsResult,
    inventoryResult,
    lastSaleRowsResult,
    suppliersResult,
    branchesResult,
    warehousesResult,
    categoriesResult,
    cashiersResult,
  ]);

  const customers = customerRows.map((row: Record<string, any>) => mapPrismaCustomer(row));
  const products = productRowsRaw.map((row: Record<string, any>) => slimReportProduct(row));
  const lastSaleMap = lastSaleByProduct(lastSaleRows);
  const nowMs = now.getTime();
  const mappedInventory: InventoryItem[] = inventoryBalances.map((balance: Record<string, any>) => {
    const item = mapPrismaInventoryBalance(balance);
    const lastSale = lastSaleMap.get(String(balance.productId));
    const daysWithoutSale = lastSale
      ? Math.max(0, Math.floor((nowMs - lastSale.getTime()) / 86_400_000))
      : item.quantity > 0
        ? 999
        : 0;
    return {
      ...item,
      daysWithoutSale,
    };
  });
  const suppliers = supplierRows.map((row: Record<string, any>) => mapPrismaSupplier(row));
  const supplierPurchaseOrdersAll: SupplierPurchaseOrder[] = purchasesByPeriod.map((row) =>
    mapPrismaSupplierPurchaseOrder(row),
  );

  const lifecycleNet = netReportLifecycle(refundRows, saleItemCostRows);
  const nettedSalesByPeriod = applyLifecycleToSaleRows(salesByPeriod, refundRows, saleItemCostRows);
  const nettedPaymentGroups = netPaymentGroups(paymentTotalsFromRows(paymentRows), refundRows);
  const refundLak = refundRows.reduce((total, refund) => total + refundAmountOf(refund), 0);
  const grossSalesLak = salesByPeriod.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.totalAmount),
    0,
  );
  const discountLak = salesByPeriod.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.discountAmount),
    0,
  );
  const totalRevenue = grossSalesLak + lifecycleNet.revenueLak;
  const totalProfit = salesByPeriod.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.profitAmount),
    0,
  ) + lifecycleNet.profitLak;
  const totalCogsLak = saleItemCostRows.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.costPrice) * amount(row.quantity),
    0,
  ) + lifecycleNet.cogsLak;
  const itemsSold = saleItemCostRows.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.quantity),
    0,
  ) + lifecycleNet.quantitySold;
  const productById = new Map<string, Product>(products.map((product) => [product.id, product]));

  const payableBySupplier = new Map<string, number>(
    payableGroups.map((row: Record<string, any>) => [row.supplierId, amount(row._sum.balanceAmount)]),
  );
  const supplierPayables: SupplierPayableSummary[] = suppliers.map((supplier) => ({
    payableBalanceLak: payableBySupplier.get(supplier.id) ?? 0,
    supplierId: supplier.id,
  }));

  const nettedProductTotals = buildNettedProductTotals(saleItemCostRows, refundRows);
  const categoryTotals = new Map<string, CategoryBreakdownRow>();
  for (const [productId, totals] of nettedProductTotals.entries()) {
    const product = productById.get(productId);
    const category = product?.categoryName || "Uncategorized";
    const current = categoryTotals.get(category) ?? {
      category,
      margin: 0,
      profit: 0,
      revenue: 0,
      unitsSold: 0,
    };
    current.profit += totals.profitLak;
    current.revenue += totals.revenueLak;
    current.unitsSold += totals.quantitySold;
    categoryTotals.set(category, current);
  }
  const categoryBreakdown = Array.from(categoryTotals.values())
    .map((row) => ({
      ...row,
      margin: row.revenue > 0 ? Math.round((row.profit / row.revenue) * 1000) / 10 : 0,
      profit: Math.round(row.profit),
      revenue: Math.round(row.revenue),
      unitsSold: Math.round(row.unitsSold),
    }))
    .sort((left, right) => right.revenue - left.revenue);

  const analytics = buildReportAnalytics({
    categoryBreakdown: categoryBreakdown.map((row) => ({ label: row.category, value: row.revenue })),
    customerCount: customers.length,
    profitLak: totalProfit,
    revenueLak: totalRevenue,
    transactionCount: salesByPeriod.length,
  });

  const salesMetrics = buildSalesMetrics(nettedSalesByPeriod, { monthStart, weekStart, yearStart });
  const revenueTrend = buildRevenueTrend(nettedSalesByPeriod);
  const revenueProfitTrend = buildRevenueProfitTrend(nettedSalesByPeriod, trendStart);
  const hourlySales = buildHourlySales(nettedSalesByPeriod.filter((row: Record<string, any>) => row.createdAt >= monthStart));

  const productRows: ProductReportRow[] = Array.from(nettedProductTotals.entries())
    .map(([productId, totals]) => {
      const product = productById.get(productId);
      return {
        categoryName: product?.categoryName ?? "Uncategorized",
        productName: product?.nameEn || product?.nameLo || productId,
        profitLak: Math.round(totals.profitLak),
        quantitySold: totals.quantitySold,
        revenueLak: Math.round(totals.revenueLak),
      };
    })
    .sort((left, right) => right.revenueLak - left.revenueLak)
    .slice(0, 20);

  const purchaseTrend = buildPurchaseTrend(purchasesByPeriod);
  const supplierPurchaseOrders = filterPurchaseOrders(supplierPurchaseOrdersAll, filters);
  const supplierReceivings: SupplierReceiving[] = [];
  const inventoryItems = filterInventoryByWarehouse(mappedInventory, filters);
  const filterOptions = toReportFilterOptions(scope, {
    branches: resultOrFallback(branchesResult, []),
    cashiers: resultOrFallback(cashiersResult, []),
    categories: resultOrFallback(categoriesResult, []),
    customers: [...customers]
      .sort((left, right) => left.fullName.localeCompare(right.fullName))
      .slice(0, 200)
      .map((row) => ({
        customerCode: row.customerCode,
        fullName: row.fullName,
        id: row.id,
        phone: row.phone,
      })),
    suppliers: suppliers.map((row) => ({
      companyName: row.companyName,
      id: row.id,
      name: row.companyName,
    })),
    warehouses: resultOrFallback(warehousesResult, []),
  });

  const hub = buildAnalyticsHub({
    analytics,
    categoryBreakdown,
    inventoryItems,
    itemsSold,
    paymentBreakdown: nettedPaymentGroups.map((row: Record<string, any>) => ({
      method: String(row.paymentMethod ?? "cash"),
      value: amount(row._sum.amount),
    })),
    productRows,
    revenueProfitTrend,
    hourlySales,
    refundLak: Math.round(refundLak),
    discountLak: Math.round(discountLak),
    grossSalesLak: Math.round(grossSalesLak),
  });

  return {
    analytics,
    cogsLak: Math.round(totalCogsLak),
    customers,
    dataQuality,
    filterOptions,
    filters,
    grossSalesLak: Math.round(grossSalesLak),
    hub,
    inventoryItems,
    productRows,
    products,
    purchaseTrend,
    refundLak: Math.round(refundLak),
    revenueTrend,
    salesMetrics,
    supplierPayables,
    supplierPayments: [],
    supplierPurchaseOrders,
    supplierReceivings,
    suppliers,
  };
}

function buildRevenueTrend(rows: Array<Record<string, any>>): TrendPoint[] {
  const totals = new Map<string, { revenueLak: number; salesCount: number }>();
  for (const row of rows) {
    const label = monthLabel(row.createdAt);
    const current = totals.get(label) ?? { revenueLak: 0, salesCount: 0 };
    current.revenueLak += amount(row.totalAmount);
    current.salesCount += 1;
    totals.set(label, current);
  }

  return Array.from(totals, ([label, value]) => ({ label, ...value }));
}

function buildRevenueProfitTrend(rows: Array<Record<string, any>>, start: Date) {
  const totals = new Map<string, { profit: number; revenue: number; transactions: number }>();
  for (const row of rows) {
    if (row.createdAt < start) continue;
    const label = dayLabel(row.createdAt);
    const current = totals.get(label) ?? { profit: 0, revenue: 0, transactions: 0 };
    current.profit += amount(row.profitAmount);
    current.revenue += amount(row.totalAmount);
    current.transactions += 1;
    totals.set(label, current);
  }

  return Array.from(totals, ([label, value]) => ({
    label,
    profit: Math.round(value.profit),
    revenue: Math.round(value.revenue),
    transactions: value.transactions,
  }));
}

function buildHourlySales(rows: Array<Record<string, any>>) {
  const totals = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    profitLak: 0,
    revenueLak: 0,
    transactions: 0,
  }));

  for (const row of rows) {
    const hour = businessHour(row.createdAt);
    totals[hour].transactions += 1;
    totals[hour].revenueLak += amount(row.totalAmount);
    totals[hour].profitLak += amount(row.profitAmount);
  }

  return totals;
}

function buildSalesMetrics(
  rows: Array<Record<string, any>>,
  ranges: { monthStart: Date; weekStart: Date; yearStart: Date },
): SalesMetric[] {
  const summarize = (filtered: Array<Record<string, any>>, label: string, period: SalesMetric["period"]) => {
    const revenue = filtered.reduce((total, row) => total + amount(row.totalAmount), 0);
    const profit = filtered.reduce((total, row) => total + amount(row.profitAmount), 0);
    const tax = filtered.reduce((total, row) => total + amount(row.taxAmount), 0);
    return {
      label,
      period,
      profitLak: Math.round(profit),
      revenueLak: Math.round(revenue),
      taxLak: Math.round(tax),
      transactions: filtered.length,
    };
  };

  return [
    summarize(rows.filter((row) => row.createdAt >= ranges.monthStart), "This month", "monthly"),
    summarize(rows.filter((row) => row.createdAt >= ranges.weekStart), "This week", "weekly"),
    summarize(rows.filter((row) => row.createdAt >= ranges.yearStart), "This year", "yearly"),
    summarize(rows, "All time", "daily"),
  ];
}

function buildPurchaseTrend(rows: Array<Record<string, any>>): PurchaseTrendPoint[] {
  const totals = new Map<string, { orderCount: number; purchaseValueLak: number }>();
  for (const row of rows) {
    const label = monthLabel(row.purchaseDate);
    const current = totals.get(label) ?? { orderCount: 0, purchaseValueLak: 0 };
    current.orderCount += 1;
    current.purchaseValueLak += amount(row.totalAmount);
    totals.set(label, current);
  }

  return Array.from(totals, ([label, value]) => ({ label, ...value }));
}
