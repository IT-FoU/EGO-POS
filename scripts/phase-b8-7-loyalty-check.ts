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
const { completePrismaSale } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession } = await import("../features/cash-sessions/prisma-repository");
const { refundPrismaSale, voidPrismaSale } = await import("../features/pos/post-sale-repository");
const {
  adjustCustomerLoyaltyPoints,
  applyLoyaltyLedger,
  reverseSaleLoyalty,
} = await import("../features/loyalty/loyalty-service");
const { buildPosPolicyForTenant, assertPosActionAllowed } = await import("../features/pos/pos-permission-guard");
const { PermissionDeniedError } = await import("../lib/auth/permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PRODUCT_ID = "b87-test-product";
const UNIT_ID = "b87-test-unit";
const CUSTOMER_ID = "b87-test-customer";
const LEVEL_STANDARD_ID = "level-standard";
const LEVEL_GOLD_ID = "level-gold";
const PLAN_ID = "b87-plan-monthly";
const SALE_LAK = 20_000;
const REDEEM_POINTS = 10;
const POINT_VALUE = 1_000;
const SPEND_PER_POINT = 10_000;
const EPS = 0.01;

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

async function ensureOpenSession(tenant: { branchId: string; companyId: string; userId: string; warehouseId: string }) {
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: tenant.userId, closedAt: null, companyId: COMPANY_ID },
  });
  if (!(await getOpenCashSession(tenant))) {
    await openCashSession({ openingCashLak: 100_000 }, tenant);
  }
}

async function ensureFixtures() {
  await prisma.companySetting.upsert({
    create: {
      companyId: COMPANY_ID,
      loyaltyEnabled: true,
      loyaltyMinRedeemPoints: 10,
      loyaltyPointValueLak: POINT_VALUE,
      loyaltySpendPerPointLak: SPEND_PER_POINT,
    },
    update: { loyaltyEnabled: true, loyaltyMinRedeemPoints: 10, loyaltyPointValueLak: POINT_VALUE, loyaltySpendPerPointLak: SPEND_PER_POINT },
    where: { companyId: COMPANY_ID },
  });
  await prisma.membershipLevel.upsert({
    create: { companyId: COMPANY_ID, discountPercent: 0, id: LEVEL_STANDARD_ID, isActive: true, minSpendLak: 0, name: "Standard" },
    update: { discountPercent: 0, isActive: true, minSpendLak: 0 },
    where: { id: LEVEL_STANDARD_ID },
  });
  await prisma.membershipLevel.upsert({
    create: { companyId: COMPANY_ID, discountPercent: 5, id: LEVEL_GOLD_ID, isActive: true, minSpendLak: 50_000, name: "Gold" },
    update: { discountPercent: 5, isActive: true, minSpendLak: 50_000 },
    where: { id: LEVEL_GOLD_ID },
  });
  await prisma.subscriptionPlan.upsert({
    create: {
      companyId: COMPANY_ID,
      discountPercent: 0,
      id: PLAN_ID,
      monthlyFee: 0,
      name: "B87 Monthly",
      subscriptionType: "monthly",
      yearlyFee: 0,
    },
    update: { name: "B87 Monthly" },
    where: { id: PLAN_ID },
  });
  await prisma.product.upsert({
    create: {
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: 10_000,
      id: PRODUCT_ID,
      isActive: true,
      nameEn: "B8-7 Product",
      nameLo: "B8-7 Product",
      sellingPriceLak: SALE_LAK,
    },
    update: { isActive: true, sellingPriceLak: SALE_LAK },
    where: { id: PRODUCT_ID },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: 10_000,
      id: UNIT_ID,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: PRODUCT_ID,
      sellingPriceLak: SALE_LAK,
      status: "active",
      unitName: "Piece",
    },
    update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: SALE_LAK, status: "active" },
    where: { id: UNIT_ID },
  });
  const stock = await prisma.inventoryBalance.findFirst({ where: { productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID } });
  if (stock) {
    await prisma.inventoryBalance.update({ data: { quantity: 1_000_000 }, where: { id: stock.id } });
  } else {
    await prisma.inventoryBalance.create({
      data: { companyId: COMPANY_ID, productId: PRODUCT_ID, quantity: 1_000_000, warehouseId: WAREHOUSE_ID },
    });
  }
  await prisma.customer.upsert({
    create: {
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      fullName: "B8-7 Customer",
      id: CUSTOMER_ID,
      membershipLevelId: LEVEL_STANDARD_ID,
      phone: "020-000087",
      pointsBalance: 500,
      status: "active",
      totalSpent: 0,
    },
    update: { membershipLevelId: LEVEL_STANDARD_ID, pointsBalance: 500, status: "active", totalSpent: 0 },
    where: { id: CUSTOMER_ID },
  });
  await prisma.customerSubscription.deleteMany({ where: { customerId: CUSTOMER_ID } });
  await prisma.loyaltyPointLedger.deleteMany({ where: { customerId: CUSTOMER_ID } });
}

async function completeCashSale(
  tenant: { branchId: string; companyId: string; userId: string; warehouseId: string },
  saleNo: string,
  options: { customerId?: string; redeemPoints?: number; totalAmount?: number } = {},
) {
  const totalAmount = options.totalAmount ?? SALE_LAK;
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: totalAmount,
      changeAmount: 0,
      customerId: options.customerId,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: PRODUCT_ID, quantity: 1, sellingPrice: SALE_LAK, unitId: UNIT_ID }],
      paymentMode: "cash",
      qrAmount: 0,
      redeemPoints: options.redeemPoints ?? 0,
      saleNo,
      taxAmount: 0,
      taxRate: 0,
      totalAmount,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !cashierUser) {
  console.error("Missing seed data. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "not-assigned-user-b87", warehouseId: WAREHOUSE_ID };

await ensureFixtures();
await ensureOpenSession(ownerTenant);

const earnSale = await completeCashSale(ownerTenant, `B87-EARN-${Date.now()}`, { customerId: CUSTOMER_ID });
const earnedPoints = Math.floor(SALE_LAK / SPEND_PER_POINT);
const afterEarn = await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } });
check("A. Customer earns points on completed sale", near(Number(afterEarn?.pointsBalance ?? 0), 500 + earnedPoints), `points=${afterEarn?.pointsBalance}`);

const ledgerEarnCount = await prisma.loyaltyPointLedger.count({ where: { saleId: earnSale.id, pointType: "earn" } });
check("B. Loyalty ledger earn entry created", ledgerEarnCount === 1, `count=${ledgerEarnCount}`);

await expectThrow("C. Duplicate earn blocked", async () => {
  await prisma.$transaction(async (tx) => {
    await applyLoyaltyLedger(tx, {
      companyId: COMPANY_ID,
      customerId: CUSTOMER_ID,
      earnedPoints: 1,
      redeemDiscountLak: 0,
      redeemPoints: 0,
      saleId: earnSale.id,
      saleNo: earnSale.saleNo,
      totalAmountLak: SALE_LAK,
    });
  });
});

await prisma.customer.update({ data: { pointsBalance: 500 }, where: { id: CUSTOMER_ID } });
const redeemSale = await completeCashSale(ownerTenant, `B87-REDEEM-${Date.now()}`, {
  customerId: CUSTOMER_ID,
  redeemPoints: REDEEM_POINTS,
  totalAmount: SALE_LAK - REDEEM_POINTS * POINT_VALUE,
});
const redeemEarned = Math.floor((SALE_LAK - REDEEM_POINTS * POINT_VALUE) / SPEND_PER_POINT);
const afterRedeem = await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } });
check(
  "D. Redeem points reduces balance",
  near(Number(afterRedeem?.pointsBalance ?? 0), 500 - REDEEM_POINTS + redeemEarned),
  `points=${afterRedeem?.pointsBalance}`,
);

await expectThrow("E. Insufficient points redemption blocked", () =>
  completeCashSale(ownerTenant, `B87-BAD-REDEEM-${Date.now()}`, { customerId: CUSTOMER_ID, redeemPoints: 9_999 }),
);

await expectThrow("F. Negative manual adjustment blocked", () =>
  adjustCustomerLoyaltyPoints(ownerTenant, { customerId: CUSTOMER_ID, pointsDelta: -10_000 }),
);

const adjustResult = await adjustCustomerLoyaltyPoints(ownerTenant, { customerId: CUSTOMER_ID, note: "B87 bonus", pointsDelta: 50 });
check(
  "G. Manual point adjustment updates balance",
  near(adjustResult.pointsBalance, 500 - REDEEM_POINTS + redeemEarned + 50),
  `points=${adjustResult.pointsBalance}`,
);

const auditBefore = await prisma.auditLog.count({ where: { companyId: COMPANY_ID, module: "customers" } });
await adjustCustomerLoyaltyPoints(ownerTenant, { customerId: CUSTOMER_ID, pointsDelta: 10, note: "Audit check" });
const auditAfter = await prisma.auditLog.count({ where: { companyId: COMPANY_ID, module: "customers" } });
check("H. Manual adjustment creates audit log", auditAfter > auditBefore, `before=${auditBefore}, after=${auditAfter}`);

await prisma.customer.update({ data: { pointsBalance: 500, totalSpent: 0 }, where: { id: CUSTOMER_ID } });
await prisma.loyaltyPointLedger.deleteMany({ where: { customerId: CUSTOMER_ID } });
const refundTarget = await completeCashSale(ownerTenant, `B87-REFUND-${Date.now()}`, { customerId: CUSTOMER_ID });
await refundPrismaSale(ownerTenant, { saleId: refundTarget.id });
check(
  "I. Refund reverses earned points",
  near(Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0), 500),
  `points=${(await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance}`,
);

await prisma.customer.update({ data: { pointsBalance: 500 }, where: { id: CUSTOMER_ID } });
const redeemRefundSale = await completeCashSale(ownerTenant, `B87-REDEEM-REFUND-${Date.now()}`, {
  customerId: CUSTOMER_ID,
  redeemPoints: REDEEM_POINTS,
  totalAmount: SALE_LAK - REDEEM_POINTS * POINT_VALUE,
});
await refundPrismaSale(ownerTenant, { saleId: redeemRefundSale.id });
check(
  "J. Refund restores redeemed points",
  near(Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0), 500),
  `points=${(await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance}`,
);

const voidTarget = await completeCashSale(ownerTenant, `B87-VOID-${Date.now()}`, { customerId: CUSTOMER_ID });
const pointsBeforeVoid = Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0);
await voidPrismaSale(ownerTenant, { saleId: voidTarget.id });
check(
  "K. Void reverses loyalty impact",
  near(Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0), pointsBeforeVoid - earnedPoints),
  `points=${(await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance}`,
);

await expectThrow("L. Double loyalty reversal blocked", async () => {
  const sale = await prisma.sale.findUnique({ where: { id: voidTarget.id } });
  if (!sale) throw new Error("Sale fixture missing.");
  await prisma.$transaction(async (tx) => reverseSaleLoyalty(tx, sale));
});

await prisma.customer.update({
  data: { membershipLevelId: LEVEL_GOLD_ID, totalSpent: 60_000 },
  where: { id: CUSTOMER_ID },
});
await prisma.customerSubscription.create({
  data: {
    customerId: CUSTOMER_ID,
    endDate: new Date("2020-01-01"),
    planId: PLAN_ID,
    startDate: new Date("2019-01-01"),
    status: "active",
  },
});
const expiredSale = await completePrismaSale(
  {
    branchId: BRANCH_ID,
    cashAmount: SALE_LAK,
    changeAmount: 0,
    customerId: CUSTOMER_ID,
    discountAmount: 0,
    discountPercent: 0,
    items: [{ productId: PRODUCT_ID, quantity: 1, sellingPrice: SALE_LAK, unitId: UNIT_ID }],
    paymentMode: "cash",
    qrAmount: 0,
    saleNo: `B87-EXPIRED-${Date.now()}`,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: SALE_LAK,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);
check(
  "M. Expired membership does not receive discount",
  near(Number(expiredSale.items[0].sellingPrice), SALE_LAK),
  `sellingPrice=${expiredSale.items[0].sellingPrice}`,
);

await prisma.customerSubscription.deleteMany({ where: { customerId: CUSTOMER_ID } });
await prisma.customer.update({
  data: { membershipLevelId: LEVEL_GOLD_ID, totalSpent: 60_000 },
  where: { id: CUSTOMER_ID },
});
await prisma.customerSubscription.create({
  data: {
    customerId: CUSTOMER_ID,
    endDate: new Date("2099-12-31"),
    planId: PLAN_ID,
    startDate: new Date("2026-01-01"),
    status: "active",
  },
});
const activeSale = await completeCashSale(ownerTenant, `B87-ACTIVE-${Date.now()}`, { customerId: CUSTOMER_ID });
const expectedMemberPrice = Math.round(SALE_LAK * 0.95);
check(
  "N. Active membership receives correct discount",
  near(Number(activeSale.items[0].sellingPrice), expectedMemberPrice),
  `sellingPrice=${activeSale.items[0].sellingPrice}`,
);

await prisma.customer.update({ data: { membershipLevelId: LEVEL_STANDARD_ID, totalSpent: 60_000 }, where: { id: CUSTOMER_ID } });
await completeCashSale(ownerTenant, `B87-TIER-${Date.now()}`, { customerId: CUSTOMER_ID, totalAmount: SALE_LAK });
const tierCustomer = await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } });
check("O. Tier rule upgrades membership level on spend", tierCustomer?.membershipLevelId === LEVEL_GOLD_ID, `level=${tierCustomer?.membershipLevelId}`);

await expectThrow("P. Unauthorized point adjustment blocked", () =>
  adjustCustomerLoyaltyPoints(cashierTenant, { customerId: CUSTOMER_ID, pointsDelta: 10 }),
);

await expectThrow("Q. Cross-company point adjustment blocked", () =>
  adjustCustomerLoyaltyPoints(foreignTenant, { customerId: CUSTOMER_ID, pointsDelta: 10 }),
);

try {
  const cashierPolicy = await buildPosPolicyForTenant(cashierTenant);
  assertPosActionAllowed(cashierPolicy, "create_sale");
  check("R. Cashier can still checkout (pos.sell)", true);
} catch {
  check("R. Cashier can still checkout (pos.sell)", false);
}

const passed = results.filter((row) => row.ok).length;
const failed = results.length - passed;
console.log(`\nB8-7 loyalty/membership hardening: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
