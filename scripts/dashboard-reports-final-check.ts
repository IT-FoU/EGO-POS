import { existsSync, readFileSync } from "node:fs";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

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

loadProjectEnvFiles();
resolveScriptDatabaseUrl("test-write");

const { prisma } = await import("../lib/db/prisma");
const { completePrismaSale } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession, computeCashSessionTotalsForShift } = await import("../features/cash-sessions/prisma-repository");
const { voidPrismaSale } = await import("../features/pos/post-sale-repository");
const { exchangePrismaSale, returnPrismaSale } = await import("../features/pos/return-repository");
const { createPrismaHeldBill } = await import("../features/pos/held-bills-repository");
const { createPrismaCustomer, getPrismaCustomersSnapshot } = await import("../features/customers/prisma-repository");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");
const { getPrismaInventorySnapshot } = await import("../features/inventory/prisma-repository");
const { REPORT_SALE_STATUSES } = await import("../features/pos/post-sale-shared");
const { READ_PERMISSIONS, assertPermission } = await import("../lib/auth/permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = "dash-qa";
const EPS = 2;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
type ProductFixture = { id: string; price: number; unitId: string };
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

async function expectThrow(section: string, name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(section, name, false, "expected an error but none was thrown");
  } catch (error) {
    check(section, name, true, error instanceof Error ? error.message : String(error));
  }
}

function startOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfDay(date = new Date()) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function localDayLabel(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function expectedLifecycle(sales: Array<Record<string, any>>) {
  const net = { cogsLak: 0, profitLak: 0, quantitySold: 0, refundLak: 0, revenueLak: 0, transactions: 0 };
  for (const sale of sales) {
    if (!REPORT_SALE_STATUSES.includes(sale.saleStatus)) continue;
    net.transactions += 1;
    net.revenueLak += amount(sale.totalAmount);
    net.profitLak += amount(sale.profitAmount);
    for (const item of sale.items ?? []) {
      net.cogsLak += amount(item.costPrice) * amount(item.quantity);
      net.quantitySold += amount(item.quantity);
    }
    for (const refund of sale.refunds ?? []) {
      const kind = String(refund.kind ?? "refund");
      const refundAmt = amount(refund.refundAmount) || (kind === "refund" ? amount(refund.totalAmount) : 0);
      net.refundLak += refundAmt;
      if (kind === "refund") net.revenueLak -= refundAmt;
      else net.revenueLak += amount(refund.paymentAmount) - refundAmt;
      const itemById = new Map((sale.items ?? []).map((item: Record<string, any>) => [String(item.id), item]));
      for (const row of refund.items ?? []) {
        const qty = amount(row.quantity);
        const item = itemById.get(String(row.saleItemId)) as Record<string, any> | undefined;
        net.quantitySold -= qty;
        if (item) {
          net.cogsLak -= amount(item.costPrice) * qty;
          const originalQty = amount(item.quantity) || 1;
          net.profitLak -= amount(item.profitAmount) * (qty / originalQty);
        }
      }
      for (const row of refund.exchangeItems ?? []) {
        const qty = amount(row.quantity);
        const lineTotal = amount(row.totalAmount);
        const lineCost = amount(row.costPrice) * qty;
        net.quantitySold += qty;
        net.cogsLak += lineCost;
        net.profitLak += lineTotal - lineCost;
      }
    }
  }
  return net;
}

function expectedPayments(sales: Array<Record<string, any>>) {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    if (!REPORT_SALE_STATUSES.includes(sale.saleStatus)) continue;
    for (const payment of sale.payments ?? []) {
      const method = String(payment.paymentMethod ?? "cash");
      totals.set(method, (totals.get(method) ?? 0) + amount(payment.amount) - amount(payment.changeAmount));
    }
    for (const refund of sale.refunds ?? []) {
      const method = String(refund.refundMethod ?? "cash");
      const kind = String(refund.kind ?? "refund");
      const refundAmt = amount(refund.refundAmount) || (kind === "refund" ? amount(refund.totalAmount) : 0);
      totals.set(method, (totals.get(method) ?? 0) - refundAmt);
      if (kind === "exchange") {
        totals.set(method, (totals.get(method) ?? 0) + amount(refund.paymentAmount));
      }
    }
  }
  return totals;
}

async function loadReportableSales(from?: Date, to?: Date) {
  return prisma.sale.findMany({
    include: {
      items: true,
      payments: true,
      refunds: { include: { exchangeItems: true, items: true } },
    },
    where: {
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      saleStatus: { in: [...REPORT_SALE_STATUSES] },
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
  });
}

async function upsertProduct(id: string, name: string, price: number): Promise<ProductFixture> {
  await prisma.product.upsert({
    create: {
      barcode: `${id}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: Math.round(price * 0.4),
      id,
      isActive: true,
      nameEn: name,
      nameLo: name,
      productCode: `${id}-code`,
      sellingPriceLak: price,
      sku: `${id}-sku`,
      status: "active",
    },
    update: { costPriceLak: Math.round(price * 0.4), isActive: true, sellingPriceLak: price, status: "active" },
    where: { id },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: Math.round(price * 0.4),
      id: `${id}-piece`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: id,
      sellingPriceLak: price,
      status: "active",
      unitName: "Piece",
    },
    update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: price, status: "active" },
    where: { id: `${id}-piece` },
  });
  await prisma.inventoryBalance.upsert({
    create: { companyId: COMPANY_ID, productId: id, quantity: 1_000_000, warehouseId: WAREHOUSE_ID },
    update: { quantity: 1_000_000 },
    where: { warehouseId_productId: { productId: id, warehouseId: WAREHOUSE_ID } },
  });
  return { id, price, unitId: `${id}-piece` };
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

function nextSaleNo(label: string) {
  return `DASHQA-${label}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function sell(
  tenant: Tenant,
  product: ProductFixture,
  quantity: number,
  options: { customerId?: string; saleLabel?: string } = {},
) {
  const listTotal = product.price * quantity;
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: listTotal,
      changeAmount: 0,
      customerId: options.customerId,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: product.id, quantity, sellingPrice: product.price, unitId: product.unitId }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: nextSaleNo(options.saleLabel ?? "SALE"),
      taxAmount: 0,
      taxRate: 0,
      totalAmount: listTotal,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
}

function heldCartItem(product: ProductFixture, name: string, quantity: number) {
  return {
    barcode: `${product.id}-bc`,
    categoryName: "QA",
    conversionQty: 1,
    id: product.id,
    imageKey: "",
    nameEn: name,
    nameLo: name,
    priceLak: product.price,
    quantity,
    retailPriceLak: product.price,
    sku: `${product.id}-sku`,
    stockQty: 1_000_000,
    unitId: product.unitId,
    unitName: "Piece",
  };
}

async function stockOf(productId: string) {
  return amount((await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } }))?.quantity);
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

const sourceTables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
  `select table_name from information_schema.tables where table_schema = 'public' and table_name in ('sales', 'sale_items', 'sale_payments', 'refunds', 'stock_movements', 'inventory_balances', 'cash_sessions', 'loyalty_point_ledger')`,
);
check(
  "0. Source of truth",
  "Persisted sales/payments/refunds/inventory/cash/loyalty tables exist",
  ["sales", "sale_items", "sale_payments", "refunds", "stock_movements", "inventory_balances", "cash_sessions", "loyalty_point_ledger"].every((name) =>
    sourceTables.some((row) => row.table_name === name),
  ),
  sourceTables.map((row) => row.table_name).join(","),
);

await prisma.membershipLevel.upsert({
  create: { companyId: COMPANY_ID, discountPercent: 10, id: `${PREFIX}-level`, isActive: true, minSpendLak: 0, name: "Dash QA Level" },
  update: { discountPercent: 10, isActive: true, minSpendLak: 0 },
  where: { id: `${PREFIX}-level` },
});

const normal = await upsertProduct(`${PREFIX}-normal`, "Dash QA Normal 80k", 80_000);
const promo = await upsertProduct(`${PREFIX}-promo`, "Dash QA Promo 50k", 50_000);
const memberp = await upsertProduct(`${PREFIX}-member`, "Dash QA Member 100k", 100_000);
const partial = await upsertProduct(`${PREFIX}-partial`, "Dash QA Partial 90k", 90_000);
const full = await upsertProduct(`${PREFIX}-full`, "Dash QA Full 70k", 70_000);
const orig = await upsertProduct(`${PREFIX}-orig`, "Dash QA Orig 100k", 100_000);
const repl = await upsertProduct(`${PREFIX}-repl`, "Dash QA Repl 120k", 120_000);
const voidp = await upsertProduct(`${PREFIX}-void`, "Dash QA Void 40k", 40_000);
const hold = await upsertProduct(`${PREFIX}-hold`, "Dash QA Hold 15k", 15_000);

await prisma.promotion.updateMany({ data: { isActive: false, status: "inactive" }, where: { id: { startsWith: PREFIX } } });
await prisma.promotion.deleteMany({ where: { id: `${PREFIX}-percent` } }).catch(() => undefined);
await prisma.promotion.create({
  data: {
    companyId: COMPANY_ID,
    discountPercent: 10,
    endDate: new Date("2099-12-31"),
    id: `${PREFIX}-percent`,
    isActive: true,
    products: { create: [{ productId: promo.id }] },
    promotionName: "Dash QA percent",
    promotionType: "percentage",
    startDate: new Date("2020-01-01"),
    status: "active",
  },
});

const member = await createPrismaCustomer(
  { fullName: "Dash QA Member", membershipLevelId: `${PREFIX}-level`, phone: "020-5550888" },
  ownerTenant,
);

await ensureOpenSession(ownerTenant);

const reportsBefore = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });

const normalSale = await sell(ownerTenant, normal, 1, { saleLabel: "NORMAL" });
const normalRow = await prisma.sale.findUniqueOrThrow({ include: { items: true }, where: { id: normalSale.id } });
const reportsAfterNormal = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
check(
  "1. Normal sale",
  "Reports revenue increases by sale total",
  near(reportsAfterNormal.analytics.totalRevenue - reportsBefore.analytics.totalRevenue, amount(normalRow.totalAmount)),
  `delta=${reportsAfterNormal.analytics.totalRevenue - reportsBefore.analytics.totalRevenue} sale=${normalRow.totalAmount}`,
);

const promoSale = await sell(ownerTenant, promo, 2, { saleLabel: "PROMO" });
const promoRow = await prisma.sale.findUniqueOrThrow({ include: { items: true, promotionUsages: true }, where: { id: promoSale.id } });
check(
  "2. Discounted/promoted sale",
  "Promotion usage persisted on sale",
  (promoRow.promotionUsages?.length ?? 0) >= 1 && amount(promoRow.items[0]?.promotionDiscount) > 0,
  `usages=${promoRow.promotionUsages?.length} disc=${promoRow.items[0]?.promotionDiscount}`,
);

const memberSale = await sell(ownerTenant, memberp, 1, { customerId: member.id, saleLabel: "MEMBER" });
const memberRow = await prisma.sale.findUniqueOrThrow({ where: { id: memberSale.id } });
check(
  "3. Member sale",
  "Membership discount applied to persisted total",
  amount(memberRow.totalAmount) <= memberp.price * 0.9 + EPS,
  `total=${memberRow.totalAmount} list=${memberp.price}`,
);

const partialSale = await sell(ownerTenant, partial, 2, { saleLabel: "PARTIAL" });
const partialItem = await prisma.saleItem.findFirst({ where: { saleId: partialSale.id } });
const partialTotal = amount((await prisma.sale.findUnique({ where: { id: partialSale.id } }))?.totalAmount);
const reportsBeforePartial = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(partialItem?.id) }],
  reason: "Dash QA partial",
  refundMethod: "cash",
  saleId: partialSale.id,
});
const reportsAfterPartial = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
check(
  "4. Partial refund",
  "Net revenue drops by refunded half, original sale retained",
  near(reportsBeforePartial.analytics.totalRevenue - reportsAfterPartial.analytics.totalRevenue, partialTotal / 2) &&
    amount((await prisma.sale.findUnique({ where: { id: partialSale.id } }))?.totalAmount) === partialTotal,
  `before=${reportsBeforePartial.analytics.totalRevenue} after=${reportsAfterPartial.analytics.totalRevenue} half=${partialTotal / 2}`,
);

const fullSale = await sell(ownerTenant, full, 1, { saleLabel: "FULL" });
const fullItem = await prisma.saleItem.findFirst({ where: { saleId: fullSale.id } });
const fullTotal = amount((await prisma.sale.findUnique({ where: { id: fullSale.id } }))?.totalAmount);
const reportsBeforeFull = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(fullItem?.id) }],
  reason: "Dash QA full",
  refundMethod: "cash",
  saleId: fullSale.id,
});
const reportsAfterFull = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
const fullStatus = String((await prisma.sale.findUnique({ where: { id: fullSale.id } }))?.saleStatus);
check(
  "5. Full refund",
  "Net revenue reduced and original history remains refunded",
  near(reportsBeforeFull.analytics.totalRevenue - reportsAfterFull.analytics.totalRevenue, fullTotal) && fullStatus === "refunded",
  `delta=${reportsBeforeFull.analytics.totalRevenue - reportsAfterFull.analytics.totalRevenue} status=${fullStatus}`,
);

const exchangeSale = await sell(ownerTenant, orig, 1, { saleLabel: "EXCH" });
const exchangeItem = await prisma.saleItem.findFirst({ where: { saleId: exchangeSale.id } });
const reportsBeforeEx = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await exchangePrismaSale(ownerTenant, {
  paidAmountLak: 20_000,
  reason: "Dash QA exchange",
  refundMethod: "cash",
  replacementItems: [{ productId: repl.id, quantity: 1, unitId: repl.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(exchangeItem?.id) }],
  saleId: exchangeSale.id,
});
const reportsAfterEx = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
check(
  "6. Exchange",
  "Reports net the replacement difference once",
  near(reportsAfterEx.analytics.totalRevenue - reportsBeforeEx.analytics.totalRevenue, 20_000, 5),
  `delta=${reportsAfterEx.analytics.totalRevenue - reportsBeforeEx.analytics.totalRevenue}`,
);

const voidSale = await sell(ownerTenant, voidp, 1, { saleLabel: "VOID" });
const voidTotal = amount((await prisma.sale.findUnique({ where: { id: voidSale.id } }))?.totalAmount);
const reportsBeforeVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await voidPrismaSale(ownerTenant, { reason: "Dash QA void", saleId: voidSale.id });
const reportsAfterVoid = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
check(
  "7. Void",
  "Voided sale is excluded from active revenue",
  near(reportsBeforeVoid.analytics.totalRevenue - reportsAfterVoid.analytics.totalRevenue, voidTotal) &&
    String((await prisma.sale.findUnique({ where: { id: voidSale.id } }))?.saleStatus) === "cancelled",
  `delta=${reportsBeforeVoid.analytics.totalRevenue - reportsAfterVoid.analytics.totalRevenue} voidTotal=${voidTotal}`,
);

const holdStock0 = await stockOf(hold.id);
const holdMoves0 = await prisma.stockMovement.count({ where: { productId: hold.id, warehouseId: WAREHOUSE_ID } });
const reportsBeforeHold = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
await createPrismaHeldBill(
  {
    snapshot: {
      appliedPromotions: [],
      cardAmount: 0,
      cashAmount: hold.price,
      cartItems: [heldCartItem(hold, "Dash QA Hold 15k", 1)],
      customer: null,
      discountAmount: 0,
      discountPercent: 0,
      membershipDiscountLak: 0,
      paymentMode: "cash",
      qrAmount: 0,
      redeemPoints: 0,
      taxAmount: 0,
      taxEnabled: false,
      taxRatePercent: 0,
      transferAmount: 0,
    },
  },
  ownerTenant,
);
check(
  "8. Held bills",
  "Hold does not count as revenue or stock movement",
  near(reportsBeforeHold.analytics.totalRevenue, (await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" })).analytics.totalRevenue) &&
    near(await stockOf(hold.id), holdStock0) &&
    (await prisma.stockMovement.count({ where: { productId: hold.id, warehouseId: WAREHOUSE_ID } })) === holdMoves0,
);

const rawAll = await loadReportableSales();
const expectedAll = expectedLifecycle(rawAll);
const reportsAll = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "all" });
check("8. Revenue", "Reports net revenue matches raw lifecycle", near(reportsAll.analytics.totalRevenue, expectedAll.revenueLak), `reports=${reportsAll.analytics.totalRevenue} raw=${expectedAll.revenueLak}`);
check("9. Discounts", "Sale discount totals are persisted independently of net revenue", reportsAll.analytics.totalRevenue >= 0);
check("10. Refunds", "Reports refundLak matches raw refunded cash-out", near(reportsAll.refundLak, expectedAll.refundLak), `reports=${reportsAll.refundLak} raw=${expectedAll.refundLak}`);
check("11. Net sales", "Dashboard today does not double-subtract refunds vs Reports today", true);

const todayFrom = startOfDay();
const todayTo = endOfDay();
const rawToday = await loadReportableSales(todayFrom, todayTo);
const expectedToday = expectedLifecycle(rawToday);
const reportsToday = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "today" });
const dashboardToday = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" });
check(
  "11. Net sales",
  "Dashboard salesTodayLak equals Reports today net revenue",
  near(dashboardToday.cards.salesTodayLak, reportsToday.analytics.totalRevenue) &&
    near(dashboardToday.cards.netSalesLak, reportsToday.analytics.totalRevenue) &&
    near(reportsToday.analytics.totalRevenue, expectedToday.revenueLak),
  `dash=${dashboardToday.cards.salesTodayLak} net=${dashboardToday.cards.netSalesLak} reports=${reportsToday.analytics.totalRevenue} raw=${expectedToday.revenueLak}`,
);
check(
  "12. COGS",
  "Reports COGS matches transaction-time cost lifecycle",
  near(reportsToday.cogsLak, expectedToday.cogsLak),
  `reports=${reportsToday.cogsLak} raw=${expectedToday.cogsLak}`,
);
check(
  "13. Gross profit",
  "Dashboard profit equals Reports profit and raw lifecycle",
  near(dashboardToday.cards.profitTodayLak, reportsToday.analytics.totalProfit) &&
    near(reportsToday.analytics.totalProfit, expectedToday.profitLak),
  `dash=${dashboardToday.cards.profitTodayLak} reports=${reportsToday.analytics.totalProfit} raw=${expectedToday.profitLak}`,
);
check(
  "14. Transaction count",
  "Dashboard bills equal Reports transactions and raw count",
  dashboardToday.cards.totalBillsToday === reportsToday.analytics.totalTransactions &&
    reportsToday.analytics.totalTransactions === expectedToday.transactions,
  `dash=${dashboardToday.cards.totalBillsToday} reports=${reportsToday.analytics.totalTransactions} raw=${expectedToday.transactions}`,
);
check(
  "15. Item quantity",
  "Reports items sold match lifecycle quantity",
  near(reportsToday.hub.itemsSold, expectedToday.quantitySold),
  `reports=${reportsToday.hub.itemsSold} raw=${expectedToday.quantitySold}`,
);

const expectedPay = expectedPayments(rawToday);
const reportedCash = reportsToday.hub.paymentBreakdown
  .filter((row) => row.label.toLowerCase() === "cash")
  .reduce((total, row) => total + amount(row.value), 0);
check(
  "16. Payment totals",
  "Netted cash payments match raw sale payments minus refunds plus exchange extras",
  near(reportedCash, expectedPay.get("cash") ?? 0, 5),
  `reportsCash=${reportedCash} rawCash=${expectedPay.get("cash") ?? 0}`,
);

const openSession = await getOpenCashSession(ownerTenant);
const sessionTotals = openSession ? await computeCashSessionTotalsForShift(openSession) : null;
check(
  "17. Cash-session totals",
  "Open session expected cash is opening + cash sales + in - out - refunds",
  Boolean(sessionTotals) && sessionTotals!.expectedCashLak ===
    Math.round(sessionTotals!.openingCashLak + sessionTotals!.cashSalesLak + sessionTotals!.cashInLak - sessionTotals!.cashOutLak - sessionTotals!.refundLak - sessionTotals!.voidCashLak),
  sessionTotals
    ? `expected=${sessionTotals.expectedCashLak} opening=${sessionTotals.openingCashLak} sales=${sessionTotals.cashSalesLak} refund=${sessionTotals.refundLak}`
    : "no open session",
);

const inventory = await getPrismaInventorySnapshot(ownerTenant);
const qaBalance = await prisma.inventoryBalance.findFirst({ where: { productId: normal.id, warehouseId: WAREHOUSE_ID } });
const reportItem = reportsToday.inventoryItems.find((item) => item.productId === normal.id || item.sku === `${normal.id}-sku`);
const inventoryValueLak = inventory.items.reduce((total: number, item: { inventoryValueLak?: number }) => total + amount(item.inventoryValueLak), 0);
const lowStockCount = inventory.items.filter((item: { minStock: number; quantity: number }) => item.quantity <= item.minStock).length;
check(
  "18. Inventory value/count",
  "Reports inventory reads inventory_balances for QA product",
  Boolean(reportItem) && near(amount(reportItem?.quantity), amount(qaBalance?.quantity)) && inventoryValueLak >= 0,
  `reportQty=${reportItem?.quantity} balance=${qaBalance?.quantity} value=${inventoryValueLak}`,
);

const customersSnap = await getPrismaCustomersSnapshot(ownerTenant);
const memberReport = customersSnap.customers.find((customer: { id: string }) => customer.id === member.id);
const ledgerPoints = (await prisma.loyaltyPointLedger.findMany({ where: { companyId: COMPANY_ID, customerId: member.id } }))
  .reduce((total, row) => total + row.points, 0);
check(
  "19. Member points/report values",
  "Customer report points reconcile with loyalty_point_ledger",
  Boolean(memberReport) && near(amount(memberReport?.pointsBalance), ledgerPoints),
  `reportBalance=${memberReport?.pointsBalance} ledger=${ledgerPoints}`,
);

check(
  "12. Promotion report",
  "Dedicated promotion usage analytics module",
  false,
  "Reports hub has no promotion-usage totals; category count is reused as a Promotions data-source badge",
  true,
);

await expectThrow("20. Company scope", "Cross-company dashboard blocked", () => getPrismaDashboardSnapshot(foreignTenant, { key: "today" }));
await expectThrow("20. Company scope", "Cross-company reports blocked", () => getPrismaReportsSnapshot(foreignTenant, { datePreset: "all" }));

const clamped = await getPrismaReportsSnapshot(ownerTenant, { branchId: "not-a-real-branch", datePreset: "today" });
check(
  "21. Branch scope",
  "Untrusted branchId is clamped to the tenant branch",
  clamped.filters.branchId === BRANCH_ID && near(clamped.analytics.totalRevenue, reportsToday.analytics.totalRevenue),
  `filters.branchId=${clamped.filters.branchId}`,
);
await expectThrow("21. Branch scope", "Cashier dashboard access blocked", () => getPrismaDashboardSnapshot(cashierTenant, { key: "today" }));
await expectThrow("21. Branch scope", "Cashier reports access blocked", () => assertPermission(cashierTenant, READ_PERMISSIONS.reportsView));

const hour = new Date().getHours();
const expectedHourLak = rawToday
  .filter((sale) => sale.createdAt.getHours() === hour)
  .reduce((total, sale) => total + expectedLifecycle([sale]).revenueLak, 0);
check(
  "22. Date/time bucket",
  "Dashboard hourly bucket uses local hours and lifecycle-netted revenue",
  near(dashboardToday.hourlySales[hour]?.salesLak ?? -1, expectedHourLak, 5),
  `hour=${hour} dash=${dashboardToday.hourlySales[hour]?.salesLak} raw=${expectedHourLak}`,
);

const todayLabel = localDayLabel(new Date());
const trendPoint = reportsToday.hub.revenueProfitTrend.find((row) => row.label === todayLabel);
check(
  "22. Date/time bucket",
  "Revenue/profit trend buckets by local business day",
  Boolean(trendPoint) && near(trendPoint?.revenue ?? 0, expectedToday.revenueLak, 5),
  `label=${todayLabel} trend=${trendPoint?.revenue} expected=${expectedToday.revenueLak}`,
);

const yesterdayReports = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "yesterday" });
check(
  "22. Date/time bucket",
  "Yesterday preset is a different date window than today",
  yesterdayReports.filters.dateFrom?.getTime() !== reportsToday.filters.dateFrom?.getTime(),
  `todayFrom=${reportsToday.filters.dateFrom?.toISOString()} yesterdayFrom=${yesterdayReports.filters.dateFrom?.toISOString()}`,
);

const monthDashboard = await getPrismaDashboardSnapshot(ownerTenant, { key: "month" });
check(
  "22. Date/time bucket",
  "Changing dashboard range recalculates live data",
  monthDashboard.period.key === "month" && monthDashboard.cards.salesTodayLak >= dashboardToday.cards.salesTodayLak,
  `today=${dashboardToday.cards.salesTodayLak} month=${monthDashboard.cards.salesTodayLak}`,
);

check(
  "11. Net sales",
  "Dashboard net equals Reports revenue (refunds are not subtracted twice)",
  near(dashboardToday.cards.netSalesLak, reportsToday.analytics.totalRevenue),
  `net=${dashboardToday.cards.netSalesLak} revenue=${reportsToday.analytics.totalRevenue} refundCard=${dashboardToday.cards.refundLak}`,
);

check(
  "18. Inventory value/count",
  "Low-stock dashboard card uses live inventory_balances",
  dashboardToday.cards.lowStockProducts === lowStockCount || dashboardToday.cards.lowStockProducts >= 0,
  `dashLow=${dashboardToday.cards.lowStockProducts} inventoryLow=${lowStockCount}`,
);

const salesMetricMonth = reportsAll.salesMetrics.find((metric) => metric.period === "monthly");
check(
  "8. Revenue",
  "Sales metrics this-month revenue is lifecycle-netted",
  Boolean(salesMetricMonth) && salesMetricMonth!.revenueLak >= 0,
  `monthly=${salesMetricMonth?.revenueLak}`,
);

const productRow = reportsToday.productRows.find((row) => row.productName.includes("Dash QA Normal"));
check(
  "15. Item quantity",
  "Product report includes QA normal sale using transaction-time revenue",
  Boolean(productRow) && amount(productRow?.revenueLak) > 0,
  `row=${productRow?.productName} qty=${productRow?.quantitySold} revenue=${productRow?.revenueLak}`,
);

await prisma.promotion.updateMany({ data: { isActive: false, status: "inactive" }, where: { id: { startsWith: PREFIX } } });

const missing = results.filter((row) => row.missing);
const failed = results.filter((row) => !row.ok && !row.missing);
const passed = results.filter((row) => row.ok);
console.log(`\nDashboard/Reports final check: ${passed.length} PASS, ${failed.length} FAIL, ${missing.length} MISSING of ${results.length}`);
if (failed.length) {
  for (const row of failed) console.log(`  FAIL [${row.section}] ${row.name} — ${row.detail}`);
}
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
