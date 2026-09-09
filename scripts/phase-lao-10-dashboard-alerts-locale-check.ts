import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { DashboardAlertsClient } from "../features/dashboard/components/dashboard-interactions-client";
import { buildImportantAlertsView } from "../features/dashboard/localize-dashboard-alerts";
import type { DashboardAlert } from "../features/dashboard/dashboard-service";
import { getDashboardCopy } from "../lib/i18n/dashboard-copy";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  if (start < 0) fail(`missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) fail(`missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

function walkTsFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (["node_modules", ".next", "dist", "generated"].includes(entry)) continue;
      walkTsFiles(fullPath, files);
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

const client = read("features/dashboard/components/dashboard-interactions-client.tsx");
const loader = read("features/dashboard/components/dashboard-alerts-loader.tsx");
const page = read("app/(dashboard)/dashboard/page.tsx");
const copySource = read("lib/i18n/dashboard-copy.ts");
const appLocale = read("lib/i18n/use-app-locale.tsx");
const localizer = read("features/dashboard/localize-dashboard-alerts.ts");
const service = read("features/dashboard/dashboard-service.ts");

const alertsClient = sliceBetween(client, "export function DashboardAlertsClient(", "function ImportantAlertsFallbackCard(");
const importantCard = sliceBetween(client, "function ImportantAlertsCard(", "export function DashboardAlertsClient(");
const alertsFallback = client.slice(client.indexOf("export function DashboardAlertsFallback("));
const dashboardBody = sliceBetween(client, "export function DashboardInteractionsClient(", "function MetricCard(");

const sampleAlerts: DashboardAlert[] = [
  {
    message: "Products not sold for more than 30 days",
    severity: "warning",
    title: "Dead Stock",
    type: "Inventory",
    value: "4",
  },
  {
    message: "Sales lower than expected",
    severity: "warning",
    title: "Low Sales Warning",
    type: "Sales",
    value: "100% below average",
  },
];

const frozenAlerts = Object.freeze(sampleAlerts.map((alert) => Object.freeze({ ...alert })));

function renderProductionCard(locale: "en" | "lo") {
  return renderToString(
    createElement(DashboardAlertsClient, {
      alerts: frozenAlerts as DashboardAlert[],
      initialLocale: locale,
    }),
  );
}

const enView = buildImportantAlertsView(frozenAlerts as DashboardAlert[], "en");
const loView = buildImportantAlertsView(frozenAlerts as DashboardAlert[], "lo");
const enViewAgain = buildImportantAlertsView(frozenAlerts as DashboardAlert[], "en");
const enHtml = renderProductionCard("en");
const loHtml = renderProductionCard("lo");
const enHtmlAgain = renderProductionCard("en");

check(
  "1. Production card has its own AppLocaleProvider so streamed islands are not stuck on DEFAULT_LOCALE",
  alertsClient.includes("<AppLocaleProvider initialLocale={initialLocale}>") &&
    alertsClient.includes("<ImportantAlertsCard alerts={alerts} />") &&
    importantCard.includes("const locale = useAppLocale();") &&
    importantCard.includes("buildImportantAlertsView(alerts, locale)") &&
    loader.includes("cookies()") &&
    loader.includes("getServerLocale") &&
    loader.includes("initialLocale={initialLocale}") &&
    !loader.includes("copy={copy}") &&
    !alertsClient.includes("copy: DashboardCopy"),
);

check(
  "2. EN Important Alerts card render is English",
  enHtml.includes("Important Alerts") &&
    enHtml.includes("View Details") &&
    enHtml.includes("Inventory") &&
    enHtml.includes("Warning") &&
    enHtml.includes("Dead Stock") &&
    enHtml.includes("Products not sold for more than 30 days") &&
    enHtml.includes("Low Sales Warning") &&
    enHtml.includes("100% below average") &&
    !enHtml.includes(">warning<") &&
    enView.title === "Important Alerts" &&
    enView.viewDetails === "View Details",
);

check(
  "3. Same alerts data switches to Lao without navigation when locale is LO",
  loHtml.includes(getDashboardCopy("lo").importantAlerts) &&
    loHtml.includes(getDashboardCopy("lo").viewDetails) &&
    loHtml.includes(getDashboardCopy("lo").alertTypeInventory) &&
    loHtml.includes(getDashboardCopy("lo").alertTypeSales) &&
    loHtml.includes(getDashboardCopy("lo").warning) &&
    loHtml.includes(getDashboardCopy("lo").deadStock) &&
    loHtml.includes(getDashboardCopy("lo").alertDeadStockMessage) &&
    loHtml.includes(getDashboardCopy("lo").lowSalesWarning) &&
    loHtml.includes(getDashboardCopy("lo").alertLowSalesMessage) &&
    loHtml.includes("100%") &&
    loHtml.includes("ຕ່ຳກວ່າສະເລ່ຍ") &&
    !loHtml.includes("Important Alerts") &&
    !loHtml.includes("View Details") &&
    !loHtml.includes("Dead Stock") &&
    !loHtml.includes("Low Sales Warning") &&
    !loHtml.includes("below average") &&
    loView.title === getDashboardCopy("lo").importantAlerts &&
    loView.items[0]?.title === getDashboardCopy("lo").deadStock,
);

check(
  "4. LO -> EN returns immediately to English on the same alerts data",
  enHtmlAgain.includes("Important Alerts") &&
    enHtmlAgain.includes("View Details") &&
    enHtmlAgain.includes("Dead Stock") &&
    enHtmlAgain.includes("Low Sales Warning") &&
    enHtmlAgain.includes("100% below average") &&
    enViewAgain.title === enView.title &&
    enViewAgain.items[0]?.title === enView.items[0]?.title &&
    enViewAgain.items[1]?.value === "100% below average",
);

check(
  "5. Alert counts and numeric values remain unchanged across locale",
  enView.items[0]?.value === "4" &&
    loView.items[0]?.value === "4" &&
    enView.items[1]?.value?.startsWith("100%") === true &&
    loView.items[1]?.value?.startsWith("100%") === true &&
    enHtml.includes("4") &&
    loHtml.includes("4") &&
    service.includes('value: `${lowSalesPercent}% below average`') &&
    service.includes('title: "Dead Stock"') &&
    service.includes('title: "Low Sales Warning"'),
);

check(
  "6. No navigation/remount/refresh workaround and no server-frozen copy prop",
  !importantCard.includes("router.refresh") &&
    !alertsClient.includes("router.refresh") &&
    !alertsClient.includes("window.location") &&
    !loader.includes("router.refresh") &&
    !page.includes("router.refresh") &&
    !alertsClient.includes("LOCALE_CHANGE_EVENT") &&
    !loader.includes("copy={copy}") &&
    !page.includes("<DashboardAlertsFallback copy={copy} />") &&
    page.includes("<DashboardAlertsFallback initialLocale={locale} />") &&
    appLocale.includes("setLocale(detail.locale)"),
);

check(
  "7. Card, empty state, actions, and detail drawer consume live view copy",
  importantCard.includes("title={view.title}") &&
    importantCard.includes("actionLabel={view.viewDetails}") &&
    importantCard.includes("alert.severityLabel") &&
    importantCard.includes("<DetailDrawer content={content} copy={view.copy}") &&
    importantCard.includes("view.emptyTitle") &&
    localizer.includes("export function buildImportantAlertsView") &&
    localizer.includes("formatDashboardAlertSeverity") &&
    localizer.includes("alertBelowAverage"),
);

check(
  "8. Other Dashboard UI still uses the same locale source",
  dashboardBody.includes("const locale = useAppLocale();") &&
    dashboardBody.includes("const copy = getDashboardCopy(locale);") &&
    dashboardBody.includes("{alertsSlot ?? <ImportantAlertsCard alerts={snapshot.alerts} />}") &&
    !dashboardBody.includes("router.refresh") &&
    client.includes("snapshot.cards.salesTodayLak") &&
    client.includes("snapshot.cards.profitTodayLak"),
);

check(
  "9. Copy files keep approved strings and add only missing alert keys",
  copySource.includes('importantAlerts: "Important Alerts"') &&
    copySource.includes('importantAlerts: "ແຈ້ງເຕືອນ"') &&
    copySource.includes('viewDetails: "View Details"') &&
    copySource.includes('viewDetails: "ລາຍລະອຽດ"') &&
    copySource.includes('deadStock: "Dead Stock"') &&
    copySource.includes('deadStock: "ສິນຄ້າບໍ່ເຄື່ອນ"') &&
    copySource.includes('alertDeadStockMessage: "Products not sold for more than 30 days"') &&
    copySource.includes("alertDeadStockMessage: \"ສິນຄ້າ ບໍ່ຂາຍເກີນ 30 ວັນ\"") &&
    copySource.includes('lowSalesWarning: "Low Sales Warning"') &&
    copySource.includes('warning: "Warning"') &&
    copySource.includes('warning: "ເຕືອນ"') &&
    copySource.includes('alertBelowAverage: "{percent}% below average"') &&
    copySource.includes("alertBelowAverage: \"{percent}% ຕ່ຳກວ່າສະເລ່ຍ\"") &&
    alertsFallback.includes("<AppLocaleProvider initialLocale={initialLocale}>"),
);

const runtimeRoots = [
  join(process.cwd(), "app"),
  join(process.cwd(), "features"),
  join(process.cwd(), "components"),
  join(process.cwd(), "lib"),
];
const allowedImportantAlertsFiles = new Set([
  "lib/i18n/dashboard-copy.ts",
  "features/dashboard/components/dashboard-interactions-client.tsx",
  "features/dashboard/localize-dashboard-alerts.ts",
]);
const extraImportantAlertsFiles: string[] = [];
const extraCardRenderers: string[] = [];

for (const root of runtimeRoots) {
  for (const filePath of walkTsFiles(root)) {
    const rel = relative(process.cwd(), filePath).replaceAll("\\", "/");
    const source = readFileSync(filePath, "utf8");
    if (source.includes('"Important Alerts"') && !allowedImportantAlertsFiles.has(rel)) {
      extraImportantAlertsFiles.push(rel);
    }
    if (
      (source.includes("title={copy.importantAlerts}") || source.includes("title={view.title}")) &&
      rel !== "features/dashboard/components/dashboard-interactions-client.tsx"
    ) {
      extraCardRenderers.push(rel);
    }
  }
}

check(
  "10. No extra production Important Alerts renderer remains outside the live card",
  extraImportantAlertsFiles.length === 0 &&
    extraCardRenderers.length === 0 &&
    (client.match(/function ImportantAlertsCard\(/g) ?? []).length === 1 &&
    (client.match(/export function DashboardAlertsClient\(/g) ?? []).length === 1 &&
    !client.includes("function AlertsList("),
  [...extraImportantAlertsFiles, ...extraCardRenderers].join(", "),
);

console.log("\nphase-lao-10-dashboard-alerts-locale-check: PASS");
