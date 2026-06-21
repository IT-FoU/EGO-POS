import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  CreditCard,
  FileClock,
  Gift,
  Package,
  ReceiptText,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type ReportKpiKey =
  | "revenue"
  | "profit"
  | "transactions"
  | "customers"
  | "averageBill"
  | "itemsSold"
  | "inventoryValue"
  | "profitMargin";

export type ReportCategory = {
  description: string;
  icon: LucideIcon;
  reports: string[];
  title: string;
};

export const currencyRates = {
  LAK: 1,
  THB: 0.0016,
  USD: 0.000046,
} as const;

export const dashboardKpis: Array<{
  key: ReportKpiKey;
  label: string;
  value: number;
  valueType: "currency" | "number" | "percent";
}> = [
  { key: "revenue", label: "Total Revenue", value: 117800000, valueType: "currency" },
  { key: "profit", label: "Total Profit", value: 33600000, valueType: "currency" },
  { key: "transactions", label: "Total Transactions", value: 2480, valueType: "number" },
  { key: "customers", label: "Total Customers", value: 1280, valueType: "number" },
  { key: "averageBill", label: "Average Bill Value", value: 47500, valueType: "currency" },
  { key: "itemsSold", label: "Items Sold", value: 18450, valueType: "number" },
  { key: "inventoryValue", label: "Inventory Value", value: 45230000, valueType: "currency" },
  { key: "profitMargin", label: "Profit Margin %", value: 28.5, valueType: "percent" },
];

export const revenueProfitTrend = [
  { label: "Mon", profit: 1260000, revenue: 4280000 },
  { label: "Tue", profit: 1480000, revenue: 5120000 },
  { label: "Wed", profit: 1320000, revenue: 4760000 },
  { label: "Thu", profit: 1590000, revenue: 5530000 },
  { label: "Fri", profit: 1840000, revenue: 6380000 },
  { label: "Sat", profit: 2260000, revenue: 7810000 },
  { label: "Sun", profit: 1710000, revenue: 5940000 },
];

export const hourlySales = Array.from({ length: 24 }, (_, hour) => ({
  hour: `${String(hour).padStart(2, "0")}:00`,
  transactions: hour >= 7 && hour <= 21 ? Math.max(4, Math.round(18 + Math.sin(hour / 2) * 12 + (hour === 18 ? 24 : 0))) : 0,
}));

export const categoryBreakdown = [
  { category: "Drinks", margin: 31, profit: 12000000, revenue: 38800000, unitsSold: 6850 },
  { category: "Snacks", margin: 26, profit: 7200000, revenue: 27600000, unitsSold: 4120 },
  { category: "Cold Goods", margin: 22, profit: 4500000, revenue: 20400000, unitsSold: 1980 },
  { category: "Household", margin: 34, profit: 5400000, revenue: 15800000, unitsSold: 840 },
  { category: "Stationery", margin: 29, profit: 1600000, revenue: 5200000, unitsSold: 660 },
];

export const inventoryAlerts = [
  { action: "Create Purchase Order", count: 24, key: "low_stock", label: "Low Stock" },
  { action: "Create Purchase Order", count: 8, key: "out_of_stock", label: "Out of Stock" },
  { action: "Create Promotion", count: 15, key: "expiring", label: "Expiring Soon" },
  { action: "Clearance Promotion", count: 19, key: "dead_stock", label: "Dead Stock" },
];

export const topSellers = [
  { margin: 40, name: "Drinking Water 500ml", profit: 1344000, qty: 1120, revenue: 3360000 },
  { margin: 31, name: "Pepsi Can", profit: 2150000, qty: 860, revenue: 6880000 },
  { margin: 35, name: "Lay's Classic", profit: 857500, qty: 245, revenue: 2450000 },
  { margin: 29, name: "Yogurt Cup", profit: 376000, qty: 188, revenue: 1316000 },
  { margin: 34, name: "Dishwashing Liquid", profit: 180000, qty: 36, revenue: 576000 },
  { margin: 27, name: "Instant Coffee", profit: 330000, qty: 80, revenue: 1200000 },
  { margin: 32, name: "Notebook A5", profit: 240000, qty: 120, revenue: 750000 },
  { margin: 25, name: "Milk 1L", profit: 410000, qty: 96, revenue: 1640000 },
  { margin: 38, name: "Energy Drink", profit: 710000, qty: 210, revenue: 1860000 },
  { margin: 30, name: "Toothpaste", profit: 260000, qty: 52, revenue: 860000 },
];

export const deadStockProducts = [
  { action: "Create Promotion", age: "30 days", name: "Imported Cookies", stock: 48, value: 672000 },
  { action: "Adjust Price", age: "60 days", name: "Dishwashing Liquid 1L", stock: 24, value: 264000 },
  { action: "Transfer Stock", age: "90 days", name: "Premium Tea Box", stock: 18, value: 540000 },
  { action: "Clearance Promotion", age: "180 days", name: "Old Stationery Pack", stock: 72, value: 360000 },
];

export const paymentBreakdown = [
  { label: "Cash", value: 38500000 },
  { label: "Transfer", value: 42100000 },
  { label: "QR", value: 26800000 },
  { label: "Card", value: 10400000 },
];

export const reportCategories: ReportCategory[] = [
  {
    description: "Sales performance, cashier activity, refunds, voids, and hourly trends.",
    icon: ShoppingCart,
    reports: ["Sales Summary", "Sales by Product", "Sales by Category", "Sales by Cashier", "Sales by Hour", "Refund & Void Report"],
    title: "Sales Reports",
  },
  {
    description: "Product movement, profitability, price history, barcode and image coverage.",
    icon: Package,
    reports: ["Top Selling Products", "Low Selling Products", "Product Profitability", "Price History", "Barcode Coverage", "Product Image Coverage"],
    title: "Product Reports",
  },
  {
    description: "Stock, valuation, movements, dead stock, expiry, transfer, and adjustment history.",
    icon: Warehouse,
    reports: ["Current Stock", "Low Stock", "Out of Stock", "Stock Movement", "Inventory Valuation", "Dead Stock", "Expiry Report", "Stock Adjustment History", "Stock Transfer Report"],
    title: "Inventory Reports",
  },
  {
    description: "Profit, payment, cash drawer, discount, tax, and multi-currency summaries.",
    icon: BadgeDollarSign,
    reports: ["Profit & Loss", "Gross Margin", "Payment Breakdown", "Cash Drawer", "Discount Report", "Tax Report", "Multi-currency Summary"],
    title: "Financial Reports",
  },
  {
    description: "Customer list, top customers, spending, credit, and outstanding balance.",
    icon: Users,
    reports: ["Customer List", "Top Customers", "Customer Spending", "New vs Returning", "Customer Credit", "Outstanding Balance"],
    title: "Customer Reports",
  },
  {
    description: "Points, tiers, student/general membership, and member retention.",
    icon: Star,
    reports: ["Points Earned", "Points Redeemed", "Points Expired", "Tier Analysis", "Student Membership", "General Membership", "Member Retention"],
    title: "Membership Reports",
  },
  {
    description: "Promotion performance, coupon use, free gift cost, and discount impact.",
    icon: Gift,
    reports: ["Promotion Performance", "Coupon Usage", "Free Gift Cost", "Discount Impact", "Promotion Profit Impact", "Promotion Redemption"],
    title: "Promotion Reports",
  },
  {
    description: "POs, receiving, supplier purchases, payables, cost trend, and returns.",
    icon: Truck,
    reports: ["Purchase Orders", "Receiving History", "Supplier Purchases", "Supplier Credit", "Supplier Payables", "Purchase Cost Trend", "Return to Supplier"],
    title: "Purchasing Reports",
  },
  {
    description: "Supplier performance, lead time, supplier debt, and product margin.",
    icon: Building2,
    reports: ["Supplier List", "Supplier Performance", "Lead Time", "Supplier Debt", "Supplier Product Margin"],
    title: "Supplier Reports",
  },
  {
    description: "Branch comparison, warehouse stock, transfers, and consolidated reporting.",
    icon: Boxes,
    reports: ["Branch Comparison", "Warehouse Stock", "Warehouse Transfer", "Consolidated Report"],
    title: "Branch & Warehouse Reports",
  },
  {
    description: "User activity, price changes, stock audit, approvals, and login history.",
    icon: ShieldCheck,
    reports: ["User Activity", "Price Change History", "Stock Adjustment Audit", "Discount Approval History", "Refund Approval History", "Login History"],
    title: "Audit Reports",
  },
];

export const reportRows = [
  ["Water 500ml", "Drinks", "1,120", "3,360,000 LAK", "1,344,000 LAK", "40%"],
  ["Pepsi Can", "Drinks", "860", "6,880,000 LAK", "2,150,000 LAK", "31%"],
  ["Lay's Classic", "Snacks", "245", "2,450,000 LAK", "857,500 LAK", "35%"],
  ["Yogurt Cup", "Cold Goods", "188", "1,316,000 LAK", "376,000 LAK", "29%"],
  ["Dishwashing Liquid", "Household", "36", "576,000 LAK", "180,000 LAK", "34%"],
];

export const executiveReports = [
  "Profit & Loss",
  "Sales Summary",
  "Inventory Valuation",
  "Promotion Profit Impact",
  "Branch Comparison",
];

export const reportIcons = {
  BarChart3,
  ClipboardList,
  CreditCard,
  FileClock,
  ReceiptText,
};
