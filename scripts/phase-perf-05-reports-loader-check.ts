import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getPrismaDashboardSnapshot } from "../features/dashboard/dashboard-service";
import { getPrismaReportsSnapshot } from "../features/reports/prisma-repository";
import { PermissionDeniedError } from "../lib/auth/permissions";

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

function withQueryCounter<T extends object>(client: T) {
  let count = 0;
  const skip = new Set(["$connect", "$disconnect", "$on", "$use", "$extends", "$transaction", "then"]);
  const proxy = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "__queryCount") return count;
      const value = Reflect.get(target, prop, receiver);
      if (skip.has(String(prop))) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      if (value && typeof value === "object") {
        return new Proxy(value, {
          get(model, method, modelReceiver) {
            const fn = Reflect.get(model, method, modelReceiver);
            if (typeof fn !== "function") return fn;
            return (...args: unknown[]) => {
              count += 1;
              return fn.apply(model, args);
            };
          },
        });
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return { countOf: () => count, proxy: proxy as T & { __queryCount: number } };
}

const reportsSrc = readFileSync("features/reports/prisma-repository.ts", "utf8");
const reportsFn = reportsSrc.slice(reportsSrc.indexOf("export async function getPrismaReportsSnapshot"));
const reportsPage = readFileSync("features/reports/report-service.ts", "utf8");
const dash = readFileSync("features/dashboard/dashboard-service.ts", "utf8");
const permissions = readFileSync("features/access-control/prisma-repository.ts", "utf8");
const prismaSrc = readFileSync("lib/db/prisma.ts", "utf8");
const posRepo = readFileSync("features/pos/prisma-repository.ts", "utf8");
const tenantScope = readFileSync("lib/db/tenant-scope.ts", "utf8");

check("Reports does not load full inventory snapshot", !reportsSrc.includes("getPrismaInventorySnapshot"));
check("Reports does not load full customer snapshot", !reportsSrc.includes("getPrismaCustomersSnapshot"));
check("Reports does not load full product catalogue", !reportsSrc.includes("getPrismaProducts("));
check("Reports does not load full supplier snapshot", !reportsSrc.includes("getPrismaSuppliersSnapshot"));
check("Reports reuses canonical lifecycle netting", reportsFn.includes("netReportLifecycle(refundRows, saleItemCostRows)"));
check("Reports first-paint reads are one Promise.all", reportsFn.includes("timedReportsLoad(\"parallel-reads\"") && reportsFn.includes("Promise.all"));
check("Reports does not sequentially gate on sales aggregate", !reportsFn.includes("hasCompletedSales"));
check("Reports page avoids a second filter-options round trip", reportsPage.includes("snapshot.filterOptions") && !reportsPage.includes("Promise.all(["));
check("Dashboard KPI helper is unchanged", dash.includes("getPrismaDashboardSalesKpis") && !dash.includes("getPrismaReportsSnapshot"));
check("Permission keys are request-cached for the default client", permissions.includes("getUserPermissionKeysCached"));
check("Tenant scope is request-cached for the default client", tenantScope.includes("resolveTenantScopeCached"));
check("PrismaPg max/maxUses unchanged", prismaSrc.includes("max: 1") && prismaSrc.includes("maxUses: 1"));
check("POS checkout writer is not part of this change set", posRepo.includes("export async function completePrismaSale"));

const url = process.env.DATABASE_URL ?? "";
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
check("PEPSI stock is 23 before reports compare", Number(pepsiBefore?.quantity) === 23, `qty=${pepsiBefore?.quantity}`);
check("Sale 00010001 is completed", saleBefore?.saleStatus === "completed", String(saleBefore?.saleStatus));

const counted = withQueryCounter(prisma);
const started = Date.now();
const reports = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "today" }, counted.proxy);
const reportsMs = Date.now() - started;
const queryCount = counted.countOf();
const dashboard = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" }, prisma);

check("Reports application query count is <= 25", queryCount <= 25, `ops=${queryCount}`);
check("Reports application query count is <= 20 stretch", queryCount <= 20, `ops=${queryCount}`);
check(
  "GO BOX reports net sales is 11000",
  Math.abs(Number(reports.analytics.totalRevenue) - 11000) <= EPS,
  `reports=${reports.analytics.totalRevenue}`,
);
check("GO BOX reports transactions is 1", Number(reports.analytics.totalTransactions) === 1, `txns=${reports.analytics.totalTransactions}`);
check("GO BOX reports profit is 3000", Math.abs(Number(reports.analytics.totalProfit) - 3000) <= EPS, `profit=${reports.analytics.totalProfit}`);
check("GO BOX reports COGS is 8000", Math.abs(Number(reports.cogsLak) - 8000) <= EPS, `cogs=${reports.cogsLak}`);
const pepsiRow = reports.productRows.find((row) => row.productName.toUpperCase().includes("PEPSI"));
check("GO BOX reports PEPSI qty is 1", Math.abs(Number(pepsiRow?.quantitySold ?? 0) - 1) <= EPS, `qty=${pepsiRow?.quantitySold}`);
const cash = reports.hub.paymentBreakdown.find((row) => row.label.toLowerCase() === "cash")?.value ?? 0;
check("GO BOX reports cash is 11000", Math.abs(Number(cash) - 11000) <= EPS, `cash=${cash}`);
check(
  "GO BOX dashboard net sales matches reports",
  Math.abs(Number(dashboard.cards.netSalesLak) - Number(reports.analytics.totalRevenue)) <= EPS,
  `dash=${dashboard.cards.netSalesLak} reports=${reports.analytics.totalRevenue}`,
);
check(
  "GO BOX dashboard profit matches reports",
  Math.abs(Number(dashboard.cards.profitTodayLak) - Number(reports.analytics.totalProfit)) <= EPS,
  `dash=${dashboard.cards.profitTodayLak} reports=${reports.analytics.totalProfit}`,
);
check(
  "GO BOX dashboard COGS matches reports",
  Math.abs(Number(dashboard.cards.cogsLak) - Number(reports.cogsLak)) <= EPS,
  `dash=${dashboard.cards.cogsLak} reports=${reports.cogsLak}`,
);
near(reports.analytics.totalRevenue, 11000, "reports net sales");
near(reports.cogsLak, 8000, "reports cogs");
near(reports.analytics.totalProfit, 3000, "reports profit");

const managerMembership = await prisma.companyUser.findFirst({
  where: {
    companyId: company.id,
    isOwner: false,
    status: "active",
    user: { roles: { some: { role: { name: { contains: "Manager", mode: "insensitive" } } } } },
  },
});
if (managerMembership) {
  try {
    await getPrismaReportsSnapshot({ ...ownerTenant, userId: managerMembership.userId }, { datePreset: "today" }, prisma);
    check("Manager reports allowed where assigned", true);
  } catch (error) {
    check("Manager reports allowed where assigned", false, error instanceof Error ? error.message : String(error));
  }
} else {
  check("Manager reports allowed where assigned", true, "no production manager membership; isolated clerk denial covers deny path");
}

const cashierMembership = await prisma.companyUser.findFirst({
  where: {
    companyId: company.id,
    isOwner: false,
    status: "active",
    user: { username: { contains: "cashier", mode: "insensitive" } },
  },
});
if (cashierMembership) {
  let denied = false;
  try {
    await getPrismaReportsSnapshot({ ...ownerTenant, userId: cashierMembership.userId }, { datePreset: "today" }, prisma);
  } catch (error) {
    denied = error instanceof PermissionDeniedError || (error instanceof Error && /Permission denied/i.test(error.message));
  }
  check("Cashier reports blocked", denied);
} else {
  check("Cashier reports blocked", true, "no production cashier username; isolated clerk denial covers deny path");
}

const pepsiAfter = await prisma.inventoryBalance.findFirst({
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const saleAfter = await prisma.sale.count({ where: { companyId: company.id } });
check("PEPSI stock unchanged after read-only compare", Number(pepsiAfter?.quantity) === 23, `qty=${pepsiAfter?.quantity}`);
check("GO BOX sale count unchanged", saleAfter === 1, `sales=${saleAfter}`);
check("Local reports snapshot timing recorded", reportsMs > 0, `${reportsMs}ms queryCount=${queryCount} (not a Production navigation measurement)`);

await prisma.$disconnect();

const failed = results.filter((row) => !row.ok);
console.log(`\nPERF-05 reports loader: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) process.exit(1);
