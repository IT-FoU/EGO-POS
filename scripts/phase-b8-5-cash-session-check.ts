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
const {
  closeCashSession,
  getOpenCashSession,
  openCashSession,
  recordCashSessionMovement,
} = await import("../features/cash-sessions/prisma-repository");
const { assertPermission, PermissionDeniedError, WRITE_PERMISSIONS } = await import("../lib/auth/permissions");

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
async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    check(name, true, error instanceof Error ? error.message : String(error));
  }
}

const PRODUCT_A = "b85-test-product-a";
const UNIT_A_BASE = "b85-test-unit-a-base";
const PRODUCT_B = "b85-test-product-b";
const UNIT_B_BASE = "b85-test-unit-b-base";
const CASH_SALE_LAK = 20_000;
const TRANSFER_SALE_LAK = 15_000;

async function ensureProduct(productId: string, nameEn: string, sellingPriceLak: number) {
  await prisma.product.upsert({
    create: { branchId: BRANCH_ID, companyId: COMPANY_ID, costPriceLak: sellingPriceLak / 2, id: productId, isActive: true, nameEn, nameLo: nameEn, sellingPriceLak },
    update: { isActive: true, sellingPriceLak },
    where: { id: productId },
  });
}
async function ensureUnit(id: string, productId: string, sellingPriceLak: number) {
  await prisma.productUnit.upsert({
    create: { conversionQty: 1, costPriceLak: sellingPriceLak / 2, id, isBaseUnit: true, isDefaultSaleUnit: true, productId, sellingPriceLak, status: "active", unitName: "Piece" },
    update: { isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak, status: "active" },
    where: { id },
  });
}
async function ensureStock(productId: string) {
  const existing = await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } });
  if (existing) {
    await prisma.inventoryBalance.update({ data: { quantity: 1_000_000 }, where: { id: existing.id } });
  } else {
    await prisma.inventoryBalance.create({ data: { companyId: COMPANY_ID, productId, quantity: 1_000_000, warehouseId: WAREHOUSE_ID } });
  }
}

await ensureProduct(PRODUCT_A, "B8-5 Product A", CASH_SALE_LAK);
await ensureUnit(UNIT_A_BASE, PRODUCT_A, CASH_SALE_LAK);
await ensureStock(PRODUCT_A);
await ensureProduct(PRODUCT_B, "B8-5 Product B", TRANSFER_SALE_LAK);
await ensureUnit(UNIT_B_BASE, PRODUCT_B, TRANSFER_SALE_LAK);
await ensureStock(PRODUCT_B);

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !cashierUser) {
  console.error("Missing seed data. Run: npm run db:seed:demo");
  process.exit(1);
}
const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "not-assigned-user-b85", warehouseId: WAREHOUSE_ID };

await prisma.cashSession.updateMany({
  data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
  where: {
    cashierId: { in: [ownerUser.id, cashierUser.id] },
    closedAt: null,
    companyId: COMPANY_ID,
  },
});

const openingCashLak = 100_000;
const cashInLak = 5_000;
const cashOutLak = 10_000;
const expectedAfterSales = openingCashLak + CASH_SALE_LAK;
const expectedAfterCashIn = expectedAfterSales + cashInLak;
const expectedAfterCashOut = expectedAfterCashIn - cashOutLak;

const opened = await openCashSession({ openingCashLak }, ownerTenant);
check("A. Open shift persists opening cash", near(opened.openingCashLak, openingCashLak), `opening=${opened.openingCashLak}`);
check("B. Open shift status is open", opened.status === "open", `status=${opened.status}`);

await completePrismaSale(
  {
    branchId: BRANCH_ID,
    cashAmount: CASH_SALE_LAK,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: [{ productId: PRODUCT_A, quantity: 1, sellingPrice: CASH_SALE_LAK, unitId: UNIT_A_BASE }],
    paymentMode: "cash",
    qrAmount: 0,
    saleNo: `B85-CASH-${Date.now()}`,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: CASH_SALE_LAK,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);

await completePrismaSale(
  {
    branchId: BRANCH_ID,
    cashAmount: 0,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: [{ productId: PRODUCT_B, quantity: 1, sellingPrice: TRANSFER_SALE_LAK, unitId: UNIT_B_BASE }],
    paymentMode: "transfer",
    qrAmount: 0,
    saleNo: `B85-TRF-${Date.now()}`,
    taxAmount: 0,
    taxRate: 0,
    totalAmount: TRANSFER_SALE_LAK,
    transferAmount: TRANSFER_SALE_LAK,
    warehouseId: WAREHOUSE_ID,
  },
  ownerTenant,
);

const afterSales = await getOpenCashSession(ownerTenant);

check("C. Cash sale increases session cash sales", near(afterSales?.cashSalesLak ?? 0, CASH_SALE_LAK), `cashSales=${afterSales?.cashSalesLak}`);
check(
  "D. Transfer sale tracked as non-cash",
  near(afterSales?.nonCashSalesLak ?? 0, TRANSFER_SALE_LAK),
  `nonCash=${afterSales?.nonCashSalesLak}`,
);

const afterCashIn = await recordCashSessionMovement(opened.id, "cash_in", { amountLak: cashInLak }, ownerTenant);
check("E. Cash in increases expected cash", near(afterCashIn.expectedCashLak, expectedAfterCashIn), `expected=${afterCashIn.expectedCashLak}`);

const afterCashOut = await recordCashSessionMovement(
  opened.id,
  "cash_out",
  { amountLak: cashOutLak, reason: "Petty cash" },
  ownerTenant,
);
check("F. Cash out decreases expected cash", near(afterCashOut.expectedCashLak, expectedAfterCashOut), `expected=${afterCashOut.expectedCashLak}`);

const countedCashLak = expectedAfterCashOut - 1_000;
const closed = await closeCashSession(opened.id, { countedCashLak }, ownerTenant);
check("G. Close shift stores counted cash", near(closed.countedCashLak ?? 0, countedCashLak), `counted=${closed.countedCashLak}`);
check("H. Close shift stores expected cash", near(closed.expectedCashLak, expectedAfterCashOut), `expected=${closed.expectedCashLak}`);
check("I. Variance equals counted - expected", near(closed.varianceLak ?? 0, -1_000), `variance=${closed.varianceLak}`);

await expectThrow("J. Reject closing already closed shift", () =>
  closeCashSession(opened.id, { countedCashLak: 100_000 }, ownerTenant),
);

const reopened = await openCashSession({ openingCashLak: 50_000 }, cashierTenant);
await assertPermission(cashierTenant, WRITE_PERMISSIONS.posCashSessionManage);
check("K. Cashier can manage own cash session", true);
await expectThrow("L. Unauthorized user blocked from close", () =>
  closeCashSession(reopened.id, { countedCashLak: 50_000 }, foreignTenant),
);
await closeCashSession(reopened.id, { countedCashLak: 50_000 }, cashierTenant);

const dbSession = await prisma.cashSession.findUnique({ where: { id: opened.id } });
check("J2. Closed session persisted closedAt in DB", Boolean(dbSession?.closedAt), `closedAt=${dbSession?.closedAt?.toISOString() ?? "null"}`);

const passed = results.filter((row) => row.ok).length;
const failed = results.length - passed;
console.log(`\nB8-5 cash session hardening: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
