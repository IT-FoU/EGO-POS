import { prisma } from "@/lib/db/prisma";
import { getPrismaCustomersSnapshot } from "@/features/customers/prisma-repository";
import { getPrismaInventorySnapshot } from "@/features/inventory/prisma-repository";
import { getPrismaProducts } from "@/features/products/prisma-repository";
import { getPrismaSuppliersSnapshot } from "@/features/suppliers/prisma-repository";
import { buildAnalyticsHub, type CategoryBreakdownRow } from "@/features/reports/build-analytics-hub";
import { buildReportAnalytics } from "@/features/reports/dto-mapper";
import type { ReportFilterOptions, ReportFilters } from "@/features/reports/report-filters";
import { resolveReportDateRange } from "@/features/reports/report-filters";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
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

function logPrismaQueryFailure(functionName: string, queryName: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${functionName}] ${queryName} failed: ${message}`);
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
    logPrismaQueryFailure("getPrismaReportsSnapshot", scope, error);
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

function startOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfWeek(date = new Date()) {
  const start = startOfDay(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1);
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthLabel(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function dayLabel(value: Date) {
  return value.toISOString().slice(0, 10);
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
    saleStatus: "completed",
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

export async function getReportFilterOptions(tenant: TenantContext): Promise<ReportFilterOptions> {
  const scope = await resolveTenantScope(tenant);
  const [branches, warehouses, categories, suppliers, customers, cashiers] = await Promise.all([
    db.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { companyId: scope.companyId },
    }),
    db.warehouse.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    }),
    db.category.findMany({
      orderBy: { nameEn: "asc" },
      select: { id: true, nameEn: true, nameLo: true },
      where: { companyId: scope.companyId },
    }),
    db.supplier.findMany({
      orderBy: { name: "asc" },
      select: { companyName: true, id: true, name: true },
      where: { companyId: scope.companyId },
    }),
    db.customer.findMany({
      orderBy: { fullName: "asc" },
      select: { customerCode: true, fullName: true, id: true, phone: true },
      take: 200,
      where: { companyId: scope.companyId },
    }),
    db.user.findMany({
      orderBy: { username: "asc" },
      select: { fullName: true, id: true, username: true },
      where: { companies: { some: { companyId: scope.companyId } } },
    }),
  ]);

  return {
    branches: branches.map((row: Record<string, string>) => ({ id: row.id, label: row.name })),
    cashiers: cashiers.map((row: Record<string, string>) => ({
      id: row.id,
      label: row.fullName || row.username,
    })),
    categories: categories.map((row: Record<string, string>) => ({
      id: row.id,
      label: row.nameEn || row.nameLo || row.id,
    })),
    customers: customers.map((row: {
      customerCode: string | null;
      fullName: string;
      id: string;
      phone: string | null;
    }) => ({
      id: row.id,
      label: formatCustomerFilterLabel(row),
    })),
    suppliers: suppliers.map((row: Record<string, string>) => ({
      id: row.id,
      label: row.companyName || row.name,
    })),
    warehouses: warehouses.map((row: Record<string, string>) => ({ id: row.id, label: row.name })),
  };
}

export async function getPrismaReportsSnapshot(tenant: TenantContext, rawFilters?: ReportFilters) {
  const scope = await resolveTenantScope(tenant);
  const filters = resolveEffectiveFilters(rawFilters);
  const saleFilter = buildSaleWhere(scope, filters);
  const saleItemFilter = buildSaleItemWhere(saleFilter, filters);
  const purchaseFilter = buildPurchaseWhere(scope, filters);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  const yearStart = startOfYear(now);
  const trendStart = new Date(now);
  trendStart.setDate(trendStart.getDate() - 6);

  const [
    salesAggregateResult,
    salesByPeriodResult,
    saleItemsResult,
    saleItemsSoldResult,
    saleItemCostRowsResult,
    productGroupsResult,
    purchasesByPeriodResult,
    paymentGroupsResult,
    payableGroupsResult,
    customersResult,
    productsResult,
    inventoryResult,
    suppliersResult,
  ] = await Promise.all([
    settleReportQuery("salesAggregate", true, () => db.sale.aggregate({
      _count: { id: true },
      _sum: { profitAmount: true, taxAmount: true, totalAmount: true },
      where: saleFilter,
    })),
    settleReportQuery("salesByPeriod", false, () => db.sale.findMany({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, profitAmount: true, taxAmount: true, totalAmount: true },
      where: saleFilter,
    })),
    settleReportQuery("saleItems", false, () => db.saleItem.findMany({
      select: {
        profitAmount: true,
        quantity: true,
        totalAmount: true,
        product: {
          select: {
            category: { select: { nameEn: true, nameLo: true } },
          },
        },
      },
      where: saleItemFilter,
    })),
    settleReportQuery("saleItemsSold", true, () => db.saleItem.aggregate({
      _sum: { quantity: true },
      where: saleItemFilter,
    })),
    settleReportQuery("saleItemCostRows", true, () => db.saleItem.findMany({
      select: { costPrice: true, quantity: true },
      where: saleItemFilter,
    })),
    settleReportQuery("productGroups", false, () => db.saleItem.groupBy({
      by: ["productId"],
      _sum: { profitAmount: true, quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 20,
      where: saleItemFilter,
    })),
    settleReportQuery("purchasesByPeriod", false, () => db.purchase.findMany({
      orderBy: { purchaseDate: "asc" },
      select: { purchaseDate: true, totalAmount: true },
      where: purchaseFilter,
    })),
    settleReportQuery("paymentGroups", false, () => db.salePayment.groupBy({
      by: ["paymentMethod"],
      _sum: { amount: true },
      where: { sale: saleFilter },
    })),
    settleReportQuery("payableGroups", false, () => db.supplierPayable.groupBy({
      by: ["supplierId"],
      _sum: { balanceAmount: true },
      where: { companyId: scope.companyId },
    })),
    settleReportQuery("customersSnapshot", false, () => getPrismaCustomersSnapshot(scope)),
    settleReportQuery("productsSnapshot", false, () => getPrismaProducts(scope)),
    settleReportQuery("inventorySnapshot", true, () => getPrismaInventorySnapshot(tenant)),
    settleReportQuery("suppliersSnapshot", false, () => getPrismaSuppliersSnapshot(tenant)),
  ]);

  const customers = resultOrFallback(customersResult, {
      analytics: {
        activeCustomers: 0,
        availablePoints: 0,
        birthdayThisMonth: 0,
        customersWithDebt: 0,
        lifetimeSpendingLak: 0,
        lostCustomers: 0,
        newThisMonth: 0,
        outstandingBalanceLak: 0,
        overdueBalanceLak: 0,
        paymentsRecordedLak: 0,
        topCustomers: 0,
        vipCustomers: 0,
      },
      customers: [],
      payments: [],
      purchases: [],
    } as any);
  const products = resultOrFallback(productsResult, [] as Product[]);
  const inventory = resultOrFallback(inventoryResult, {
    dashboard: {
      adjustmentCountToday: 0,
      deadStockCount: 0,
      fastMovingCount: 0,
      inventoryQuantity: 0,
      inventoryValueLak: 0,
      lowStockCount: 0,
      nearExpiryCount: 0,
      outOfStockCount: 0,
      todayStockInCount: 0,
    },
    items: [],
    lots: [],
    movements: [],
    todayStockIns: [],
  } as any);
  const suppliers = resultOrFallback(suppliersResult, {
    payments: [],
    purchaseOrders: [],
    receivings: [],
    suppliers: [],
  } as any);
  const salesAggregate = resultOrFallback(salesAggregateResult, {
    _count: { id: 0 },
    _sum: { profitAmount: 0, taxAmount: 0, totalAmount: 0 },
  });
  const salesByPeriod: Array<Record<string, any>> = resultOrFallback(salesByPeriodResult, []);
  const saleItems: Array<Record<string, any>> = resultOrFallback(saleItemsResult, []);
  const saleItemsSold = resultOrFallback(saleItemsSoldResult, { _sum: { quantity: 0 } });
  const saleItemCostRows: Array<Record<string, any>> = resultOrFallback(saleItemCostRowsResult, []);
  const productGroups: Array<Record<string, any>> = resultOrFallback(productGroupsResult, []);
  const purchasesByPeriod: Array<Record<string, any>> = resultOrFallback(purchasesByPeriodResult, []);
  const paymentGroups: Array<Record<string, any>> = resultOrFallback(paymentGroupsResult, []);
  const payableGroups: Array<Record<string, any>> = resultOrFallback(payableGroupsResult, []);
  const dataQuality = buildReportDataQuality([
    salesAggregateResult,
    salesByPeriodResult,
    saleItemsResult,
    saleItemsSoldResult,
    saleItemCostRowsResult,
    productGroupsResult,
    purchasesByPeriodResult,
    paymentGroupsResult,
    payableGroupsResult,
    customersResult,
    productsResult,
    inventoryResult,
    suppliersResult,
  ]);

  const totalRevenue = amount(salesAggregate._sum.totalAmount);
  const totalProfit = amount(salesAggregate._sum.profitAmount);
  const totalCogsLak = saleItemCostRows.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.costPrice) * amount(row.quantity),
    0,
  );
  const productById = new Map<string, Product>(products.map((product: Product) => [product.id, product]));

  const payableBySupplier = new Map<string, number>(
    payableGroups.map((row: Record<string, any>) => [row.supplierId, amount(row._sum.balanceAmount)]),
  );
  const supplierPayables: SupplierPayableSummary[] = suppliers.suppliers.map((supplier: { id: string }) => ({
    payableBalanceLak: payableBySupplier.get(supplier.id) ?? 0,
    supplierId: supplier.id,
  }));

  const categoryTotals = new Map<string, CategoryBreakdownRow>();
  for (const item of saleItems) {
    const category = item.product?.category?.nameEn || item.product?.category?.nameLo || "Uncategorized";
    const current = categoryTotals.get(category) ?? {
      category,
      margin: 0,
      profit: 0,
      revenue: 0,
      unitsSold: 0,
    };
    current.profit += amount(item.profitAmount);
    current.revenue += amount(item.totalAmount);
    current.unitsSold += amount(item.quantity);
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
    customerCount: customers.customers.length,
    profitLak: totalProfit,
    revenueLak: totalRevenue,
    transactionCount: salesAggregate._count.id ?? 0,
  });

  const salesMetrics = buildSalesMetrics(salesByPeriod, { monthStart, weekStart, yearStart });
  const revenueTrend = buildRevenueTrend(salesByPeriod);
  const revenueProfitTrend = buildRevenueProfitTrend(salesByPeriod, trendStart);
  const hourlySales = buildHourlySales(salesByPeriod.filter((row: Record<string, any>) => row.createdAt >= monthStart));

  const productRows: ProductReportRow[] = productGroups.map((row: Record<string, any>) => {
    const product = productById.get(row.productId);
    return {
      categoryName: product?.categoryName ?? "Uncategorized",
      productName: product?.nameEn || product?.nameLo || row.productId,
      profitLak: amount(row._sum.profitAmount),
      quantitySold: amount(row._sum.quantity),
      revenueLak: amount(row._sum.totalAmount),
    };
  });

  const purchaseTrend = buildPurchaseTrend(purchasesByPeriod);
  const supplierPurchaseOrders = filterPurchaseOrders(suppliers.purchaseOrders, filters);
  const supplierReceivings: SupplierReceiving[] = suppliers.receivings;
  const inventoryItems = filterInventoryByWarehouse(inventory.items, filters);

  const hub = buildAnalyticsHub({
    analytics,
    categoryBreakdown,
    inventoryItems,
    itemsSold: amount(saleItemsSold._sum.quantity),
    paymentBreakdown: paymentGroups.map((row: Record<string, any>) => ({
      method: String(row.paymentMethod ?? "cash"),
      value: amount(row._sum.amount),
    })),
    productRows,
    revenueProfitTrend,
    hourlySales,
  });

  return {
    analytics,
    cogsLak: Math.round(totalCogsLak),
    customers: customers.customers,
    dataQuality,
    filters,
    hub,
    inventoryItems,
    productRows,
    products,
    purchaseTrend,
    revenueTrend,
    salesMetrics,
    supplierPayables,
    supplierPayments: suppliers.payments,
    supplierPurchaseOrders,
    supplierReceivings,
    suppliers: suppliers.suppliers,
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
  const totals = new Map<string, { profit: number; revenue: number }>();
  for (const row of rows) {
    if (row.createdAt < start) continue;
    const label = dayLabel(row.createdAt);
    const current = totals.get(label) ?? { profit: 0, revenue: 0 };
    current.profit += amount(row.profitAmount);
    current.revenue += amount(row.totalAmount);
    totals.set(label, current);
  }

  return Array.from(totals, ([label, value]) => ({
    label,
    profit: Math.round(value.profit),
    revenue: Math.round(value.revenue),
  }));
}

function buildHourlySales(rows: Array<Record<string, any>>) {
  const totals = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, "0")}:00`,
    transactions: 0,
  }));

  for (const row of rows) {
    const hour = row.createdAt.getHours();
    totals[hour].transactions += 1;
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
