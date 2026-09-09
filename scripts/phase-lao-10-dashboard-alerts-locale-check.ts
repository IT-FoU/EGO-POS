import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { localizeDashboardAlerts } from "../features/dashboard/localize-dashboard-alerts";
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

const client = read("features/dashboard/components/dashboard-interactions-client.tsx");
const loader = read("features/dashboard/components/dashboard-alerts-loader.tsx");
const page = read("app/(dashboard)/dashboard/page.tsx");
const copySource = read("lib/i18n/dashboard-copy.ts");
const appLocale = read("lib/i18n/use-app-locale.tsx");

const alertsClient = sliceBetween(client, "export function DashboardAlertsClient(", "export function DashboardAlertsFallback(");
const alertsFallback = client.slice(client.indexOf("export function DashboardAlertsFallback("));
const dashboardBody = sliceBetween(client, "export function DashboardInteractionsClient(", "function MetricCard(");

const sampleAlerts: DashboardAlert[] = [
  {
    message: "Products not sold for more than 30 days",
    severity: "warning",
    title: "Dead Stock",
    type: "Inventory",
  },
  {
    message: "3 products need stock review.",
    severity: "warning",
    title: "Low stock",
    type: "Inventory",
    value: "3",
  },
];

const enCopy = getDashboardCopy("en");
const loCopy = getDashboardCopy("lo");
const enAlerts = localizeDashboardAlerts(sampleAlerts, enCopy);
const loAlerts = localizeDashboardAlerts(sampleAlerts, loCopy);

check(
  "1. Important Alerts client uses canonical useAppLocale",
  alertsClient.includes("const locale = useAppLocale();") &&
    alertsClient.includes("const copy = getDashboardCopy(locale);") &&
    !alertsClient.includes("copy: DashboardCopy") &&
    client.includes('import { useAppLocale } from "@/lib/i18n/use-app-locale"'),
);

check(
  "2. EN Important Alerts copy is English",
  enCopy.importantAlerts === "Important Alerts" &&
    enCopy.viewDetails === "View Details" &&
    enCopy.noImportantAlerts === "No important alerts" &&
    enCopy.emptyAlerts === "No business alerts today." &&
    enAlerts[0]?.title === enCopy.deadStock &&
    enAlerts[1]?.title === enCopy.lowStock,
);

check(
  "3. Switching copy locale to LO localizes Important Alerts immediately",
  loCopy.importantAlerts === "ແຈ້ງເຕືອນ" &&
    loCopy.viewDetails === "ລາຍລະອຽດ" &&
    loCopy.noImportantAlerts === "ບໍ່ມີແຈ້ງເຕືອນ" &&
    loCopy.emptyAlerts !== enCopy.emptyAlerts &&
    loAlerts[0]?.title === loCopy.deadStock &&
    loAlerts[0]?.title !== enAlerts[0]?.title &&
    loAlerts[1]?.message.includes("3") &&
    loAlerts[1]?.title === loCopy.lowStock,
);

check(
  "4. No navigation/remount/refresh workaround",
  !alertsClient.includes("router.refresh") &&
    !alertsClient.includes("window.location") &&
    !alertsClient.includes("location.reload") &&
    !loader.includes("router.refresh") &&
    !page.includes("router.refresh") &&
    !alertsClient.includes("LOCALE_CHANGE_EVENT") &&
    appLocale.includes("setLocale(detail.locale)"),
);

check(
  "5. LO -> EN uses the same live copy source",
  getDashboardCopy("en").importantAlerts === "Important Alerts" &&
    alertsClient.includes("getDashboardCopy(locale)") &&
    alertsFallback.includes("const locale = useAppLocale();") &&
    alertsFallback.includes("const copy = getDashboardCopy(locale);") &&
    alertsFallback.includes("{copy.importantAlerts}"),
);

check(
  "6. Alert card, empty state, actions, and detail drawer consume live copy",
  alertsClient.includes("title={copy.importantAlerts}") &&
    alertsClient.includes("actionLabel={copy.viewDetails}") &&
    alertsClient.includes("<AlertsList alerts={alerts} copy={copy} />") &&
    alertsClient.includes("<DetailDrawer content={content} copy={copy}") &&
    client.includes("copy.noImportantAlerts") &&
    client.includes("copy.emptyAlerts") &&
    client.includes("localizeDashboardAlerts(alerts, copy)"),
);

check(
  "7. Loader passes alert data only; copy is not frozen from the server",
  loader.includes("<DashboardAlertsClient alerts={secondary.alerts} />") &&
    !loader.includes("copy={copy}") &&
    page.includes("<DashboardAlertsFallback />") &&
    !page.includes("<DashboardAlertsFallback copy={copy} />") &&
    page.includes("DashboardAlertsLoader"),
);

check(
  "8. Other Dashboard UI still uses the same locale source and no refresh workaround",
  dashboardBody.includes("const locale = useAppLocale();") &&
    dashboardBody.includes("const copy = getDashboardCopy(locale);") &&
    dashboardBody.includes("{alertsSlot ?? (") &&
    dashboardBody.includes("title={copy.importantAlerts}") &&
    !dashboardBody.includes("router.refresh") &&
    client.includes("snapshot.cards.salesTodayLak") &&
    client.includes("snapshot.cards.profitTodayLak"),
);

check(
  "9. Copy files are not rewritten",
  copySource.includes('importantAlerts: "Important Alerts"') &&
    copySource.includes("importantAlerts: \"ແຈ້ງເຕືອນ\"") &&
    copySource.includes('emptyAlerts: "No business alerts today."'),
);

console.log("\nphase-lao-10-dashboard-alerts-locale-check: PASS");
