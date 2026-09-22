/**
 * REPORTS R1.1 — Report page navigation polish.
 * Nav/empty-state only. Does not change report accounting or cash KPIs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canViewFullStoreReports, canViewStoreNavigationItem } from "../features/permissions/store-ui-permissions";
import { hasStorePermission, STORE_ACTIONS } from "../features/permissions/store-permissions";
import {
  REPORT_CENTER_ENTRIES,
  findReportCenterEntryByHref,
} from "../features/reports/report-center-catalog";
import {
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import { CASH_SESSION_SALE_STATUSES } from "../features/pos/post-sale-shared";

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

const shell = read("features/reports/components/report-page-shell.tsx");
const analyticsClient = read("features/reports/components/reports-analytics-client.tsx");
const analyticsPage = read("app/(dashboard)/reports/analytics/page.tsx");
const salesPage = read("app/(dashboard)/reports/sales/page.tsx");
const productsPage = read("app/(dashboard)/reports/products/page.tsx");
const inventoryPage = read("app/(dashboard)/reports/inventory/page.tsx");
const customersPage = read("app/(dashboard)/reports/customers/page.tsx");
const purchasingPage = read("app/(dashboard)/reports/purchasing/page.tsx");
const salesCatchAll = read("app/(dashboard)/reports/sales/[report]/page.tsx");
const productsCatchAll = read("app/(dashboard)/reports/products/[report]/page.tsx");
const inventoryCatchAll = read("app/(dashboard)/reports/inventory/[report]/page.tsx");
const shiftsCatchAll = read("app/(dashboard)/reports/shifts/[report]/page.tsx");
const calculator = read("features/cash-sessions/cash-session-calculator.ts");
const postSale = read("features/pos/post-sale-shared.ts");
const layout = read("app/(dashboard)/reports/layout.tsx");
const frameStart = analyticsClient.indexOf("function ModalFrame(");
const rowsStart = analyticsClient.indexOf("function ReportRowsTable(");
const frameFn = analyticsClient.slice(frameStart, rowsStart);

const navCopyKeys = ["backToReports", "breadcrumbNav", "comingSoonTable", "planned", "reportTable", "filters", "print"];
const skeletonHrefs = [
  "/reports/sales/refunds-voids",
  "/reports/sales/receipts",
  "/reports/shifts/summary",
  "/reports/shifts/own-history",
  "/reports/shifts/cash-count",
  "/reports/shifts/cash-in-out",
  "/reports/inventory/movements",
  "/reports/inventory/valuation",
];
const redirectHrefs = [
];
const fullPageFiles = [
  salesPage,
  productsPage,
  inventoryPage,
  customersPage,
  purchasingPage,
  analyticsPage,
  salesCatchAll,
  productsCatchAll,
  inventoryCatchAll,
  shiftsCatchAll,
  shell,
];

check("1. Shared shell exports nav, sheet, coming soon", shell.includes("export function ReportDetailNav") && shell.includes("export function ReportSheet") && shell.includes("export function ReportComingSoon") && shell.includes("export function ReportDetailShell"));
check("2. Semantic breadcrumb + dedicated Back to Reports", shell.includes('aria-label={tReports("breadcrumbNav", locale)}') && shell.includes("<ol") && shell.includes("<ArrowLeft") && shell.includes('href="/reports"') && shell.includes('tReports("backToReports"') && !shell.includes("router.back(") && !shell.includes("history.back"));
check("3. Full-page shell has no ambiguous X close", !shell.includes("<X ") && !shell.includes('tReports("close"'));
check(
  "4. Skeleton empty state is a white sheet, not a blank dashed box",
  shell.includes("ReportComingSoon") &&
    shell.includes("comingSoonTable") &&
    shell.includes("FileSpreadsheet") &&
    shell.includes("bg-white") &&
    shell.includes("ReportPlannedChips") &&
    !shell.includes("border-dashed border-border bg-card p-8 text-center"),
);
check(
  "5. Planned chips are labeled and not buttons",
  shell.includes('["filters", "reportTable", "print", "excel", "pdf"]') &&
    shell.includes('tReports("planned"') &&
    !/ReportPlannedChips[\s\S]*<button/.test(shell),
);
check(
  "6. Existing working pages keep queries and gain nav",
  salesPage.includes("getReportsSnapshot") &&
    salesPage.includes("ReportDetailNav") &&
    productsPage.includes("getReportsSnapshot") &&
    productsPage.includes("ReportDetailNav") &&
    inventoryPage.includes("getReportsSnapshot") &&
    inventoryPage.includes("ReportDetailNav") &&
    customersPage.includes("getReportsSnapshot") &&
    customersPage.includes("ReportDetailNav") &&
    purchasingPage.includes("getReportsSnapshot") &&
    purchasingPage.includes("ReportDetailNav") &&
    salesCatchAll.includes("ReportComingSoon") &&
    analyticsPage.includes("getReportsPageData") &&
    analyticsPage.includes("ReportDetailNav"),
);
check(
  "7. Dedicated report routes stay full pages, generic reports are not redirected into",
  !salesCatchAll.includes('redirect("/reports/sales")') &&
    !productsCatchAll.includes('redirect("/reports/products")') &&
    !inventoryCatchAll.includes('redirect("/reports/inventory")') &&
    !salesCatchAll.includes("hub.paymentBreakdown") &&
    shiftsCatchAll.includes("ReportComingSoon") &&
    salesCatchAll.includes("ReportComingSoon") &&
    productsCatchAll.includes("ReportComingSoon") &&
    inventoryCatchAll.includes("ReportComingSoon") &&
    redirectHrefs.every((href) => findReportCenterEntryByHref(href)?.planned === true) &&
    skeletonHrefs.every((href) => findReportCenterEntryByHref(href)?.reuse === null),
);
check(
  "8. Analytics drawers keep large-drawer X close + sidebar",
  frameFn.includes('aria-label={t("close")}') &&
    frameFn.includes("<X ") &&
    frameFn.includes("lg:left-72") &&
    frameFn.includes("max-w-none") &&
    !frameFn.includes("place-items-center") &&
    !analyticsClient.includes("function ReportsCompactModal("),
);
check(
  "9. EN/LO nav + empty-state copy",
  reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    navCopyKeys.every((key) => tReports(key, "en") !== key && tReports(key, "lo") !== tReports(key, "en") && !thaiScript.test(tReports(key, "lo"))) &&
    tReports("comingSoonTable", "en") === "This report is ready for detailed table implementation in the next report batch." &&
    tReports("backToReports", "en") === "Back to Reports",
);
check("10. No mixed hard-coded English in shell", !/\bBack to Reports\b/.test(shell) && !/\bThis report is ready\b/.test(shell) && shell.includes("tReports("));
check(
  "11. Keyboard/focus and accessible labels",
  shell.includes("focus-visible:ring-2") &&
    shell.includes('aria-label={tReports("backToReports"') &&
    frameFn.includes('aria-label={t("close")}') &&
    frameFn.includes('aria-hidden="true"'),
);
check(
  "12. Responsive wrapping classes",
  shell.includes("flex-wrap") && shell.includes("min-w-0") && shell.includes("text-2xl font-semibold sm:text-3xl"),
);
check(
  "13. Catch-alls still do not import sibling page modules",
  !salesCatchAll.includes('from "../page"') &&
    !productsCatchAll.includes('from "../page"') &&
    !inventoryCatchAll.includes('from "../page"'),
);
check(
  "14. Permissions unchanged",
  canViewFullStoreReports("owner") &&
    canViewFullStoreReports("manager") &&
    !canViewFullStoreReports("cashier") &&
    canViewStoreNavigationItem("cashier", "reports") === false &&
    hasStorePermission("cashier", STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT) &&
    layout.includes("canViewFullStoreReports"),
);
check(
  "15. Batch H cash refund KPI unchanged",
  CASH_SESSION_SALE_STATUSES.includes("refunded") &&
    calculator.includes("computeCashRefundLak") &&
    calculator.includes("cashSalesLak") &&
    postSale.includes("refunded"),
);
check("16. Catalog routes still registered", REPORT_CENTER_ENTRIES.length === 16 && existsSync(join(ROOT, "features/reports/report-center-icons.ts")));
check(
  "17. Full-page report files expose Back via shared nav",
  fullPageFiles.every((source) => source.includes("ReportDetailNav") || source.includes("ReportComingSoon") || source.includes("ReportDetailShell") || source.includes("backToReports")),
);

if (failed) {
  console.error(`\nphase-reports-r1-1-nav-check: FAIL (${passed} passed, ${failed} failed)`);
  process.exit(1);
}

console.log(`\nphase-reports-r1-1-nav-check: PASS (${passed})`);
