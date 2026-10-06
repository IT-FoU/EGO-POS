/**
 * Settings finalization step 3A — split, lazy sections, prefetch, dead copy.
 * Static only: no database, network, deployment, or production access.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settingsCopyKeyParity } from "../lib/i18n/settings-copy";

const root = process.cwd();
let passed = 0;
let failed = 0;
const read = (path: string) => readFileSync(join(root, path), "utf8");
const check = (label: string, ok: boolean) => {
  if (ok) {
    passed += 1;
    console.log(`PASS: ${label}`);
  } else {
    failed += 1;
    console.error(`FAIL: ${label}`);
  }
};

const form = read("features/settings/components/settings-form.tsx");
const landing = read("features/settings/components/settings-landing.tsx");
const company = read("features/settings/components/company-settings-section.tsx");
const tax = read("features/settings/components/tax-settings-section.tsx");
const receipt = read("features/settings/components/receipt-settings-section.tsx");
const loyalty = read("features/settings/components/loyalty-settings-section.tsx");
const display = read("features/settings/components/customer-display-settings-section.tsx");
const help = read("features/settings/components/help-support-panel.tsx");
const page = read("app/(dashboard)/settings/[section]/page.tsx");
const copy = read("lib/i18n/settings-copy.ts");

const staticHeavy = [
  'from "@/features/settings/components/loyalty-rules-panel"',
  'from "@/features/pos/customer-display-settings"',
  'from "@/features/pos/customer-display-templates"',
  'from "@/features/settings/components/receipt-settings-preview"',
  'from "@/features/settings/components/qr-payment-bank-management-section"',
].filter((item) => !item.includes("loyalty-rules-panel") || !form.includes("import type"));

check("1. company section still edits the company profile", company.includes('tSettings("companyName"') && form.includes('section === "company-profile"') && form.includes("companyName: settings.companyName"));
check("2. tax section still saves VAT", tax.includes('tSettings("enableVat"') && form.includes("vatEnabled: settings.vatEnabled") && form.includes("buildTaxConfirmLines"));
check("3. receipt section still saves layout and device print mode", receipt.includes('tSettings("receiptPaperSize"') && receipt.includes("printBehaviorThisBrowser") && form.includes("writeReceiptPrintModePreference(printMode)") && form.includes("showLogoOnReceipt: settings.showLogoOnReceipt"));
check("4. QR loads only through dynamic import", form.includes('import("@/features/settings/components/qr-payment-bank-management-section")') && !form.includes('from "@/features/settings/components/qr-payment-bank-management-section"'));
check("5. Customer Display loads only through dynamic import", form.includes('import("@/features/settings/components/customer-display-settings-section")') && !form.includes('from "@/features/pos/customer-display-settings"') && display.includes("resetAllCustomerDisplaySettings()"));
check("6. Loyalty loads only through dynamic import", form.includes('import("@/features/settings/components/loyalty-settings-section")') && form.includes("import type { LoyaltyCatalogItem }") && !form.includes("LoyaltyRulesPanel") && loyalty.includes("LoyaltyRulesPanel") && loyalty.includes("loyaltyHelp"));
check("7. Help still submits tickets through the existing desk", form.includes("HelpSupportPanel") && form.includes("canSubmit={canSubmitSupport}") && help.includes("SupportDesk"));
check("8. landing no longer prefetches every route on a timer", !landing.includes("setInterval") && !landing.includes("SETTINGS_PREFETCH_ORDER") && landing.includes("onMouseEnter") && landing.includes("onFocus") && landing.includes("intentHref === row.href"));
check("9. section permission gate remains on the detail page", page.includes("requireSettingsDestination") && page.includes("settingsSectionAllows"));
check("10. EN/LO parity and deferred ticket key removed", settingsCopyKeyParity() && !copy.includes("supportTicketsDeferred"));
check("11. cash-shift false encoding and JSON reader stay", form.includes("requireCashShiftBeforeSale === false ? 0 : 1") && read("features/settings/cash-shift-policy.ts").includes("readRequireCashShiftBeforeSaleFromJson"));
check("12. dispatcher does not statically import heavy section modules", staticHeavy.every((item) => !form.includes(item)));

console.log(`\nSettings step 3A: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
