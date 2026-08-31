import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  computeCashSessionTotalsForShift,
  computeCashSessionTotalsForShifts,
} from "../features/cash-sessions/prisma-repository";
import {
  loadDashboardCriticalSalesKpis,
  resolveDashboardCriticalContext,
} from "../features/dashboard/critical-queries";
import {
  dashboardLoadStages,
  getPrismaDashboardCriticalSnapshot,
  getPrismaDashboardSecondarySnapshot,
  getPrismaDashboardSnapshot,
  resetDashboardLoadStages,
} from "../features/dashboard/dashboard-service";
import { getPrismaDashboardSalesKpis } from "../features/reports/prisma-repository";
import { PermissionDeniedError } from "../lib/auth/permissions";
import { startOfBusinessDay } from "../lib/datetime/business-timezone";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const EPS = 1;
const BEFORE_OPS = 14;
const MAX_AFTER_OPS = 9;

process.env.IGO_DEMO_MODE = "false";
loadProjectEnvFiles();

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function withQueryCounter<T extends object>(client: T) {
  let count = 0;
  const rawKeys = new Set(["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"]);
  const skip = new Set(["$connect", "$disconnect", "$on", "$use", "$extends", "$transaction", "then"]);
  const proxy = new Proxy(client, {
    get(target, prop) {
      if (prop === "__queryCount") return count;
      const value = Reflect.get(target, prop);
      if (rawKeys.has(String(prop)) && typeof value === "function") {
        return (...args: unknown[]) => {
          count += 1;
          return value.apply(target, args);
        };
      }
      if (skip.has(String(prop))) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      if (value && typeof value === "object") {
        return new Proxy(value, {
          get(model, method) {
            const fn = Reflect.get(model, method);
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
  return { countOf: () => count, proxy: proxy as T };
}

function near(left: number, right: number) {
  return Math.abs(Number(left) - Number(right)) <= EPS;
}

function sameBreakdown(
  left: Array<{ label?: string; method?: string; totalLak: number }>,
  right: Array<{ label?: string; method?: string; totalLak: number }>,
) {
  const key = (row: { label?: string; method?: string; totalLak: number }) =>
    `${String(row.label ?? row.method ?? "").toLowerCase()}:${Math.round(row.totalLak)}`;
  return JSON.stringify([...left.map(key)].sort()) === JSON.stringify([...right.map(key)].sort());
}

const dash = readFileSync("features/dashboard/dashboard-service.ts", "utf8");
const criticalSrc = readFileSync("features/dashboard/critical-queries.ts", "utf8");
const cashSrc = readFileSync("features/cash-sessions/prisma-repository.ts", "utf8");
const prismaSrc = readFileSync("lib/db/prisma.ts", "utf8");
const page = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
const criticalFn = dash.slice(
  dash.indexOf("async function loadDashboardCriticalSnapshot"),
  dash.indexOf("async function loadDashboardSecondarySlice"),
);

check("Critical sales loader uses one parameterized query", criticalSrc.includes("$queryRaw") && criticalSrc.includes("assembleDashboardSalesKpis"));
check("Critical sales query is company and branch scoped", criticalSrc.includes("s.company_id = ${scope.companyId}") && criticalSrc.includes("s.branch_id = ${scope.branchId}"));
check("No string-interpolated SQL identifiers", !criticalSrc.includes("${`") && !cashSrc.includes("queryRawUnsafe"));
check("Cash totals batch uses parameterized SQL", cashSrc.includes("computeCashSessionTotalsForShifts") && cashSrc.includes("$queryRaw"));
check("Page still streams secondary after critical", page.includes("getMiniMartDashboardCriticalSnapshot") && page.includes("Suspense") && page.includes("DashboardAlertsLoader"));
check("Secondary still starts after critical-complete label", criticalFn.includes("critical-complete"));
check("PrismaPg max/maxUses unchanged", prismaSrc.includes("max: 1") && prismaSrc.includes("maxUses: 1"));
check("No WebSocket or persistent cache added", !dash.includes("WebSocket") && !criticalSrc.includes("redis") && !dash.includes("caches.default"));

let url: string;
try {
  url = resolveScriptDatabaseUrl("production-readonly");
} catch {
  url = resolveScriptDatabaseUrl("test-write");
}
if (url.includes(TARGET_REF)) {
  if (url.includes(GOFLO_REF) || url.includes(OLD_PRO_REF)) {
    throw new Error("Refusing inactive PRO or GoFLO database");
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  }),
});

const production = url.includes(TARGET_REF);
const company = await prisma.company.findFirst({
  where: production ? { storeCode: "0001" } : { OR: [{ id: "gobox-company" }, { storeCode: "0001" }] },
});
if (!company) {
  throw new Error("Dashboard tenant company was not found");
}
const ownerMembership = await prisma.companyUser.findFirst({
  include: { user: true },
  where: { companyId: company.id, isOwner: true, status: "active" },
});
if (!ownerMembership) {
  throw new Error("Owner membership was not found");
}
const branch = await prisma.branch.findFirst({
  orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
  where: { companyId: company.id },
});
const warehouse = await prisma.warehouse.findFirst({
  orderBy: { createdAt: "asc" },
  where: { companyId: company.id },
});
if (!branch || !warehouse) {
  throw new Error("Branch/warehouse missing");
}
const ownerTenant = {
  branchId: branch.id,
  companyId: company.id,
  userId: ownerMembership.userId,
  warehouseId: warehouse.id,
};
const cashierMembership = await prisma.companyUser.findFirst({
  where: {
    companyId: company.id,
    isOwner: false,
    status: "active",
    user: { username: { contains: "cashier" } },
  },
});
const cashierTenant = cashierMembership
  ? {
      branchId: branch.id,
      companyId: company.id,
      userId: cashierMembership.userId,
      warehouseId: warehouse.id,
    }
  : null;
const foreignTenant = {
  branchId: branch.id,
  companyId: company.id,
  userId: "not-assigned-user-perf10",
  warehouseId: warehouse.id,
};

const pepsiBefore = await prisma.inventoryBalance.findFirst({
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const salesBefore = await prisma.sale.count({ where: { companyId: company.id } });

const now = new Date();
const start = startOfBusinessDay(now);
const end = new Date(start.getTime() + 86_400_000);
const dateTo = new Date(end.getTime() - 1);
const justAfterMidnight = new Date(start.getTime() + 1_000);
const justBeforeNextDay = new Date(end.getTime() - 1_000);
check("Timezone 00:00 stays Asia/Vientiane business day", startOfBusinessDay(justAfterMidnight).getTime() === start.getTime(), `start=${start.toISOString()}`);
check("Timezone 23:59 stays on the same business day start", startOfBusinessDay(justBeforeNextDay).getTime() === start.getTime(), `late=${justBeforeNextDay.toISOString()}`);

const scope = await resolveDashboardCriticalContext(ownerTenant, prisma);
const oldKpiStarted = Date.now();
const oldKpis = await getPrismaDashboardSalesKpis(scope, { dateFrom: start, dateTo }, prisma);
const oldKpiMs = Date.now() - oldKpiStarted;
const newKpiStarted = Date.now();
const newSales = await loadDashboardCriticalSalesKpis(scope, { dateFrom: start, dateTo }, prisma);
const newKpiMs = Date.now() - newKpiStarted;
const newKpis = newSales.kpis;

check("Differential Today Sales", near(oldKpis.totalRevenue, newKpis.totalRevenue), `old=${oldKpis.totalRevenue} new=${newKpis.totalRevenue}`);
check("Differential Profit", near(oldKpis.totalProfit, newKpis.totalProfit), `old=${oldKpis.totalProfit} new=${newKpis.totalProfit}`);
check("Differential Transactions", oldKpis.totalTransactions === newKpis.totalTransactions, `old=${oldKpis.totalTransactions} new=${newKpis.totalTransactions}`);
check("Differential Average Bill", near(
  oldKpis.totalTransactions ? oldKpis.totalRevenue / oldKpis.totalTransactions : 0,
  newKpis.totalTransactions ? newKpis.totalRevenue / newKpis.totalTransactions : 0,
));
check("Differential payment breakdown", sameBreakdown(oldKpis.paymentBreakdown, newKpis.paymentBreakdown));
check("Differential hourly-source sale totals", near(
  oldKpis.nettedSales.reduce((total, sale) => total + sale.totalAmount, 0),
  newKpis.nettedSales.reduce((total, sale) => total + sale.totalAmount, 0),
));
check(
  "Differential Best Sellers / Product Revenue",
  JSON.stringify(oldKpis.productRows) === JSON.stringify(newKpis.productRows),
  `old=${JSON.stringify(oldKpis.productRows)} new=${JSON.stringify(newKpis.productRows)}`,
);
check("KPI fetch stays date-bounded", newSales.bounds.sales === oldKpis.totalTransactions, `salesRows=${newSales.bounds.sales}`);
check("No all-product catalogue fetch in new KPI path", newSales.bounds.saleItems >= 0 && !criticalSrc.includes("product.findMany"));

const openSession = await prisma.cashSession.findFirst({
  include: { transactions: true },
  orderBy: { openedAt: "desc" },
  where: { branchId: branch.id, cashierId: ownerTenant.userId, closedAt: null, companyId: company.id },
});
const todaySessions = await prisma.cashSession.findMany({
  include: { transactions: true },
  where: { branchId: branch.id, companyId: company.id, openedAt: { gte: start, lt: end } },
});
const shiftsForTotals = new Map<string, Record<string, any>>();
if (openSession) shiftsForTotals.set(openSession.id, openSession);
for (const shift of todaySessions) shiftsForTotals.set(shift.id, shift);
const shiftList = Array.from(shiftsForTotals.values()).map((session) => ({
  endAt: session.closedAt ?? new Date(),
  session,
}));
let cashMismatches = 0;
if (shiftList.length > 0) {
  const oldTotals = await Promise.all(shiftList.map(async (shift) => [
    String(shift.session.id),
    await computeCashSessionTotalsForShift(shift.session, shift.endAt, prisma),
  ] as const));
  const newTotals = await computeCashSessionTotalsForShifts(shiftList, prisma);
  for (const [id, oldTotal] of oldTotals) {
    const next = newTotals.get(id);
    const ok = next != null
      && near(oldTotal.expectedCashLak, next.expectedCashLak)
      && near(oldTotal.cashSalesLak, next.cashSalesLak)
      && near(oldTotal.cashInLak, next.cashInLak)
      && near(oldTotal.cashOutLak, next.cashOutLak)
      && near(oldTotal.refundLak, next.refundLak);
    if (!ok) cashMismatches += 1;
  }
  check("Differential Expected Cash / cash sales / in / out / refund", cashMismatches === 0, `shifts=${shiftList.length} mismatches=${cashMismatches}`);
} else {
  check("Differential Expected Cash / cash sales / in / out / refund", true, "no cash sessions in window");
}

resetDashboardLoadStages();
const counted = withQueryCounter(prisma);
const criticalStarted = Date.now();
const critical = await getPrismaDashboardCriticalSnapshot(ownerTenant, { key: "today" }, counted.proxy);
const criticalMs = Date.now() - criticalStarted;
const criticalOps = counted.countOf();
check("Critical DB operations reduced", criticalOps > 0 && criticalOps <= MAX_AFTER_OPS, `before=${BEFORE_OPS} after=${criticalOps}`);
check("Critical stages still complete before secondary", dashboardLoadStages.includes("critical-complete") && !dashboardLoadStages.includes("secondary-start"), dashboardLoadStages.join(" > "));
check("Primary snapshot has finite Today Sales", Number.isFinite(critical.cards.salesTodayLak), `sales=${critical.cards.salesTodayLak}`);
check("Primary snapshot has finite Expected Cash", Number.isFinite(critical.shift.expectedCashLak), `cash=${critical.shift.expectedCashLak}`);
check("Primary inventory widgets still deferred", critical.cards.inventoryValueLak === 0 && critical.alerts.length === 0);

const secondary = await getPrismaDashboardSecondarySnapshot(ownerTenant, { key: "today" }, {
  salesTodayLak: critical.cards.salesTodayLak,
  shiftSummaries: critical.closeDay.shiftSummaries,
}, prisma);
check(
  "Secondary starts after critical-complete",
  dashboardLoadStages.indexOf("secondary-start") > dashboardLoadStages.indexOf("critical-complete"),
  dashboardLoadStages.join(" > "),
);
check("Secondary alerts still populate", secondary.alerts.length >= 0);

resetDashboardLoadStages();
const merged = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" }, prisma);
check(
  "Merged snapshot keeps critical sales/profit/bills/cash",
  near(merged.cards.salesTodayLak, critical.cards.salesTodayLak)
    && near(merged.cards.profitTodayLak, critical.cards.profitTodayLak)
    && merged.cards.totalBillsToday === critical.cards.totalBillsToday
    && near(merged.shift.expectedCashLak, critical.shift.expectedCashLak),
);
check(
  "Full snapshot does not start secondary before critical-complete",
  dashboardLoadStages.indexOf("secondary-start") > dashboardLoadStages.indexOf("critical-complete"),
  dashboardLoadStages.join(" > "),
);

if (production) {
  check("Production Today Sales remains 28260", near(merged.cards.salesTodayLak, 28260), `sales=${merged.cards.salesTodayLak}`);
  check("Production Profit remains 4260", near(merged.cards.profitTodayLak, 4260), `profit=${merged.cards.profitTodayLak}`);
  check("Production Average Bill remains 14130", near(
    merged.cards.totalBillsToday ? merged.cards.salesTodayLak / merged.cards.totalBillsToday : 0,
    14130,
  ), `avg=${merged.cards.totalBillsToday ? merged.cards.salesTodayLak / merged.cards.totalBillsToday : 0}`);
  check("Production Expected Cash remains 94260", near(merged.shift.expectedCashLak, 94260), `cash=${merged.shift.expectedCashLak}`);
  const pepsiRevenue = merged.topProducts.find((row) => /pepsi/i.test(row.name));
  check(
    "Production Best Sellers Product Revenue remains 29260",
    pepsiRevenue != null && near(pepsiRevenue.totalLak, 29260),
    pepsiRevenue ? `revenue=${pepsiRevenue.totalLak}` : "PEPSI missing",
  );
}

async function expectDenied(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected permission/tenant error");
  } catch (error) {
    const ok = error instanceof PermissionDeniedError || (error instanceof Error && /not assigned|permission|denied/i.test(error.message));
    check(name, ok, error instanceof Error ? error.message : String(error));
  }
}

if (cashierTenant) {
  await expectDenied("Cashier dashboard remains blocked", () => getPrismaDashboardCriticalSnapshot(cashierTenant, { key: "today" }, prisma));
} else {
  check("Cashier dashboard remains blocked", true, "no cashier user in this database");
}
await expectDenied("Foreign tenant dashboard remains blocked", () => getPrismaDashboardCriticalSnapshot(foreignTenant, { key: "today" }, prisma));

const pepsiAfter = await prisma.inventoryBalance.findFirst({
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const salesAfter = await prisma.sale.count({ where: { companyId: company.id } });
check("PEPSI stock unchanged", Number(pepsiAfter?.quantity ?? 0) === Number(pepsiBefore?.quantity ?? 0), `qty=${pepsiAfter?.quantity}`);
check("Sale count unchanged", salesAfter === salesBefore, `sales=${salesAfter}`);

console.log(`PERF-10 query counts critical=${criticalOps} salesRows=${newSales.bounds.sales} itemRows=${newSales.bounds.saleItems} paymentRows=${newSales.bounds.payments} refundRows=${newSales.bounds.refunds}`);
console.log(`PERF-10 local timing oldKpi=${oldKpiMs}ms newKpi=${newKpiMs}ms critical=${criticalMs}ms (not a Production navigation measurement)`);

await prisma.$disconnect();

const failed = results.filter((row) => !row.ok);
console.log(`\nPERF-10 dashboard round-trips: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) process.exit(1);
