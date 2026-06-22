import {
  BadgeDollarSign,
  Boxes,
  Building2,
  Gift,
  Package,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type ReportCategory = {
  description: string;
  icon: LucideIcon;
  reports: string[];
  title: string;
};

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

export const executiveReports = [
  "Profit & Loss",
  "Sales Summary",
  "Inventory Valuation",
  "Promotion Profit Impact",
  "Branch Comparison",
];
