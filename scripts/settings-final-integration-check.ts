import { existsSync, readFileSync } from "node:fs";

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

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes(NEW_REF) || databaseUrl.includes(OLD_REF) || databaseUrl.includes(PROD_REF)) {
  console.error("Refusing script: DATABASE_URL is not the TEST project");
  process.exit(1);
}

const { prisma } = await import("../lib/db/prisma");
const { getPrismaSettings, updatePrismaSettings } = await import("../features/settings/prisma-repository");
const { getPrismaPosSnapshot, completePrismaSale } = await import("../features/pos/prisma-repository");
const { openCashSession, getOpenCashSession } = await import("../features/cash-sessions/prisma-repository");
const { saveQrPaymentAccount, saveQrPaymentBank, archiveQrPaymentAccount } = await import("../features/qr-payments/prisma-repository");
const { assertPermission, WRITE_PERMISSIONS } = await import("../lib/auth/permissions");
const { canPerformStoreAction, STORE_ACTIONS, STORE_ROLES } = await import("../features/permissions/store-permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";
const PREFIX = "set-qa";

type Tenant = { branchId: string; companyId: string; userId: string; warehouseId: string };
type CheckRow = { detail: string; name: string; ok: boolean; missing?: boolean };

const results: CheckRow[] = [];

function check(name: string, ok: boolean, detail = "", missing = false) {
  results.push({ detail, missing, name, ok });
  console.log(`${missing ? "MISSING" : ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    check(name, true, error instanceof Error ? error.message : String(error));
  }
}

async function ensureOpenSession(tenant: Tenant) {
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: tenant.userId, closedAt: null, companyId: tenant.companyId },
  });
  if (!(await getOpenCashSession(tenant))) {
    await openCashSession({ openingCashLak: 100_000 }, tenant);
  }
}

async function sell(tenant: Tenant, productId: string, unitId: string, sellingPrice: number, extras: { taxAmount?: number; taxRate?: number; totalAmount?: number } = {}) {
  const totalAmount = extras.totalAmount ?? sellingPrice;
  return completePrismaSale(
    {
      branchId: BRANCH_ID,
      cashAmount: totalAmount,
      changeAmount: 0,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId, quantity: 1, sellingPrice, unitId }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo: `SETQA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      taxAmount: extras.taxAmount ?? 0,
      taxRate: extras.taxRate ?? 0,
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
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant: Tenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant: Tenant = { branchId: BRANCH_ID, companyId: "not-gobox-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const baseline = await getPrismaSettings(ownerTenant);
const marker = `SETQA-${Date.now()}`;

check(
  "0. Source of truth",
  existsSync("prisma/schema.prisma") &&
    readFileSync("prisma/schema.prisma", "utf8").includes("model CompanySetting") &&
    !readFileSync("features/settings/prisma-repository.ts", "utf8").includes("demoSettingsRepository"),
  "CompanySetting + Company.name; no demo settings repository",
);

try {
  await updatePrismaSettings(
    {
      companyName: baseline.companyName,
      profileAddress: `${marker} Address`,
      profileEmail: "setqa@gobox.test",
      profilePhone: "0205550111",
      receiptFooter: `${marker} Footer`,
      receiptHeader: `${marker} Header`,
      receiptPrefix: "SETQA",
      taxNumber: "TAX-SETQA",
    },
    ownerTenant,
  );
  const profile = await getPrismaSettings(ownerTenant);
  check(
    "1. Store profile persistence",
    profile.companyName === baseline.companyName &&
      profile.profileAddress === `${marker} Address` &&
      profile.profilePhone === "0205550111" &&
      profile.profileEmail === "setqa@gobox.test" &&
      profile.taxNumber === "TAX-SETQA",
    `name=${profile.companyName}`,
  );
  check(
    "2. Receipt setting persistence",
    profile.receiptHeader === `${marker} Header` &&
      profile.receiptFooter === `${marker} Footer` &&
      profile.receiptPrefix === "SETQA",
  );

  const posAfterProfile = await getPrismaPosSnapshot(ownerTenant);
  check(
    "2b. Receipt identity reaches POS snapshot",
    posAfterProfile.receiptSettings.receiptHeader === `${marker} Header` &&
      posAfterProfile.receiptSettings.profilePhone === "0205550111" &&
      posAfterProfile.receiptSettings.taxNumber === "TAX-SETQA" &&
      posAfterProfile.receiptSettings.receiptPrefix === "SETQA",
  );

  const printModeSource = readFileSync("features/settings/components/settings-form.tsx", "utf8");
  check(
    "2c. Receipt print mode is device-local and Save writes the selected value",
    printModeSource.includes("writeReceiptPrintModePreference(printMode)") &&
      printModeSource.includes("const printMode = settings.receiptPrintMode") &&
      readFileSync("features/settings/receipt-print-mode.ts", "utf8").includes("ego-pos:receipt-print-mode") &&
      !readFileSync("prisma/schema.prisma", "utf8").includes("receiptPrintMode"),
  );

  const bank = await saveQrPaymentBank(
    { bankName: `${PREFIX}-bank-${Date.now()}`, isActive: true, shortCode: "SETQA", sortOrder: 980 },
    ownerTenant,
  );
  const account = await saveQrPaymentAccount(
    {
      accountName: "SET QA QR",
      accountNumber: `QA${Date.now().toString().slice(-8)}`,
      bankId: bank.id,
      branchId: BRANCH_ID,
      displayLabel: "SET QA QR",
      isActive: true,
      printOnReceipt: true,
      qrImageUrl: "data:image/png;base64,setqa",
      showOnCustomerDisplay: true,
    },
    ownerTenant,
  );
  const posWithQr = await getPrismaPosSnapshot(ownerTenant);
  check(
    "3. Payment enable → POS",
    posWithQr.qrBanks.some((entry: { accountNumber: string }) => entry.accountNumber === account.accountNumber),
    `qrCount=${posWithQr.qrBanks.length}`,
  );
  await archiveQrPaymentAccount(account.id, ownerTenant);
  const posWithoutQr = await getPrismaPosSnapshot(ownerTenant);
  check(
    "3b. Payment disable → POS hides QR account",
    !posWithoutQr.qrBanks.some((entry: { accountNumber: string }) => entry.accountNumber === account.accountNumber),
  );
  const posClient = readFileSync("features/pos/components/pos-page-client.tsx", "utf8");
  check(
    "3c. Cash/card/transfer remain hardcoded POS methods",
    posClient.includes('"cash"') && posClient.includes('"card"') && posClient.includes('"transfer"') && posClient.includes('"qr"'),
    "No company-level disable toggles for cash/card/transfer",
  );

  const cashSource = readFileSync("features/pos/prisma-repository.ts", "utf8");
  check(
    "4. Cash-session setting",
    cashSource.includes("assertOpenCashSessionForSale") &&
      !readFileSync("features/settings/types.ts", "utf8").includes("requireCashSession"),
    "Always required before checkout; no Settings toggle",
  );
  await prisma.cashSession.updateMany({
    data: { cashDifference: 0, closedAt: new Date(), closingCash: 0, expectedCash: 0 },
    where: { cashierId: ownerUser.id, closedAt: null, companyId: COMPANY_ID },
  });
  await prisma.product.upsert({
    create: {
      barcode: `${PREFIX}-bc`,
      branchId: BRANCH_ID,
      companyId: COMPANY_ID,
      costPriceLak: 5_000,
      id: `${PREFIX}-item`,
      isActive: true,
      nameEn: "SET QA Item",
      nameLo: "SET QA Item",
      productCode: `${PREFIX}-code`,
      sellingPriceLak: 10_000,
      sku: `${PREFIX}-sku`,
      status: "active",
    },
    update: { isActive: true, sellingPriceLak: 10_000, status: "active" },
    where: { id: `${PREFIX}-item` },
  });
  await prisma.productUnit.upsert({
    create: {
      conversionQty: 1,
      costPriceLak: 5_000,
      id: `${PREFIX}-piece`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      isPurchaseUnit: true,
      productId: `${PREFIX}-item`,
      sellingPriceLak: 10_000,
      status: "active",
      unitName: "Piece",
    },
    update: { conversionQty: 1, sellingPriceLak: 10_000, status: "active" },
    where: { id: `${PREFIX}-piece` },
  });
  await prisma.inventoryBalance.upsert({
    create: { companyId: COMPANY_ID, productId: `${PREFIX}-item`, quantity: 1_000, warehouseId: WAREHOUSE_ID },
    update: { quantity: 1_000 },
    where: { warehouseId_productId: { productId: `${PREFIX}-item`, warehouseId: WAREHOUSE_ID } },
  });
  await expectThrow("4b. Checkout blocked without open cash session", () =>
    sell(ownerTenant, `${PREFIX}-item`, `${PREFIX}-piece`, 10_000),
  );
  await ensureOpenSession(ownerTenant);

  const currencyAfter = await getPrismaSettings(ownerTenant);
  check(
    "5. Currency/exchange-rate persistence",
    currencyAfter.baseCurrency === "LAK" &&
      readFileSync("features/reports/currency-rates.ts", "utf8").includes("currencyRates") &&
      !readFileSync("features/pos/format.ts", "utf8").includes("decimalPlaces"),
    "LAK is base; report FX table is static; POS format does not consume decimalPlaces",
  );

  await updatePrismaSettings({ vatEnabled: true, vatRate: 10, taxInclusive: false, showTaxOnReceipt: true }, ownerTenant);
  const posTax = await getPrismaPosSnapshot(ownerTenant);
  check("6. Tax setting → POS snapshot", posTax.taxRatePercent === 10 && posTax.taxInclusive === false, `rate=${posTax.taxRatePercent}`);
  const taxedSale = await sell(ownerTenant, `${PREFIX}-item`, `${PREFIX}-piece`, 10_000, {
    taxAmount: 1_000,
    taxRate: 10,
    totalAmount: 11_000,
  });
  const taxedRow = await prisma.sale.findUniqueOrThrow({ where: { id: taxedSale.id } });
  check("6b. Tax applied at sale time", amount(taxedRow.taxAmount) === 1_000 && amount(taxedRow.taxRate) === 10, `tax=${taxedRow.taxAmount}`);

  const localeSource = readFileSync("lib/i18n/locale.ts", "utf8");
  const themeSource = readFileSync("components/theme-provider.tsx", "utf8");
  const companyLocale = await prisma.company.findUniqueOrThrow({ where: { id: COMPANY_ID } });
  await updatePrismaSettings({ receiptFooter: `${marker} Footer 2` }, ownerTenant);
  const companyLocaleAfter = await prisma.company.findUniqueOrThrow({ where: { id: COMPANY_ID } });
  check(
    "7. Language persistence",
    localeSource.includes("ego-pos-locale") &&
      companyLocale.defaultLocale === companyLocaleAfter.defaultLocale &&
      !readFileSync("features/settings/types.ts", "utf8").includes("defaultLocale"),
    `companyDefaultLocale=${companyLocale.defaultLocale} (user/device preference, not CompanySetting)`,
  );
  check(
    "7b. Appearance is device-local",
    themeSource.includes("DemoStorageKeys.theme") && !readFileSync("prisma/schema.prisma", "utf8").includes("theme"),
  );

  const warehouse = await prisma.warehouse.findUnique({ where: { id: WAREHOUSE_ID } });
  const posWarehouse = await getPrismaPosSnapshot(ownerTenant);
  check(
    "8. Inventory/default warehouse references",
    warehouse?.id === WAREHOUSE_ID &&
      warehouse.companyId === COMPANY_ID &&
      posWarehouse.warehouseId === WAREHOUSE_ID &&
      !readFileSync("features/settings/types.ts", "utf8").includes("defaultWarehouse"),
    `warehouseId=${posWarehouse.warehouseId}`,
  );

  const ownerWrite = await updatePrismaSettings({ receiptHeader: `${marker} Owner` }, ownerTenant);
  check("9. Owner write permission", ownerWrite.receiptHeader === `${marker} Owner`);
  await expectThrow("10. Cashier write blocked", () => assertPermission(cashierTenant, WRITE_PERMISSIONS.settingsManage));
  check(
    "10b. Cashier matrix denies staff/settings manage",
    !canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.STAFF_MANAGE) &&
      canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.STAFF_MANAGE),
  );
  await expectThrow("11. Cross-company blocked", () => updatePrismaSettings({ companyName: "Hacked" }, foreignTenant));

  const extraBranch = await prisma.branch.upsert({
    create: { companyId: COMPANY_ID, id: `${PREFIX}-other-branch`, name: "SET QA Other Branch" },
    update: { name: "SET QA Other Branch" },
    where: { id: `${PREFIX}-other-branch` },
  });
  const managerMembership = await prisma.companyUser.findFirst({ where: { companyId: COMPANY_ID, userId: managerUser.id } });
  const previousBranch = managerMembership?.branchId ?? BRANCH_ID;
  if (managerMembership) {
    await prisma.companyUser.update({ data: { branchId: extraBranch.id }, where: { id: managerMembership.id } });
  }
  try {
    await expectThrow("12. Cross-branch QR account write blocked", () =>
      saveQrPaymentAccount(
        {
          accountName: "Other Branch Hijack",
          accountNumber: `XB${Date.now().toString().slice(-8)}`,
          bankId: bank.id,
          branchId: BRANCH_ID,
          displayLabel: "Hijack",
          isActive: false,
        },
        { branchId: extraBranch.id, companyId: COMPANY_ID, userId: managerUser.id },
      ),
    );
  } finally {
    if (managerMembership) {
      await prisma.companyUser.update({ data: { branchId: previousBranch }, where: { id: managerMembership.id } });
    }
  }

  await expectThrow("13. Invalid setting rejected", () => updatePrismaSettings({ vatRate: 150 }, ownerTenant));
  await expectThrow("13b. Empty company name rejected", () => updatePrismaSettings({ companyName: "" }, ownerTenant));

  const beforeCount = await prisma.companySetting.count({ where: { companyId: COMPANY_ID } });
  await Promise.all([
    updatePrismaSettings({ receiptFooter: `${marker} A` }, ownerTenant),
    updatePrismaSettings({ receiptFooter: `${marker} B` }, ownerTenant),
  ]);
  const afterCount = await prisma.companySetting.count({ where: { companyId: COMPANY_ID } });
  check("14. No duplicate settings records", beforeCount === 1 && afterCount === 1, `count=${afterCount}`);

  await updatePrismaSettings({ vatEnabled: false, vatRate: 0 }, ownerTenant);
  const historical = await prisma.sale.findUniqueOrThrow({ where: { id: taxedSale.id } });
  check(
    "15. Historical sale values unchanged after settings change",
    amount(historical.taxAmount) === 1_000 && amount(historical.totalAmount) === amount(taxedRow.totalAmount),
    `tax=${historical.taxAmount} total=${historical.totalAmount}`,
  );

  const loyaltyAfterPartial = await getPrismaSettings(ownerTenant);
  check(
    "15b. Partial update does not wipe unrelated flags",
    loyaltyAfterPartial.loyaltyEnabled === baseline.loyaltyEnabled &&
      loyaltyAfterPartial.baseCurrency === baseline.baseCurrency,
    `loyaltyEnabled=${loyaltyAfterPartial.loyaltyEnabled}`,
  );
} finally {
  await updatePrismaSettings(baseline, ownerTenant).catch((error) => {
    console.error("Failed to restore baseline settings", error);
  });
  await prisma.product.updateMany({
    data: { isActive: false, status: "inactive" },
    where: { id: { startsWith: PREFIX } },
  });
}

const missing = results.filter((row) => row.missing);
const failed = results.filter((row) => !row.ok && !row.missing);
const passed = results.filter((row) => row.ok).length;
console.log(`\nSettings final integration: ${passed}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}${missing.length ? ` (${missing.length} MISSING)` : ""}`);
for (const row of missing) {
  console.log(`MISSING REQUIRED LINK  ${row.name} — ${row.detail}`);
}
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
