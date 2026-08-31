import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaDashboardSnapshot } from "../features/dashboard/dashboard-service";
import { getPrismaReportsSnapshot } from "../features/reports/prisma-repository";
import { PermissionDeniedError } from "../lib/auth/permissions";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const EPS = 1;

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
process.env.IGO_DEMO_MODE = "false";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function near(actual: unknown, expected: number, message: string) {
  const value = Math.round(Number(actual ?? 0));
  if (Math.abs(value - expected) > EPS) {
    throw new Error(`${message}: expected ${expected}, got ${value}`);
  }
}

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const dash = readFileSync("features/dashboard/dashboard-service.ts", "utf8");
const criticalFn = dash.slice(
  dash.indexOf("async function loadDashboardCriticalSnapshot"),
  dash.indexOf("async function loadDashboardSecondarySlice"),
);
const reportsSrc = readFileSync("features/reports/prisma-repository.ts", "utf8");
const permissions = readFileSync("features/access-control/prisma-repository.ts", "utf8");
const prismaSrc = readFileSync("lib/db/prisma.ts", "utf8");
const reportsPage = readFileSync("features/reports/report-service.ts", "utf8");
const posRepo = readFileSync("features/pos/prisma-repository.ts", "utf8");

check("Dashboard uses lightweight sales KPI loader", dash.includes("getPrismaDashboardSalesKpis"));
check("Dashboard does not embed full Reports snapshot", !dash.includes("getPrismaReportsSnapshot"));
check("Dashboard does not load inventory/customer/product/supplier snapshots", !dash.includes("getPrismaInventorySnapshot") && !dash.includes("getPrismaCustomersSnapshot") && !dash.includes("getPrismaProducts(") && !dash.includes("getPrismaSuppliersSnapshot"));
check("Dashboard KPI helper reuses netReportLifecycle", reportsSrc.includes("export async function getPrismaDashboardSalesKpis") && reportsSrc.includes("netReportLifecycle(refundRows, saleItemCostRows)"));
check("Dashboard critical path runs sales KPIs before cash", criticalFn.includes("critical-sales-kpis") && criticalFn.includes("critical-cash-sessions") && criticalFn.indexOf("critical-sales-kpis") < criticalFn.indexOf("critical-cash-sessions"));
check("Dashboard cash-session totals remain Promise.all", criticalFn.includes("timedDashboardLoad(\"critical-cash-totals\"") && criticalFn.includes("Promise.all"));
check("Critical path does not query inventory lots or dead stock", !criticalFn.includes("inventoryLot.count") && !criticalFn.includes("deadStockCutoff") && !criticalFn.includes("inventoryBalance.findMany"));
check("Recent activity is limited to 20 netted sales", criticalFn.includes("salesKpis.nettedSales.slice(0, 20)"));
check("Expiry widgets use counts instead of full lot payloads", dash.includes("inventoryLot.count") && !dash.includes("inventoryLot.findMany"));
check("Historical sales uses aggregate not row loading", dash.includes("sale.aggregate") && !dash.includes("historicalSales as Array"));
check("Permission keys are request-cached for the default client", permissions.includes("getUserPermissionKeysCached"));
check("PrismaPg max/maxUses unchanged", prismaSrc.includes("max: 1") && prismaSrc.includes("maxUses: 1"));
check("Reports page loader is unchanged in this phase", reportsPage.includes("getPrismaReportsSnapshot"));
check("POS checkout writer is not part of this change set", posRepo.includes("export async function completePrismaSale"));

if (process.env.EGO_PRODUCTION_READONLY !== "true") {
  console.log("Skipping Production live queries (set EGO_PRODUCTION_READONLY=true)");
  const failed = results.filter((row) => !row.ok);
  console.log(`\nPERF-04 dashboard loader: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
  if (failed.length) process.exit(1);
  process.exit(0);
}

loadProjectEnvFiles();
const url = resolveScriptDatabaseUrl("production-readonly");
assert(url.includes(TARGET_REF), "Refusing non-Production database");
assert(!url.includes(GOFLO_REF) && !url.includes(OLD_PRO_REF), "Refusing inactive PRO or GoFLO database");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url, ssl: { rejectUnauthorized: false } }),
});

const company = await prisma.company.findFirst({ where: { storeCode: "0001" } });
assert(company, "GO BOX storeCode 0001 was not found");
const ownerMembership = await prisma.companyUser.findFirst({
  include: { user: true },
  where: { companyId: company.id, isOwner: true, status: "active" },
});
assert(ownerMembership, "GO BOX owner membership was not found");
const branch = await prisma.branch.findFirst({
  orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
  where: { companyId: company.id },
});
const warehouse = await prisma.warehouse.findFirst({
  orderBy: { createdAt: "asc" },
  where: { companyId: company.id },
});
assert(branch && warehouse, "GO BOX branch/warehouse missing");

const ownerTenant = {
  branchId: branch.id,
  companyId: company.id,
  userId: ownerMembership.userId,
  warehouseId: warehouse.id,
};

const pepsiBefore = await prisma.inventoryBalance.findFirst({
  include: { product: { select: { barcode: true, nameEn: true } } },
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const saleBefore = await prisma.sale.findFirst({
  where: { companyId: company.id, saleNo: "00010001" },
});
check("PEPSI stock is 23 before dashboard compare", Number(pepsiBefore?.quantity) === 23, `qty=${pepsiBefore?.quantity}`);
check("Sale 00010001 is completed", saleBefore?.saleStatus === "completed", String(saleBefore?.saleStatus));

const dashStarted = Date.now();
const dashboard = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" }, prisma);
const dashMs = Date.now() - dashStarted;
const reports = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "today" }, prisma);

check("GO BOX dashboard sales is 11000", Math.abs(Number(dashboard.cards.salesTodayLak) - 11000) <= EPS, `sales=${dashboard.cards.salesTodayLak}`);
check("GO BOX dashboard transactions is 1", Number(dashboard.cards.totalBillsToday) === 1, `txns=${dashboard.cards.totalBillsToday}`);
check("GO BOX dashboard net sales matches reports", Math.abs(Number(dashboard.cards.netSalesLak) - Number(reports.analytics.totalRevenue)) <= EPS, `dash=${dashboard.cards.netSalesLak} reports=${reports.analytics.totalRevenue}`);
check("GO BOX dashboard profit matches reports", Math.abs(Number(dashboard.cards.profitTodayLak) - Number(reports.analytics.totalProfit)) <= EPS, `dash=${dashboard.cards.profitTodayLak} reports=${reports.analytics.totalProfit}`);
check("GO BOX dashboard COGS matches reports", Math.abs(Number(dashboard.cards.cogsLak) - Number(reports.cogsLak)) <= EPS, `dash=${dashboard.cards.cogsLak} reports=${reports.cogsLak}`);
check("GO BOX reports net sales is 11000", Math.abs(Number(reports.analytics.totalRevenue) - 11000) <= EPS, `reports=${reports.analytics.totalRevenue}`);
check("GO BOX reports profit is 3000", Math.abs(Number(reports.analytics.totalProfit) - 3000) <= EPS, `reports=${reports.analytics.totalProfit}`);
check("GO BOX reports COGS is 8000", Math.abs(Number(reports.cogsLak) - 8000) <= EPS, `reports=${reports.cogsLak}`);
near(dashboard.cards.netSalesLak, 11000, "dashboard net sales");
near(dashboard.cards.cogsLak, 8000, "dashboard cogs");
near(dashboard.cards.profitTodayLak, 3000, "dashboard profit");

const pepsiAfter = await prisma.inventoryBalance.findFirst({
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const saleAfter = await prisma.sale.count({ where: { companyId: company.id } });
check("PEPSI stock unchanged after read-only compare", Number(pepsiAfter?.quantity) === 23, `qty=${pepsiAfter?.quantity}`);
check("GO BOX sale count unchanged", saleAfter === 1, `sales=${saleAfter}`);
check("Local dashboard snapshot timing recorded", dashMs > 0, `${dashMs}ms (not a Production navigation measurement)`);

await prisma.$disconnect();

const failed = results.filter((row) => !row.ok);
console.log(`\nPERF-04 dashboard loader: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) process.exit(1);
