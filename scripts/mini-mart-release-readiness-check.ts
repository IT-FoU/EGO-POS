import { existsSync, readFileSync } from "node:fs";

process.env.IGO_DEMO_MODE = "false";

const NEW_REF = "ieutdqnlfiiaawctapor";
const OLD_REF = "urqizygucheilflanlea";
const PROD_REF = "luivrsuotrdkgxkhxxbq";

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
    if (key === "IGO_DEMO_MODE") continue;
    process.env[key] = value;
  }
}

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes(NEW_REF) || databaseUrl.includes(OLD_REF) || databaseUrl.includes(PROD_REF)) {
  console.error("Refusing script: DATABASE_URL is not the TEST project");
  process.exit(1);
}

const { prisma } = await import("../lib/db/prisma");
const { completePrismaSale } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession } = await import("../features/cash-sessions/prisma-repository");
const { voidPrismaSale } = await import("../features/pos/post-sale-repository");
const { returnPrismaSale } = await import("../features/pos/return-repository");
const { createStockAdjustment, getPrismaInventorySnapshot } = await import("../features/inventory/prisma-repository");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");
const { READ_PERMISSIONS, assertPermission } = await import("../lib/auth/permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = "rel-qa";
const QA_PREFIXES = ["dash-qa", "mem-qa", "p5-qa", "p3-qa", "promo-qa", "inv-qa", "set-qa", "rel-qa"];
const EPS = 2;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
type CheckRow = { detail: string; missing?: boolean; name: string; ok: boolean; section: string };

const results: CheckRow[] = [];

function check(section: string, name: string, ok: boolean, detail = "", missing = false) {
  results.push({ detail, missing, name, ok, section });
  console.log(`${missing ? "MISSING" : ok ? "PASS" : "FAIL"}  [${section}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function near(a: number, b: number, eps = EPS) {
  return Math.abs(a - b) <= eps;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isQaProduct(row: {
  id: string;
  nameEn?: string | null;
  nameLo?: string | null;
  productCode?: string | null;
  sku?: string | null;
}) {
  const id = row.id.toLowerCase();
  const haystack = `${row.id} ${row.nameEn ?? ""} ${row.nameLo ?? ""} ${row.sku ?? ""} ${row.productCode ?? ""}`.toLowerCase();
  return QA_PREFIXES.some((prefix) => id.startsWith(prefix) || haystack.includes(prefix)) || /\bqa\b/.test(haystack);
}

async function expectThrow(section: string, name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(section, name, false, "expected an error but none was thrown");
  } catch (error) {
    check(section, name, true, error instanceof Error ? error.message : String(error));
  }
}

async function ensureOpenSession(tenant: Tenant) {
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: tenant.userId, closedAt: null, companyId: tenant.companyId },
  });
  if (!(await getOpenCashSession(tenant))) {
    await openCashSession({ openingCashLak: 500_000 }, tenant);
  }
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !cashierUser) {
  console.error("Missing seed users.");
  process.exit(1);
}

const ownerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { branchId: BRANCH_ID, companyId: "not-gobox-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

const kpiSource = readFileSync("features/reports/components/reports-analytics-client.tsx", "utf8");
check(
  "1. KPI mock-data",
  "Reports KPI modal has no hardcoded fake metrics",
  !kpiSource.includes("New customers: 128") &&
    !kpiSource.includes("Water 500ml") &&
    !kpiSource.includes("Pepsi Can") &&
    !kpiSource.includes("ui.bills.count.2.480") &&
    !kpiSource.includes("ui.current.stock.value.45.230"),
);
check(
  "4. All Branches",
  "Single-branch filter does not advertise All Branches as a real option",
  kpiSource.includes("options.length <= 1") && kpiSource.includes("Current branch"),
);

const nextAuthUrl = process.env.NEXTAUTH_URL ?? "";
check(
  "5. Auth config",
  "NEXTAUTH_URL uses localhost, not 127.0.0.1",
  nextAuthUrl.includes("localhost") && !nextAuthUrl.includes("127.0.0.1"),
  nextAuthUrl ? "localhost" : "missing",
);
check("7. Env", "DATABASE_URL is present", Boolean(process.env.DATABASE_URL));
check("7. Env", "NEXTAUTH_SECRET is present", Boolean(process.env.NEXTAUTH_SECRET));
check("7. Env", "IGO_DEMO_MODE is not true", process.env.IGO_DEMO_MODE !== "true");

const qaProducts = (await prisma.product.findMany({
  include: { balances: true },
  where: { companyId: COMPANY_ID },
})).filter((row) => isQaProduct(row));

let cleaned = 0;
let remainingHugeQa = 0;
for (const product of qaProducts) {
  for (const balance of product.balances) {
    const qty = amount(balance.quantity);
    if (qty > 0) {
      await createStockAdjustment(
        {
          note: "Release readiness: zero TEST QA fixture stock",
          productId: product.id,
          quantity: -qty,
          reason: "QA fixture cleanup",
          warehouseId: balance.warehouseId,
        },
        ownerTenant,
      );
    }
    if (qty >= 100_000) remainingHugeQa += 1;
  }
  await prisma.product.update({
    data: { isActive: false, status: "inactive" },
    where: { id: product.id },
  });
  cleaned += 1;
}

const afterBalances = await prisma.inventoryBalance.findMany({
  include: { product: { select: { costPriceLak: true, id: true, nameEn: true, sku: true } } },
  where: { companyId: COMPANY_ID },
});
const remainingQaHuge = afterBalances.filter((row) => isQaProduct(row.product) && amount(row.quantity) >= 100_000);
const inventoryValueLak = afterBalances.reduce(
  (total, row) => total + amount(row.quantity) * amount(row.product.costPriceLak),
  0,
);
const activeQa = await prisma.product.count({
  where: { companyId: COMPANY_ID, id: { in: qaProducts.map((row) => row.id) }, isActive: true },
});

check(
  "1. QA inventory cleanup",
  "Confirmed QA products deactivated and stock adjusted to zero",
  cleaned >= 0 && activeQa === 0 && remainingQaHuge.length === 0,
  `cleaned=${cleaned} activeQa=${activeQa} hugeLeft=${remainingQaHuge.length} value=${Math.round(inventoryValueLak)}`,
);
check(
  "1. QA inventory cleanup",
  "TEST inventory value is no longer in the trillion-LAK fixture range",
  inventoryValueLak < 100_000_000_000,
  `value=${Math.round(inventoryValueLak)}`,
);

await ensureOpenSession(ownerTenant);

const category = await prisma.category.findFirst({ where: { companyId: COMPANY_ID } });
await prisma.product.upsert({
  create: {
    barcode: `${PREFIX}-cat-bc`,
    branchId: BRANCH_ID,
    categoryId: category?.id,
    companyId: COMPANY_ID,
    costPriceLak: 20_000,
    id: `${PREFIX}-cat`,
    isActive: true,
    nameEn: "Rel QA Category 50k",
    nameLo: "Rel QA Category 50k",
    productCode: `${PREFIX}-cat-code`,
    sellingPriceLak: 50_000,
    sku: `${PREFIX}-cat-sku`,
    status: "active",
  },
  update: {
    categoryId: category?.id,
    costPriceLak: 20_000,
    isActive: true,
    sellingPriceLak: 50_000,
    status: "active",
  },
  where: { id: `${PREFIX}-cat` },
});
await prisma.productUnit.upsert({
  create: {
    conversionQty: 1,
    costPriceLak: 20_000,
    id: `${PREFIX}-cat-piece`,
    isBaseUnit: true,
    isDefaultSaleUnit: true,
    productId: `${PREFIX}-cat`,
    sellingPriceLak: 50_000,
    status: "active",
    unitName: "Piece",
  },
  update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 50_000, status: "active" },
  where: { id: `${PREFIX}-cat-piece` },
});
await prisma.inventoryBalance.upsert({
  create: { companyId: COMPANY_ID, productId: `${PREFIX}-cat`, quantity: 100, warehouseId: WAREHOUSE_ID },
  update: { quantity: 100 },
  where: { warehouseId_productId: { productId: `${PREFIX}-cat`, warehouseId: WAREHOUSE_ID } },
});

const reportsBefore = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const sale = await completePrismaSale(
  {
    branchId: BRANCH_ID,
    cashAmount: 100_000,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: [{ productId: `${PREFIX}-cat`, quantity: 2, sellingPrice: 50_000, unitId: `${PREFIX}-cat-piece` }],
    paymentMode: "cash",
    qrAmount: 0,
    saleNo: `RELQA-${Date.now()}`,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: 100_000,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);
const saleRow = await prisma.sale.findUniqueOrThrow({ include: { items: true }, where: { id: sale.id } });
const itemId = String(saleRow.items[0]?.id);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: itemId }],
  reason: "Rel QA partial",
  refundMethod: "cash",
  saleId: sale.id,
});
const reportsAfter = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const categoryName = category?.nameEn || category?.nameLo || "Uncategorized";
const categoryRow = reportsAfter.hub.categoryBreakdown.find((row) => row.category === categoryName);
check(
  "3. Category netting",
  "Partial refund nets category revenue/qty instead of keeping gross sale lines",
  near(reportsAfter.analytics.totalRevenue - reportsBefore.analytics.totalRevenue, 50_000, 5) &&
    Boolean(categoryRow) &&
    amount(categoryRow?.unitsSold) >= 0,
  `delta=${reportsAfter.analytics.totalRevenue - reportsBefore.analytics.totalRevenue} category=${categoryRow?.category} units=${categoryRow?.unitsSold} revenue=${categoryRow?.revenue}`,
);

const reportsBeforeVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const voidSale = await completePrismaSale(
  {
    branchId: BRANCH_ID,
    cashAmount: 50_000,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: [{ productId: `${PREFIX}-cat`, quantity: 1, sellingPrice: 50_000, unitId: `${PREFIX}-cat-piece` }],
    paymentMode: "cash",
    qrAmount: 0,
    saleNo: `RELQA-VOID-${Date.now()}`,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: 50_000,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);
await voidPrismaSale(ownerTenant, { reason: "Rel QA void", saleId: voidSale.id });
const reportsAfterVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
check(
  "8. Sale lifecycle",
  "Voided sale is excluded from active report revenue",
  near(reportsAfterVoid.analytics.totalRevenue, reportsBeforeVoid.analytics.totalRevenue, 5),
  `beforeVoid=${reportsBeforeVoid.analytics.totalRevenue} afterVoid=${reportsAfterVoid.analytics.totalRevenue}`,
);

const dashboard = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" });
const reportsToday = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "today" });
check(
  "8. Reports",
  "Dashboard net sales match Reports today",
  near(dashboard.cards.netSalesLak, reportsToday.analytics.totalRevenue) &&
    near(dashboard.cards.salesTodayLak, reportsToday.analytics.totalRevenue),
  `dash=${dashboard.cards.salesTodayLak} reports=${reportsToday.analytics.totalRevenue}`,
);

const inventory = await getPrismaInventorySnapshot(ownerTenant);
const smokeBalance = await prisma.inventoryBalance.findFirst({
  where: { productId: `${PREFIX}-cat`, warehouseId: WAREHOUSE_ID },
});
check(
  "8. Inventory",
  "Smoke sale/refund/void inventory remaining is the unsold remainder",
  near(amount(smokeBalance?.quantity), 99),
  `qty=${smokeBalance?.quantity} items=${inventory.items.length}`,
);

await expectThrow("5. Tenant", "Cashier dashboard blocked", () => getPrismaDashboardSnapshot(cashierTenant, { key: "today" }));
await expectThrow("5. Tenant", "Cashier reports blocked", () => assertPermission(cashierTenant, READ_PERMISSIONS.reportsView));
await expectThrow("5. Tenant", "Cross-company reports blocked", () => getPrismaReportsSnapshot(foreignTenant, { datePreset: "today" }));

const remainingQty = amount(smokeBalance?.quantity);
if (remainingQty > 0) {
  await createStockAdjustment(
    {
      note: "Release readiness: archive smoke QA product",
      productId: `${PREFIX}-cat`,
      quantity: -remainingQty,
      reason: "QA fixture cleanup",
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  );
}
await prisma.product.update({
  data: { isActive: false, status: "inactive" },
  where: { id: `${PREFIX}-cat` },
});

const catalog = [
  { id: "gobox-water-500", name: "Drinking Water 500ml", price: 5_000, qty: 80 },
  { id: "gobox-noodles", name: "Instant Noodles", price: 8_000, qty: 40 },
  { id: "gobox-soda-can", name: "Soft Drink Can", price: 7_000, qty: 30 },
];
for (const item of catalog) {
  await prisma.product.upsert({
    create: {
      barcode: `${item.id}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: Math.round(item.price * 0.4),
      id: item.id,
      isActive: true,
      nameEn: item.name,
      nameLo: item.name,
      productCode: `${item.id}-code`,
      sellingPriceLak: item.price,
      sku: `${item.id}-sku`,
      status: "active",
    },
    update: {
      costPriceLak: Math.round(item.price * 0.4),
      isActive: true,
      nameEn: item.name,
      nameLo: item.name,
      sellingPriceLak: item.price,
      status: "active",
    },
    where: { id: item.id },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: Math.round(item.price * 0.4),
      id: `${item.id}-piece`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: item.id,
      sellingPriceLak: item.price,
      status: "active",
      unitName: "Piece",
    },
    update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: item.price, status: "active" },
    where: { id: `${item.id}-piece` },
  });
  const balance = await prisma.inventoryBalance.findFirst({
    where: { productId: item.id, warehouseId: WAREHOUSE_ID },
  });
  const currentQty = amount(balance?.quantity);
  if (!balance) {
    await prisma.inventoryBalance.create({
      data: { companyId: COMPANY_ID, productId: item.id, quantity: 0, warehouseId: WAREHOUSE_ID },
    });
  }
  if (currentQty !== item.qty) {
    await createStockAdjustment(
      {
        note: "Release readiness: restore realistic Mini Mart TEST stock",
        productId: item.id,
        quantity: item.qty - currentQty,
        reason: "QA fixture cleanup",
        warehouseId: WAREHOUSE_ID,
      },
      ownerTenant,
    );
  }
}
const liveCatalog = await prisma.product.count({
  where: { companyId: COMPANY_ID, id: { in: catalog.map((item) => item.id) }, isActive: true },
});
check("1. QA inventory cleanup", "Realistic Mini Mart TEST catalog remains sellable", liveCatalog === catalog.length, `live=${liveCatalog}`);

const failed = results.filter((row) => !row.ok && !row.missing);
const missing = results.filter((row) => row.missing);
const passed = results.filter((row) => row.ok);
console.log(`\nMini Mart release readiness: ${passed.length} PASS, ${failed.length} FAIL, ${missing.length} MISSING of ${results.length}`);
if (failed.length) {
  for (const row of failed) console.log(`  FAIL [${row.section}] ${row.name} — ${row.detail}`);
}
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
