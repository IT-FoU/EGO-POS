import fs from "node:fs";
import path from "node:path";

import {
  PROMOTIONS_COPY,
  localizePromotionError,
  promotionsCopyHasNoReplacementChars,
  promotionsCopyKeyParity,
  promotionStatusLabel,
  promotionTypeLabel,
  tPromotions,
} from "../lib/i18n/promotions-copy";
import {
  REPORTS_COPY,
  datePresetLabel,
  localizeReportLabel,
  reportsCopyHasNoReplacementChars,
  reportsCopyKeyParity,
  tReports,
} from "../lib/i18n/reports-copy";
import {
  SETTINGS_COPY,
  localizeSettingsError,
  receiptPrintModeLabel,
  settingsCopyHasNoReplacementChars,
  settingsCopyKeyParity,
  tSettings,
} from "../lib/i18n/settings-copy";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

const promotionsCopy = read("lib/i18n/promotions-copy.ts");
const reportsCopy = read("lib/i18n/reports-copy.ts");
const settingsCopy = read("lib/i18n/settings-copy.ts");
const promotionsList = read("features/promotions/components/promotions-list-client.tsx");
const promotionsForm = read("features/promotions/components/promotion-form.tsx");
const promotionsDetail = read("features/promotions/components/promotion-detail-client.tsx");
const promotionsBadge = read("features/promotions/components/promotion-status-badge.tsx");
const promotionsPage = read("app/(dashboard)/promotions/page.tsx");
const promotionsLoading = read("app/(dashboard)/promotions/loading.tsx");
const promotionsActions = read("features/promotions/actions.ts");
const promotionsRepo = read("features/promotions/prisma-repository.ts");
const promotionsCheckout = read("features/promotions/promotion-checkout.ts");
const reportsClient = read("features/reports/components/reports-analytics-client.tsx");
const reportsPage = read("app/(dashboard)/reports/page.tsx");
const reportsLoading = read("app/(dashboard)/reports/loading.tsx");
const reportsSales = read("app/(dashboard)/reports/sales/page.tsx") + read("features/reports/components/sales-report-view.tsx");
const reportsInventory = read("app/(dashboard)/reports/inventory/page.tsx") + read("features/reports/components/inventory-report-view.tsx");
const reportsPurchasing = read("app/(dashboard)/reports/purchasing/page.tsx");
const reportsCustomers = read("app/(dashboard)/reports/customers/page.tsx");
const reportsService = read("features/reports/report-service.ts");
const reportsHub = read("features/reports/build-analytics-hub.ts");
const reportsCatalog = read("features/reports/report-catalog.ts");
const settingsForm = read("features/settings/components/settings-form.tsx");
const settingsStaff = read("features/settings/components/staff-control-section.tsx");
const settingsPage = read("app/(dashboard)/settings/page.tsx");
const settingsLoading = read("app/(dashboard)/settings/loading.tsx");
const settingsActions = read("features/settings/actions.ts");
const settingsRepo = read("features/settings/prisma-repository.ts");
const storeActivity = read("features/store-activity/components/store-activity-logs-client.tsx");
const displaySettings = read("features/pos/customer-display-settings.ts");
const displayClient = read("features/pos/components/customer-display-client.tsx");
const shell = read("components/layout/dashboard-shell.tsx");

const pen = PROMOTIONS_COPY.en;
const plo = PROMOTIONS_COPY.lo;
const ren = REPORTS_COPY.en;
const rlo = REPORTS_COPY.lo;
const sen = SETTINGS_COPY.en;
const slo = SETTINGS_COPY.lo;
const laoPromotions = String.fromCharCode(0x0ec2, 0x0e9b, 0x0ea3, 0x0ec2, 0x0ea1, 0x0e8a, 0x0eb1, 0x0e99);
const laoReports = String.fromCharCode(0x0ea5, 0x0eb2, 0x0e8d, 0x0e87, 0x0eb2, 0x0e99);
const laoSettings = String.fromCharCode(0x0e95, 0x0eb1, 0x0ec9, 0x0e87, 0x0e84, 0x0ec8, 0x0eb2);

check(
  "1. Promotions Lao copy",
  promotionsCopy.includes("export const PROMOTIONS_COPY") &&
    Boolean(pen.promotions && plo.promotions) &&
    Boolean(pen.createPromotion && plo.createPromotion) &&
    Boolean(pen.searchPlaceholder && plo.searchPlaceholder) &&
    Boolean(pen.noPromotionsMatch && plo.noPromotionsMatch) &&
    promotionsList.includes('from "@/lib/i18n/promotions-copy"') &&
    promotionsForm.includes('from "@/lib/i18n/promotions-copy"') &&
    promotionsLoading.includes("copy.loadingPromotions"),
);

check(
  "2. Reports Lao copy",
  reportsCopy.includes("export const REPORTS_COPY") &&
    Boolean(ren.reports && rlo.reports) &&
    Boolean(ren.salesReport && rlo.salesReport) &&
    Boolean(ren.today && rlo.today) &&
    reportsClient.includes('from "@/lib/i18n/reports-copy"') &&
    reportsLoading.includes("copy.loadingReports") &&
    reportsSales.includes("tReports") &&
    reportsInventory.includes("tReports") &&
    reportsPurchasing.includes("tReports") &&
    reportsCustomers.includes("tReports"),
);

check(
  "3. Settings Lao copy",
  settingsCopy.includes("export const SETTINGS_COPY") &&
    Boolean(sen.settings && slo.settings) &&
    Boolean(sen.resetThisPage && slo.resetThisPage) &&
    Boolean(sen.customerDisplay && slo.customerDisplay) &&
    settingsForm.includes('from "@/lib/i18n/settings-copy"') &&
    settingsStaff.includes('from "@/lib/i18n/settings-copy"') &&
    settingsLoading.includes("copy.loadingSettings"),
);

check("4. EN/LO key parity", promotionsCopyKeyParity() && reportsCopyKeyParity() && settingsCopyKeyParity());
check(
  "5. No replacement characters",
  promotionsCopyHasNoReplacementChars() && reportsCopyHasNoReplacementChars() && settingsCopyHasNoReplacementChars(),
);

check(
  "6. No live Thai Promotions runtime",
  !promotionsCopy.includes('"th"') &&
    !promotionsList.includes('"en" | "th"') &&
    !promotionsForm.includes('"en" | "th"') &&
    !promotionsList.includes('from "@/lib/i18n/ui"') &&
    !promotionsForm.includes('from "@/lib/i18n/ui"') &&
    !Object.values(plo).some((value) => /[\u0E00-\u0E7F]/.test(value)),
);

check(
  "7. No live Thai Reports runtime",
  !reportsCopy.includes('"th"') &&
    !reportsClient.includes('"en" | "th"') &&
    !reportsClient.includes("locale === \"th\"") &&
    !reportsClient.includes("reportCopy") &&
    !reportsClient.includes('from "@/lib/i18n/ui"') &&
    !Object.values(rlo).some((value) => /[\u0E00-\u0E7F]/.test(value)),
);

check(
  "8. No live Thai Settings runtime",
  !settingsCopy.includes('"th"') &&
    !settingsForm.includes('"en" | "th"') &&
    !settingsStaff.includes('"en" | "th"') &&
    !storeActivity.includes('"en" | "th"') &&
    !storeActivity.includes("locale === \"th\"") &&
    !Object.values(slo).some((value) => /[\u0E00-\u0E7F]/.test(value)),
);

check(
  "9. Sidebar Promotions LO",
  shell.includes('tPromotions("promotions", "en")') &&
    shell.includes('tPromotions("promotions", "lo")') &&
    pen.promotions === "Promotions" &&
    plo.promotions === laoPromotions,
);

check(
  "10. Sidebar Reports LO",
  shell.includes('tReports("reports", "en")') &&
    shell.includes('tReports("reports", "lo")') &&
    ren.reports === "Reports" &&
    rlo.reports === laoReports,
);

check(
  "11. Sidebar Settings LO",
  shell.includes('tSettings("settings", "en")') &&
    shell.includes('tSettings("settings", "lo")') &&
    sen.settings === "Settings" &&
    slo.settings === laoSettings,
);

check(
  "12. Promotions form/status validation copy",
  promotionsForm.includes('t("createPromotion")') &&
    promotionsForm.includes('t("promotionName")') &&
    promotionsForm.includes("localizePromotionError") &&
    promotionStatusLabel("active", "lo") === plo.active &&
    promotionStatusLabel("expired", "en") === "Expired" &&
    promotionTypeLabel("percentage", "en") === "Percentage Discount" &&
    localizePromotionError("Missing promotion name.", "lo") === plo.missingName &&
    promotionsBadge.includes("promotionStatusLabel"),
);

check(
  "13. Reports filters/tables copy",
  datePresetLabel("today", "lo") === rlo.today &&
    datePresetLabel("this_month", "en") === "This Month" &&
    localizeReportLabel("Total Revenue", "lo") === rlo.totalRevenue &&
    reportsClient.includes("datePresetLabel") &&
    reportsClient.includes("localizeReportLabel") &&
    reportsSales.includes('tReports("revenue"') &&
    reportsInventory.includes('tReports("lowStock"'),
);

check(
  "14. Settings sections/forms copy",
  settingsForm.includes('tSettings("companyProfile"') &&
    settingsForm.includes('tSettings("receiptSettings"') &&
    settingsForm.includes('tSettings("customerDisplay"') &&
    settingsForm.includes('tSettings("qrPaymentBanks"') &&
    settingsStaff.includes('tSettings("staffControl"') &&
    receiptPrintModeLabel("auto_print", "en") === "Auto Print" &&
    localizeSettingsError("Company name is required.", "lo") === slo.companyNameRequired,
);

check(
  "15. Customer Display settings labels localized",
  settingsForm.includes('tSettings("customerDisplay"') &&
    settingsForm.includes('tSettings("displayTemplate"') &&
    settingsForm.includes('tSettings("resetThisPage"') &&
    settingsForm.includes('tSettings("resetAllCustomerDisplay"') &&
    !displayClient.includes("settings-copy") &&
    !displayClient.includes("promotions-copy"),
);

check(
  "16. Reset behavior source remains unchanged",
  settingsForm.includes("function resetAppearancePage") &&
    settingsForm.includes("function resetAllDisplaySettings") &&
    settingsForm.includes("resetCustomerDisplayAppearanceSettings(displaySettings)") &&
    settingsForm.includes("resetAllCustomerDisplaySettings()") &&
    displaySettings.includes("export function resetCustomerDisplayAppearanceSettings") &&
    displaySettings.includes("export function resetAllCustomerDisplaySettings") &&
    displaySettings.includes("DEFAULT_CUSTOMER_DISPLAY_SETTINGS"),
);

check(
  "17. Promotion business logic unchanged",
  promotionsActions.includes("export async function createPromotionAction") &&
    promotionsActions.includes("export async function updatePromotionAction") &&
    promotionsRepo.includes("createPrismaPromotion") &&
    promotionsCheckout.includes("apply") &&
    !promotionsActions.includes("promotions-copy") &&
    !promotionsCheckout.includes("promotions-copy"),
);

check(
  "18. Report calculations unchanged",
  reportsHub.includes('label: "Total Revenue"') &&
    reportsHub.includes("profitMarginPercent") &&
    reportsCatalog.includes('title: "Sales Reports"') &&
    !reportsService.includes("reports-copy") &&
    !reportsHub.includes("reports-copy"),
);

check(
  "19. Settings persistence unchanged",
  settingsActions.includes("updateSettingsAction") &&
    settingsRepo.includes("getPrismaSettings") &&
    !settingsActions.includes("settings-copy") &&
    !settingsRepo.includes("settings-copy") &&
    settingsForm.includes("updateSettingsAction"),
);

check(
  "20. User-entered data remains untouched",
  promotionsList.includes("promotion.promotionName") &&
    promotionsForm.includes("promotionName") &&
    reportsCustomers.includes("customer.fullName") &&
    reportsPurchasing.includes("supplier.companyName") &&
    settingsForm.includes("settings.companyName") &&
    settingsForm.includes("settings.receiptHeader"),
);

check(
  "Pages pass locale",
  promotionsPage.includes("locale={locale}") &&
    reportsPage.includes("locale={locale}") &&
    settingsPage.includes("locale={locale}"),
);

console.log("\nphase-lao-08-promotions-reports-settings-language-check: PASS");
process.exit(0);
