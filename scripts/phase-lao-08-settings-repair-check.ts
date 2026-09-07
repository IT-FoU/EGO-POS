import fs from "node:fs";
import path from "node:path";

import {
  SETTINGS_COPY,
  fillSettingsCopy,
  localizeActivityStatus,
  localizeApprovalRule,
  localizeCustomerDisplayTemplateDescription,
  localizePermissionAction,
  localizePermissionModule,
  localizeRoleTemplate,
  localizeSettingsError,
  localizeStaffStatus,
  localizeTerminalOption,
  receiptPrintModeLabel,
  roundingMethodLabel,
  settingsCopyHasNoReplacementChars,
  settingsCopyHasNoThaiScript,
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

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const en = SETTINGS_COPY.en;
const lo = SETTINGS_COPY.lo;
const shell = read("components/layout/dashboard-shell.tsx");
const settingsPage = read("app/(dashboard)/settings/page.tsx");
const settingsLoading = read("app/(dashboard)/settings/loading.tsx");
const settingsForm = read("features/settings/components/settings-form.tsx");
const settingsStaff = read("features/settings/components/staff-control-section.tsx");
const storeActivity = read("features/store-activity/components/store-activity-logs-client.tsx");
const settingsCopy = read("lib/i18n/settings-copy.ts");
const settingsActions = read("features/settings/actions.ts");
const settingsRepo = read("features/settings/prisma-repository.ts");
const receiptPrintMode = read("features/settings/receipt-print-mode.ts");
const permissionCatalog = read("features/access-control/permission-catalog.ts");
const displaySettings = read("features/pos/customer-display-settings.ts");
const displayTemplates = read("features/pos/customer-display-templates.ts");
const displayQrStyle = read("features/pos/customer-display-qr-style.ts");
const displayClient = read("features/pos/components/customer-display-client.tsx");
const formSource = stripComments(settingsForm);
const staffSource = stripComments(settingsStaff);
const activitySource = stripComments(storeActivity);

const allowlistedEnglishWords = new Set([
  "Back",
  "Office",
  "CSV",
  "Excel",
  "JPG",
  "JPEG",
  "JSON",
  "LAK",
  "MP4",
  "PDF",
  "PIN",
  "PNG",
  "POS",
  "QR",
  "SVG",
  "THB",
  "USD",
  "VAT",
  "WebP",
  "EGO",
  "API",
  "URL",
  "USB",
  "SMS",
  "OTP",
  "SMTP",
]);
const leftoverEnglishPhrases = [
  "Close modal",
  "Access denied",
  "QR preview",
  "Unknown bank",
  "permissions saved.",
  "rule saved.",
  "Approval ${status",
  "{total} records",
  "{banks.length} banks",
  "{qrAccounts.length} accounts",
  ">All</option>",
  ">Previous<",
  ">Next<",
  "Page {page}",
  "Back to ${",
  'aria-label="Close"',
  'aria-label="Close modal"',
  'from "@/lib/i18n/ui"',
  "`QR account",
  "`Bank ${",
  "`Default QR account",
];
const laoScript = /[\u0E80-\u0EFF]/;
const leftoverEnglishInLo: string[] = [];
for (const [key, value] of Object.entries(lo)) {
  const words = value.replace(/\{[a-zA-Z0-9_]+\}/g, "").match(/\b[A-Za-z]{5,}\b/g) ?? [];
  const unexpected = words.filter((word) => !allowlistedEnglishWords.has(word));
  if (unexpected.length) leftoverEnglishInLo.push(`${key}: ${unexpected.join(", ")}`);
}

check(
  "1. Main Settings navigation is localized",
  shell.includes('tSettings("settings", "en")') &&
    shell.includes('tSettings("settings", "lo")') &&
    en.settings === "Settings" &&
    lo.settings === String.fromCharCode(0x0e95, 0x0eb1, 0x0ec9, 0x0e87, 0x0e84, 0x0ec8, 0x0eb2) &&
    tSettings("settings", "lo") === lo.settings &&
    tSettings("settings", "en") === "Settings",
);

check(
  "2. Every Settings section title is localized",
  settingsForm.includes('tSettings("companyProfile"') &&
    settingsForm.includes('tSettings("receiptSettings"') &&
    settingsForm.includes('tSettings("customerDisplay"') &&
    settingsForm.includes('tSettings("qrPaymentBanks"') &&
    settingsStaff.includes('tSettings("staffControl"') &&
    settingsForm.includes('tSettings("currencySettings"') &&
    settingsForm.includes('tSettings("loyaltyRules"') &&
    settingsForm.includes('tSettings("taxVatSettings"') &&
    settingsForm.includes('tSettings("storeActivityLogs"') &&
    lo.companyProfile !== en.companyProfile &&
    lo.staffControl !== en.staffControl &&
    laoScript.test(lo.companyProfile) &&
    laoScript.test(lo.customerDisplay),
);

check(
  "3. Common form labels/actions are localized",
  settingsForm.includes('tSettings("saveSettings"') &&
    settingsForm.includes('tSettings("cancel"') &&
    settingsForm.includes('tSettings("confirm"') &&
    settingsForm.includes('tSettings("chooseLogo"') &&
    settingsStaff.includes('tSettings("addStaff"') &&
    settingsStaff.includes('tSettings("saveStaff"') &&
    tSettings("save", "lo") === lo.save &&
    tSettings("cancel", "en") === "Cancel" &&
    laoScript.test(lo.save) &&
    laoScript.test(lo.username) &&
    laoScript.test(lo.password),
);

check(
  "4. Dropdown/static option labels are localized",
  settingsForm.includes("receiptPrintModeLabel") &&
    settingsForm.includes("roundingMethodLabel") &&
    settingsStaff.includes("localizeRoleTemplate") &&
    settingsStaff.includes("localizeTerminalOption") &&
    settingsStaff.includes("localizePermissionModule") &&
    settingsStaff.includes("localizePermissionAction") &&
    storeActivity.includes("localizeActivityStatus") &&
    receiptPrintModeLabel("auto_print", "lo") === lo.autoPrint &&
    roundingMethodLabel("nearest", "en") === "Nearest" &&
    localizeRoleTemplate("Owner", "lo") === lo.owner &&
    localizeRoleTemplate("Staff/Cashier", "lo") === lo.staffCashier &&
    localizeTerminalOption("Back Office", "lo") === lo.backOffice &&
    localizeTerminalOption("POS-01", "lo") === "POS-01" &&
    localizePermissionModule("Dashboard", "lo") === lo.moduleDashboard &&
    localizePermissionAction("View", "en") === "View",
);

check(
  "5. Popup/modal/drawer copy is localized",
  settingsForm.includes("closeModal") &&
    settingsStaff.includes("closeModal") &&
    storeActivity.includes("closeModal") &&
    settingsForm.includes('tSettings("addBank"') &&
    settingsForm.includes('tSettings("editQrAccount"') &&
    settingsStaff.includes('tSettings("editStaff"') &&
    storeActivity.includes("activityDetail") &&
    tSettings("closeModal", "lo") === lo.closeModal &&
    tSettings("closeModal", "en") === "Close",
);

check(
  "6. Confirmation and reset dialogs are localized",
  settingsForm.includes('tSettings("removeLogoConfirm"') &&
    settingsForm.includes('tSettings("resetThisPageConfirm"') &&
    settingsForm.includes('tSettings("resetAllCustomerDisplayConfirm"') &&
    settingsForm.includes('tSettings("deleteBankTitle"') &&
    settingsForm.includes('tSettings("deleteQrAccountTitle"') &&
    settingsForm.includes('tSettings("confirmQr"') &&
    laoScript.test(lo.removeLogoConfirm) &&
    laoScript.test(lo.deleteBankConfirm) &&
    lo.resetThisPageConfirm !== en.resetThisPageConfirm,
);

check(
  "7. Validation/helper/empty-state copy is localized",
  localizeSettingsError("Company name is required.", "lo") === lo.companyNameRequired &&
    localizeSettingsError("Decimal places must be an integer between 0 and 4.", "lo") === lo.decimalPlacesIntegerRange &&
    localizeSettingsError("Username already exists.", "lo") === lo.usernameExists &&
    localizeSettingsError("Cannot delete a bank that still has QR accounts. Archive it instead.", "en") === en.cannotDeleteBankWithAccounts &&
    settingsForm.includes('tSettings("noBanks"') &&
    settingsForm.includes('tSettings("noQrAccounts"') &&
    settingsForm.includes('tSettings("noAdvertisementMedia"') &&
    settingsStaff.includes('tSettings("noPendingApprovals"') &&
    storeActivity.includes("emptyActivity") &&
    laoScript.test(lo.noBanks),
);

check(
  "8. Customer Display Settings UI has no remaining unintended raw English",
  settingsForm.includes("localizeCustomerDisplayTemplateDescription") &&
    settingsForm.includes("template.name") &&
    settingsForm.includes("option.name") &&
    localizeCustomerDisplayTemplateDescription("ocean-blue", "fallback", "lo") === lo.templateOceanBlueDesc &&
    localizeCustomerDisplayTemplateDescription("ocean-blue", "fallback", "en") !== lo.templateOceanBlueDesc &&
    settingsForm.includes("localizeCustomerDisplayTemplateDescription(template.id, template.description") &&
    !formSource.includes("{template.description}") &&
    displayTemplates.includes('name: "Ocean Blue"') &&
    displayQrStyle.includes('name: "Green Clean"') &&
    !displayClient.includes("settings-copy"),
);

check(
  "9. Technical/brand terms intentionally retained are allowlisted",
  lo.pos === "POS" &&
    lo.qr === "QR" &&
    lo.pin === "PIN" &&
    lo.vat === "VAT" &&
    lo.backOffice === "Back Office" &&
    settingsForm.includes(">LAK<") &&
    settingsForm.includes(">THB<") &&
    settingsForm.includes(">USD<") &&
    settingsCopy.includes("JPG") &&
    settingsCopy.includes("PNG") &&
    settingsCopy.includes("SVG") &&
    settingsCopy.includes("WebP") &&
    settingsCopy.includes("MP4") &&
    leftoverEnglishInLo.length === 0,
  leftoverEnglishInLo.join(" | "),
);

check(
  "10. Dynamic business/user data is not incorrectly translated",
  settingsForm.includes("settings.companyName") &&
    settingsForm.includes("settings.receiptHeader") &&
    settingsForm.includes("settings.receiptFooter") &&
    settingsForm.includes("bank.bankName") &&
    settingsForm.includes("account.displayLabel") &&
    settingsStaff.includes("member.fullName") &&
    settingsStaff.includes("member.username") &&
    settingsStaff.includes("branch.name") &&
    storeActivity.includes("log.actorName") &&
    storeActivity.includes("log.action") &&
    localizeTerminalOption("POS-02", "lo") === "POS-02",
);

check(
  "11. Internal enum/config values remain unchanged",
  receiptPrintMode.includes('"ask_every_time" | "auto_print" | "no_auto_print"') &&
    settingsForm.includes('value="ask_every_time"') &&
    settingsForm.includes('value="auto_print"') &&
    settingsForm.includes('value="nearest"') &&
    settingsStaff.includes('value="active"') &&
    settingsStaff.includes('value="inactive"') &&
    settingsStaff.includes('["POS-01", "POS-02", "POS-03", "Back Office"]') &&
    permissionCatalog.includes('["Owner", "Manager", "Staff/Cashier", "Custom"]') &&
    !settingsActions.includes("settings-copy") &&
    !settingsRepo.includes("settings-copy") &&
    !permissionCatalog.includes("settings-copy"),
);

check(
  "12. English locale still renders English",
  tSettings("settings", "en") === "Settings" &&
    tSettings("customerDisplay", "en") === "Customer Display" &&
    tSettings("saveSettings", "en") === en.saveSettings &&
    localizeStaffStatus("active", "en") === "Active" &&
    localizeActivityStatus("failed", "en") === "Failed" &&
    localizeApprovalRule("refund", "en") === "Refund" &&
    fillSettingsCopy(en.pageLabel, { page: 2 }) === "Page 2" &&
    fillSettingsCopy(lo.pageLabel, { page: 2 }) !== "Page 2",
);

check(
  "13. No Settings functional behavior changed",
  settingsForm.includes("function resetAppearancePage") &&
    settingsForm.includes("function resetAllDisplaySettings") &&
    settingsForm.includes("resetCustomerDisplayAppearanceSettings(displaySettings)") &&
    settingsForm.includes("resetAllCustomerDisplaySettings()") &&
    displaySettings.includes("export function resetCustomerDisplayAppearanceSettings") &&
    displaySettings.includes("export function resetAllCustomerDisplaySettings") &&
    settingsActions.includes("updateSettingsAction") &&
    settingsRepo.includes("getPrismaSettings") &&
    settingsPage.includes("locale={locale}") &&
    settingsLoading.includes("copy.loadingSettings"),
);

const leftoverHits = leftoverEnglishPhrases.filter((phrase) =>
  formSource.includes(phrase) || staffSource.includes(phrase) || activitySource.includes(phrase),
);

check(
  "Source scan: no leftover raw English Settings UI phrases",
  leftoverHits.length === 0 &&
    !formSource.includes('t("ui.confirm.qr")') &&
    settingsForm.includes("ui.confirm.qr") &&
    settingsForm.includes("ui.replace.qr") &&
    settingsForm.includes("ui.remove.qr"),
  leftoverHits.join(" | "),
);

check(
  "Copy system integrity",
  settingsCopyKeyParity() &&
    settingsCopyHasNoReplacementChars() &&
    settingsCopyHasNoThaiScript() &&
    settingsCopy.includes("export const SETTINGS_COPY"),
);

console.log("\nphase-lao-08-settings-repair-check: PASS");
process.exit(0);
