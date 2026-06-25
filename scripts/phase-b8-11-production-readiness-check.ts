/**
 * B8-11 Final Production Readiness Audit harness.
 * Run: npx tsx scripts/phase-b8-11-production-readiness-check.ts
 */
import { existsSync, readFileSync } from "node:fs";

process.env.IGO_DEMO_MODE = "false";
delete process.env.IGO_ENABLE_DEMO_FALLBACK;

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE" || key === "IGO_ENABLE_DEMO_FALLBACK") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const { prisma } = await import("../lib/db/prisma");
const { isDemoMode, isDemoFallbackEnabled } = await import("../lib/demo-mode");
const { assertPermission, PermissionDeniedError } = await import("../lib/auth/permissions");
const { getPrismaSettings } = await import("../features/settings/prisma-repository");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const EPS = 0.01;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function near(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}
function read(path: string) {
  return readFileSync(path, "utf8");
}
async function expectDenied(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected permission denial");
  } catch (error) {
    check(name, error instanceof PermissionDeniedError, error instanceof Error ? error.message : String(error));
  }
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const managerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: managerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: "foreign-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

// --- 1. Environment / demo gates ---
check("A1. isDemoMode defaults false in harness", isDemoMode() === false);
check("A2. isDemoFallbackEnabled defaults false", isDemoFallbackEnabled() === false);

const sessionSrc = read("lib/auth/session.ts");
check(
  "A3. Session demo fallback gated by isDemoFallbackEnabled",
  sessionSrc.includes("isDemoFallbackEnabled"),
);

// --- 2. Static production source-of-truth audit ---
const productionServices = [
  "features/pos/pos-service.ts",
  "features/dashboard/dashboard-service.ts",
  "features/reports/report-service.ts",
  "features/settings/settings-service.ts",
  "features/inventory/inventory-service.ts",
  "features/purchasing/purchasing-service.ts",
  "features/customers/customer-service.ts",
  "features/promotions/promotion-service.ts",
].filter(existsSync);

for (const servicePath of productionServices) {
  const src = read(servicePath);
  check(
    `B. ${servicePath} has no mock-data import`,
    !/mock-data/.test(src),
  );
  check(
    `B. ${servicePath} has no isDemoMode read branch`,
    !/isDemoMode/.test(src),
  );
}

const posClient = read("features/pos/components/pos-page-client.tsx");
const settingsForm = read("features/settings/components/settings-form.tsx");
const dashboardShell = read("components/layout/dashboard-shell.tsx");
check(
  "B2. Settings form does not write demo settings repository",
  !settingsForm.includes("demoSettingsRepository.writeSettings"),
);
check(
  "B3. Dashboard shell does not read demo settings repository",
  !dashboardShell.includes("demoSettingsRepository"),
);
check(
  "B4. POS recent sales uses server fetch when demoMode false",
  posClient.includes("refreshRecentSalesFromServer") && posClient.includes("fetchRecentSales"),
);

// --- 3. User journey route surfaces exist ---
const journeyRoutes = [
  "app/(auth)/login/page.tsx",
  "app/(dashboard)/dashboard/page.tsx",
  "app/(dashboard)/products/page.tsx",
  "app/(dashboard)/inventory/page.tsx",
  "app/(dashboard)/purchasing/page.tsx",
  "app/(dashboard)/pos/page.tsx",
  "app/(dashboard)/reports/page.tsx",
  "app/(dashboard)/settings/page.tsx",
  "app/api/pos/sales/route.ts",
  "app/api/approvals/route.ts",
  "app/api/settings/route.ts",
];
for (const route of journeyRoutes) {
  check(`C. Journey route exists: ${route}`, existsSync(route));
}

// --- 4. Security / permissions ---
await assertPermission(ownerTenant, "dashboard.view");
check("D1. Owner can view dashboard", true);
await assertPermission(ownerTenant, "settings.manage");
check("D2. Owner can manage settings", true);
await assertPermission(managerTenant, "reports.view");
check("D3. Manager can view reports", true);
await expectDenied("D4. Cashier blocked from settings.manage", () => assertPermission(cashierTenant, "settings.manage"));
await expectDenied("D5. Cashier blocked from products.create", () => assertPermission(cashierTenant, "products.create"));
await expectDenied("D6. Cross-company dashboard blocked", () => assertPermission(foreignTenant, "dashboard.view"));

// --- 5. Accounting / data integrity cross-checks ---
const now = new Date();
const start = new Date(now);
start.setHours(0, 0, 0, 0);
const end = new Date(start);
end.setDate(end.getDate() + 1);

const dashboard = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" });
const reports = await getPrismaReportsSnapshot(ownerTenant, {
  branchId: BRANCH_ID,
  dateFrom: start,
  datePreset: "custom",
  dateTo: new Date(end.getTime() - 1),
  warehouseId: WAREHOUSE_ID,
});

check(
  "E1. Dashboard sales equals report sales (today)",
  near(Number(dashboard.cards.salesTodayLak), Number(reports.analytics.totalRevenue)),
  `dashboard=${dashboard.cards.salesTodayLak}, report=${reports.analytics.totalRevenue}`,
);
check(
  "E2. Dashboard profit equals report profit (today)",
  near(Number(dashboard.cards.profitTodayLak), Number(reports.analytics.totalProfit)),
  `dashboard=${dashboard.cards.profitTodayLak}, report=${reports.analytics.totalProfit}`,
);
check(
  "E3. Dashboard inventory valuation equals report inventory",
  near(Number(dashboard.cards.inventoryValueLak), Number(reports.hub.inventoryValueLak)),
);
check(
  "E4. Dashboard supplier payables equals report payables",
  near(
    Number(dashboard.cards.supplierPayablesDueLak),
    Number(reports.supplierPayables.reduce((total, row) => total + Number(row.payableBalanceLak), 0)),
  ),
);

const openSession = await prisma.cashSession.findFirst({
  where: { branchId: BRANCH_ID, companyId: COMPANY_ID, closedAt: null },
  orderBy: { openedAt: "desc" },
});
if (openSession) {
  const expected = Number(openSession.expectedCash ?? 0);
  check(
    "E5. Open cash session expected cash is non-negative",
    expected >= 0,
    `expected=${expected}`,
  );
} else {
  check("E5. Open cash session expected cash is non-negative", true, "no open session (skipped)");
}

const settings = await getPrismaSettings(ownerTenant);
const posSnapshot = await getPrismaPosSnapshot(ownerTenant);
check(
  "E6. POS receipt prefix matches DB settings",
  posSnapshot.receiptSettings.receiptPrefix === settings.receiptPrefix,
  `pos=${posSnapshot.receiptSettings.receiptPrefix}, db=${settings.receiptPrefix}`,
);

// --- 6. Write path demo guard ---
const { assertProductionWritesEnabled, DemoModeWriteError } = await import("../lib/db/write-context");
try {
  assertProductionWritesEnabled();
  check("F1. Production writes enabled when IGO_DEMO_MODE=false", true);
} catch (error) {
  check("F1. Production writes enabled when IGO_DEMO_MODE=false", false, error instanceof Error ? error.message : String(error));
}

process.env.IGO_DEMO_MODE = "true";
const { isDemoMode: demoOn } = await import("../lib/demo-mode");
const { assertProductionWritesEnabled: assertWritesDemo } = await import("../lib/db/write-context");
check("F2. isDemoMode true when env set", demoOn() === true);
try {
  assertWritesDemo();
  check("F3. Production writes blocked when IGO_DEMO_MODE=true", false, "expected DemoModeWriteError");
} catch (error) {
  check("F3. Production writes blocked when IGO_DEMO_MODE=true", error instanceof DemoModeWriteError);
}
process.env.IGO_DEMO_MODE = "false";

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nB8-11 production readiness audit: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
