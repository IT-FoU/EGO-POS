import { prisma } from "@/lib/db/prisma";
import { getPrismaCustomersSnapshot } from "@/features/customers/prisma-repository";
import { getPrismaInventorySnapshot } from "@/features/inventory/prisma-repository";
import { getPrismaProducts } from "@/features/products/prisma-repository";
import { getPrismaSuppliersSnapshot } from "@/features/suppliers/prisma-repository";
import { buildAnalyticsHub, type CategoryBreakdownRow } from "@/features/reports/build-analytics-hub";
import { buildReportAnalytics } from "@/features/reports/dto-mapper";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import type { Product } from "@/features/products/types";
import type { Supplier } from "@/features/suppliers/types";
import type { ProductReportRow, PurchaseTrendPoint, SalesMetric, TrendPoint } from "@/features/reports/types";

const db = prisma as any;

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

function saleWhere(scope: { branchId: string; companyId: string }) {
  return {
    branchId: scope.branchId,
    companyId: scope.companyId,
    saleStatus: "completed",
  };
}

export async function getPrismaReportsSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const saleFilter = saleWhere(scope);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const weekStart = startOfWeek(now);
  const yearStart = startOfYear(now);
  const trendStart = new Date(now);
  trendStart.setDate(trendStart.getDate() - 6);

  const [
    sales,
    salesAggregate,
    salesByPeriod,
    saleItems,
    saleItemsSold,
    productGroups,
    purchasesBySupplier,
    purchasesByPeriod,
    paymentGroups,
    customers,
    inventory,
    products,
    suppliers,
  ] = await Promise.all([
    db.sale.findMany({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, id: true },
      where: saleFilter,
    }),
    db.sale.aggregate({
      _count: { id: true },
      _sum: { profitAmount: true, taxAmount: true, totalAmount: true },
      where: saleFilter,
    }),
    db.sale.findMany({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, profitAmount: true, taxAmount: true, totalAmount: true },
      where: saleFilter,
    }),
    db.saleItem.findMany({
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
      where: { sale: saleFilter },
    }),
    db.saleItem.aggregate({
      _sum: { quantity: true },
      where: { sale: saleFilter },
    }),
    db.saleItem.groupBy({
      by: ["productId"],
      _sum: { profitAmount: true, quantity: true, totalAmount: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      take: 20,
      where: { sale: saleFilter },
    }),
    db.purchase.groupBy({
      by: ["supplierId"],
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { _sum: { totalAmount: "desc" } },
      where: { companyId: scope.companyId, status: { not: "cancelled" }, warehouseId: { in: scope.warehouseIds } },
    }),
    db.purchase.findMany({
      orderBy: { purchaseDate: "asc" },
      select: { purchaseDate: true, totalAmount: true },
      where: { companyId: scope.companyId, status: { not: "cancelled" }, warehouseId: { in: scope.warehouseIds } },
    }),
    db.salePayment.groupBy({
      by: ["paymentMethod"],
      _sum: { amount: true },
      where: { sale: saleFilter },
    }),
    getPrismaCustomersSnapshot(scope),
    getPrismaInventorySnapshot(scope),
    getPrismaProducts(scope),
    getPrismaSuppliersSnapshot(scope),
  ]);

  const totalRevenue = amount(salesAggregate._sum.totalAmount);
  const totalProfit = amount(salesAggregate._sum.profitAmount);
  const productById = new Map<string, Product>(products.map((product: Product) => [product.id, product]));
  const supplierById = new Map<string, Supplier>(suppliers.suppliers.map((supplier: Supplier) => [supplier.id, supplier]));

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
    transactionCount: salesAggregate._count.id ?? sales.length,
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
  const purchaseOrders = purchasesBySupplier.map((row: Record<string, any>) => ({
    id: `supplier-${row.supplierId}`,
    purchaseDate: "",
    purchaseNo: "",
    status: "received" as const,
    supplierId: row.supplierId,
    totalLak: amount(row._sum.totalAmount),
    warehouseName: supplierById.get(row.supplierId)?.companyName ?? row.supplierId,
  }));

  const hub = buildAnalyticsHub({
    analytics,
    categoryBreakdown,
    inventoryItems: inventory.items,
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
    customers: customers.customers,
    hub,
    inventoryItems: inventory.items,
    productRows,
    products,
    purchaseTrend,
    revenueTrend,
    salesMetrics,
    supplierPayments: suppliers.payments,
    supplierPurchaseOrders: [...purchaseOrders, ...suppliers.purchaseOrders],
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
