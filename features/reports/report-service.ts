import type { Customer } from "@/features/customers/types";
import type { InventoryItem } from "@/features/inventory/types";
import type { Product } from "@/features/products/types";
import type { Supplier, SupplierPayment, SupplierPurchaseOrder, SupplierReceiving } from "@/features/suppliers/types";
import type { ReportsAnalyticsHub } from "@/features/reports/build-analytics-hub";
import type { ReportFilterOptions, ReportFilters } from "@/features/reports/report-filters";
import { parseReportFilters } from "@/features/reports/report-filters";
import type {
  ProductReportRow,
  PurchaseTrendPoint,
  ReportDataQuality,
  SalesMetric,
  SupplierPayableSummary,
  TrendPoint,
} from "@/features/reports/types";
import { requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { tenantFromSession } from "@/lib/db/write-context";
import { getPrismaReportsSnapshot, getReportFilterOptions } from "@/features/reports/prisma-repository";

export type ReportsSnapshot = {
  analytics: {
    categoryBreakdown: Array<{ label: string; value: number }>;
    totalCustomers: number;
    totalProfit: number;
    totalRevenue: number;
    totalTransactions: number;
  };
  cogsLak: number;
  customers: Customer[];
  dataQuality: ReportDataQuality;
  filters: ReportFilters;
  hub: ReportsAnalyticsHub;
  inventoryItems: InventoryItem[];
  products: Product[];
  productRows: ProductReportRow[];
  purchaseTrend: PurchaseTrendPoint[];
  revenueTrend: TrendPoint[];
  salesMetrics: SalesMetric[];
  supplierPayables: SupplierPayableSummary[];
  supplierPayments: SupplierPayment[];
  supplierPurchaseOrders: SupplierPurchaseOrder[];
  supplierReceivings: SupplierReceiving[];
  suppliers: Supplier[];
};

export type ReportsPageData = ReportsSnapshot & {
  filterOptions: ReportFilterOptions;
};

export async function getReportsSnapshot(filters?: ReportFilters): Promise<ReportsSnapshot> {
  const tenant = tenantFromSession(await requireSession());
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  return getPrismaReportsSnapshot(tenant, filters);
}

export async function getReportsPageData(
  searchParams?: Record<string, string | string[] | undefined>,
): Promise<ReportsPageData> {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  const normalizedParams = Object.fromEntries(
    Object.entries(searchParams ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const filters = parseReportFilters(normalizedParams);
  const [snapshot, filterOptions] = await Promise.all([
    getPrismaReportsSnapshot(tenant, filters),
    getReportFilterOptions(tenant),
  ]);
  return { ...snapshot, filterOptions };
}
