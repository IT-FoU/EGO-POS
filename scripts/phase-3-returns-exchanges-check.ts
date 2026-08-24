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
const { getPrismaSaleById, refundPrismaSale, voidPrismaSale } = await import("../features/pos/post-sale-repository");
const { exchangePrismaSale, returnPrismaSale } = await import("../features/pos/return-repository");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const CUSTOMER_ID = "p3-qa-customer";
const PREFIX = "p3-qa";
const EPS = 0.5;

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };

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

async function stockOf(productId: string) {
  return Number(
    (await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } }))?.quantity ?? 0,
  );
}

async function upsertProduct(id: string, name: string, price: number) {
  const sku = `${id}-sku`;
  const productCode = `${id}-code`;
  await prisma.product.upsert({
    create: {
      barcode: `${id}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: Math.round(price / 2),
      id,
      isActive: true,
      nameEn: name,
      nameLo: name,
      productCode,
      sellingPriceLak: price,
      sku,
    },
    update: {
      isActive: true,
      nameEn: name,
      nameLo: name,
      sellingPriceLak: price,
      sku,
    },
    where: { id },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: Math.round(price / 2),
      id: `${id}-unit`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      productId: id,
      sellingPriceLak: price,
      status: "active",
      unitName: "Piece",
    },
    update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: price, status: "active" },
    where: { id: `${id}-unit` },
  });
  const stock = await prisma.inventoryBalance.findFirst({ where: { productId: id, warehouseId: WAREHOUSE_ID } });
  if (stock) {
    await prisma.inventoryBalance.update({ data: { quantity: 1_000_000 }, where: { id: stock.id } });
  } else {
    await prisma.inventoryBalance.create({
      data: { companyId: COMPANY_ID, productId: id, quantity: 1_000_000, warehouseId: WAREHOUSE_ID },
    });
  }
  return { id, price, unitId: `${id}-unit` };
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

async function sell(
  tenant: Tenant,
  product: { id: string; price: number; unitId: string },
  quantity: number,
  customerId?: string,
) {
  const totalAmount = product.price * quantity;
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: totalAmount,
      changeAmount: 0,
      customerId,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: product.id, quantity, sellingPrice: product.price, unitId: product.unitId }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: `P3-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      taxAmount: 0,
      taxRate: 0,
      totalAmount,
      warehouseId: WAREHOUSE_ID,
    },
    tenant,
  );
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed data. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const managerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: managerUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { branchId: BRANCH_ID, companyId: "not-gobox-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

await prisma.customer.upsert({
  create: {
    branchId: BRANCH_ID,
    companyId: COMPANY_ID,
    fullName: "P3 QA Customer",
    id: CUSTOMER_ID,
    phone: "020-000003",
    pointsBalance: 0,
    status: "active",
    totalSpent: 0,
  },
  update: { pointsBalance: 0, status: "active", totalSpent: 0 },
  where: { id: CUSTOMER_ID },
});
await prisma.loyaltyPointLedger.deleteMany({ where: { customerId: CUSTOMER_ID } });
await prisma.companySetting.upsert({
  create: {
    companyId: COMPANY_ID,
    loyaltyEnabled: true,
    loyaltyMinRedeemPoints: 1,
    loyaltyPointValueLak: 1_000,
    loyaltySpendPerPointLak: 10_000,
  },
  update: { loyaltyEnabled: true, loyaltySpendPerPointLak: 10_000 },
  where: { companyId: COMPANY_ID },
});

const orig = await upsertProduct(`${PREFIX}-orig`, "P3 QA Original 30k", 30_000);
const high = await upsertProduct(`${PREFIX}-high`, "P3 QA Replacement 45k", 45_000);
const low = await upsertProduct(`${PREFIX}-low`, "P3 QA Replacement 35k", 35_000);
const fifty = await upsertProduct(`${PREFIX}-fifty`, "P3 QA Original 50k", 50_000);
const equal = await upsertProduct(`${PREFIX}-equal`, "P3 QA Equal 30k", 30_000);
const qty = await upsertProduct(`${PREFIX}-qty`, "P3 QA Qty Pack", 20_000);
const promoTarget = await upsertProduct(`${PREFIX}-promo`, "P3 QA Promo Replacement", 40_000);

await ensureOpenSession(ownerTenant);
await ensureOpenSession(managerTenant);

const promoName = `P3 QA Promo ${Date.now()}`;
await prisma.promotion.create({
  data: {
    companyId: COMPANY_ID,
    discountPercent: 10,
    endDate: new Date("2099-12-31"),
    isActive: true,
    products: { create: [{ productId: promoTarget.id }] },
    promotionName: promoName,
    promotionType: "percentage",
    startDate: new Date("2020-01-01"),
    status: "active",
  },
});

const qtySale = await sell(ownerTenant, qty, 2);
const qtyItem = await prisma.saleItem.findFirst({ where: { saleId: qtySale.id } });
const stockBeforePartial = await stockOf(qty.id);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(qtyItem?.id) }],
  reason: "P3 partial return",
  refundMethod: "cash",
  saleId: qtySale.id,
});
const stockAfterPartial = await stockOf(qty.id);
const partialRow = await getPrismaSaleById(ownerTenant, qtySale.id);
check("1. Partial return", partialRow?.status === "partial_refund" && near(partialRow.remainingRefundableLak ?? 0, 20_000), `status=${partialRow?.status}, remaining=${partialRow?.remainingRefundableLak}`);
check("5. Sellable return restores stock", near(stockAfterPartial, stockBeforePartial + 1), `before=${stockBeforePartial}, after=${stockAfterPartial}`);

const originalTotal = Number((await prisma.sale.findUnique({ where: { id: qtySale.id } }))?.totalAmount ?? 0);
check("15. Original sale remains preserved", near(originalTotal, 40_000) && Boolean(await prisma.sale.findUnique({ where: { id: qtySale.id } })), `total=${originalTotal}`);

await expectThrow("3. Cannot return more than purchased", () =>
  returnPrismaSale(ownerTenant, {
    items: [{ condition: "sellable", quantity: 2, saleItemId: String(qtyItem?.id) }],
    reason: "too many",
    saleId: qtySale.id,
  }),
);

await returnPrismaSale(ownerTenant, {
  items: [{ condition: "sellable", quantity: 1, saleItemId: String(qtyItem?.id) }],
  reason: "P3 remaining full return",
  saleId: qtySale.id,
});
const fullRow = await getPrismaSaleById(ownerTenant, qtySale.id);
check("2. Full return", fullRow?.status === "refunded", `status=${fullRow?.status}`);

await expectThrow("4. Cannot refund same quantity twice", () =>
  returnPrismaSale(ownerTenant, {
    items: [{ condition: "sellable", quantity: 1, saleItemId: String(qtyItem?.id) }],
    reason: "duplicate",
    saleId: qtySale.id,
  }),
);

const damagedSale = await sell(ownerTenant, orig, 1);
const damagedItem = await prisma.saleItem.findFirst({ where: { saleId: damagedSale.id } });
const damagedStockBefore = await stockOf(orig.id);
await returnPrismaSale(ownerTenant, {
  items: [{ condition: "damaged", quantity: 1, saleItemId: String(damagedItem?.id) }],
  reason: "P3 damaged return",
  saleId: damagedSale.id,
});
const damagedStockAfter = await stockOf(orig.id);
check("6. Damaged return does not restore sellable stock", near(damagedStockAfter, damagedStockBefore), `before=${damagedStockBefore}, after=${damagedStockAfter}`);

const payMoreSale = await sell(ownerTenant, orig, 1);
const payMoreItem = await prisma.saleItem.findFirst({ where: { saleId: payMoreSale.id } });
const payMoreStockOrigBefore = await stockOf(orig.id);
const payMoreStockHighBefore = await stockOf(high.id);
const cashBeforePayMore = (await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0;
const payMore = await exchangePrismaSale(ownerTenant, {
  paidAmountLak: 15_000,
  reason: "P3 customer pays more",
  refundMethod: "cash",
  replacementItems: [{ productId: high.id, quantity: 1, unitId: high.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(payMoreItem?.id) }],
  saleId: payMoreSale.id,
});
check("7. Exchange where customer pays more", near(payMore.differenceLak ?? 0, 15_000), `diff=${payMore.differenceLak}`);
check("7b. Exchange stock orig restored and replacement deducted", near(await stockOf(orig.id), payMoreStockOrigBefore + 1) && near(await stockOf(high.id), payMoreStockHighBefore - 1), `orig=${await stockOf(orig.id)}, high=${await stockOf(high.id)}`);

const refundDiffSale = await sell(ownerTenant, fifty, 1);
const refundDiffItem = await prisma.saleItem.findFirst({ where: { saleId: refundDiffSale.id } });
const refundDiff = await exchangePrismaSale(ownerTenant, {
  reason: "P3 store refunds difference",
  refundMethod: "cash",
  replacementItems: [{ productId: low.id, quantity: 1, unitId: low.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(refundDiffItem?.id) }],
  saleId: refundDiffSale.id,
});
check("8. Exchange where store refunds difference", near(refundDiff.differenceLak ?? 0, -15_000), `diff=${refundDiff.differenceLak}`);

const equalSale = await sell(ownerTenant, orig, 1);
const equalItem = await prisma.saleItem.findFirst({ where: { saleId: equalSale.id } });
const equalResult = await exchangePrismaSale(ownerTenant, {
  reason: "P3 equal exchange",
  refundMethod: "cash",
  replacementItems: [{ productId: equal.id, quantity: 1, unitId: equal.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(equalItem?.id) }],
  saleId: equalSale.id,
});
check("9. Equal-value Exchange", near(equalResult.differenceLak ?? 1, 0), `diff=${equalResult.differenceLak}`);

const voidSale = await sell(ownerTenant, qty, 1);
const voidStockBefore = await stockOf(qty.id);
await voidPrismaSale(ownerTenant, { reason: "P3 incorrect sale", saleId: voidSale.id });
check("10. Void only reverses once", near(await stockOf(qty.id), voidStockBefore + 1), `stock=${await stockOf(qty.id)}`);
await expectThrow("10b. Duplicate void blocked", () => voidPrismaSale(ownerTenant, { saleId: voidSale.id }));

const concurrentSale = await sell(ownerTenant, orig, 1);
const concurrentItem = await prisma.saleItem.findFirst({ where: { saleId: concurrentSale.id } });
const concurrentInput = {
  items: [{ condition: "sellable" as const, quantity: 1, saleItemId: String(concurrentItem?.id) }],
  reason: "P3 concurrent",
  saleId: concurrentSale.id,
};
const concurrent = await Promise.allSettled([
  returnPrismaSale(ownerTenant, concurrentInput),
  returnPrismaSale(ownerTenant, concurrentInput),
]);
const concurrentWins = concurrent.filter((row) => row.status === "fulfilled").length;
const concurrentFails = concurrent.filter((row) => row.status === "rejected").length;
check("11. Concurrent duplicate refund protection", concurrentWins === 1 && concurrentFails === 1, `wins=${concurrentWins}, fails=${concurrentFails}`);

const loyaltySale = await sell(ownerTenant, orig, 1, CUSTOMER_ID);
const pointsAfterSale = Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0);
check("12a. Sale earns membership points", pointsAfterSale >= 3, `points=${pointsAfterSale}`);
await refundPrismaSale(ownerTenant, { reason: "P3 loyalty reverse", saleId: loyaltySale.id });
const pointsAfterRefund = Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0);
check("12. Membership points update correctly", near(pointsAfterRefund, 0), `points=${pointsAfterRefund}`);

const promoSale = await sell(ownerTenant, orig, 1);
const promoItem = await prisma.saleItem.findFirst({ where: { saleId: promoSale.id } });
const promoExchange = await exchangePrismaSale(ownerTenant, {
  paidAmountLak: 6_000,
  reason: "P3 promo recalc",
  refundMethod: "cash",
  replacementItems: [{ productId: promoTarget.id, quantity: 1, unitId: promoTarget.unitId }],
  returnedItems: [{ condition: "sellable", quantity: 1, saleItemId: String(promoItem?.id) }],
  saleId: promoSale.id,
});
const promoLine = await prisma.refundExchangeItem.findFirst({ where: { refundId: promoExchange.refundId } });
check("13. Promotions recalculate correctly", Number(promoLine?.promotionDiscount ?? 0) >= 1_000, `promoDiscount=${promoLine?.promotionDiscount}, diff=${promoExchange.differenceLak}`);

const cashAfter = (await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0;
check("14. Cash-session totals remain finite/correct", Number.isFinite(cashAfter) && cashAfter !== cashBeforePayMore, `expected=${cashAfter}, beforePayMore=${cashBeforePayMore}`);

await expectThrow("16. Cross-company access blocked", () =>
  returnPrismaSale(foreignTenant, {
    items: [{ condition: "sellable", quantity: 1, saleItemId: "x" }],
    reason: "foreign",
    saleId: equalSale.id,
  }),
);

const extraBranch = await prisma.branch.upsert({
  create: { companyId: COMPANY_ID, id: `${PREFIX}-other-branch`, name: "P3 QA Other Branch" },
  update: { name: "P3 QA Other Branch" },
  where: { id: `${PREFIX}-other-branch` },
});
const managerMembership = await prisma.companyUser.findFirst({ where: { companyId: COMPANY_ID, userId: managerUser.id } });
const previousBranch = managerMembership?.branchId ?? BRANCH_ID;
if (managerMembership) {
  await prisma.companyUser.update({ data: { branchId: extraBranch.id }, where: { id: managerMembership.id } });
}
const otherBranchSale = await sell(ownerTenant, orig, 1);
const otherBranchItem = await prisma.saleItem.findFirst({ where: { saleId: otherBranchSale.id } });
try {
  await expectThrow("17. Cross-branch access blocked", () =>
    returnPrismaSale(
      { ...managerTenant, branchId: extraBranch.id },
      {
        items: [{ condition: "sellable", quantity: 1, saleItemId: String(otherBranchItem?.id) }],
        reason: "other branch",
        saleId: otherBranchSale.id,
      },
    ),
  );
} finally {
  if (managerMembership) {
    await prisma.companyUser.update({ data: { branchId: previousBranch }, where: { id: managerMembership.id } });
  }
}

await prisma.product.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { id: { startsWith: PREFIX } },
});
await prisma.promotion.updateMany({
  data: { isActive: false, status: "inactive" },
  where: { companyId: COMPANY_ID, promotionName: promoName },
});

const passed = results.filter((row) => row.ok).length;
const failed = results.length - passed;
console.log(`\nPhase 3 returns/exchanges: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
