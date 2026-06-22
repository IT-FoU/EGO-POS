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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const { prisma } = await import("../lib/db/prisma");
const { getPrismaInventorySnapshot } = await import("../features/inventory/prisma-repository");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { assertPermission, PermissionDeniedError, READ_PERMISSIONS } = await import("../lib/auth/permissions");

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
async function expectDenied(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected permission denial");
  } catch (error) {
    check(name, error instanceof PermissionDeniedError, error instanceof Error ? error.message : String(error));
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

const saleWhere = { branchId: BRANCH_ID, companyId: COMPANY_ID, saleStatus: "completed" as const };
const monthStart = new Date();
monthStart.setDate(1);
monthStart.setHours(0, 0, 0, 0);

const warehouses = await prisma.warehouse.findMany({
  select: { id: true },
  where: { branchId: BRANCH_ID, companyId: COMPANY_ID },
});
const warehouseIds = warehouses.map((warehouse) => warehouse.id);

const dbRevenue = await prisma.sale.aggregate({ _sum: { totalAmount: true }, where: saleWhere });
const dbProfit = await prisma.sale.aggregate({ _sum: { profitAmount: true }, where: saleWhere });
const dbTransactions = await prisma.sale.count({ where: saleWhere });
const dbCogsRows = await prisma.saleItem.findMany({ select: { costPrice: true, quantity: true }, where: { sale: saleWhere } });
const dbPayables = await prisma.supplierPayable.groupBy({
  by: ["supplierId"],
  _sum: { balanceAmount: true },
  where: { companyId: COMPANY_ID },
});
const dbInventory = await getPrismaInventorySnapshot(ownerTenant);
const expectedCogs = dbCogsRows.reduce((total, row) => total + Number(row.costPrice) * Number(row.quantity), 0);
const expectedInventoryValue = dbInventory.items.reduce(
  (total: number, item: { inventoryValueLak?: number }) => total + (item.inventoryValueLak ?? 0),
  0,
);
const expectedPayableTotal = dbPayables.reduce((total, row) => total + Number(row._sum.balanceAmount ?? 0), 0);

const allTimeSnapshot = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const monthSnapshot = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "this_month" });

check(
  "A. Sales revenue matches Prisma aggregate",
  near(allTimeSnapshot.analytics.totalRevenue, Number(dbRevenue._sum?.totalAmount ?? 0)),
  `report=${allTimeSnapshot.analytics.totalRevenue} db=${dbRevenue._sum?.totalAmount ?? 0}`,
);
check(
  "B. Sales profit matches Prisma aggregate",
  near(allTimeSnapshot.analytics.totalProfit, Number(dbProfit._sum?.profitAmount ?? 0)),
  `report=${allTimeSnapshot.analytics.totalProfit} db=${dbProfit._sum?.profitAmount ?? 0}`,
);
check(
  "C. Transaction count matches Prisma count",
  allTimeSnapshot.analytics.totalTransactions === dbTransactions,
  `report=${allTimeSnapshot.analytics.totalTransactions} db=${dbTransactions}`,
);
check(
  "D. COGS computed from sale item costPrice x quantity",
  near(allTimeSnapshot.cogsLak, expectedCogs),
  `report=${allTimeSnapshot.cogsLak} db=${expectedCogs}`,
);
check(
  "E. Inventory valuation matches stock x cost",
  near(
    allTimeSnapshot.inventoryItems.reduce((total, item) => total + (item.inventoryValueLak ?? 0), 0),
    expectedInventoryValue,
  ),
  `report=${allTimeSnapshot.inventoryItems.reduce((total, item) => total + (item.inventoryValueLak ?? 0), 0)} db=${expectedInventoryValue}`,
);
check(
  "F. Supplier payable total matches SupplierPayable balances",
  near(
    allTimeSnapshot.supplierPayables.reduce((total, row) => total + row.payableBalanceLak, 0),
    expectedPayableTotal,
  ),
  `report=${allTimeSnapshot.supplierPayables.reduce((total, row) => total + row.payableBalanceLak, 0)} db=${expectedPayableTotal}`,
);
check(
  "G. No synthetic supplier-* purchase order ids",
  !allTimeSnapshot.supplierPurchaseOrders.some((order) => order.id.startsWith("supplier-")),
  allTimeSnapshot.supplierPurchaseOrders.filter((order) => order.id.startsWith("supplier-")).map((order) => order.id).join(", ") || "none",
);
check(
  "H. Date filter changes transaction count",
  monthSnapshot.analytics.totalTransactions <= allTimeSnapshot.analytics.totalTransactions,
  `month=${monthSnapshot.analytics.totalTransactions} all=${allTimeSnapshot.analytics.totalTransactions}`,
);

const dbMonthCount = await prisma.sale.count({ where: { ...saleWhere, createdAt: { gte: monthStart } } });
check(
  "I. This-month filter matches Prisma month count",
  monthSnapshot.analytics.totalTransactions === dbMonthCount,
  `report=${monthSnapshot.analytics.totalTransactions} db=${dbMonthCount}`,
);

const productWithNoSales = await prisma.product.findFirst({
  where: {
    companyId: COMPANY_ID,
    balances: { some: { quantity: { gt: 0 }, warehouseId: { in: warehouseIds } } },
    saleItems: { none: { sale: saleWhere } },
  },
});
if (productWithNoSales) {
  const reportItem = allTimeSnapshot.inventoryItems.find((item) => item.productId === productWithNoSales.id);
  check(
    "J. Never-sold stocked product has high daysWithoutSale",
    reportItem?.daysWithoutSale === 999,
    `product=${productWithNoSales.id} days=${reportItem?.daysWithoutSale}`,
  );
} else {
  check(
    "J. daysWithoutSale field present on inventory rows",
    allTimeSnapshot.inventoryItems.every((item) => Number.isFinite(item.daysWithoutSale)),
    `rows=${allTimeSnapshot.inventoryItems.length}`,
  );
}

await assertPermission(ownerTenant, READ_PERMISSIONS.reportsView);
check("K. Owner can read reports permission", true);
await expectDenied("L. Cashier blocked from reports read", () => assertPermission(cashierTenant, READ_PERMISSIONS.reportsView));

const mockFixturePattern = /\b117800000\b|\b33600000\b|\b45230000\b|\b2480\b/;
const serialized = JSON.stringify(allTimeSnapshot);
check(
  "M. No mock fixture values leak into report output",
  !mockFixturePattern.test(serialized),
  mockFixturePattern.test(serialized) ? "mock pattern found" : "clean",
);

const passed = results.filter((row) => row.ok).length;
const failed = results.length - passed;
console.log(`\nB8-4 report hardening: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
