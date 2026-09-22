export const REPORT_CENTER_CATEGORY_IDS = ["sales", "shifts", "products", "inventory"] as const;

export type ReportCenterCategoryId = (typeof REPORT_CENTER_CATEGORY_IDS)[number];

export type ReportCenterReuse = "sales" | "products" | "inventory" | "payment-methods" | null;

export type ReportCenterIcon =
  | "alert-triangle"
  | "arrow-left-right"
  | "arrow-up-down"
  | "banknote"
  | "calendar-days"
  | "calendar-range"
  | "clipboard-list"
  | "history"
  | "package"
  | "receipt"
  | "scale"
  | "tags"
  | "trending-up"
  | "undo-2"
  | "wallet"
  | "warehouse";

export type ReportCenterEntry = {
  categoryId: ReportCenterCategoryId;
  descriptionKey: string;
  href: string;
  icon: ReportCenterIcon;
  id: string;
  planned?: boolean;
  posHint?: boolean;
  reuse: ReportCenterReuse;
  slug: string;
  titleKey: string;
};

export type ReportCenterCategory = {
  descriptionKey: string;
  id: ReportCenterCategoryId;
  titleKey: string;
};

export const REPORT_CENTER_CATEGORIES: ReportCenterCategory[] = [
  { id: "sales", titleKey: "salesReports", descriptionKey: "salesReportsDesc" },
  { id: "shifts", titleKey: "shiftReports", descriptionKey: "shiftReportsDesc" },
  { id: "products", titleKey: "productReports", descriptionKey: "productReportsDesc" },
  { id: "inventory", titleKey: "inventoryReports", descriptionKey: "inventoryReportsDesc" },
];

export const REPORT_CENTER_ENTRIES: ReportCenterEntry[] = [
  {
    id: "sales-daily",
    slug: "daily",
    href: "/reports/sales/daily",
    categoryId: "sales",
    titleKey: "dailySales",
    descriptionKey: "dailySalesDesc",
    icon: "calendar-days",
    reuse: null,
  },
  {
    id: "sales-monthly",
    slug: "monthly",
    href: "/reports/sales/monthly",
    categoryId: "sales",
    titleKey: "monthlySales",
    descriptionKey: "monthlySalesDesc",
    icon: "calendar-range",
    reuse: null,
  },
  {
    id: "sales-payment-methods",
    slug: "payment-methods",
    href: "/reports/sales/payment-methods",
    categoryId: "sales",
    titleKey: "salesByPayment",
    descriptionKey: "salesByPaymentDesc",
    icon: "wallet",
    reuse: null,
  },
  {
    id: "sales-refunds-voids",
    slug: "refunds-voids",
    href: "/reports/sales/refunds-voids",
    categoryId: "sales",
    titleKey: "refundVoidReport",
    descriptionKey: "refundVoidDesc",
    icon: "undo-2",
    reuse: null,
  },
  {
    id: "sales-receipts",
    slug: "receipts",
    href: "/reports/sales/receipts",
    categoryId: "sales",
    titleKey: "receiptsSalesDetail",
    descriptionKey: "receiptsSalesDetailDesc",
    icon: "receipt",
    reuse: null,
  },
  {
    id: "shifts-summary",
    slug: "summary",
    href: "/reports/shifts/summary",
    categoryId: "shifts",
    titleKey: "shiftSummary",
    descriptionKey: "shiftSummaryDesc",
    icon: "clipboard-list",
    reuse: null,
    posHint: true,
  },
  {
    id: "shifts-own-history",
    slug: "own-history",
    href: "/reports/shifts/own-history",
    categoryId: "shifts",
    titleKey: "ownShiftHistory",
    descriptionKey: "ownShiftHistoryDesc",
    icon: "history",
    reuse: null,
    posHint: true,
  },
  {
    id: "shifts-cash-count",
    slug: "cash-count",
    href: "/reports/shifts/cash-count",
    categoryId: "shifts",
    titleKey: "cashShiftCount",
    descriptionKey: "cashShiftCountDesc",
    icon: "banknote",
    reuse: null,
    posHint: true,
  },
  {
    id: "shifts-cash-in-out",
    slug: "cash-in-out",
    href: "/reports/shifts/cash-in-out",
    categoryId: "shifts",
    titleKey: "cashInOut",
    descriptionKey: "cashInOutDesc",
    icon: "arrow-left-right",
    reuse: null,
    posHint: true,
  },
  {
    id: "products-sales",
    slug: "sales",
    href: "/reports/products/sales",
    categoryId: "products",
    titleKey: "productSales",
    descriptionKey: "productSalesDesc",
    icon: "package",
    reuse: null,
  },
  {
    id: "products-categories",
    slug: "categories",
    href: "/reports/products/categories",
    categoryId: "products",
    titleKey: "categorySales",
    descriptionKey: "categorySalesDesc",
    icon: "tags",
    reuse: null,
  },
  {
    id: "products-performance",
    slug: "performance",
    href: "/reports/products/performance",
    categoryId: "products",
    titleKey: "bestSlowSellers",
    descriptionKey: "bestSlowSellersDesc",
    icon: "trending-up",
    reuse: null,
  },
  {
    id: "inventory-movements",
    slug: "movements",
    href: "/reports/inventory/movements",
    categoryId: "inventory",
    titleKey: "stockMovement",
    descriptionKey: "stockMovementDesc",
    icon: "arrow-up-down",
    reuse: null,
  },
  {
    id: "inventory-on-hand",
    slug: "on-hand",
    href: "/reports/inventory/on-hand",
    categoryId: "inventory",
    titleKey: "stockOnHand",
    descriptionKey: "stockOnHandDesc",
    icon: "warehouse",
    reuse: null,
  },
  {
    id: "inventory-low-stock",
    slug: "low-stock",
    href: "/reports/inventory/low-stock",
    categoryId: "inventory",
    titleKey: "lowStockReorder",
    descriptionKey: "lowStockReorderDesc",
    icon: "alert-triangle",
    reuse: null,
  },
  {
    id: "inventory-valuation",
    slug: "valuation",
    href: "/reports/inventory/valuation",
    categoryId: "inventory",
    titleKey: "stockValuation",
    descriptionKey: "stockValuationDesc",
    icon: "scale",
    reuse: null,
  },
];

const entriesById = new Map(REPORT_CENTER_ENTRIES.map((entry) => [entry.id, entry]));
const entriesByHref = new Map(REPORT_CENTER_ENTRIES.map((entry) => [entry.href, entry]));

export function findReportCenterEntry(id: string) {
  return entriesById.get(id) ?? null;
}

export function findReportCenterEntryByHref(href: string) {
  return entriesByHref.get(href) ?? null;
}

export function findReportCenterEntryBySlug(categoryId: ReportCenterCategoryId, slug: string) {
  return REPORT_CENTER_ENTRIES.find((entry) => entry.categoryId === categoryId && entry.slug === slug) ?? null;
}

export function reportCenterCategoryTitleKey(categoryId: ReportCenterCategoryId) {
  return REPORT_CENTER_CATEGORIES.find((category) => category.id === categoryId)?.titleKey ?? "reports";
}

export function reportCenterEntriesForCategory(categoryId: ReportCenterCategoryId) {
  return REPORT_CENTER_ENTRIES.filter((entry) => entry.categoryId === categoryId);
}

export const REPORT_CENTER_HREFS = REPORT_CENTER_ENTRIES.map((entry) => entry.href);

export const REPORT_CENTER_PLANNED_HREFS = [] as const;

export function isPlannedReportCenterEntry(entry: Pick<ReportCenterEntry, "planned" | "href">) {
  return Boolean(entry.planned) || REPORT_CENTER_PLANNED_HREFS.includes(entry.href as never);
}
