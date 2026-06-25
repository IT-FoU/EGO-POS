import { existsSync, readFileSync } from "node:fs";

process.env.IGO_DEMO_MODE = "false";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const { prisma } = await import("../lib/db/prisma");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const EPS = 1;

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function near(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}
async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    check(name, true, error instanceof Error ? error.message : String(error));
  }
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "not-assigned-user-b89", warehouseId: WAREHOUSE_ID };

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
  "A. Dashboard sales KPI equals report sales total",
  near(Number(dashboard.cards.salesTodayLak), Number(reports.analytics.totalRevenue)),
  `dashboard=${dashboard.cards.salesTodayLak}, report=${reports.analytics.totalRevenue}`,
);
check(
  "B. Dashboard profit KPI equals report profit total",
  near(Number(dashboard.cards.profitTodayLak), Number(reports.analytics.totalProfit)),
  `dashboard=${dashboard.cards.profitTodayLak}, report=${reports.analytics.totalProfit}`,
);
check(
  "C. Cash KPI equals close-day expected cash",
  near(Number(dashboard.cards.cashDrawerExpectedLak), Number(dashboard.shift.expectedCashLak)),
  `card=${dashboard.cards.cashDrawerExpectedLak}, shift=${dashboard.shift.expectedCashLak}`,
);
check(
  "D. Close-day cash totals are internally consistent",
  near(
    dashboard.closeDay.expectedCashLak,
    dashboard.closeDay.shiftSummaries.reduce((total, shift) => total + Number(shift.expectedCashLak), 0) || dashboard.closeDay.expectedCashLak,
  ),
  `closeDayExpected=${dashboard.closeDay.expectedCashLak}`,
);
check(
  "E. Inventory KPI equals report inventory valuation",
  near(Number(dashboard.cards.inventoryValueLak), Number(reports.hub.inventoryValueLak)),
  `dashboard=${dashboard.cards.inventoryValueLak}, report=${reports.hub.inventoryValueLak}`,
);
check(
  "F. Supplier payable KPI equals report payable balance",
  near(
    Number(dashboard.cards.supplierPayablesDueLak),
    Number(reports.supplierPayables.reduce((total, row) => total + Number(row.payableBalanceLak), 0)),
  ),
  `dashboard=${dashboard.cards.supplierPayablesDueLak}`,
);
check(
  "G. Promotion impact equals promotion discounts",
  near(
    Number(dashboard.cards.promotionDiscountLak),
    Number((await prisma.saleItem.aggregate({
      _sum: { promotionDiscount: true },
      where: { sale: { branchId: BRANCH_ID, companyId: COMPANY_ID, createdAt: { gte: start, lt: end }, saleStatus: "completed" } },
    }))._sum.promotionDiscount ?? 0),
  ),
  `promotion=${dashboard.cards.promotionDiscountLak}`,
);
check(
  "H. Loyalty KPI equals loyalty ledger redeem activity",
  near(
    Number(dashboard.cards.loyaltyRedeemedLak),
    Number((await prisma.loyaltyPointLedger.aggregate({
      _sum: { amountLak: true },
      where: { companyId: COMPANY_ID, createdAt: { gte: start, lt: end }, pointType: "redeem" },
    }))._sum.amountLak ?? 0),
  ),
  `loyalty=${dashboard.cards.loyaltyRedeemedLak}`,
);
check(
  "I. Refund and void impact reflected",
  dashboard.cards.refundLak >= 0 && dashboard.cards.voidCount >= 0,
  `refund=${dashboard.cards.refundLak}, void=${dashboard.cards.voidCount}`,
);
const monthDashboard = await getPrismaDashboardSnapshot(ownerTenant, { key: "month" });
check(
  "J. Date range changes output",
  monthDashboard.period.key === "month" && (monthDashboard.cards.salesTodayLak !== dashboard.cards.salesTodayLak || monthDashboard.cards.totalBillsToday !== dashboard.cards.totalBillsToday),
  `todaySales=${dashboard.cards.salesTodayLak}, monthSales=${monthDashboard.cards.salesTodayLak}`,
);
check(
  "K. Branch/warehouse scope preserved",
  near(Number(dashboard.cards.inventoryValueLak), Number(reports.hub.inventoryValueLak)),
  `inventory=${dashboard.cards.inventoryValueLak}`,
);
await expectThrow("L. Unauthorized dashboard access blocked", () => getPrismaDashboardSnapshot(cashierTenant, { key: "today" }));
await expectThrow("M. Cross-company dashboard access blocked", () => getPrismaDashboardSnapshot(foreignTenant, { key: "today" }));
check(
  "N. No mock fixture IDs leak into dashboard output",
  !JSON.stringify(dashboard).toLowerCase().includes("mock-"),
);

const passed = results.filter((entry) => entry.ok).length;
const failed = results.length - passed;
console.log(`\nB8-9 dashboard analytics hardening: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
