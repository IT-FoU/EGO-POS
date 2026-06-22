import { existsSync, readFileSync } from "node:fs";

// Force production writes BEFORE loading env files (loader only sets unset keys).
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

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const { completePrismaSale } = await import("../features/pos/prisma-repository");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const EPS = 1; // LAK rounding tolerance

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
async function balanceOf(productId: string) {
  const row = await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } });
  return row ? Number(row.quantity) : 0;
}

const user = await prisma.user.findFirst({ where: { username: "igo-admin" } });
if (!user) {
  console.error("Missing seed data. Run: npm run db:seed:demo");
  process.exit(1);
}

const tenant = {
  branchId: BRANCH_ID,
  companyId: COMPANY_ID,
  userId: user.id,
  warehouseId: WAREHOUSE_ID,
};

// Capture original company settings so the tax test can toggle VAT then restore.
const originalSettings = await prisma.companySetting.findUnique({ where: { companyId: COMPANY_ID } });

// ---- Test fixtures: dedicated products + units with known DB prices ----
const PRODUCT_A = "b81-test-product-a";
const UNIT_A_BASE = "b81-test-unit-a-base";
const UNIT_A_BOX = "b81-test-unit-a-box";
const PRODUCT_B = "b81-test-product-b";
const UNIT_B_BASE = "b81-test-unit-b-base";

async function ensureProduct(productId: string, nameEn: string) {
  await prisma.product.upsert({
    create: { branchId: BRANCH_ID, companyId: COMPANY_ID, costPriceLak: 6000, id: productId, isActive: true, nameEn, nameLo: nameEn, sellingPriceLak: 10000 },
    update: { isActive: true },
    where: { id: productId },
  });
}
async function ensureUnit(id: string, productId: string, unitName: string, conversionQty: number, sellingPriceLak: number, costPriceLak: number, isBase: boolean, isDefault: boolean) {
  await prisma.productUnit.upsert({
    create: { conversionQty, costPriceLak, id, isBaseUnit: isBase, isDefaultSaleUnit: isDefault, productId, sellingPriceLak, status: "active", unitName },
    update: { conversionQty, costPriceLak, isBaseUnit: isBase, isDefaultSaleUnit: isDefault, sellingPriceLak, status: "active" },
    where: { id },
  });
}
async function ensureStock(productId: string, quantity: number) {
  const existing = await prisma.inventoryBalance.findFirst({ where: { productId, warehouseId: WAREHOUSE_ID } });
  if (existing) {
    await prisma.inventoryBalance.update({ data: { quantity }, where: { id: existing.id } });
  } else {
    await prisma.inventoryBalance.create({ data: { companyId: COMPANY_ID, productId, quantity, warehouseId: WAREHOUSE_ID } });
  }
}

await ensureProduct(PRODUCT_A, "B8-1 Product A");
await ensureUnit(UNIT_A_BASE, PRODUCT_A, "Piece", 1, 10000, 6000, true, true);
await ensureUnit(UNIT_A_BOX, PRODUCT_A, "Box12", 12, 110000, 70000, false, false);
await ensureStock(PRODUCT_A, 1_000_000);
await ensureProduct(PRODUCT_B, "B8-1 Product B");
await ensureUnit(UNIT_B_BASE, PRODUCT_B, "Piece", 1, 5000, 3000, true, true);
await ensureStock(PRODUCT_B, 1_000_000);

function baseInput(overrides: Record<string, any> = {}) {
  return {
    branchId: BRANCH_ID,
    cashAmount: 0,
    cardAmount: 0,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: [],
    paymentMode: "cash" as const,
    qrAmount: 0,
    saleNo: "",
    taxAmount: 0,
    taxRate: 0,
    totalAmount: 0,
    transferAmount: 0,
    warehouseId: WAREHOUSE_ID,
    ...overrides,
  };
}

// 1. Normal sale — DB price authoritative even with bogus client sellingPrice.
{
  const before = await balanceOf(PRODUCT_A);
  const sale: any = await completePrismaSale(baseInput({
    cashAmount: 20000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 999999, unitId: UNIT_A_BASE }],
    totalAmount: 20000,
  }), tenant);
  check("1. Normal sale subtotal = 20,000 (DB price, ignores client price)", near(Number(sale.subtotal), 20000), `subtotal=${sale.subtotal}`);
  check("1. Normal sale total = 20,000", near(Number(sale.totalAmount), 20000), `total=${sale.totalAmount}`);
  check("1. Persisted item sellingPrice = DB 10,000 (not client 999,999)", near(Number(sale.items[0].sellingPrice), 10000), `sellingPrice=${sale.items[0].sellingPrice}`);
  check("1. Server change = 0", near(Number(sale.changeAmount), 0), `change=${sale.changeAmount}`);
  check("1. Stock deducted by 2", near(await balanceOf(PRODUCT_A), before - 2), `before=${before}, after=${await balanceOf(PRODUCT_A)}`);
}

// 2. Discounted sale.
{
  const sale: any = await completePrismaSale(baseInput({
    cashAmount: 15000,
    discountAmount: 5000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 15000,
  }), tenant);
  check("2. Discounted sale discount = 5,000", near(Number(sale.discountAmount), 5000), `discount=${sale.discountAmount}`);
  check("2. Discounted sale total = 15,000", near(Number(sale.totalAmount), 15000), `total=${sale.totalAmount}`);
}

// 3. Promotion sale (product-scoped 10% percentage promotion).
{
  const promo: any = await prisma.promotion.create({
    data: {
      companyId: COMPANY_ID,
      discountPercent: 10,
      endDate: new Date(Date.now() + 86400000),
      isActive: true,
      products: { create: [{ productId: PRODUCT_A }] },
      promotionName: "B8-1 Test 10%",
      promotionType: "percentage",
      startDate: new Date(Date.now() - 86400000),
      status: "active",
    },
  });
  try {
    const sale: any = await completePrismaSale(baseInput({
      cashAmount: 9000,
      items: [{ productId: PRODUCT_A, quantity: 1, sellingPrice: 10000, unitId: UNIT_A_BASE }],
      totalAmount: 10000, // client preview without promotion; server applies the lower price
    }), tenant);
    check("3. Promotion discount applied = 1,000", near(Number(sale.discountAmount), 1000), `discount=${sale.discountAmount}`);
    check("3. Promotion sale total = 9,000 (server authoritative)", near(Number(sale.totalAmount), 9000), `total=${sale.totalAmount}`);
    check("3. Promotion item discount recorded", near(Number(sale.items[0].promotionDiscount), 1000), `promoDiscount=${sale.items[0].promotionDiscount}`);
    const usage = await prisma.promotionUsage.count({ where: { promotionId: promo.id, saleId: sale.id } });
    check("3. PromotionUsage row created", usage === 1, `usage=${usage}`);
  } finally {
    await prisma.promotionUsage.deleteMany({ where: { promotionId: promo.id } });
    await prisma.promotionProduct.deleteMany({ where: { promotionId: promo.id } });
    await prisma.promotion.delete({ where: { id: promo.id } });
  }
}

// 4. Tax sale (temporarily enable exclusive 10% VAT, then restore).
{
  await prisma.companySetting.update({ data: { taxInclusive: false, vatEnabled: true, vatRate: 10 }, where: { companyId: COMPANY_ID } });
  try {
    const sale: any = await completePrismaSale(baseInput({
      cashAmount: 11000,
      items: [{ productId: PRODUCT_A, quantity: 1, sellingPrice: 10000, unitId: UNIT_A_BASE }],
      totalAmount: 11000,
    }), tenant);
    check("4. Tax sale tax = 1,000", near(Number(sale.taxAmount), 1000), `tax=${sale.taxAmount}`);
    check("4. Tax sale total = 11,000", near(Number(sale.totalAmount), 11000), `total=${sale.totalAmount}`);
  } finally {
    await prisma.companySetting.update({
      data: { taxInclusive: Boolean(originalSettings?.taxInclusive), vatEnabled: Boolean(originalSettings?.vatEnabled), vatRate: originalSettings ? Number(originalSettings.vatRate) : 10 },
      where: { companyId: COMPANY_ID },
    });
  }
}

// 5. Member sale (server applies membership tier discount from DB).
{
  const level = await prisma.membershipLevel.findFirst({ where: { companyId: COMPANY_ID, discountPercent: { gt: 0 }, isActive: true } });
  if (!level) {
    check("5. Member sale (membership level with discount available)", false, "no membership level with discountPercent>0");
  } else {
    const discountPercent = Number(level.discountPercent);
    await prisma.customer.upsert({
      create: { branchId: BRANCH_ID, companyId: COMPANY_ID, fullName: "B8-1 Member", id: "b81-test-member", membershipLevelId: level.id, status: "active" },
      update: { membershipLevelId: level.id, status: "active" },
      where: { id: "b81-test-member" },
    });
    const expectedUnit = Math.round(10000 * (1 - discountPercent / 100));
    const sale: any = await completePrismaSale(baseInput({
      cashAmount: expectedUnit,
      customerId: "b81-test-member",
      items: [{ productId: PRODUCT_A, quantity: 1, sellingPrice: 10000, unitId: UNIT_A_BASE }],
      totalAmount: expectedUnit,
    }), tenant);
    check(`5. Member unit price = ${expectedUnit} (${discountPercent}% off DB price)`, near(Number(sale.items[0].sellingPrice), expectedUnit), `sellingPrice=${sale.items[0].sellingPrice}`);
    check(`5. Member sale total = ${expectedUnit}`, near(Number(sale.totalAmount), expectedUnit), `total=${sale.totalAmount}`);
  }
}

// 6. Multi-item sale.
{
  const sale: any = await completePrismaSale(baseInput({
    cashAmount: 35000,
    items: [
      { productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE },
      { productId: PRODUCT_B, quantity: 3, sellingPrice: 5000, unitId: UNIT_B_BASE },
    ],
    totalAmount: 35000,
  }), tenant);
  check("6. Multi-item subtotal = 35,000", near(Number(sale.subtotal), 35000), `subtotal=${sale.subtotal}`);
  check("6. Multi-item has 2 line items", sale.items.length === 2, `items=${sale.items.length}`);
}

// 7. Unit conversion: 1 box (x12) deducts 12 base units and uses DB box price.
{
  const before = await balanceOf(PRODUCT_A);
  const sale: any = await completePrismaSale(baseInput({
    cashAmount: 110000,
    items: [{ productId: PRODUCT_A, quantity: 1, sellingPrice: 1, unitId: UNIT_A_BOX }],
    totalAmount: 110000,
  }), tenant);
  check("7. Box unit price = DB 110,000 (ignores client 1)", near(Number(sale.items[0].sellingPrice), 110000), `sellingPrice=${sale.items[0].sellingPrice}`);
  check("7. Box deducts 12 base units", near(await balanceOf(PRODUCT_A), before - 12), `before=${before}, after=${await balanceOf(PRODUCT_A)}`);
}

// 8. Change calculation: overpay cash.
{
  const sale: any = await completePrismaSale(baseInput({
    cashAmount: 25000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 20000,
  }), tenant);
  check("8. Overpay change = 5,000 (server-calculated)", near(Number(sale.changeAmount), 5000), `change=${sale.changeAmount}`);
}

// 9. No duplicate sale_no across consecutive auto-numbered sales.
{
  const s1: any = await completePrismaSale(baseInput({ cashAmount: 10000, items: [{ productId: PRODUCT_A, quantity: 1, sellingPrice: 10000, unitId: UNIT_A_BASE }], totalAmount: 10000 }), tenant);
  const s2: any = await completePrismaSale(baseInput({ cashAmount: 10000, items: [{ productId: PRODUCT_A, quantity: 1, sellingPrice: 10000, unitId: UNIT_A_BASE }], totalAmount: 10000 }), tenant);
  check("9. Consecutive sale_no are unique", s1.saleNo !== s2.saleNo, `${s1.saleNo} vs ${s2.saleNo}`);
  const dupes = await prisma.sale.groupBy({ by: ["saleNo"], having: { saleNo: { _count: { gt: 1 } } }, where: { companyId: COMPANY_ID } });
  check("9. No duplicate sale_no in company", dupes.length === 0, `dupes=${dupes.length}`);
}

// ---- Negative / manipulation cases ----

// 10. Manipulated client total below server total is rejected.
await expectThrow("10. Manipulated low client total rejected", () =>
  completePrismaSale(baseInput({
    cashAmount: 20000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 1,
  }), tenant),
);

// 11. Negative discount rejected.
await expectThrow("11. Negative discount rejected", () =>
  completePrismaSale(baseInput({
    cashAmount: 20000,
    discountAmount: -5000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 25000,
  }), tenant),
);

// 12. Insufficient payment rejected.
await expectThrow("12. Insufficient payment rejected", () =>
  completePrismaSale(baseInput({
    cashAmount: 10000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 20000,
  }), tenant),
);

// 13. Negative quantity rejected.
await expectThrow("13. Negative quantity rejected", () =>
  completePrismaSale(baseInput({
    cashAmount: 20000,
    items: [{ productId: PRODUCT_A, quantity: -2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 20000,
  }), tenant),
);

// 14. Over-100% discount percent rejected.
await expectThrow("14. Discount percent > 100 rejected", () =>
  completePrismaSale(baseInput({
    cashAmount: 20000,
    discountPercent: 150,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 0,
  }), tenant),
);

// 15. Negative payment amount rejected.
await expectThrow("15. Negative payment amount rejected", () =>
  completePrismaSale(baseInput({
    cashAmount: 30000,
    cardAmount: -10000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: UNIT_A_BASE }],
    totalAmount: 20000,
  }), tenant),
);

// 16. Unknown unitId rejected.
await expectThrow("16. Unknown unitId rejected", () =>
  completePrismaSale(baseInput({
    cashAmount: 20000,
    items: [{ productId: PRODUCT_A, quantity: 2, sellingPrice: 10000, unitId: "does-not-exist" }],
    totalAmount: 20000,
  }), tenant),
);

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB8-1 checkout: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
