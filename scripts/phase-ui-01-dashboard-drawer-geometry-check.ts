import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const client = read("features/dashboard/components/dashboard-interactions-client.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const service = read("features/dashboard/dashboard-service.ts");

const drawerStart = client.indexOf("function DetailDrawer(");
check("1. Shared DetailDrawer exists", drawerStart >= 0);
const drawerSource = client.slice(drawerStart);
const drawerBodyEnd = drawerSource.indexOf("\nfunction SummaryRow");
const drawerFn = drawerBodyEnd >= 0 ? drawerSource.slice(0, drawerBodyEnd) : drawerSource;

check(
  "2. DetailDrawer uses lg:left-72 Sidebar offset",
  drawerFn.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72'),
);

check(
  "3. No 5rem fallback remains in Dashboard DetailDrawer geometry",
  !drawerFn.includes("dashboard-sidebar-width") &&
    !drawerFn.includes("5rem") &&
    !client.includes("dashboard-sidebar-width") &&
    !client.includes("lg:left-[var("),
);

check(
  "4. Today Sales uses the repaired shared drawer",
  client.includes('detail: "sales"') &&
    client.includes("onClick={() => setDetail(metric.detail)}") &&
    client.includes('onAction={() => setDetail("sales")}') &&
    client.includes("<DetailDrawer content={activeDetail}") &&
    client.includes('title: copy.salesDetails'),
);

check(
  "5. Profit uses the same repaired drawer",
  client.includes('detail: "profit"') &&
    client.includes('title: copy.profitDetails') &&
    client.includes('if (detail === "profit")'),
);

check(
  "6. Cash Session uses the same repaired drawer",
  client.includes('detail: "cash_session"') &&
    client.includes('onAction={() => setDetail("cash_session")}') &&
    client.includes('if (detail === "cash_session")'),
);

check(
  "7. Payment Breakdown uses the same repaired drawer",
  client.includes('onAction={() => setDetail("payment")}') &&
    client.includes('if (detail === "payment")') &&
    client.includes('title: copy.paymentDetails'),
);

check(
  "8. Best Sellers uses the same repaired drawer",
  client.includes('onAction={() => setDetail("top_products")}') &&
    client.includes('if (detail === "top_products")'),
);

check(
  "9. Alerts use the same repaired drawer",
  client.includes("function ImportantAlertsCard(") &&
    client.includes("export function DashboardAlertsClient") &&
    client.includes("<DetailDrawer content={content}") &&
    (client.match(/<DetailDrawer /g) ?? []).length === 2,
);

check(
  "10. No Dashboard business logic changed",
  service.includes("const salesTodayLak = amount(salesKpis.totalRevenue)") &&
    service.includes("const topProducts = salesKpis.productRows.slice(0, 10)") &&
    client.includes("snapshot.cards.salesTodayLak") &&
    client.includes("snapshot.cards.profitTodayLak") &&
    client.includes("snapshot.shift.expectedCashLak") &&
    !client.includes("md:left-72") &&
    drawerFn.includes("inset-y-0") &&
    drawerFn.includes("right-0") &&
    !drawerFn.includes("md:left-72"),
);

console.log("\nphase-ui-01-dashboard-drawer-geometry-check: PASS");
