/**
 * REPORTS R1 — Report Center / report list.
 * Navigation layer only. Does not change cash/sales/inventory accounting.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canViewFullStoreReports, canViewStoreNavigationItem } from "../features/permissions/store-ui-permissions";
import { hasStorePermission, STORE_ACTIONS } from "../features/permissions/store-permissions";
import {
  REPORT_CENTER_CATEGORIES,
  REPORT_CENTER_ENTRIES,
  REPORT_CENTER_HREFS,
  findReportCenterEntryByHref,
  findReportCenterEntryBySlug,
} from "../features/reports/report-center-catalog";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import { CASH_SESSION_SALE_STATUSES } from "../features/pos/post-sale-shared";
import { DemoStorageKeys } from "../lib/demo/storage-keys";

const ROOT = process.cwd();
const thaiScript = /[\u0E00-\u0E7F]/;

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, extra = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}${extra ? ` — ${extra}` : ""}`);
    process.exitCode = 1;
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

const requiredHrefs = [
  "/reports/sales/daily",
  "/reports/sales/monthly",
  "/reports/sales/payment-methods",
  "/reports/sales/refunds-voids",
  "/reports/sales/receipts",
  "/reports/shifts/summary",
  "/reports/shifts/own-history",
  "/reports/shifts/cash-count",
  "/reports/shifts/cash-in-out",
  "/reports/products/sales",
  "/reports/products/categories",
  "/reports/products/performance",
  "/reports/inventory/movements",
  "/reports/inventory/on-hand",
  "/reports/inventory/low-stock",
  "/reports/inventory/valuation",
];

const copyKeys = [
  "analyticsHubLink",
  "backToReports",
  "bestSlowSellers",
  "centerSubtitle",
  "comingSoonTable",
  "dailySalesDesc",
  "favoriteReports",
  "monthlySales",
  "noRecent",
  "ownShiftHistory",
  "recentReports",
  "reportComing",
  "reportReady",
  "searchReports",
  "shiftReports",
  "stockValuation",
];

const reportsPage = read("app/(dashboard)/reports/page.tsx");
const analyticsPage = read("app/(dashboard)/reports/analytics/page.tsx");
const layout = read("app/(dashboard)/reports/layout.tsx");
const centerClient = read("features/reports/components/report-center-client.tsx");
const prefs = read("features/reports/report-center-prefs.ts");
const analyticsClient = read("features/reports/components/reports-analytics-client.tsx");
const catalogLegacy = read("features/reports/report-catalog.ts");
const salesPage = read("app/(dashboard)/reports/sales/page.tsx");
const productsPage = read("app/(dashboard)/reports/products/page.tsx");
const inventoryPage = read("app/(dashboard)/reports/inventory/page.tsx");
const customersPage = read("app/(dashboard)/reports/customers/page.tsx");
const purchasingPage = read("app/(dashboard)/reports/purchasing/page.tsx");
const calculator = read("features/cash-sessions/cash-session-calculator.ts");
const postSale = read("features/pos/post-sale-shared.ts");

check("1. Four report categories", REPORT_CENTER_CATEGORIES.map((row) => row.id).join(",") === "sales,shifts,products,inventory");
check("2. Sixteen report entries", REPORT_CENTER_ENTRIES.length === 16);
check(
  "3. Stable hrefs",
  requiredHrefs.every((href) => REPORT_CENTER_HREFS.includes(href)) && requiredHrefs.every((href) => Boolean(findReportCenterEntryByHref(href))),
);

for (const href of requiredHrefs) {
  const entry = findReportCenterEntryByHref(href)!;
  const catchAll = join(ROOT, "app", "(dashboard)", "reports", entry.categoryId, "[report]", "page.tsx");
  check(`4. Route exists ${href}`, existsSync(catchAll) && Boolean(findReportCenterEntryBySlug(entry.categoryId, entry.slug)));
}

check("5. Reports hub is Report Center", reportsPage.includes("ReportCenterClient") && reportsPage.includes("locale={locale}"));
check(
  "6. Analytics hub moved, not deleted",
  analyticsPage.includes("getReportsPageData") &&
    analyticsPage.includes("generatedAt={new Date().toISOString()}") &&
    analyticsPage.includes("locale={locale}") &&
    analyticsPage.includes("ReportDetailNav") &&
    analyticsPage.includes("reportsAnalytics"),
);
check(
  "7. Existing working reports kept",
  salesPage.includes("getReportsSnapshot") &&
    productsPage.includes("getReportsSnapshot") &&
    inventoryPage.includes("getReportsSnapshot") &&
    customersPage.includes("getReportsSnapshot") &&
    purchasingPage.includes("getReportsSnapshot"),
);
check(
  "8. Owner-verified missing reports are planned, not reused generic pages",
  REPORT_CENTER_ENTRIES.filter((entry) => entry.planned).length === 5 &&
    REPORT_CENTER_ENTRIES.filter((entry) => entry.reuse).length === 0 &&
    read("app/(dashboard)/reports/sales/[report]/page.tsx").includes("ReportComingSoon") &&
    !read("app/(dashboard)/reports/sales/[report]/page.tsx").includes('redirect("/reports/sales")') &&
    !read("app/(dashboard)/reports/products/[report]/page.tsx").includes('redirect("/reports/products")') &&
    !read("app/(dashboard)/reports/inventory/[report]/page.tsx").includes('redirect("/reports/inventory")') &&
    !read("app/(dashboard)/reports/sales/[report]/page.tsx").includes("hub.paymentBreakdown") &&
    salesPage.includes("getReportsSnapshot") &&
    productsPage.includes("getReportsSnapshot") &&
    inventoryPage.includes("getReportsSnapshot"),
);
check(
  "9. Search / favorites / recent",
  centerClient.includes("searchReports") &&
    centerClient.includes("toggleReportCenterFavorite") &&
    centerClient.includes("readReportCenterRecent") &&
    prefs.includes("DemoStorageKeys.reportCenterFavorites") &&
    prefs.includes("DemoStorageKeys.reportCenterRecent") &&
    DemoStorageKeys.reportCenterFavorites === "ego-pos:report-center.favorites",
);
check("10. No report-favorites migration", !existsSync(join(ROOT, "prisma/migrations")) || !readFileSync(join(ROOT, "prisma/schema.prisma"), "utf8").includes("reportCenterFavorite"));
check(
  "11. EN/LO copy",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    copyKeys.every((key) => tReports(key, "en") !== key && tReports(key, "lo") !== tReports(key, "en")) &&
    !Object.values({ en: true }).some(() => thaiScript.test(tReports("comingSoonTable", "lo"))),
);
check("12. Lao has no Thai script in new keys", copyKeys.every((key) => !thaiScript.test(tReports(key, "lo"))));
check(
  "13. Permissions unchanged",
  canViewFullStoreReports("owner") &&
    canViewFullStoreReports("manager") &&
    !canViewFullStoreReports("cashier") &&
    canViewStoreNavigationItem("owner", "reports") &&
    canViewStoreNavigationItem("manager", "reports") &&
    !canViewStoreNavigationItem("cashier", "reports") &&
    hasStorePermission("cashier", STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT) &&
    layout.includes("canViewFullStoreReports"),
);
check(
  "14. Old catalog / analytics client preserved",
  catalogLegacy.includes('title: "Sales Reports"') &&
    catalogLegacy.includes('"Profit & Loss"') &&
    analyticsClient.includes("function openReport") &&
    analyticsClient.includes('router.push(`/reports/analytics?${params.toString()}`)') &&
    analyticsClient.includes('router.push("/reports/analytics")'),
);
check(
  "15. Batch H cash refund KPI unchanged",
  CASH_SESSION_SALE_STATUSES.includes("refunded") &&
    calculator.includes("computeCashRefundLak") &&
    calculator.includes("cashSalesLak") &&
    postSale.includes("refunded"),
);
check("16. Placeholder copy present", tReports("comingSoonTable", "en").includes("next report batch"));
check("17. Center placeholder used on skeletons", read("features/reports/components/report-page-shell.tsx").includes("comingSoonTable"));

if (failed) {
  console.error(`\nphase-reports-r1-center-check: FAIL (${passed} passed, ${failed} failed)`);
  process.exit(1);
}

console.log(`\nphase-reports-r1-center-check: PASS (${passed})`);
