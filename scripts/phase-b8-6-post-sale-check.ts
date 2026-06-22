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
const {
  getPrismaSaleById,
  getPrismaSaleReceipt,
  listPrismaRecentSales,
  logPrismaReceiptReprint,
  refundPrismaSale,
  voidPrismaSale,
} = await import("../features/pos/post-sale-repository");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PRODUCT_ID = "b86-test-product";
const UNIT_ID = "b86-test-unit";
const CUSTOMER_ID = "b86-test-customer";
const SALE_LAK = 20_000;
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
  await prisma.product.upsert({
    create: {
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: 10_000,
      id: PRODUCT_ID,
      isActive: true,
      nameEn: "B8-6 Product",
      nameLo: "B8-6 Product",
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
      fullName: "B8-6 Customer",
      id: CUSTOMER_ID,
      phone: "020-000086",
      pointsBalance: 0,
      status: "active",
      totalSpent: 0,
    },
    update: { pointsBalance: 0, status: "active", totalSpent: 0 },
    where: { id: CUSTOMER_ID },
  });
  await prisma.companySetting.upsert({
    create: {
      companyId: COMPANY_ID,
      loyaltyEnabled: true,
      loyaltyMinRedeemPoints: 100,
      loyaltyPointValueLak: 1_000,
      loyaltySpendPerPointLak: 10_000,
    },
    update: { loyaltyEnabled: true, loyaltyMinRedeemPoints: 100, loyaltyPointValueLak: 1_000, loyaltySpendPerPointLak: 10_000 },
    where: { companyId: COMPANY_ID },
  });
}

async function completeCashSale(
  tenant: { branchId: string; companyId: string; userId: string; warehouseId: string },
  saleNo: string,
  customerId?: string,
) {
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: SALE_LAK,
      changeAmount: 0,
      customerId,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: PRODUCT_ID, quantity: 1, sellingPrice: SALE_LAK, unitId: UNIT_ID }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo,
      taxAmount: 0,
      taxRate: 0,
      totalAmount: SALE_LAK,
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
const foreignTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "not-assigned-user-b86", warehouseId: WAREHOUSE_ID };

await ensureFixtures();
await ensureOpenSession(ownerTenant);

const sale = await completeCashSale(ownerTenant, `B86-SALE-${Date.now()}`, CUSTOMER_ID);
check("A. Recent sales reads DB sale", Boolean((await listPrismaRecentSales(ownerTenant)).some((row) => row.id === sale.id)), `saleId=${sale.id}`);

const receipt = await getPrismaSaleReceipt(ownerTenant, sale.id, {
  branchName: "Main Branch",
  cashierName: "Owner",
  showTaxOnReceipt: true,
});
check("B. Receipt loads from DB", receipt.saleNo === sale.saleNo && near(receipt.totalAmount, SALE_LAK), `saleNo=${receipt.saleNo}`);

const auditBefore = await prisma.auditLog.count({ where: { companyId: COMPANY_ID, module: "pos" } });
await logPrismaReceiptReprint(ownerTenant, sale.id);
const auditAfter = await prisma.auditLog.count({ where: { companyId: COMPANY_ID, module: "pos" } });
check("C. Receipt reprint audit created", auditAfter > auditBefore, `before=${auditBefore}, after=${auditAfter}`);

const refundSale = await completeCashSale(ownerTenant, `B86-REFUND-${Date.now()}`);
const stockAfterSale = Number(
  (await prisma.inventoryBalance.findFirst({ where: { productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID } }))?.quantity ?? 0,
);
const expectedBeforeRefund = (await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0;
await refundPrismaSale(ownerTenant, { reason: "Customer return", saleId: refundSale.id });
const stockAfterRefund = Number(
  (await prisma.inventoryBalance.findFirst({ where: { productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID } }))?.quantity ?? 0,
);
check("D. Refund restores stock", near(stockAfterRefund, stockAfterSale + 1), `before=${stockAfterSale}, after=${stockAfterRefund}`);

const sessionAfterRefund = await getOpenCashSession(ownerTenant);
check(
  "E. Refund adjusts cash session",
  near((sessionAfterRefund?.expectedCashLak ?? 0), expectedBeforeRefund - SALE_LAK),
  `expected=${sessionAfterRefund?.expectedCashLak}`,
);

await prisma.loyaltyPointLedger.deleteMany({ where: { customerId: CUSTOMER_ID } });
await prisma.customer.update({ data: { pointsBalance: 0, totalSpent: 0 }, where: { id: CUSTOMER_ID } });
const loyaltySale = await completeCashSale(ownerTenant, `B86-LOYALTY-${Date.now()}`, CUSTOMER_ID);
const earnedPoints = Math.floor(SALE_LAK / 10_000);
const pointsAfterSale = Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0);
check("F. Sale earns loyalty points", near(pointsAfterSale, earnedPoints), `points=${pointsAfterSale}`);
await refundPrismaSale(ownerTenant, { reason: "Loyalty reversal", saleId: loyaltySale.id });
const pointsAfterRefund = Number((await prisma.customer.findUnique({ where: { id: CUSTOMER_ID } }))?.pointsBalance ?? 0);
check("G. Refund reverses loyalty", near(pointsAfterRefund, 0), `points=${pointsAfterRefund}`);

await expectThrow("H. Duplicate refund blocked", () => refundPrismaSale(ownerTenant, { saleId: refundSale.id }));

const voidSale = await completeCashSale(ownerTenant, `B86-VOID-${Date.now()}`);
const stockAfterSecondSale = Number(
  (await prisma.inventoryBalance.findFirst({ where: { productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID } }))?.quantity ?? 0,
);
const expectedBeforeVoid = (await getOpenCashSession(ownerTenant))?.expectedCashLak ?? 0;
await voidPrismaSale(ownerTenant, { reason: "Wrong bill", saleId: voidSale.id });
const stockAfterVoid = Number(
  (await prisma.inventoryBalance.findFirst({ where: { productId: PRODUCT_ID, warehouseId: WAREHOUSE_ID } }))?.quantity ?? 0,
);
check("I. Void restores stock", near(stockAfterVoid, stockAfterSecondSale + 1), `before=${stockAfterSecondSale}, after=${stockAfterVoid}`);

const sessionAfterVoid = await getOpenCashSession(ownerTenant);
check(
  "J. Void adjusts cash session",
  near((sessionAfterVoid?.expectedCashLak ?? 0), expectedBeforeVoid - SALE_LAK),
  `expected=${sessionAfterVoid?.expectedCashLak}`,
);

await expectThrow("K. Duplicate void blocked", () => voidPrismaSale(ownerTenant, { saleId: voidSale.id }));

await ensureOpenSession(cashierTenant);
const cashierSale = await completeCashSale(cashierTenant, `B86-CASHIER-${Date.now()}`);
await expectThrow("L. Unauthorized refund blocked", () => refundPrismaSale(cashierTenant, { saleId: cashierSale.id }));
await expectThrow("M. Unauthorized void blocked", () => voidPrismaSale(cashierTenant, { saleId: cashierSale.id }));

const foreignSale = await completeCashSale(ownerTenant, `B86-FOREIGN-${Date.now()}`);
await expectThrow("N. Cross-company refund blocked", () => refundPrismaSale(foreignTenant, { saleId: foreignSale.id }));
await expectThrow("O. Cross-company void blocked", () => voidPrismaSale(foreignTenant, { saleId: foreignSale.id }));

const refundedRow = await getPrismaSaleById(ownerTenant, refundSale.id);
const voidedRow = await getPrismaSaleById(ownerTenant, voidSale.id);
check("P. Refunded sale status persisted", refundedRow?.status === "refunded", `status=${refundedRow?.status}`);
check("Q. Voided sale status persisted", voidedRow?.status === "voided", `status=${voidedRow?.status}`);

const reportAfter = await getPrismaReportsSnapshot(ownerTenant);
check(
  "R. Reports exclude refunded/voided from completed aggregate",
  (await prisma.sale.count({ where: { companyId: COMPANY_ID, id: { in: [refundSale.id, voidSale.id] }, saleStatus: "completed" } })) === 0,
  `transactions=${reportAfter.analytics.totalTransactions}`,
);

const passed = results.filter((row) => row.ok).length;
const failed = results.length - passed;
console.log(`\nB8-6 post-sale hardening: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
