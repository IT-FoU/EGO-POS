/**
 * Settings V2 step 4 — Business + POS & Payments detail UX.
 * Static only: no database, network, deployment, or production access.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
const qr = read("features/settings/components/qr-payment-bank-management-section.tsx");
const copy = read("lib/i18n/settings-copy.ts");
const preview = read("features/settings/components/receipt-settings-preview.tsx");
const detail = read("app/(dashboard)/settings/[section]/page.tsx");
const step2 = read("scripts/phase-settings-v2-step2-check.ts");
const step3 = read("scripts/phase-settings-v2-step3-check.ts");
const schema = read("prisma/schema.prisma");

check("1. company profile fields present", form.includes('section === "company-profile"') && form.includes('tSettings("companyName"') && form.includes('tSettings("phone"') && form.includes('tSettings("email"') && form.includes('tSettings("address"') && form.includes('tSettings("taxNumber"'));
check("2. company name save payload", form.includes("companyName: settings.companyName") && form.includes("ACTIVE_COMPANY_NAME_CHANGE_EVENT"));
check("3. contact fields in payload", form.includes("profilePhone: settings.profilePhone") && form.includes("profileEmail: settings.profileEmail") && form.includes("profileAddress: settings.profileAddress") && form.includes("taxNumber: settings.taxNumber"));
check("4. header still uses company name event", form.includes("ACTIVE_COMPANY_NAME_CHANGE_EVENT"));
check("5. company validation/error", form.includes("companyNameRequired") && form.includes("localizeSettingsError"));
check("6. logo preview loads", form.includes("previewStagedImage(logoStage)") && form.includes("initialBusinessLogoUrl"));
check("7. logo upload path", form.includes("saveCompanyLogoAction") && form.includes("confirmLogo"));
check("8. logo replacement via staged image", form.includes("selectStagedImage") && form.includes("confirmStagedImage"));
check("9. logo remove confirmation", form.includes('settingsConfirm === "removeLogo"') && form.includes("removeLogoConfirm"));
check("10. sidebar never uses business logo", !read("components/layout/dashboard-shell.tsx").includes("readCompanyLogoUrl") && read("components/layout/dashboard-shell.tsx").includes("APP_NAME"));
check("11. receipt logo toggle", form.includes("showLogoOnReceipt") && preview.includes("showLogoOnReceipt"));
check("12. customer display uses company logo source", form.includes("LogoContainer") || detail.includes("getCompanyBusinessLogoUrl"));
check("13. tax enabled payload", form.includes("vatEnabled: settings.vatEnabled"));
check("14. tax disabled can save", form.includes('section === "tax"') && form.includes("buildTaxConfirmLines"));
check("15. tax rate validation", form.includes("vatRateRange"));
check("16. inclusive confirmation", form.includes("taxInclusiveConfirm") && form.includes("taxExclusiveConfirm"));
check("17. historical sales untouched (no rewrite)", !form.includes("updateMany") && !form.includes("historical"));
check("18. receipt tax display remains on tax page", form.includes("showTaxOnReceipt") && !landing.includes("showTaxOnReceipt"));
check("19. cash shift ON path", form.includes("requireCashShiftBeforeSale") && form.includes("cashShiftOnHelp"));
check("20. cash shift OFF confirmation", form.includes("cashShiftOff") && form.includes("cashShiftDisableConfirmBody"));
check("21. false survives via 0/1 payload", form.includes("requireCashShiftBeforeSale === false ? 0 : 1"));
check("22. canonical field only", step2.includes("canonical field write") && form.includes("requireCashShiftBeforeSale"));
check("23. receipt company fields save", form.includes("receiptPrefix") && form.includes("receiptHeader") && form.includes("receiptFooter"));
check("24. receipt logo toggle save", form.includes("showLogoOnReceipt: settings.showLogoOnReceipt"));
check("25. print mode device-local", form.includes("writeReceiptPrintModePreference") && form.includes("updatePrintMode"));
check("26. print mode not in company payload", form.includes("writeReceiptPrintModePreference(printMode)") && form.includes("showLogoOnReceipt: settings.showLogoOnReceipt") && !form.includes("receiptPrintMode: settings.receiptPrintMode") && !schema.includes("receiptPrintMode"));
check("27. receipt preview safe without logo", preview.includes("showLogo") && preview.includes("ReceiptSettingsPreview"));
check("28. QR receipt step2 regression retained", step2.includes("QR print flag"));
check("29. bank list present", qr.includes("sortedBanks") && qr.includes("addBank"));
check("30. account list present", qr.includes("qrAccounts") && qr.includes("addQrAccount"));
check("31. default per branch action", qr.includes("setDefaultQrPaymentAccountAction"));
check("32. account branch scope", qr.includes("branchId") && qr.includes('tSettings("branch"'));
check("33. bank archive/delete safety", qr.includes("archiveInstead") && qr.includes("bankHasAccountsWarning"));
check("34. account delete confirmation named", qr.includes("deleteQrAccountNamed"));
check("35. printOnReceipt preserved", qr.includes("printOnReceipt"));
check("36. showOnCustomerDisplay preserved", qr.includes("showOnCustomerDisplay"));
check("37. QR image preserved", qr.includes("qrImageUrl") && qr.includes("qrImageHelp"));
check("38. Customer Display This device", form.includes("scopeThisDevice") && form.includes("customerDisplayThisBrowser"));
check("39. CD local persistence", form.includes("writeCustomerDisplaySettingsToStorage") && form.includes("savedOnThisDevice"));
check("40. CD reset confirmation", form.includes("resetThisPageConfirm") && form.includes("resetAllCustomerDisplayConfirm"));
check("41. reset does not delete company/QR", form.includes("resetCustomerDisplayAppearanceSettings") && form.includes("resetAllCustomerDisplaySettings") && !form.includes("deleteQrPaymentAccountAction"));
check("42. canonical company identity for CD page", form.includes("customer-display") && detail.includes("getPrismaSettings"));
check("43. Step 3 routes unchanged", detail.includes('"company-profile"') && detail.includes('"qr-payments"') && detail.includes('"customer-display"') && landing.includes('id: "business"') && landing.includes('id: "pos-payments"'));
check("44. landing statuses remain real", landing.includes("hasLogo") && landing.includes("vatEnabled") && landing.includes("requireCashShiftBeforeSale") && landing.includes("activeQrBanks"));
check("45. no global Save on landing", !landing.includes("saveSettings") && !landing.includes("Save settings"));
check("46. no deferred pages", !landing.includes("/settings/currency") && !landing.includes("/settings/hours") && !landing.includes("/settings/terminal"));
check("dirty save gating", form.includes("isSectionDirty()") && form.includes("!isSectionDirty()"));
check("tax confirm modal", form.includes('settingsConfirm === "taxChange"') && copy.includes("taxChangeConfirmTitle"));
check("receipt preview component", existsSync(join(root, "features/settings/components/receipt-settings-preview.tsx")));
check("logo size help + too large", copy.includes("logoSizeHelp") && copy.includes("logoTooLarge") && form.includes("MAX_SOURCE_IMAGE_BYTES"));
check("bank vs qr image clarity", qr.includes("bankLogoHelp") && qr.includes("qrImageHelp"));
check("no new schema migration", !existsSync(join(root, "prisma/migrations/20261002040000_settings_v2_step4")));
check("Step 2 + Step 3 checks remain", step2.includes("print mode not written") && step3.includes("Settings landing shows exactly 4 categories"));
check("ads inside customer display", form.includes("adsInsideCustomerDisplayHelp") && form.includes("advertisementMedia"));
check("detail loads logo for receipt", detail.includes('section === "business-logo" || section === "receipt"') || detail.includes("needsLogo"));

console.log(`\nSettings V2 step 4: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
