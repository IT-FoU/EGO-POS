import type { Customer } from "@/features/customers/types";
import type { InventoryItem } from "@/features/inventory/types";
import type { Product } from "@/features/products/types";
import type { Supplier, SupplierPayment, SupplierPurchaseOrder } from "@/features/suppliers/types";
import type { ReportsAnalyticsHub } from "@/features/reports/build-analytics-hub";
import type { ProductReportRow, PurchaseTrendPoint, SalesMetric, TrendPoint } from "@/features/reports/types";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { getPrismaReportsSnapshot } from "@/features/reports/prisma-repository";

export type ReportsSnapshot = {
  analytics: {
    categoryBreakdown: Array<{ label: string; value: number }>;
    totalCustomers: number;
    totalProfit: number;
    totalRevenue: number;
    totalTransactions: number;
  };
  customers: Customer[];
  hub: ReportsAnalyticsHub;
  inventoryItems: InventoryItem[];
  products: Product[];
  productRows: ProductReportRow[];
  purchaseTrend: PurchaseTrendPoint[];
  revenueTrend: TrendPoint[];
  salesMetrics: SalesMetric[];
  supplierPayments: SupplierPayment[];
  supplierPurchaseOrders: SupplierPurchaseOrder[];
  suppliers: Supplier[];
};

export async function getReportsSnapshot(): Promise<ReportsSnapshot> {
  return getPrismaReportsSnapshot(tenantFromSession(await requireSession()));
}
