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
const { buildPosPolicyForTenant } = await import("../features/pos/pos-permission-guard");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
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
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users (igo-admin / manager / cashier). Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const managerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: managerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };

// Test product with stock and a 10,000 base price.
const PRODUCT = "b83-test-product";
const UNIT = "b83-test-unit";
await prisma.product.upsert({
  create: { branchId: BRANCH_ID, companyId: COMPANY_ID, costPriceLak: 6000, id: PRODUCT, isActive: true, nameEn: "B8-3 Product", nameLo: "B8-3 Product", sellingPriceLak: 10000 },
  update: { isActive: true },
  where: { id: PRODUCT },
});
await prisma.productUnit.upsert({
  create: { conversionQty: 1, costPriceLak: 6000, id: UNIT, isBaseUnit: true, isDefaultSaleUnit: true, productId: PRODUCT, sellingPriceLak: 10000, status: "active", unitName: "Piece" },
  update: { status: "active" },
  where: { id: UNIT },
});
const existingBalance = await prisma.inventoryBalance.findFirst({ where: { productId: PRODUCT, warehouseId: WAREHOUSE_ID } });
if (existingBalance) {
  await prisma.inventoryBalance.update({ data: { quantity: 1_000_000 }, where: { id: existingBalance.id } });
} else {
  await prisma.inventoryBalance.create({ data: { companyId: COMPANY_ID, productId: PRODUCT, quantity: 1_000_000, warehouseId: WAREHOUSE_ID } });
}

function sale(overrides: Record<string, any> = {}) {
  return {
    branchId: BRANCH_ID,
    cashAmount: 0,
    cardAmount: 0,
    changeAmount: 0,
    discountAmount: 0,
    discountPercent: 0,
    items: [{ productId: PRODUCT, quantity: 1, sellingPrice: 10000, unitId: UNIT }],
    paymentMode: "cash" as const,
    qrAmount: 0,
    saleNo: "",
    taxAmount: 0,
    taxRate: 0,
    totalAmount: 10000,
    transferAmount: 0,
    warehouseId: WAREHOUSE_ID,
    ...overrides,
  };
}

// ---- Policy resolution uses the ACTUAL DB role (not a template lookup) ----
const ownerPolicy = await buildPosPolicyForTenant(ownerTenant);
const managerPolicy = await buildPosPolicyForTenant(managerTenant);
const cashierPolicy = await buildPosPolicyForTenant(cashierTenant);
check("Owner policy resolves role=Owner", ownerPolicy.role === "Owner", `role=${ownerPolicy.role}`);
check("Manager policy resolves role=Manager", managerPolicy.role === "Manager", `role=${managerPolicy.role}`);
check("Cashier policy resolves role=Cashier", cashierPolicy.role === "Cashier", `role=${cashierPolicy.role}`);
check("Owner maxDiscount = 100", ownerPolicy.maxDiscountPercent === 100, `max=${ownerPolicy.maxDiscountPercent}`);
check("Manager maxDiscount = 10 (threshold)", managerPolicy.maxDiscountPercent === 10, `max=${managerPolicy.maxDiscountPercent}`);
check("Cashier maxDiscount = 0 (hierarchy preserved)", cashierPolicy.maxDiscountPercent === 0, `max=${cashierPolicy.maxDiscountPercent}`);

// ---- create_sale allowed for all roles (no discount) ----
const ownerSale: any = await completePrismaSale(sale({ cashAmount: 10000 }), ownerTenant);
check("Owner can create_sale", ownerSale.saleStatus === "completed");
const managerSale: any = await completePrismaSale(sale({ cashAmount: 10000 }), managerTenant);
check("Manager can create_sale", managerSale.saleStatus === "completed");
const cashierSale: any = await completePrismaSale(sale({ cashAmount: 10000 }), cashierTenant);
check("Cashier can create_sale", cashierSale.saleStatus === "completed");

// ---- apply_discount enforcement ----
// Owner: any discount allowed (50%).
const ownerDiscount: any = await completePrismaSale(sale({ cashAmount: 5000, discountAmount: 5000, totalAmount: 5000 }), ownerTenant);
check("Owner can apply large discount (50%)", Number(ownerDiscount.discountAmount) === 5000, `discount=${ownerDiscount.discountAmount}`);

// Manager: 10% discount allowed (within limit).
const managerWithinLimit: any = await completePrismaSale(sale({ cashAmount: 9000, discountAmount: 1000, totalAmount: 9000 }), managerTenant);
check("Manager can apply 10% discount (within limit)", Number(managerWithinLimit.discountAmount) === 1000, `discount=${managerWithinLimit.discountAmount}`);

// Manager: 20% discount rejected (over 10% limit, no approval token).
await expectThrow("Manager over-limit discount (20%) rejected server-side", () =>
  completePrismaSale(sale({ cashAmount: 8000, discountAmount: 2000, totalAmount: 8000 }), managerTenant));

// Cashier: ANY discount rejected (max 0%).
await expectThrow("Cashier discount rejected server-side (max 0%)", () =>
  completePrismaSale(sale({ cashAmount: 9000, discountAmount: 1000, totalAmount: 9000 }), cashierTenant));

await expectThrow("Cashier percent discount rejected server-side", () =>
  completePrismaSale(sale({ cashAmount: 9500, discountPercent: 5, totalAmount: 9500 }), cashierTenant));

// Cashier with no discount still works (sanity: enforcement only on discount).
const cashierNoDiscount: any = await completePrismaSale(sale({ cashAmount: 10000 }), cashierTenant);
check("Cashier non-discounted sale still allowed", cashierNoDiscount.saleStatus === "completed");

// ---- A user with no company membership cannot checkout ----
await expectThrow("Non-member user blocked from create_sale", () =>
  completePrismaSale(sale({ cashAmount: 10000 }), { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "no-such-user", warehouseId: WAREHOUSE_ID }));

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB8-3 POS permission: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
