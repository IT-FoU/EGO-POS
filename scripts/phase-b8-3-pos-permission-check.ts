import { existsSync, readFileSync } from "node:fs";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";

loadProjectEnvFiles();
const SCRIPT_DATABASE_URL = resolveScriptDatabaseUrl("test-write");

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
const { assertPermission, READ_PERMISSIONS, WRITE_PERMISSIONS } = await import("../lib/auth/permissions");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: SCRIPT_DATABASE_URL }) });

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

const { getOpenCashSession, openCashSession } = await import("../features/cash-sessions/prisma-repository");
async function ensureCashSessionFor(tenant: typeof ownerTenant) {
  if (await getOpenCashSession(tenant)) return;
  await openCashSession({ openingCashLak: 0 }, tenant);
}
for (const userId of [ownerUser.id, managerUser.id, cashierUser.id]) {
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: userId, closedAt: null, companyId: COMPANY_ID },
  });
}
await ensureCashSessionFor(ownerTenant);
await ensureCashSessionFor(managerTenant);
await ensureCashSessionFor(cashierTenant);
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

// ---- Cross-module write permission matrix (server assertPermission) ----
async function expectAllowed(name: string, tenant: typeof ownerTenant, permission: string) {
  try {
    await assertPermission(tenant, permission as any);
    check(name, true);
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
}

// Owner: all critical write/read permissions allowed
await expectAllowed("Owner: products.create", ownerTenant, WRITE_PERMISSIONS.productsCreate);
await expectAllowed("Owner: inventory.adjust", ownerTenant, WRITE_PERMISSIONS.inventoryAdjust);
await expectAllowed("Owner: purchasing.create", ownerTenant, WRITE_PERMISSIONS.purchasingCreate);
await expectAllowed("Owner: customers.create", ownerTenant, WRITE_PERMISSIONS.customersCreate);
await expectAllowed("Owner: promotions.create", ownerTenant, WRITE_PERMISSIONS.promotionsCreate);
await expectAllowed("Owner: settings.manage", ownerTenant, WRITE_PERMISSIONS.settingsManage);
await expectAllowed("Owner: staff.manage", ownerTenant, WRITE_PERMISSIONS.staffManage);
await expectAllowed("Owner: approvals.manage", ownerTenant, WRITE_PERMISSIONS.approvalsManage);
await expectAllowed("Owner: reports.view", ownerTenant, READ_PERMISSIONS.reportsView);

// Manager: operational writes allowed
await expectAllowed("Manager: products.create", managerTenant, WRITE_PERMISSIONS.productsCreate);
await expectAllowed("Manager: inventory.adjust", managerTenant, WRITE_PERMISSIONS.inventoryAdjust);
await expectAllowed("Manager: purchasing.create", managerTenant, WRITE_PERMISSIONS.purchasingCreate);
await expectAllowed("Manager: reports.view", managerTenant, READ_PERMISSIONS.reportsView);

// Cashier: POS sell allowed; back-office writes blocked
await expectAllowed("Cashier: pos.sell", cashierTenant, WRITE_PERMISSIONS.posSell);
await expectThrow("Cashier blocked: products.create", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.productsCreate));
await expectThrow("Cashier blocked: inventory.adjust", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.inventoryAdjust));
await expectThrow("Cashier blocked: purchasing.create", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.purchasingCreate));
await expectThrow("Cashier blocked: settings.manage", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.settingsManage));
await expectThrow("Cashier blocked: staff.manage", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.staffManage));
await expectThrow("Cashier blocked: reports.view", () => assertPermission(cashierTenant, READ_PERMISSIONS.reportsView));

// Cross-company: user id with no company membership receives empty permission set
await expectThrow("Cross-company user blocked from products.create", () =>
  assertPermission({ ...ownerTenant, userId: "not-assigned-user-b83" }, WRITE_PERMISSIONS.productsCreate));

// API route guards: static verification (NextAuth unavailable in tsx harness)
const writeResponseSource = readFileSync("lib/api/write-response.ts", "utf8");
const sessionSource = readFileSync("lib/auth/session.ts", "utf8");
check("runRead uses requireApiSession", writeResponseSource.includes("requireApiSession"));
check("runWrite uses requireApiSession", writeResponseSource.includes("requireApiSession"));
check("API maps PermissionDeniedError to 403", writeResponseSource.includes("PermissionDeniedError") && writeResponseSource.includes("403"));
check("API maps ApiUnauthorizedError to 401", writeResponseSource.includes("ApiUnauthorizedError") && writeResponseSource.includes("401"));
check("requireApiSession throws ApiUnauthorizedError", sessionSource.includes("throw new ApiUnauthorizedError"));

const passed = results.filter((r) => r.ok).length;
const failed = results.length - passed;
console.log(`\nB8-3 permission enforcement: ${passed}/${results.length} PASS, ${failed} FAIL`);

await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
