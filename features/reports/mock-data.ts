import type {
  ProductReportRow,
  PurchaseTrendPoint,
  SalesMetric,
  TrendPoint,
} from "@/features/reports/types";

export const mockSalesMetrics: SalesMetric[] = [
  {
    period: "daily",
    label: "Today",
    revenueLak: 4280000,
    profitLak: 1260000,
    taxLak: 428000,
    transactions: 86,
  },
  {
    period: "weekly",
    label: "This week",
    revenueLak: 28650000,
    profitLak: 8120000,
    taxLak: 2865000,
    transactions: 612,
  },
  {
    period: "monthly",
    label: "This month",
    revenueLak: 117800000,
    profitLak: 33600000,
    taxLak: 11780000,
    transactions: 2480,
  },
  {
    period: "yearly",
    label: "This year",
    revenueLak: 1245000000,
    profitLak: 361000000,
    taxLak: 124500000,
    transactions: 28420,
  },
];

export const mockRevenueTrend: TrendPoint[] = [
  { label: "Mon", revenueLak: 3600000, salesCount: 71 },
  { label: "Tue", revenueLak: 4100000, salesCount: 82 },
  { label: "Wed", revenueLak: 3850000, salesCount: 76 },
  { label: "Thu", revenueLak: 4620000, salesCount: 94 },
  { label: "Fri", revenueLak: 5100000, salesCount: 108 },
  { label: "Sat", revenueLak: 5950000, salesCount: 126 },
  { label: "Sun", revenueLak: 4280000, salesCount: 86 },
];

export const mockProductReportRows: ProductReportRow[] = [
  {
    productName: "Drinking Water 500ml",
    categoryName: "Drinks",
    quantitySold: 1120,
    revenueLak: 3360000,
    profitLak: 1344000,
  },
  {
    productName: "Pepsi Can",
    categoryName: "Drinks",
    quantitySold: 860,
    revenueLak: 6880000,
    profitLak: 2150000,
  },
  {
    productName: "Lay's Classic",
    categoryName: "Snacks",
    quantitySold: 245,
    revenueLak: 2450000,
    profitLak: 857500,
  },
  {
    productName: "Yogurt Cup",
    categoryName: "Cold Goods",
    quantitySold: 188,
    revenueLak: 1316000,
    profitLak: 376000,
  },
  {
    productName: "Dishwashing Liquid",
    categoryName: "Household",
    quantitySold: 36,
    revenueLak: 576000,
    profitLak: 180000,
  },
];

export const mockPurchaseTrend: PurchaseTrendPoint[] = [
  { label: "Week 1", purchaseValueLak: 9200000, orderCount: 6 },
  { label: "Week 2", purchaseValueLak: 12800000, orderCount: 8 },
  { label: "Week 3", purchaseValueLak: 10400000, orderCount: 7 },
  { label: "Week 4", purchaseValueLak: 14150000, orderCount: 9 },
];
