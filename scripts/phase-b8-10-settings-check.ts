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
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const { prisma } = await import("../lib/db/prisma");
const { getPrismaSettings, updatePrismaSettings } = await import("../features/settings/prisma-repository");
const {
  readReceiptPrintModePreference,
} = await import("../features/settings/receipt-print-mode");
const {
  getQrPaymentSettingsSnapshot,
  saveQrPaymentAccount,
  saveQrPaymentBank,
} = await import("../features/qr-payments/prisma-repository");
const { getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");
const { getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { assertPermission, READ_PERMISSIONS, WRITE_PERMISSIONS } = await import("../lib/auth/permissions");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
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
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "not-assigned-user-b810", warehouseId: WAREHOUSE_ID };

const baseline = await getPrismaSettings(ownerTenant);
check("A. Production company settings load from DB", baseline.companyName.length > 0, `company=${baseline.companyName}`);

const printMode = baseline.receiptPrintMode === "auto_print" ? "ask_every_time" : "auto_print";
const prefix = `B810${Date.now().toString().slice(-4)}`;
await updatePrismaSettings({ companyName: baseline.companyName, receiptPrefix: prefix }, ownerTenant);
const updated = await getPrismaSettings(ownerTenant);
check(
  "B. Receipt settings persist to DB",
  updated.receiptPrefix === prefix,
  `prefix=${updated.receiptPrefix}`,
);
check(
  "B2. Receipt print mode is device-local preference",
  readFileSync("features/settings/receipt-print-mode.ts", "utf8").includes("ego-pos:receipt-print-mode") &&
    readFileSync("features/pos/components/pos-page-client.tsx", "utf8").includes("readReceiptPrintModePreference"),
  `modeFallback=${readReceiptPrintModePreference("ask_every_time")}`,
);

const bank = await saveQrPaymentBank(
  { bankName: `B810 Bank ${Date.now()}`, isActive: true, shortCode: "B810", sortOrder: 999 },
  ownerTenant,
);
const account = await saveQrPaymentAccount(
  {
    accountName: "B810 Owner",
    accountNumber: `810${Date.now().toString().slice(-6)}`,
    bankId: bank.id,
    branchId: BRANCH_ID,
    displayLabel: "B810 QR",
    isActive: true,
    printOnReceipt: true,
    qrImageUrl: "data:image/png;base64,b810",
    showOnCustomerDisplay: true,
  },
  ownerTenant,
);
const qrSnapshot = await getQrPaymentSettingsSnapshot(ownerTenant);
check(
  "C. QR bank/account settings persist to DB",
  qrSnapshot.banks.some((entry: { id: string }) => entry.id === bank.id) &&
    qrSnapshot.accounts.some((entry: { id: string }) => entry.id === account.id),
);

await expectThrow("D. Cashier blocked from owner settings permission", () =>
  assertPermission(cashierTenant, WRITE_PERMISSIONS.settingsManage),
);
await expectThrow("E. Cross-company settings access blocked", () => getPrismaSettings(foreignTenant));

const posSnapshot = await getPrismaPosSnapshot(ownerTenant);
check(
  "F. POS checkout snapshot uses DB settings",
  posSnapshot.receiptSettings.receiptPrefix === prefix,
  `prefix=${posSnapshot.receiptSettings.receiptPrefix}`,
);

const dashboard = await getPrismaDashboardSnapshot(ownerTenant, { key: "today" });
const reports = await getPrismaReportsSnapshot(ownerTenant, { datePreset: "today" });
check(
  "G. Reports/dashboard still use DB-backed services",
  Number.isFinite(dashboard.cards.salesTodayLak) && Number.isFinite(reports.analytics.totalRevenue),
);

const posClientSource = readFileSync("features/pos/components/pos-page-client.tsx", "utf8");
const settingsFormSource = readFileSync("features/settings/components/settings-form.tsx", "utf8");
const themeSource = readFileSync("components/theme-provider.tsx", "utf8");
const languageSource = readFileSync("components/layout/language-toggle.tsx", "utf8");
check(
  "H. No production settings read from demo localStorage path",
  !posClientSource.includes("demoSettingsRepository.readSettings") &&
    !settingsFormSource.includes("demoSettingsRepository.writeSettings"),
);
check(
  "I. Safe UI preferences remain local-only",
  themeSource.includes("writeStringToStorage(DemoStorageKeys.theme") &&
    languageSource.includes("writeStringToStorage(LANGUAGE_KEY"),
);

check(
  "J. No mock/demo production data leak in settings snapshots",
  !JSON.stringify({ dashboard, posSnapshot, reports }).toLowerCase().includes("mock-"),
);

const passed = results.filter((entry) => entry.ok).length;
const failed = results.length - passed;
console.log(`\nB8-10 settings/localStorage cleanup: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
await prisma.$disconnect();
process.exit(failed ? 1 : 0);
