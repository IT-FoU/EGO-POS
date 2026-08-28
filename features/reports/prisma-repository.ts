import { prisma } from "@/lib/db/prisma";
import { getPrismaCustomersSnapshot } from "@/features/customers/prisma-repository";
import { getPrismaInventorySnapshot } from "@/features/inventory/prisma-repository";
import { getPrismaProducts } from "@/features/products/prisma-repository";
import { getPrismaSuppliersSnapshot } from "@/features/suppliers/prisma-repository";
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
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
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

function settledReportValue<T>(scope: string, critical: boolean, value: T): ReportQueryResult<T> {
  return { critical, ok: true, scope, value };
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

  const scopedBranches = scope.isOwner
    ? branches
    : branches.filter((row: Record<string, string>) => row.id === scope.branchId);

  return {
    branches: scopedBranches.map((row: Record<string, string>) => ({ id: row.id, label: row.name })),
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

export async function getPrismaReportsSnapshot(
  tenant: TenantContext,
  rawFilters?: ReportFilters,
  client: any = db,
) {
  await assertPermission(tenant, READ_PERMISSIONS.reportsView, client);
  const scope = await resolveTenantScope(tenant, client);
  const filters = clampReportFilters(scope, resolveEffectiveFilters(rawFilters));
  const saleFilter = buildSaleWhere(scope, filters);
  const saleItemFilter = buildSaleItemWhere(saleFilter, filters);
  const purchaseFilter = buildPurchaseWhere(scope, filters);
  const now = new Date();
  const monthStart = startOfBusinessMonth(now);
  const weekStart = startOfBusinessWeek(now);
  const yearStart = startOfBusinessYear(now);
  const trendStart = new Date(startOfBusinessDay(now).getTime() - 6 * 86_400_000);

  const salesAggregateResult = await settleReportQuery("salesAggregate", true, () => client.sale.aggregate({
    _count: { id: true },
    _sum: { discountAmount: true, profitAmount: true, taxAmount: true, totalAmount: true },
    where: saleFilter,
  }));
  const hasCompletedSales = salesAggregateResult.ok
    ? amount((salesAggregateResult.value as any)._count?.id) > 0
    : true;

  const [
    salesByPeriodResult,
    saleItemsResult,
    saleItemsSoldResult,
    saleItemCostRowsResult,
    refundRowsResult,
    purchasesByPeriodResult,
    paymentGroupsResult,
    payableGroupsResult,
    customersResult,
    productsResult,
    inventoryResult,
    suppliersResult,
  ] = await Promise.all([
    settleReportQuery("salesByPeriod", false, () => client.sale.findMany({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, id: true, profitAmount: true, taxAmount: true, totalAmount: true },
      where: saleFilter,
    })),
    hasCompletedSales
      ? settleReportQuery("saleItems", false, () => client.saleItem.findMany({
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
        }))
      : Promise.resolve(settledReportValue("saleItems", false, [])),
    hasCompletedSales
      ? settleReportQuery("saleItemsSold", true, () => client.saleItem.aggregate({
          _sum: { quantity: true },
          where: saleItemFilter,
        }))
      : Promise.resolve(settledReportValue("saleItemsSold", true, { _sum: { quantity: 0 } })),
    hasCompletedSales
      ? settleReportQuery("saleItemCostRows", true, () => client.saleItem.findMany({
          select: {
            costPrice: true,
            id: true,
            productId: true,
            profitAmount: true,
            quantity: true,
            totalAmount: true,
          },
          where: saleItemFilter,
        }))
      : Promise.resolve(settledReportValue("saleItemCostRows", true, [])),
    hasCompletedSales
      ? settleReportQuery("refundRows", true, () => client.refund.findMany({
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
        }))
      : Promise.resolve(settledReportValue("refundRows", true, [])),
    settleReportQuery("purchasesByPeriod", false, () => client.purchase.findMany({
      orderBy: { purchaseDate: "asc" },
      select: { purchaseDate: true, totalAmount: true },
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
    settleReportQuery("customersSnapshot", false, () => getPrismaCustomersSnapshot(scope, client)),
    settleReportQuery("productsSnapshot", false, () => getPrismaProducts(scope, client)),
    settleReportQuery("inventorySnapshot", true, () => getPrismaInventorySnapshot(tenant, client)),
    settleReportQuery("suppliersSnapshot", false, () => getPrismaSuppliersSnapshot(tenant, client)),
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
    _sum: { discountAmount: 0, profitAmount: 0, taxAmount: 0, totalAmount: 0 },
  });
  const salesByPeriod: Array<Record<string, any>> = resultOrFallback(salesByPeriodResult, []);
  const saleItemsSold = resultOrFallback(saleItemsSoldResult, { _sum: { quantity: 0 } });
  const saleItemCostRows: Array<Record<string, any>> = resultOrFallback(saleItemCostRowsResult, []);
  const refundRows: Array<Record<string, any>> = resultOrFallback(refundRowsResult, []);
  const purchasesByPeriod: Array<Record<string, any>> = resultOrFallback(purchasesByPeriodResult, []);
  const paymentRows: Array<Record<string, any>> = resultOrFallback(paymentGroupsResult, []);
  const payableGroups: Array<Record<string, any>> = resultOrFallback(payableGroupsResult, []);
  const dataQuality = buildReportDataQuality([
    salesAggregateResult,
    salesByPeriodResult,
    saleItemsResult,
    saleItemsSoldResult,
    saleItemCostRowsResult,
    refundRowsResult,
    purchasesByPeriodResult,
    paymentGroupsResult,
    payableGroupsResult,
    customersResult,
    productsResult,
    inventoryResult,
    suppliersResult,
  ]);

  const lifecycleNet = netReportLifecycle(refundRows, saleItemCostRows);
  const nettedSalesByPeriod = applyLifecycleToSaleRows(salesByPeriod, refundRows, saleItemCostRows);
  const nettedPaymentGroups = netPaymentGroups(paymentTotalsFromRows(paymentRows), refundRows);
  const refundLak = refundRows.reduce((total, refund) => total + refundAmountOf(refund), 0);
  const grossSalesLak = amount(salesAggregate._sum.totalAmount);
  const discountLak = amount(salesAggregate._sum.discountAmount);
  const totalRevenue = grossSalesLak + lifecycleNet.revenueLak;
  const totalProfit = amount(salesAggregate._sum.profitAmount) + lifecycleNet.profitLak;
  const totalCogsLak = saleItemCostRows.reduce(
    (total: number, row: Record<string, any>) => total + amount(row.costPrice) * amount(row.quantity),
    0,
  ) + lifecycleNet.cogsLak;
  const itemsSold = amount(saleItemsSold._sum.quantity) + lifecycleNet.quantitySold;
  const productById = new Map<string, Product>(products.map((product: Product) => [product.id, product]));

  const payableBySupplier = new Map<string, number>(
    payableGroups.map((row: Record<string, any>) => [row.supplierId, amount(row._sum.balanceAmount)]),
  );
  const supplierPayables: SupplierPayableSummary[] = suppliers.suppliers.map((supplier: { id: string }) => ({
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
    customerCount: customers.customers.length,
    profitLak: totalProfit,
    revenueLak: totalRevenue,
    transactionCount: salesAggregate._count.id ?? 0,
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
  const supplierPurchaseOrders = filterPurchaseOrders(suppliers.purchaseOrders, filters);
  const supplierReceivings: SupplierReceiving[] = suppliers.receivings;
  const inventoryItems = filterInventoryByWarehouse(inventory.items, filters);

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
    customers: customers.customers,
    dataQuality,
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
