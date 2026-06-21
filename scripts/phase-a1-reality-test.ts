/**
 * Phase A1 Reality Test — exercises DB-backed flows used by the UI.
 * Run: npx tsx scripts/phase-a1-reality-test.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");
process.env.IGO_DEMO_MODE = "false";

type Result = { detail: string; module: string; name: string; pass: boolean };

const results: Result[] = [];
const companyId = "gobox-company";
const branchId = "gobox-main-branch";
const warehouseId = "gobox-default-warehouse";

function record(module: string, name: string, pass: boolean, detail: string) {
  results.push({ detail, module, name, pass });
  console.log(`${pass ? "PASS" : "FAIL"} — [${module}] ${name}: ${detail}`);
}

async function main() {
  const { compare } = await import("bcryptjs");
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { assertPermission, PermissionDeniedError } = await import("../lib/auth/permissions");
  const { completePrismaSale } = await import("../features/pos/prisma-repository");
  const { createPrismaCustomer, updatePrismaCustomer, archivePrismaCustomer } = await import("../features/customers/prisma-repository");
  const {
    createPrismaProduct,
    deletePrismaProduct,
    getPrismaProducts,
    updatePrismaProduct,
    upsertPrismaCategory,
  } = await import("../features/products/prisma-repository");
  const { createPrismaPromotion, updatePrismaPromotion, archivePrismaPromotion } = await import("../features/promotions/prisma-repository");
  const { getPrismaSettings, updatePrismaSettings } = await import("../features/settings/prisma-repository");
  const { getQrPaymentSettingsSnapshot, saveQrPaymentBank } = await import("../features/qr-payments/prisma-repository");
  const { createStockIn } = await import("../features/inventory/prisma-repository");
  const { isDemoMode } = await import("../lib/demo-mode");
  type TenantContext = import("../lib/db/write-context").TenantContext;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL is required.");

  record("Login", "Environment IGO_DEMO_MODE=false", !isDemoMode(), `isDemoMode()=${isDemoMode()}`);

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });

  const users = await prisma.user.findMany({
    where: { username: { in: ["igo-admin", "manager", "cashier"] } },
    include: {
      companies: { where: { companyId, status: "active" } },
      roles: { include: { role: true }, where: { companyId } },
    },
  });

  const logins = [
    { password: "AdminChangeMe123!", username: "igo-admin" },
    { password: "Manager123!", username: "manager" },
    { password: "Cashier123!", username: "cashier" },
  ] as const;

  for (const login of logins) {
    const user = users.find((row) => row.username === login.username);
    const ok = Boolean(user && user.status === "active" && (await compare(login.password, user.passwordHash)));
    record("Login", `Credentials ${login.username}`, ok, ok ? "password verified against DB hash" : "user missing or password mismatch");
  }

  const owner = users.find((row) => row.username === "igo-admin");
  const manager = users.find((row) => row.username === "manager");
  const cashier = users.find((row) => row.username === "cashier");
  if (!owner || !manager || !cashier) throw new Error("Seed users missing.");

  const ownerTenant: TenantContext = { branchId, companyId, userId: owner.id, warehouseId };
  const managerTenant: TenantContext = { branchId, companyId, userId: manager.id, warehouseId };
  const cashierTenant: TenantContext = { branchId, companyId, userId: cashier.id, warehouseId };

  try {
    await assertPermission(cashierTenant, "settings.manage");
    record("Login", "Role restriction cashier settings.manage", false, "cashier was allowed");
  } catch (error) {
    record(
      "Login",
      "Role restriction cashier settings.manage",
      error instanceof PermissionDeniedError,
      error instanceof Error ? error.message : String(error),
    );
  }

  try {
    await assertPermission(managerTenant, "products.create");
    record("Login", "Role restriction manager products.create", true, "allowed");
  } catch (error) {
    record("Login", "Role restriction manager products.create", false, error instanceof Error ? error.message : String(error));
  }

  const testCategoryName = `A1-Cat-${Date.now()}`;
  const category = await upsertPrismaCategory({ nameLo: testCategoryName }, ownerTenant);
  record("Products", "Category save", Boolean(category.id), `categoryId=${category.id}`);

  const testSku = `A1-SKU-${Date.now()}`;
  const createdProduct = await createPrismaProduct(
    {
      barcode: testSku,
      categoryId: category.id,
      imageUrl: "https://example.com/a1-test.png",
      nameEn: "A1 Test Product",
      nameLo: "A1 Test Product LO",
      sellingPriceLak: 15000,
      sku: testSku,
    },
    ownerTenant,
  );
  record("Products", "Create", Boolean(createdProduct.id), `productId=${createdProduct.id}`);

  await createStockIn(
    { productId: createdProduct.id, quantity: 20, warehouseId },
    ownerTenant,
  );

  await updatePrismaProduct(
    createdProduct.id,
    { nameEn: "A1 Test Product Updated", sellingPriceLak: 16000 },
    ownerTenant,
  );
  const afterProductUpdate = await prisma.product.findFirst({ where: { id: createdProduct.id, companyId } });
  record(
    "Products",
    "Update persistence",
    afterProductUpdate?.nameEn === "A1 Test Product Updated" && Number(afterProductUpdate?.sellingPriceLak) === 16000,
    `name=${afterProductUpdate?.nameEn}`,
  );

  const products = await getPrismaProducts(ownerTenant);
  const found = products.some((product: { id: string }) => product.id === createdProduct.id);
  record("Products", "Search/list contains created product", found, `products=${products.length}`);

  record(
    "Products",
    "Image save",
    afterProductUpdate?.imageUrl === "https://example.com/a1-test.png",
    `imageUrl=${afterProductUpdate?.imageUrl ?? "null"}`,
  );

  const testPhone = `020${String(Date.now()).slice(-7)}`;
  const createdCustomer = await createPrismaCustomer(
    { fullName: "A1 Reality Customer", phone: testPhone },
    ownerTenant,
  );
  record("Customers", "Create", Boolean(createdCustomer.id), `customerId=${createdCustomer.id}`);

  await updatePrismaCustomer(createdCustomer.id, { fullName: "A1 Reality Customer Updated" }, ownerTenant);
  const customerAfterUpdate = await prisma.customer.findFirst({ where: { id: createdCustomer.id, companyId } });
  record(
    "Customers",
    "Update persistence",
    customerAfterUpdate?.fullName === "A1 Reality Customer Updated",
    `fullName=${customerAfterUpdate?.fullName}`,
  );

  const levels = await prisma.membershipLevel.findMany({ where: { companyId }, take: 1 });
  if (levels[0]) {
    await updatePrismaCustomer(createdCustomer.id, { membershipLevelId: levels[0].id }, ownerTenant);
  }
  const customerAfterMembership = await prisma.customer.findFirst({
    where: { id: createdCustomer.id, companyId },
  });
  record(
    "Customers",
    "Membership assignment",
    Boolean(levels[0] && customerAfterMembership?.membershipLevelId === levels[0].id),
    `membershipLevelId=${customerAfterMembership?.membershipLevelId ?? "none"}`,
  );

  const promoCode = `A1PROMO${Date.now()}`;
  const promo = await createPrismaPromotion(
    {
      applicableProductIds: [createdProduct.id],
      discountPercent: 10,
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      promotionCode: promoCode,
      promotionName: "A1 Reality Promo",
      promotionType: "percentage",
      startDate: new Date().toISOString().slice(0, 10),
      status: "active",
    },
    ownerTenant,
  );
  record("Promotions", "Create", Boolean(promo.id), `promotionId=${promo.id}`);

  await updatePrismaPromotion(promo.id, { promotionName: "A1 Reality Promo Updated" }, ownerTenant);
  const promoUpdated = await prisma.promotion.findFirst({ where: { id: promo.id } });
  record(
    "Promotions",
    "Update persistence",
    promoUpdated?.promotionName === "A1 Reality Promo Updated",
    `name=${promoUpdated?.promotionName}`,
  );

  await updatePrismaPromotion(promo.id, { isActive: true, status: "active" }, ownerTenant);
  const promoActive = await prisma.promotion.findFirst({ where: { id: promo.id } });
  record(
    "Promotions",
    "Activate",
    promoActive?.status === "active" && promoActive?.isActive === true,
    `status=${promoActive?.status}`,
  );

  await updatePrismaPromotion(promo.id, { isActive: false, status: "inactive" }, ownerTenant);
  const promoInactive = await prisma.promotion.findFirst({ where: { id: promo.id } });
  record("Promotions", "Deactivate", promoInactive?.status === "inactive", `status=${promoInactive?.status}`);

  await updatePrismaPromotion(promo.id, { isActive: true, status: "active" }, ownerTenant);

  const settingsBefore = await getPrismaSettings(ownerTenant);
  const uniqueReceiptPrefix = `A1${String(Date.now()).slice(-4)}`;
  await updatePrismaSettings(
    {
      ...settingsBefore,
      receiptFooter: "A1 Reality Footer",
      receiptHeader: "A1 Reality Header",
      receiptPrefix: uniqueReceiptPrefix,
      currencyDisplay: "LAK-A1",
      decimalPlaces: 0,
    },
    ownerTenant,
  );
  const settingsAfter = await getPrismaSettings(ownerTenant);
  record(
    "Settings",
    "Company/receipt persistence",
    settingsAfter.receiptPrefix === uniqueReceiptPrefix && settingsAfter.receiptFooter === "A1 Reality Footer",
    `prefix=${settingsAfter.receiptPrefix}`,
  );

  const company = await prisma.company.findFirst({ where: { id: companyId } });
  record(
    "Settings",
    "Localization company defaultLocale",
    company?.defaultLocale === "lo",
    `defaultLocale=${company?.defaultLocale}`,
  );

  const qrSnapshot = await getQrPaymentSettingsSnapshot(ownerTenant);
  record("Settings", "QR banks load", qrSnapshot.banks.length > 0, `banks=${qrSnapshot.banks.length}`);

  const qrBank = await saveQrPaymentBank(
    { bankName: `A1 Bank ${Date.now()}`, shortCode: "A1BK", sortOrder: 99 },
    ownerTenant,
  );
  const qrReload = await getQrPaymentSettingsSnapshot(ownerTenant);
  record(
    "Settings",
    "QR bank save persistence",
    qrReload.banks.some((bank) => bank.id === qrBank.id),
    `bankId=${qrBank.id}`,
  );

  const stockBefore = await prisma.inventoryBalance.findFirst({
    where: { companyId, productId: createdProduct.id, warehouseId },
  });

  const sale = await completePrismaSale(
    {
      branchId,
      cardAmount: 0,
      cashAmount: 14400,
      changeAmount: 0,
      customerId: createdCustomer.id,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: createdProduct.id, quantity: 1, sellingPrice: 16000 }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: `A1-${Date.now()}`,
      taxAmount: 0,
      taxRate: 0,
      totalAmount: 14400,
      warehouseId,
    },
    ownerTenant,
  );
  record("POS", "Create sale", Boolean(sale.id), `saleId=${sale.id}`);

  const stockAfter = await prisma.inventoryBalance.findFirst({
    where: { companyId, productId: createdProduct.id, warehouseId },
  });
  record(
    "POS",
    "Inventory deduction",
    Number(stockBefore?.quantity ?? 0) - Number(stockAfter?.quantity ?? 0) === 1,
    `before=${stockBefore?.quantity} after=${stockAfter?.quantity}`,
  );

  const customerAfterSale = await prisma.customer.findFirst({ where: { id: createdCustomer.id } });
  record(
    "Customers",
    "Loyalty points (via sale)",
    Number(customerAfterSale?.pointsBalance ?? 0) > 0,
    `points=${customerAfterSale?.pointsBalance ?? 0}`,
  );

  record("POS", "Customer assignment", sale.customerId === createdCustomer.id, `sale.customerId=${sale.customerId}`);

  const saleWithItems = await prisma.sale.findFirst({
    include: { items: true },
    where: { id: sale.id },
  });
  const promoApplied = (saleWithItems?.items ?? []).some((item) => Number(item.promotionDiscount) > 0);
  record(
    "POS",
    "Promotion application",
    promoApplied,
    `promotionDiscount=${saleWithItems?.items?.[0]?.promotionDiscount ?? 0}`,
  );

  record(
    "POS",
    "Receipt data available",
    Boolean(sale.saleNo && sale.totalAmount),
    `saleNo=${sale.saleNo} total=${sale.totalAmount}`,
  );

  await archivePrismaCustomer(createdCustomer.id, ownerTenant);
  const archivedCustomer = await prisma.customer.findFirst({ where: { id: createdCustomer.id } });
  record("Customers", "Delete/archive", archivedCustomer?.status === "inactive", `status=${archivedCustomer?.status}`);

  await archivePrismaPromotion(promo.id, ownerTenant);
  await deletePrismaProduct(createdProduct.id, ownerTenant);
  const deletedProduct = await prisma.product.findFirst({ where: { id: createdProduct.id } });
  record(
    "Products",
    "Delete",
    deletedProduct?.status === "deleted",
    deletedProduct ? `status=${deletedProduct.status}` : "hard deleted",
  );

  await prisma.$disconnect();

  const modules = ["Login", "Products", "Customers", "Promotions", "Settings", "POS"] as const;
  console.log("\n=== MODULE SUMMARY ===");
  for (const module of modules) {
    const moduleResults = results.filter((row) => row.module === module);
    const tested = moduleResults.filter((row) => !row.detail.startsWith("NOT TESTED"));
    const passed = tested.filter((row) => row.pass);
    const failed = tested.filter((row) => !row.pass);
    const notTested = moduleResults.filter((row) => row.detail.startsWith("NOT TESTED"));
    const status = failed.length > 0 ? "FAIL" : notTested.length === moduleResults.length ? "NOT TESTED" : passed.length === tested.length ? "PASS" : "PARTIAL";
    console.log(`${status} — ${module} (${passed.length}/${tested.length} passed, ${notTested.length} not tested)`);
  }

  const failed = results.filter((row) => !row.pass && !row.detail.startsWith("NOT TESTED"));
  console.log(`\nTotal: ${results.length}, Passed: ${results.filter((r) => r.pass).length}, Failed: ${failed.length}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
