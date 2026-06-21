import type { InventoryItem } from "@/features/inventory/types";
import type { ProductReportRow } from "@/features/reports/types";
import type { ReportKpiKey } from "@/features/reports/mock-full-data";

export type CategoryBreakdownRow = {
  category: string;
  margin: number;
  profit: number;
  revenue: number;
  unitsSold: number;
};

export type ReportsAnalyticsHub = {
  averageBillLak: number;
  categoryBreakdown: CategoryBreakdownRow[];
  deadStockProducts: Array<{ action: string; age: string; name: string; stock: number; value: number }>;
  healthScore: number;
  healthStatus: "critical" | "excellent" | "good" | "warning";
  hourlySales: Array<{ hour: string; transactions: number }>;
  inventoryAlerts: Array<{ action: string; count: number; key: string; label: string }>;
  inventoryValueLak: number;
  itemsSold: number;
  kpis: Array<{
    key: ReportKpiKey;
    label: string;
    value: number;
    valueType: "currency" | "number" | "percent";
  }>;
  paymentBreakdown: Array<{ label: string; value: number }>;
  profitMarginPercent: number;
  revenueProfitTrend: Array<{ label: string; profit: number; revenue: number }>;
  topSellers: Array<{ margin: number; name: string; profit: number; qty: number; revenue: number }>;
};

function round(value: number) {
  return Math.round(value);
}

function paymentLabel(method: string) {
  if (method === "visa" || method === "card") return "Card";
  if (method === "transfer") return "Transfer";
  if (method === "qr") return "QR";
  return "Cash";
}

export function buildAnalyticsHub(input: {
  analytics: {
    totalCustomers: number;
    totalProfit: number;
    totalRevenue: number;
    totalTransactions: number;
  };
  categoryBreakdown: CategoryBreakdownRow[];
  inventoryItems: InventoryItem[];
  itemsSold: number;
  paymentBreakdown: Array<{ method: string; value: number }>;
  productRows: ProductReportRow[];
  revenueProfitTrend: Array<{ label: string; profit: number; revenue: number }>;
  hourlySales: Array<{ hour: string; transactions: number }>;
}): ReportsAnalyticsHub {
  const revenue = input.analytics.totalRevenue;
  const profit = input.analytics.totalProfit;
  const transactions = input.analytics.totalTransactions;
  const profitMarginPercent = revenue > 0 ? round((profit / revenue) * 1000) / 10 : 0;
  const averageBillLak = transactions > 0 ? round(revenue / transactions) : 0;
  const inventoryValueLak = round(input.inventoryItems.reduce((total, item) => total + (item.inventoryValueLak ?? 0), 0));

  const lowStock = input.inventoryItems.filter((item) => item.quantity > 0 && item.quantity <= item.minStock);
  const outOfStock = input.inventoryItems.filter((item) => item.quantity <= 0);
  const expiringSoon = input.inventoryItems.filter((item) => {
    if (!item.expiryDate) return false;
    const expiry = new Date(`${item.expiryDate}T00:00:00`);
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);
    return expiry.getTime() <= horizon.getTime() && expiry.getTime() >= Date.now();
  });
  const deadStock = input.inventoryItems.filter((item) => item.daysWithoutSale >= 30 && item.quantity > 0);

  const inventoryAlerts = [
    { action: "Create Purchase Order", count: lowStock.length, key: "low_stock", label: "Low Stock" },
    { action: "Create Purchase Order", count: outOfStock.length, key: "out_of_stock", label: "Out of Stock" },
    { action: "Create Promotion", count: expiringSoon.length, key: "expiring", label: "Expiring Soon" },
    { action: "Clearance Promotion", count: deadStock.length, key: "dead_stock", label: "Dead Stock" },
  ];

  const topSellers = [...input.productRows]
    .sort((left, right) => right.quantitySold - left.quantitySold)
    .slice(0, 10)
    .map((row) => ({
      margin: row.revenueLak > 0 ? round((row.profitLak / row.revenueLak) * 1000) / 10 : 0,
      name: row.productName,
      profit: round(row.profitLak),
      qty: round(row.quantitySold),
      revenue: round(row.revenueLak),
    }));

  const deadStockProducts = deadStock
    .sort((left, right) => right.daysWithoutSale - left.daysWithoutSale)
    .slice(0, 8)
    .map((item) => ({
      action: item.daysWithoutSale >= 90 ? "Clearance Promotion" : "Create Promotion",
      age: `${item.daysWithoutSale} days`,
      name: item.productNameEn || item.productNameLo,
      stock: round(item.quantity),
      value: round(item.inventoryValueLak ?? 0),
    }));

  const healthScore = Math.max(
    0,
    Math.min(
      100,
      round(68 + profitMarginPercent - lowStock.length * 1.5 - deadStock.length * 2 - outOfStock.length * 2),
    ),
  );
  const healthStatus =
    healthScore >= 85 ? "excellent" : healthScore >= 72 ? "good" : healthScore >= 55 ? "warning" : "critical";

  return {
    averageBillLak,
    categoryBreakdown: input.categoryBreakdown,
    deadStockProducts,
    healthScore,
    healthStatus,
    hourlySales: input.hourlySales,
    inventoryAlerts,
    inventoryValueLak,
    itemsSold: round(input.itemsSold),
    kpis: [
      { key: "revenue", label: "Total Revenue", value: round(revenue), valueType: "currency" },
      { key: "profit", label: "Total Profit", value: round(profit), valueType: "currency" },
      { key: "transactions", label: "Total Transactions", value: transactions, valueType: "number" },
      { key: "customers", label: "Total Customers", value: input.analytics.totalCustomers, valueType: "number" },
      { key: "averageBill", label: "Average Bill Value", value: averageBillLak, valueType: "currency" },
      { key: "itemsSold", label: "Items Sold", value: round(input.itemsSold), valueType: "number" },
      { key: "inventoryValue", label: "Inventory Value", value: inventoryValueLak, valueType: "currency" },
      { key: "profitMargin", label: "Profit Margin %", value: profitMarginPercent, valueType: "percent" },
    ],
    paymentBreakdown: input.paymentBreakdown.map((entry) => ({
      label: paymentLabel(entry.method),
      value: round(entry.value),
    })),
    profitMarginPercent,
    revenueProfitTrend: input.revenueProfitTrend,
    topSellers,
  };
}
