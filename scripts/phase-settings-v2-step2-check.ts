/**
 * Settings V2 step 2 — logo, receipt, cash shift, print mode.
 * Static and in-memory. Does not touch Production or QA.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storeReplacementLogo, clearStoredLogo } from "../features/brand/company-logo-service";
import { MemoryCompanyLogoStorage } from "../lib/storage/company-logo-storage";
import { assertCompanyLogoPath, companyLogoObjectPath, isCompanyLogoObjectPath } from "../lib/storage/company-logo-ref";
import { receiptBusinessLogoSrc } from "../features/pos/receipt-branding";
import { receiptQrImageFromPayments, resolveReceiptQrImage } from "../features/pos/receipt-qr";
import { readCompanyRequireCashShift } from "../features/settings/cash-shift-policy";
import { readReceiptPrintModePreference, writeReceiptPrintModePreference } from "../features/settings/receipt-print-mode";
import { mergeUnitPricingDefaultsFromUnits, REQUIRE_CASH_SHIFT_JSON_KEY } from "../features/products/unit-pricing-defaults";

const root = process.cwd();
let failed = 0;
let passed = 0;

function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL: ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const storage = new MemoryCompanyLogoStorage();
let canonical: string | null = null;
const first = await storeReplacementLogo({
  bytes: png,
  companyId: "companyA",
  declaredMime: "image/png",
  persistPath: async (path) => {
    canonical = path;
  },
  storage,
});
const signed = await storage.signedUrl(first);
check("1. company logo persists server-side", Boolean(canonical && signed && storage.objects.has(first)));
check("2. second device receives same canonical logo", signed === (await storage.signedUrl(canonical ?? "")) && canonical?.startsWith("companies/companyA/logo/"));

let isolated = false;
try {
  assertCompanyLogoPath(companyLogoObjectPath("companyB", "file", "png"), "companyA");
} catch {
  isolated = true;
}
check("3. tenant A cannot read/write tenant B logo", isolated && isCompanyLogoObjectPath(first, "companyB") === false);

const beforeReplace = first;
const replaced = await storeReplacementLogo({
  bytes: png,
  companyId: "companyA",
  declaredMime: "image/png",
  persistPath: async (path) => {
    canonical = path;
  },
  previousPath: beforeReplace,
  storage,
});
check("4. upload replacement safe", replaced !== beforeReplace && canonical === replaced && !storage.objects.has(beforeReplace) && storage.objects.has(replaced));

await clearStoredLogo({
  clearPath: async () => {
    const previous = canonical;
    canonical = null;
    return previous;
  },
  companyId: "companyA",
  storage,
});
check("5. remove safe", canonical === null && !storage.objects.has(replaced));
check("6. no logo empty state", receiptBusinessLogoSrc(true, null) === null && receiptBusinessLogoSrc(true, "  ") === null);

const shell = read("components/layout/dashboard-shell.tsx");
check("7. sidebar does not render Business Logo", !shell.includes("LogoContainer") && !shell.includes("readCompanyLogoUrl"));
check("8. EGO POS branding remains", shell.includes("APP_NAME") && shell.includes("SLOGAN") && read("lib/constants.ts").includes('APP_NAME = "EGO POS"'));
check("9. header Company.name unchanged", shell.includes("storeName") && shell.includes("resolveActiveCompanyName"));

const pos = read("features/pos/components/pos-page-client.tsx");
const display = read("features/pos/components/customer-display-client.tsx");
check("10. Customer Display reads canonical logo", pos.includes("receiptSettings.businessLogoUrl") && display.includes("displayState.storeLogoUrl") && !display.includes("readCompanyLogoUrl"));
check("11. legacy localStorage is not canonical", !pos.includes("readCompanyLogoUrl") && !read("features/settings/components/settings-form.tsx").includes("writeCompanyLogoUrl"));

check("12. showLogoOnReceipt OFF → no logo", receiptBusinessLogoSrc(false, "https://cdn.example/logo.png") === null);
check("13. ON + logo → logo rendered", receiptBusinessLogoSrc(true, "https://cdn.example/logo.png") === "https://cdn.example/logo.png" && pos.includes("receiptBusinessLogoSrc"));
check("14. ON + no logo → safe", receiptBusinessLogoSrc(true, undefined) === null);
const receiptPreview = pos.slice(pos.indexOf("function ReceiptPreview"));
check(
  "15. receipt identity text unchanged",
  receiptPreview.includes("receiptHeader") &&
    receiptPreview.includes("profileAddress") &&
    receiptPreview.includes("profilePhone") &&
    receiptPreview.includes("profileEmail") &&
    receiptPreview.includes("taxNumber") &&
    receiptPreview.includes("branchName") &&
    receiptPreview.includes("cashierName") &&
    receiptPreview.includes("showTaxOnReceipt"),
);

const account = { id: "acc-1", printOnReceipt: true, qrImageUrl: "https://cdn.example/qr.png" };
check("16. QR print flag false → no QR", resolveReceiptQrImage({ account: { ...account, printOnReceipt: false }, referencedAccountId: "acc-1" }) === null);
check("17. QR print flag true + reliable account → QR rendered", resolveReceiptQrImage({ account, referencedAccountId: "acc-1" }) === account.qrImageUrl && pos.includes("receiptQrImageUrl"));
check(
  "18. unrelated/default account not printed incorrectly",
  resolveReceiptQrImage({ account, referencedAccountId: "acc-2" }) === null &&
    receiptQrImageFromPayments([{ paymentMethod: "qr" }], [account]) === null &&
    receiptQrImageFromPayments([{ paymentMethod: "cash", referenceNo: "qr-account:acc-1" }], [account]) === null,
);
check(
  "19. reprint consistency where supported",
  read("features/pos/post-sale-repository.ts").includes("parseQrAccountReference") &&
    read("features/pos/post-sale-repository.ts").includes("resolveReceiptQrImage") &&
    !read("features/pos/post-sale-repository.ts").includes("isDefault"),
);

check("20. legacy missing → required true", readCompanyRequireCashShift({ unitPricingDefaults: { units: {}, version: 1 } }) === true);
check("21. legacy true → true", readCompanyRequireCashShift({ unitPricingDefaults: { [REQUIRE_CASH_SHIFT_JSON_KEY]: true } }) === true);
check("22. legacy false → false", readCompanyRequireCashShift({ unitPricingDefaults: { [REQUIRE_CASH_SHIFT_JSON_KEY]: false } }) === false);
check("23. canonical field write true", readCompanyRequireCashShift({ requireCashShiftBeforeSale: true, unitPricingDefaults: { [REQUIRE_CASH_SHIFT_JSON_KEY]: false } }) === true);
check("24. canonical field write false", readCompanyRequireCashShift({ requireCashShiftBeforeSale: false, unitPricingDefaults: { [REQUIRE_CASH_SHIFT_JSON_KEY]: true } }) === false);
const saleGuard = read("features/cash-sessions/prisma-repository.ts");
const settingsRepo = read("features/settings/prisma-repository.ts");
check("25. POS guard uses canonical value", saleGuard.includes("readCompanyRequireCashShift") && read("features/pos/prisma-repository.ts").includes("readCompanyRequireCashShift"));
check("26. OFF still allows sale without Start Work", saleGuard.includes("readCompanyRequireCashShift(settings) === false") && saleGuard.includes("return null"));
check("27. ON still requires Start Work", saleGuard.includes("An open cash session is required before completing a sale."));
check("28. explicit false survives reload", readCompanyRequireCashShift({ requireCashShiftBeforeSale: false }) === false && settingsRepo.includes("requireCashShiftBeforeSale: normalized.requireCashShiftBeforeSale"));

const settingsForm = read("features/settings/components/settings-form.tsx");
check(
  "29. print mode not written to company settings",
  settingsForm.includes("const { receiptPrintMode: _devicePrintMode, ...companySettings } = settings") &&
    settingsRepo.includes("receiptPrintMode: _devicePrintMode") &&
    !read("prisma/schema.prisma").includes("receiptPrintMode"),
);

const memory = new Map<string, string>();
const localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
};
(globalThis as { window?: unknown }).window = { localStorage };
writeReceiptPrintModePreference("auto_print");
check("30. print mode persists on same device/browser", readReceiptPrintModePreference() === "auto_print");
const other = new Map<string, string>();
(globalThis as { window?: { localStorage: typeof localStorage } }).window = {
  localStorage: {
    getItem: (key: string) => other.get(key) ?? null,
    setItem: (key: string, value: string) => {
      other.set(key, value);
    },
  },
};
check("31. second device uses independent/default value", readReceiptPrintModePreference() === "ask_every_time" && memory.get("ego-pos:receipt-print-mode") === "auto_print");
writeReceiptPrintModePreference("no_auto_print");
check("32. existing Ask/Auto/Off behavior unchanged", readReceiptPrintModePreference("ask_every_time") === "no_auto_print");

const merged = mergeUnitPricingDefaultsFromUnits({ units: {}, version: 1, [REQUIRE_CASH_SHIFT_JSON_KEY]: false }, []);
check("legacy JSON key is not rewritten by unit pricing", merged[REQUIRE_CASH_SHIFT_JSON_KEY] === false);
const created = mergeUnitPricingDefaultsFromUnits({ units: {}, version: 1 }, []);
check("unit pricing does not create a cash-shift key", !(REQUIRE_CASH_SHIFT_JSON_KEY in created));

let failedUploadKeptOld = false;
const rollback = new MemoryCompanyLogoStorage();
const kept = await storeReplacementLogo({
  bytes: png,
  companyId: "companyA",
  declaredMime: "image/png",
  persistPath: async () => undefined,
  storage: rollback,
});
try {
  await storeReplacementLogo({
    bytes: png,
    companyId: "companyA",
    declaredMime: "image/png",
    persistPath: async () => {
      throw new Error("db failed");
    },
    previousPath: kept,
    storage: rollback,
  });
} catch {
  failedUploadKeptOld = rollback.objects.has(kept) && [...rollback.objects.keys()].length === 1;
}
check("failed logo save keeps the working file", failedUploadKeptOld);

console.log(`\nSettings V2 step 2: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
