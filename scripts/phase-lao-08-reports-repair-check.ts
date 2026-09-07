import fs from "node:fs";
import path from "node:path";

import { executiveReports, reportCategories } from "../features/reports/report-catalog";
import {
  REPORTS_COPY,
  datePresetLabel,
  localizeReportLabel,
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

const en = REPORTS_COPY.en;
const lo = REPORTS_COPY.lo;
const client = read("features/reports/components/reports-analytics-client.tsx");
const copySource = read("lib/i18n/reports-copy.ts");
const catalog = read("features/reports/report-catalog.ts");
const hub = read("features/reports/build-analytics-hub.ts");
const service = read("features/reports/report-service.ts");
const salesPage = read("app/(dashboard)/reports/sales/page.tsx");
const productsPage = read("app/(dashboard)/reports/products/page.tsx");
const inventoryPage = read("app/(dashboard)/reports/inventory/page.tsx");
const purchasingPage = read("app/(dashboard)/reports/purchasing/page.tsx");
const thaiScript = /[\u0E00-\u0E7F]/;
const ownerHubTitles = [
  "Product Reports",
  "Financial Reports",
  "Customer Reports",
  "Promotion Reports",
  "Supplier Reports",
] as const;
const ownerReportNames = [
  "Profit & Loss",
  "Top Selling Products",
  "Low Selling Products",
  "Product Profitability",
  "Inventory Valuation",
  "Gross Margin",
  "Payment Breakdown",
  "New vs Returning",
  "Customer Credit",
  "Outstanding Balance",
  "Points Earned",
  "Points Redeemed",
  "Points Expired",
  "Promotion Performance",
  "Coupon Usage",
  "Free Gift Cost",
  "Purchase Orders",
  "Receiving History",
  "Supplier Purchases",
  "Supplier List",
  "Supplier Performance",
  "Lead Time",
] as const;
const ownerKpiLabels = [
  "Average Bill Value",
  "Items Sold",
  "Inventory Value",
  "Profit Margin %",
  "Business Health Score",
  "AI Insights",
  "Data Source Status",
  "Synced",
  "View Product Report",
  "View Sales Report",
  "View Inventory Report",
  "Clearance Promotion",
] as const;
const ownerChartLabels = [
  "Revenue & Profit Trend",
  "Hourly Sales Trend",
  "High sales",
  "Normal sales",
  "Low sales",
  "High revenue",
  "Normal revenue",
  "Low revenue",
  "Margin",
] as const;
const catalogGaps: string[] = [];
for (const category of reportCategories) {
  if (localizeReportLabel(category.title, "lo") === category.title) catalogGaps.push(category.title);
  if (localizeReportLabel(category.description, "lo") === category.description) catalogGaps.push(category.description);
  for (const report of category.reports) {
    if (localizeReportLabel(report, "lo") === report) catalogGaps.push(report);
  }
}
for (const report of executiveReports) {
  if (localizeReportLabel(report, "lo") === report) catalogGaps.push(report);
}

check("1. Lao Reports header/actions are localized",
  tReports("egoPosAnalytics", "lo") !== en.egoPosAnalytics &&
    tReports("export", "lo") === "ສົ່ງອອກ" &&
    tReports("schedule", "lo") === "ກຳນົດເວລາ" &&
    tReports("print", "lo") !== en.print &&
    tReports("favorites", "lo") !== en.favorites &&
    client.includes('t("egoPosAnalytics")') &&
    client.includes('t("export")') &&
    client.includes('t("schedule")') &&
    !client.includes("EGO POS Analytics") &&
    tReports("egoPosAnalytics", "en") === "EGO POS Analytics" &&
    tReports("export", "en") === "Export" &&
    tReports("schedule", "en") === "Schedule",
);

check("2. Lao Report Hub category titles/descriptions are localized",
  ownerHubTitles.every((title) => {
    const localized = localizeReportLabel(title, "lo");
    return localized !== title && localized === localizeReportLabel(title, "lo");
  }) &&
    localizeReportLabel("Product Reports", "lo") === lo.productReports &&
    localizeReportLabel("Financial Reports", "lo") === lo.financialReports &&
    localizeReportLabel("Customer Reports", "lo") === lo.customerReports &&
    localizeReportLabel("Promotion Reports", "lo") === lo.promotionReports &&
    localizeReportLabel("Supplier Reports", "lo") === lo.supplierReports &&
    localizeReportLabel("Product movement, profitability, price history, barcode and image coverage.", "lo") === lo.productReportsDesc &&
    client.includes("localizeLabel(category.title)") &&
    client.includes("localizeLabel(category.description)"),
);

check("3. Lao report item names are localized",
  ownerReportNames.every((name) => localizeReportLabel(name, "lo") !== name) &&
    localizeReportLabel("Profit & Loss", "lo") === lo.profitLoss &&
    localizeReportLabel("Top Selling Products", "lo") === lo.topSellingProducts &&
    localizeReportLabel("Lead Time", "lo") === lo.leadTime &&
    catalogGaps.length === 0 &&
    client.includes("localizeLabel(report)"),
  catalogGaps.length ? catalogGaps.join(" | ") : "",
);

check("4. Lao dashboard KPI and AI Insight labels are localized",
  ownerKpiLabels.every((label) => localizeReportLabel(label, "lo") !== label) &&
    localizeReportLabel("Average Bill Value", "lo") === lo.averageBill &&
    localizeReportLabel("Items Sold", "lo") === lo.itemsSold &&
    tReports("businessHealth", "lo") === lo.businessHealth &&
    tReports("aiInsights", "lo") === lo.aiInsights &&
    tReports("dataSourceStatus", "lo") === lo.dataSourceStatus &&
    localizeReportLabel("Synced", "lo") === lo.synced &&
    tReports("viewProductReport", "lo") === lo.viewProductReport &&
    tReports("clearancePromotion", "lo") === lo.clearancePromotion &&
    client.includes('t("aiInsights")') &&
    client.includes('t("dataSourceStatus")') &&
    client.includes("localizeLabel(kpi.label)") &&
    client.includes('t("viewSalesReport")'),
);

check("5. Lao chart titles/legends are localized",
  ownerChartLabels.every((label) => localizeReportLabel(label, "lo") !== label) &&
    localizeReportLabel("Revenue & Profit Trend", "lo") === lo.revenueProfitTrend &&
    localizeReportLabel("Hourly Sales Trend", "lo") === lo.hourlySales &&
    tReports("highSales", "lo") === lo.highSales &&
    tReports("peakHour", "lo").includes("{hour}") &&
    tReports("peakHour", "lo") !== en.peakHour &&
    client.includes('t("revenueProfitTrend")') &&
    client.includes('t("hourlySales")') &&
    client.includes('t("highSales")') &&
    client.includes('t("highRevenue")') &&
    client.includes("performanceLegend") &&
    client.includes("performanceTooltip"),
);

check("6. Lao popup/modal/drawer/menu copy in Reports is localized",
  tReports("businessHealth", "lo") !== en.businessHealth &&
    localizeReportLabel("Expiring Soon", "lo") === lo.expiringSoon &&
    localizeReportLabel("Dead Stock", "lo") === lo.deadStock &&
    localizeReportLabel("Clearance Promotion", "lo") === lo.clearancePromotion &&
    tReports("scheduleDaily", "lo") !== en.scheduleDaily &&
    tReports("deliveryChannel", "lo") !== en.deliveryChannel &&
    tReports("active", "lo") !== en.active &&
    tReports("live", "lo") !== en.live &&
    client.includes("function HealthModal") &&
    client.includes("function ExportModal") &&
    client.includes("function ScheduleModal") &&
    client.includes("function FavoritesModal") &&
    client.includes("function DataSourceModal") &&
    client.includes('t("scheduleDaily")') &&
    client.includes('t("deliveryChannel")') &&
    client.includes('t("active")') &&
    client.includes('t("live")') &&
    !client.includes("/> Active</label>") &&
    !client.includes('value="Live"'),
);

check("7. English locale remains English",
  tReports("export", "en") === "Export" &&
    tReports("schedule", "en") === "Schedule" &&
    tReports("egoPosAnalytics", "en") === "EGO POS Analytics" &&
    localizeReportLabel("Profit & Loss", "en") === "Profit & Loss" &&
    localizeReportLabel("Average Bill Value", "en") === "Average Bill Value" &&
    datePresetLabel("this_month", "en") === "This Month" &&
    datePresetLabel("today", "lo") === lo.today &&
    ownerHubTitles.every((title) => localizeReportLabel(title, "en") === title) &&
    ownerReportNames.every((name) => localizeReportLabel(name, "en") === name),
);

check("8. Internal report IDs/keys/enums were not changed",
  catalog.includes('title: "Sales Reports"') &&
    catalog.includes('"Profit & Loss"') &&
    catalog.includes('"Top Selling Products"') &&
    hub.includes('label: "Total Revenue"') &&
    hub.includes('label: "Average Bill Value"') &&
    hub.includes('label: "Dead Stock"') &&
    hub.includes('action: "Clearance Promotion"') &&
    !service.includes("reports-copy") &&
    !hub.includes("reports-copy") &&
    !catalog.includes("reports-copy") &&
    reportsCopyKeyParity() &&
    reportsCopyHasNoReplacementChars() &&
    !Object.values(lo).some((value) => thaiScript.test(value)),
);

check("9. Report actions still work",
  client.includes('t("viewReport")') &&
    client.includes("function openReport") &&
    client.includes('setModal("export")') &&
    client.includes('setModal("schedule")') &&
    client.includes('setModal("favorites")') &&
    client.includes("onOpen={openReport}") &&
    client.includes("onSchedule") &&
    client.includes("onFavorite") &&
    client.includes("applyFilters") &&
    salesPage.includes('tReports("salesReport"') &&
    productsPage.includes('tReports("productReport"') &&
    inventoryPage.includes('tReports("inventoryReport"') &&
    purchasingPage.includes('tReports("purchasingReport"') &&
    copySource.includes("localizeReportLabel"),
);

console.log("\nphase-lao-08-reports-repair-check: PASS");
process.exit(0);
