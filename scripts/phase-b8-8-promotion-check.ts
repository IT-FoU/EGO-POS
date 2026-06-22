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
const { createPrismaPromotion, getPrismaPromotionById, updatePrismaPromotion } = await import("../features/promotions/prisma-repository");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { recordPromotionUsage } = await import("../features/promotions/promotion-checkout");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const CATEGORY_ID = "b88-test-category";
const PRODUCT_A = "b88-test-product-a";
const PRODUCT_B = "b88-test-product-b";
const UNIT_A = "b88-test-unit-a";
const UNIT_B = "b88-test-unit-b";
const CUSTOMER_ID = "b88-test-customer";
const LEVEL_GOLD_ID = "level-gold";
const PRICE = 10_000;
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
      loyaltyMinRedeemPoints: 1,
      loyaltyPointValueLak: 1000,
      loyaltySpendPerPointLak: 10_000,
    },
    update: { loyaltyEnabled: true, loyaltyMinRedeemPoints: 1, loyaltyPointValueLak: 1000, loyaltySpendPerPointLak: 10_000 },
    where: { companyId: COMPANY_ID },
  });
  await prisma.category.upsert({
    create: { branchId: BRANCH_ID, companyId: COMPANY_ID, id: CATEGORY_ID, nameEn: "B88 Category", nameLo: "B88 Category" },
    update: { nameEn: "B88 Category" },
    where: { id: CATEGORY_ID },
  });
  for (const [productId, unitId, name] of [
    [PRODUCT_A, UNIT_A, "B88 Product A"],
    [PRODUCT_B, UNIT_B, "B88 Product B"],
  ] as const) {
    await prisma.product.upsert({
      create: {
        branchId: BRANCH_ID,
        categoryId: CATEGORY_ID,
        companyId: COMPANY_ID,
        costPriceLak: 6_000,
        id: productId,
        isActive: true,
        nameEn: name,
        nameLo: name,
        sellingPriceLak: PRICE,
      },
      update: { categoryId: CATEGORY_ID, costPriceLak: 6_000, isActive: true, sellingPriceLak: PRICE },
      where: { id: productId },
    });
    await prisma.productUnit.upsert({
      create: {
        conversionQty: 1,
        costPriceLak: 6_000,
        id: unitId,
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        productId,
        sellingPriceLak: PRICE,
        status: "active",
        unitName: "Piece",
      },
      update: { costPriceLak: 6_000, isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: PRICE, status: "active" },
      where: { id: unitId },
    });
    const stock = await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } });
    if (stock) {
      await prisma.inventoryBalance.update({ data: { quantity: 1_000_000 }, where: { id: stock.id } });
    } else {
      await prisma.inventoryBalance.create({
        data: { companyId: COMPANY_ID, productId, quantity: 1_000_000, warehouseId: WAREHOUSE_ID },
      });
    }
  }
  await prisma.customer.upsert({
    create: {
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      fullName: "B88 Customer",
      id: CUSTOMER_ID,
      membershipLevelId: LEVEL_GOLD_ID,
      phone: "020-000088",
      pointsBalance: 500,
      status: "active",
      totalSpent: 60_000,
    },
    update: { membershipLevelId: LEVEL_GOLD_ID, pointsBalance: 500, status: "active" },
    where: { id: CUSTOMER_ID },
  });
}

async function sale(
  tenant: { branchId: string; companyId: string; userId: string; warehouseId: string },
  saleNo: string,
  options: {
    customerId?: string;
    items?: Array<{ productId: string; quantity: number; unitId: string }>;
    promotionCodes?: string[];
    redeemPoints?: number;
    totalAmount?: number;
  } = {},
) {
  const items = options.items ?? [{ productId: PRODUCT_A, quantity: 1, unitId: UNIT_A }];
  const subtotal = items.length * PRICE;
  const clientTotal = options.totalAmount ?? subtotal;
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: Math.max(clientTotal, subtotal),
      changeAmount: 0,
      customerId: options.customerId,
      discountAmount: 0,
      discountPercent: 0,
      items: items.map((item) => ({ ...item, sellingPrice: PRICE })),
      paymentMode: "cash",
      promotionCodes: options.promotionCodes,
      qrAmount: 0,
      redeemPoints: options.redeemPoints ?? 0,
      saleNo,
      taxAmount: 0,
      taxRate: 0,
      totalAmount: clientTotal,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
}

async function deactivateHarnessPromos() {
  await prisma.promotion.updateMany({
    data: { isActive: false, status: "inactive" },
    where: { companyId: COMPANY_ID, promotionName: { startsWith: "B88" } },
  });
}


async function createPromo(
  tenant: { branchId: string; companyId: string; userId: string; warehouseId: string },
  input: Record<string, unknown>,
) {
  return createPrismaPromotion(
    {
      endDate: "2099-12-31",
      promotionName: String(input.promotionName ?? "B88 Promo"),
      startDate: "2020-01-01",
      ...input,
    } as any,
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
const foreignTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "not-assigned-user-b88", warehouseId: WAREHOUSE_ID };

await ensureFixtures();
await ensureOpenSession(ownerTenant);

await deactivateHarnessPromos();
const pctPromo = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 10,
  promotionName: "B88 Percent",
  promotionType: "percentage",
});
const pctSale = await sale(ownerTenant, `B88-PCT-${Date.now()}`);
check("A. Percentage promotion applies correctly", near(Number(pctSale.items[0].promotionDiscount), 1000), `discount=${pctSale.items[0].promotionDiscount}`);

await deactivateHarnessPromos();
const fixedPromo = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountAmountLak: 1500,
  promotionName: "B88 Fixed",
  promotionType: "fixed_amount",
});
const fixedSale = await sale(ownerTenant, `B88-FIXED-${Date.now()}`);
check("B. Fixed amount promotion applies correctly", near(Number(fixedSale.items[0].promotionDiscount), 1500), `discount=${fixedSale.items[0].promotionDiscount}`);

await deactivateHarnessPromos();
await prisma.promotion.create({
  data: {
    buyQuantity: 15_000,
    companyId: COMPANY_ID,
    discountAmountLak: 2000,
    endDate: new Date("2099-12-31"),
    isActive: true,
    promotionName: "B88 Spend Threshold",
    promotionType: "fixed_amount",
    startDate: new Date("2020-01-01"),
    status: "active",
  },
});
const spendFixture = await prisma.promotion.findFirst({
  where: { companyId: COMPANY_ID, promotionName: "B88 Spend Threshold", status: "active" },
});
check(
  "C0. Spend threshold fixture persisted",
  spendFixture != null && Number(spendFixture.buyQuantity) === 15_000 && Number(spendFixture.discountAmountLak) === 2000,
  `buy=${spendFixture?.buyQuantity}, discount=${spendFixture?.discountAmountLak}`,
);
const spendSale = await sale(ownerTenant, `B88-SPEND-${Date.now()}`, {
  items: [
    { productId: PRODUCT_A, quantity: 1, unitId: UNIT_A },
    { productId: PRODUCT_B, quantity: 1, unitId: UNIT_B },
  ],
});
check("C. Spend threshold promotion applies correctly", near(Number(spendSale.discountAmount), 2000), `discount=${spendSale.discountAmount}`);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_B],
  discountPercent: 20,
  promotionName: "B88 Product B",
  promotionType: "percentage",
});
const productSale = await sale(ownerTenant, `B88-PROD-${Date.now()}`, {
  items: [
    { productId: PRODUCT_A, quantity: 1, unitId: UNIT_A },
    { productId: PRODUCT_B, quantity: 1, unitId: UNIT_B },
  ],
});
check(
  "D. Product-targeted promotion applies correctly",
  near(Number(productSale.items.find((item: { productId: string }) => item.productId === PRODUCT_B)?.promotionDiscount ?? 0), 2000),
  `discount=${productSale.items.find((item: { productId: string }) => item.productId === PRODUCT_B)?.promotionDiscount}`,
);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableCategoryIds: [CATEGORY_ID],
  discountPercent: 5,
  promotionName: "B88 Category",
  promotionType: "percentage",
});
const categorySale = await sale(ownerTenant, `B88-CAT-${Date.now()}`);
check("E. Category-targeted promotion applies correctly", near(Number(categorySale.items[0].promotionDiscount), 500), `discount=${categorySale.items[0].promotionDiscount}`);

await deactivateHarnessPromos();
const inactivePct = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 10,
  promotionName: "B88 Inactive Target",
  promotionType: "percentage",
});
await prisma.promotion.update({ data: { isActive: false, status: "inactive" }, where: { id: inactivePct.id } });
const inactiveSale = await sale(ownerTenant, `B88-INACTIVE-${Date.now()}`);
check("F. Inactive promotion is ignored", near(Number(inactiveSale.items[0].promotionDiscount), 0), `discount=${inactiveSale.items[0].promotionDiscount}`);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 99,
  endDate: "2020-01-02",
  promotionName: "B88 Expired",
  promotionType: "percentage",
  startDate: "2019-01-01",
});
const expiredSale = await sale(ownerTenant, `B88-EXPIRED-${Date.now()}`);
check("G. Expired promotion is ignored", near(Number(expiredSale.items[0].promotionDiscount), 0), `discount=${expiredSale.items[0].promotionDiscount}`);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 99,
  endDate: "2099-12-31",
  promotionName: "B88 Future",
  promotionType: "percentage",
  startDate: "2099-01-01",
});
const futureSale = await sale(ownerTenant, `B88-FUTURE-${Date.now()}`);
check("H. Future promotion is ignored", near(Number(futureSale.items[0].promotionDiscount), 0), `discount=${futureSale.items[0].promotionDiscount}`);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 5,
  promotionName: "B88 Low Priority",
  priority: 1,
  promotionType: "percentage",
});
const highPriority = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 5,
  promotionName: "B88 High Priority",
  priority: 500,
  promotionType: "percentage",
});
const prioritySale = await sale(ownerTenant, `B88-PRIORITY-${Date.now()}`);
check(
  "I. Priority chooses correct promotion on tie",
  prioritySale.items[0].promotionId === highPriority.id,
  `promotionId=${prioritySale.items[0].promotionId}`,
);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 10,
  promotionName: "B88 Stack A",
  promotionType: "percentage",
});
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountAmountLak: 1500,
  promotionName: "B88 Stack B",
  priority: 200,
  promotionType: "fixed_amount",
});
const stackingSale = await sale(ownerTenant, `B88-STACK-${Date.now()}`);
check(
  "J. Stacking disabled blocks double discount",
  near(Number(stackingSale.items[0].promotionDiscount), 1500),
  `discount=${stackingSale.items[0].promotionDiscount}`,
);

await expectThrow("K. Duplicate promotion usage blocked", async () => {
  await prisma.$transaction(async (tx) => {
    await recordPromotionUsage(tx, {
      companyId: COMPANY_ID,
      saleId: stackingSale.id,
      saleItems: [{
        baseQuantity: 1,
        costPrice: 6000,
        discountAmount: 1500,
        productId: PRODUCT_A,
        profitAmount: 2500,
        promotionDiscount: 1500,
        promotionId: stackingSale.items[0].promotionId,
        quantity: 1,
        sellingPrice: PRICE,
        totalAmount: 8500,
        unitId: UNIT_A,
      }],
    });
  });
});

await expectThrow("L. Manipulated client promotion rejected", () =>
  completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: 1000,
      changeAmount: 0,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: PRODUCT_A, promotionDiscount: 9000, promotionId: "fake-promo", quantity: 1, sellingPrice: PRICE, unitId: UNIT_A }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: `B88-BAD-CLIENT-${Date.now()}`,
      taxAmount: 0,
      taxRate: 0,
      totalAmount: 1000,
      warehouseId: WAREHOUSE_ID,
    },
    ownerTenant,
  ),
);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 50,
  promotionName: "B88 Below Cost",
  promotionType: "percentage",
});
await expectThrow("M. Promotion below cost blocked", () => sale(ownerTenant, `B88-BELOW-COST-${Date.now()}`));

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableCategoryIds: [CATEGORY_ID],
  discountPercent: 5,
  promotionName: "B88 Member Category",
  promotionType: "percentage",
});
const memberSale = await sale(ownerTenant, `B88-MEMBER-${Date.now()}`, { customerId: CUSTOMER_ID });
check(
  "N. Member discount + promotion calculation is correct",
  near(Number(memberSale.items[0].sellingPrice), 9500) && near(Number(memberSale.items[0].promotionDiscount), 475),
  `price=${memberSale.items[0].sellingPrice}, promo=${memberSale.items[0].promotionDiscount}`,
);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableCategoryIds: [CATEGORY_ID],
  discountPercent: 5,
  promotionName: "B88 Loyalty Category",
  promotionType: "percentage",
});
const loyaltySale = await sale(ownerTenant, `B88-LOYALTY-${Date.now()}`, {
  customerId: CUSTOMER_ID,
  redeemPoints: 1,
});
check(
  "O. Loyalty redemption still works after promotion",
  near(Number(loyaltySale.items[0].promotionDiscount), 475) && Number(loyaltySale.totalAmount) < 9025,
  `total=${loyaltySale.totalAmount}, promo=${loyaltySale.items[0].promotionDiscount}`,
);

await deactivateHarnessPromos();
const refundFixedPromo = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountAmountLak: 1500,
  promotionName: "B88 Refund Fixed",
  promotionType: "fixed_amount",
});
const refundPromoSale = await sale(ownerTenant, `B88-REFUND-PROMO-${Date.now()}`);
const usageBeforeRefund = await prisma.promotionUsage.count({ where: { saleId: refundPromoSale.id } });
const promoUsageBefore = await prisma.promotion.findUnique({ where: { id: refundFixedPromo.id } });
await refundPrismaSale(ownerTenant, { saleId: refundPromoSale.id });
const usageAfterRefund = await prisma.promotionUsage.count({ where: { saleId: refundPromoSale.id } });
const promoUsageAfter = await prisma.promotion.findUnique({ where: { id: refundFixedPromo.id } });
check("P. Refund reverses promotion impact", usageBeforeRefund === 1 && usageAfterRefund === 0, `usage=${usageAfterRefund}`);
check(
  "P2. Refund decrements promotion counters",
  Number(promoUsageAfter?.usageCount ?? 0) < Number(promoUsageBefore?.usageCount ?? 0),
  `usageCount=${promoUsageAfter?.usageCount}`,
);

await deactivateHarnessPromos();
const voidFixedPromo = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountAmountLak: 1500,
  promotionName: "B88 Void Fixed",
  promotionType: "fixed_amount",
});
const voidPromoSale = await sale(ownerTenant, `B88-VOID-PROMO-${Date.now()}`);
await voidPrismaSale(ownerTenant, { saleId: voidPromoSale.id });
check("Q. Void reverses promotion impact", (await prisma.promotionUsage.count({ where: { saleId: voidPromoSale.id } })) === 0);

await expectThrow("R. Unauthorized promotion create blocked", () =>
  createPromo(cashierTenant, { applicableProductIds: [PRODUCT_A], discountPercent: 1, promotionName: "B88 Cashier Promo", promotionType: "percentage" }),
);

await deactivateHarnessPromos();
const crossPromo = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountPercent: 5,
  promotionName: "B88 Cross Promo",
  promotionType: "percentage",
});
await expectThrow("S. Cross-company promotion update blocked", () =>
  updatePrismaPromotion(crossPromo.id, { promotionName: "Foreign" }, foreignTenant),
);

await deactivateHarnessPromos();
await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountAmountLak: 1500,
  promotionName: "B88 Report Fixed",
  promotionType: "fixed_amount",
});
const revenueBefore = (await getPrismaReportsSnapshot(ownerTenant)).analytics.totalRevenue;
const reportPromoSale = await sale(ownerTenant, `B88-REPORT-${Date.now()}`);
const revenueAfter = (await getPrismaReportsSnapshot(ownerTenant)).analytics.totalRevenue;
check(
  "T. Reports reflect promotion discounts correctly",
  near(revenueAfter - revenueBefore, Number(reportPromoSale.totalAmount)),
  `delta=${revenueAfter - revenueBefore}, sale=${reportPromoSale.totalAmount}`,
);

const reportPromo = await prisma.promotion.findFirst({ where: { promotionName: "B88 Report Fixed" } });
const mapped = reportPromo ? await getPrismaPromotionById(reportPromo.id, ownerTenant) : undefined;
check("U. Promotion analytics totalSalesLak computed", Number(mapped?.totalSalesLak ?? 0) > 0, `totalSalesLak=${mapped?.totalSalesLak}`);

await deactivateHarnessPromos();
const updatePromo = await createPromo(ownerTenant, {
  applicableProductIds: [PRODUCT_A],
  discountAmountLak: 1500,
  promotionName: "B88 Fixed Updated",
  promotionType: "fixed_amount",
});
await updatePrismaPromotion(
  updatePromo.id,
  { applicableProductIds: [PRODUCT_B], promotionName: "B88 Fixed Updated" },
  ownerTenant,
);
const updated = await prisma.promotion.findFirst({
  include: { products: true },
  where: { id: updatePromo.id },
});
check(
  "V. Promotion target update replaces product scope",
  updated?.products.length === 1 && updated.products[0]?.productId === PRODUCT_B,
  `products=${updated?.products.map((row) => row.productId).join(",")}`,
);

const passed = results.filter((row) => row.ok).length;
const failed = results.length - passed;
console.log(`\nB8-8 promotion hardening: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
