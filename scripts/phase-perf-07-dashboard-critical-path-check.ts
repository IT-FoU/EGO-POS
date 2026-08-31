import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  dashboardLoadStages,
  getPrismaDashboardCriticalSnapshot,
  getPrismaDashboardSecondarySnapshot,
  getPrismaDashboardSnapshot,
  resetDashboardLoadStages,
} from "../features/dashboard/dashboard-service";
import { PermissionDeniedError } from "../lib/auth/permissions";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

const TARGET_REF = "ieutdqnlfiiaawctapor";
const GOFLO_REF = "luivrsuotrdkgxkhxxbq";
const OLD_PRO_REF = "urqizygucheilflanlea";
const EPS = 1;

process.env.IGO_DEMO_MODE = "false";
loadProjectEnvFiles();

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
  return { countOf: () => count, proxy: proxy as T };
}

const dash = readFileSync("features/dashboard/dashboard-service.ts", "utf8");
const page = readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8");
const prismaSrc = readFileSync("lib/db/prisma.ts", "utf8");
const criticalFn = dash.slice(
  dash.indexOf("async function loadDashboardCriticalSnapshot"),
  dash.indexOf("async function loadDashboardSecondarySlice"),
);
const secondaryFn = dash.slice(dash.indexOf("async function loadDashboardSecondarySlice"));

check("Critical loader exists", dash.includes("export async function getPrismaDashboardCriticalSnapshot"));
check("Secondary loader exists", dash.includes("export async function getPrismaDashboardSecondarySnapshot"));
check("Page awaits critical snapshot", page.includes("getMiniMartDashboardCriticalSnapshot"));
check("Page does not await full snapshot", !page.includes("getMiniMartDashboardSnapshot"));
check("Page uses Suspense around alerts loader", page.includes("Suspense") && page.includes("DashboardAlertsLoader"));
check("Page does not call secondary snapshot in the page function", !page.includes("getMiniMartDashboardSecondarySnapshot"));
check("Critical path has no inventory balances", !criticalFn.includes("inventoryBalance.findMany"));
check("Critical path has no lot counts", !criticalFn.includes("inventoryLot.count"));
check("Critical path has no dead-stock count", !criticalFn.includes("saleItems"));
check("Critical path has no historical average aggregate", !criticalFn.includes("historicalStart"));
check("Critical path has no customer credit aggregate", !criticalFn.includes("outstandingBalance"));
check("Critical path has no supplier payables query", !criticalFn.includes("supplierPayable.aggregate"));
check("Critical path has no promotion discount aggregate", !criticalFn.includes("_sum: { promotionDiscount: true }"));
check("Critical path has no loyalty redeem aggregate", !criticalFn.includes("loyaltyPointLedger"));
check("Critical path still loads sales KPIs", criticalFn.includes("getPrismaDashboardSalesKpis"));
check("Critical path still loads cash sessions", criticalFn.includes("cashSession.findFirst") && criticalFn.includes("cashSession.findMany"));
check("Critical path still uses computeCashSessionTotalsForShift", criticalFn.includes("computeCashSessionTotalsForShift"));
check("Secondary loader owns inventory/alerts queries", secondaryFn.includes("inventoryBalance.findMany") && secondaryFn.includes("inventoryLot.count") && secondaryFn.includes("deadStockCutoff"));
check("KPI queries start before cash queries", criticalFn.indexOf("critical-sales-kpis") < criticalFn.indexOf("critical-cash-sessions"));
check("PrismaPg max/maxUses unchanged", prismaSrc.includes("max: 1") && prismaSrc.includes("maxUses: 1"));
check("No WebSocket added", !dash.includes("WebSocket") && !page.includes("WebSocket"));
check("No Redis/KV cache added", !dash.includes("redis") && !dash.includes("caches.default"));

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
  include: { user: { include: { roles: { include: { role: true } } } } },
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
  userId: "not-assigned-user-perf07",
  warehouseId: warehouse.id,
};

const pepsiBefore = await prisma.inventoryBalance.findFirst({
  where: { companyId: company.id, product: { barcode: "8859313502907" }, warehouseId: warehouse.id },
});
const salesBefore = await prisma.sale.count({ where: { companyId: company.id } });

resetDashboardLoadStages();
const criticalCounted = withQueryCounter(prisma);
const critical = await getPrismaDashboardCriticalSnapshot(ownerTenant, { key: "today" }, criticalCounted.proxy);
const stagesAfterCritical = [...dashboardLoadStages];
const criticalOps = criticalCounted.countOf();
check(
  "Primary can resolve without awaiting secondary",
  stagesAfterCritical.includes("critical-complete") && !stagesAfterCritical.includes("secondary-start"),
  stagesAfterCritical.join(" > "),
);
check("Critical Today Sales is a finite number", Number.isFinite(critical.cards.salesTodayLak), `sales=${critical.cards.salesTodayLak}`);
check("Critical Expected Cash is a finite number", Number.isFinite(critical.shift.expectedCashLak), `cash=${critical.shift.expectedCashLak}`);
check("Critical inventory widgets are not populated yet", critical.cards.inventoryValueLak === 0 && critical.alerts.length === 0);
check("Critical DB operations recorded", criticalOps > 0, `ops=${criticalOps}`);

const secondaryCounted = withQueryCounter(prisma);
const secondary = await getPrismaDashboardSecondarySnapshot(ownerTenant, { key: "today" }, {
  salesTodayLak: critical.cards.salesTodayLak,
  shiftSummaries: critical.closeDay.shiftSummaries,
}, secondaryCounted.proxy);
check(
  "Secondary starts after critical-complete",
  dashboardLoadStages.indexOf("critical-complete") >= 0
    && dashboardLoadStages.indexOf("secondary-start") > dashboardLoadStages.indexOf("critical-complete"),
  dashboardLoadStages.join(" > "),
);
check("Secondary DB operations recorded", secondaryCounted.countOf() > 0, `ops=${secondaryCounted.countOf()}`);

resetDashboardLoadStages();
const merged = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" }, prisma);
check(
  "Merged snapshot keeps critical sales/profit/bills/cash",
  Math.abs(merged.cards.salesTodayLak - critical.cards.salesTodayLak) <= EPS
    && Math.abs(merged.cards.profitTodayLak - critical.cards.profitTodayLak) <= EPS
    && merged.cards.totalBillsToday === critical.cards.totalBillsToday
    && Math.abs(merged.shift.expectedCashLak - critical.shift.expectedCashLak) <= EPS,
);
check(
  "Merged snapshot applies secondary inventory/alerts",
  merged.cards.inventoryValueLak === secondary.cardPatch.inventoryValueLak
    && merged.cards.lowStockProducts === secondary.cardPatch.lowStockProducts
    && merged.cards.expiredProducts === secondary.cardPatch.expiredProducts
    && merged.cards.nearExpiryProducts === secondary.cardPatch.nearExpiryProducts
    && merged.cards.customerCreditDueLak === secondary.cardPatch.customerCreditDueLak
    && merged.cards.supplierPayablesDueLak === secondary.cardPatch.supplierPayablesDueLak
    && merged.alerts.length === secondary.alerts.length,
);
check(
  "Merged Best Sellers match critical KPI product rows",
  JSON.stringify(merged.topProducts) === JSON.stringify(critical.topProducts),
);
check(
  "Full snapshot does not start secondary before critical-complete",
  dashboardLoadStages.indexOf("secondary-start") > dashboardLoadStages.indexOf("critical-complete"),
  dashboardLoadStages.join(" > "),
);

if (production) {
  check("Production Today Sales remains 28260", Math.abs(merged.cards.salesTodayLak - 28260) <= EPS, `sales=${merged.cards.salesTodayLak}`);
  check("Production Expected Cash remains 94260", Math.abs(merged.shift.expectedCashLak - 94260) <= EPS, `cash=${merged.shift.expectedCashLak}`);
  const pepsiRevenue = merged.topProducts.find((row) => /pepsi/i.test(row.name));
  check(
    "Production Best Sellers Product Revenue remains 29260",
    pepsiRevenue != null && Math.abs(pepsiRevenue.totalLak - 29260) <= EPS,
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

console.log(`PERF-07 query counts critical=${criticalOps} secondary=${secondaryCounted.countOf()}`);
await prisma.$disconnect();

const failed = results.filter((row) => !row.ok);
console.log(`\nPERF-07 dashboard critical path: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) process.exit(1);
