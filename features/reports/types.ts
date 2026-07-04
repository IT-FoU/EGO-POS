export type ReportKpiKey =
  | "revenue"
  | "profit"
  | "transactions"
  | "customers"
  | "averageBill"
  | "itemsSold"
  | "inventoryValue"
  | "profitMargin";

export type PeriodKey = "daily" | "weekly" | "monthly" | "yearly";

export type SupplierPayableSummary = {
  payableBalanceLak: number;
  supplierId: string;
};

export type SalesMetric = {
  period: PeriodKey;
  label: string;
  revenueLak: number;
  profitLak: number;
  taxLak: number;
  transactions: number;
};

export type TrendPoint = {
  label: string;
  revenueLak: number;
  salesCount: number;
};

export type ProductReportRow = {
  productName: string;
  categoryName: string;
  quantitySold: number;
  revenueLak: number;
  profitLak: number;
};

export type PurchaseTrendPoint = {
  label: string;
  purchaseValueLak: number;
  orderCount: number;
};

export type ReportDataQualityStatus = "complete" | "partial" | "unavailable" | "error";

export type ReportDataQualityWarning = {
  code: string;
  message: string;
  scope: string;
  severity: "info" | "warning" | "error";
};

export type ReportDataQuality = {
  failedScopes: string[];
  status: ReportDataQualityStatus;
  warnings: ReportDataQualityWarning[];
};
