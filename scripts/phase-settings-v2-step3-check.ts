/**
 * Settings V2 step 3 — list-first navigation.
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

const landingPage = read("app/(dashboard)/settings/page.tsx");
const landing = read("features/settings/components/settings-landing.tsx");
const detailPage = read("app/(dashboard)/settings/[section]/page.tsx");
const form = read("features/settings/components/settings-form.tsx");
const staff = read("features/settings/components/staff-control-section.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const permissions = read("features/permissions/store-ui-permissions.ts");
const activityPage = read("app/(dashboard)/activity-logs/page.tsx");
const step2 = read("scripts/phase-settings-v2-step2-check.ts");
const settingsCopy = read("lib/i18n/settings-copy.ts");

const businessHrefs = ["/settings/company-profile", "/settings/business-logo", "/settings/branch-information", "/settings/tax"];
const posHrefs = ["/settings/cash-shift", "/settings/receipt", "/settings/qr-payments", "/settings/customer-display"];
const staffHrefs = ["/settings/staff", "/settings/roles", "/settings/approval-rules", "/settings/day-off", "/settings/ot"];
const customerHrefs = ["/settings/loyalty"];
const helpHrefs = ["/settings/help"];
const loBusiness = "\u0e97\u0eb8\u0ea5\u0eb0\u0e81\u0eb4\u0e94";
const loQrPay = "\u0e81\u0eb2\u0e99\u0e8a\u0eb3\u0ea5\u0eb0";
const loSearch = "\u0e84\u0ebb\u0ec9\u0e99\u0eab\u0eb2\u0e95\u0eb1\u0ec9\u0e87\u0e84\u0ec8\u0eb2";

check("1. Settings landing shows exactly 5 categories", (landing.match(/id: "/g) ?? []).length === 5 && landing.includes('id: "business"') && landing.includes('id: "pos-payments"') && landing.includes('id: "staff"') && landing.includes('id: "customers"') && landing.includes('id: "help"'));
check("2. Business items correct", businessHrefs.every((href) => landing.includes(`href: "${href}"`)) && !landing.includes("/settings/currency") && !landing.includes("Business Hours"));
check("3. POS & Payments items correct", posHrefs.every((href) => landing.includes(`href: "${href}"`)) && !landing.includes('href: "/settings/ads"'));
check("4. Staff items correct", staffHrefs.every((href) => landing.includes(`href: "${href}"`)) && landing.includes("Staff & Security"));
check("5. Customers only shows Loyalty", customerHrefs.every((href) => landing.includes(`href: "${href}"`)) && !landing.includes("/settings/membership") && !landing.includes("/settings/customer-rules"));
check("5b. Help & Support category present", helpHrefs.every((href) => landing.includes(`href: "${href}"`)) && landing.includes("Help & Support"));
check("6. Currency absent", !landing.includes("Currency Settings") && !form.includes("currencySettings") && !staff.includes("currencySettings"));
check("7. Business Hours absent", !landing.includes("Business Hours") && !detailPage.includes("business-hours"));
check("8. Notifications absent", !landing.includes('href: "/settings/notifications"'));
check("9. Terminal absent", !landing.includes('href: "/settings/terminal"') && !landing.includes("Terminal management"));
check("10. Membership not duplicated", landing.includes('href: "/membership-levels"') && !landing.includes('href: "/settings/membership"'));
check("11. Reorder not duplicated", landing.includes('href: "/reports/inventory/reorder"') && !landing.includes('href: "/settings/reorder"'));
check("12. search QR opens QR Payments", landing.includes("keywords: \"qr payments") && landing.includes('href: "/settings/qr-payments"'));
check("13. search membership links Membership", landing.includes("keywords: \"membership") && landing.includes('href: "/membership-levels"'));
check("14. search reorder links Reorder", landing.includes("keywords: \"reorder") && landing.includes('href: "/reports/inventory/reorder"'));
check("15. search activity links Activity Logs", landing.includes("keywords: \"activity audit") && landing.includes('href: "/activity-logs"'));
check("16. deferred search returns explanation", landing.includes("hours business hours holiday payroll session timeout pin") && landing.includes("not a configurable setting") && landing.includes("There is no printer device setting"));
check("17. row status Business Logo", landing.includes("Uploaded") && landing.includes("Not set") && landing.includes("hasLogo"));
check("18. Tax status", landing.includes("vatEnabled") && landing.includes("On") && landing.includes("Off"));
check("19. Cash Shift status", landing.includes("requireCashShiftBeforeSale") && landing.includes("Required") && landing.includes("Not required"));
check("20. QR counts", landing.includes("activeQrBanks") && landing.includes("activeQrAccounts"));
check("21. Staff active count", landing.includes("activeStaff"));
check("22. Loyalty status", landing.includes("loyaltyEnabled"));
check("23. direct route refresh works", detailPage.includes("sections.has") && businessHrefs.concat(posHrefs, staffHrefs, customerHrefs, helpHrefs).every((href) => detailPage.includes(`"${href.replace("/settings/", "")}"`)));
check("24. Back to Settings works", form.includes('href="/settings"') && form.includes("backToSettings") && settingsCopy.includes("Back to Settings"));
check("25. global Save absent", !landing.includes("saveSettings") && !landing.includes("Save settings") && landingPage.includes("SettingsLanding"));
check("26. print mode labeled This device", form.includes("scopeThisDevice") && form.includes("printBehaviorThisBrowser") && settingsCopy.includes("This print mode applies only to this browser."));
check("27. Customer Display labeled This device", form.includes("customerDisplayThisBrowser") && landing.includes('scope: "device"'));
check("28. sidebar EGO POS branding unchanged", shell.includes("APP_NAME") && shell.includes("SLOGAN") && !shell.includes("readCompanyLogoUrl"));
check("29. header Company.name unchanged", shell.includes("resolveActiveCompanyName(session.user.activeCompanyName)"));
check("30. EN copy", landing.includes("Business") && landing.includes("POS & Payments") && landing.includes("Customers") && landing.includes("Search settings") && landing.includes("Staff & Security"));
check("31. LO copy", landing.includes(loBusiness) && landing.includes(loQrPay) && landing.includes(loSearch) && settingsCopy.includes(loBusiness) && settingsCopy.includes("backToSettings"));

check("landing does not mount SettingsForm", !landingPage.includes("SettingsForm") && landingPage.includes("SettingsLanding"));
check("activity page exists outside settings", existsSync(join(root, "app/(dashboard)/activity-logs/page.tsx")) && activityPage.includes("StoreActivityLogsClient"));
check("activity is removed from SettingsForm", !form.includes("StoreActivityLogsClient"));
check("activity nav is near Reports", shell.indexOf('href: "/activity-logs"') > shell.indexOf('href: "/reports"'));
check("activity nav uses existing permission", permissions.includes('case "activity"') && permissions.includes("STORE_ACTIVITY_LOGS_VIEW_OWN_STORE"));
check("QR is split from landing bundle", form.includes("qr-payment-bank-management-section") && existsSync(join(root, "features/settings/components/qr-payment-bank-management-section.tsx")));
check("staff pages do not render loyalty or currency", !staff.includes("loyaltyRules") && !staff.includes("currencySettings"));
check("no Super Admin badge", !landing.includes("Super Admin") && !form.includes("Super Admin"));
check("no schema migration added by Step 3", !existsSync(join(root, "prisma/migrations/20261002030000_settings_v2_step3")));
check("Step 2 focused checks remain", step2.includes("company logo persists server-side") && step2.includes("print mode not written to company settings"));
check("receipt print mode still device-local", form.includes("writeReceiptPrintModePreference") && form.includes("payload = {"));
check("logo save path remains", form.includes("saveCompanyLogoAction") && form.includes("removeCompanyLogoAction"));
check("scoped company saves remain", form.includes('section === "company-profile"') && form.includes('section === "tax"') && form.includes('section === "cash-shift"') && form.includes('section === "loyalty"'));
check("settings-copy has landing and shell keys", ["searchSettings", "scopeThisDevice", "categoryPosPayments", "qrPayments", "activityLogsSubtitle"].every((key) => settingsCopy.includes(`"${key}"`)));

console.log(`\nSettings V2 step 3: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
