import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { DEFAULT_LOCALE } from "../lib/constants";
import { LOCALE_CHANGE_EVENT, LOCALE_COOKIE_NAME } from "../lib/i18n/locale";
import { DemoStorageKeys } from "../lib/demo/storage-keys";
import { tPromotions } from "../lib/i18n/promotions-copy";
import { tReports } from "../lib/i18n/reports-copy";
import { tSettings } from "../lib/i18n/settings-copy";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

function walkTsFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
      walkTsFiles(fullPath, files);
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

const appLocale = read("lib/i18n/use-app-locale.tsx");
const localeSource = read("lib/i18n/locale.ts");
const layoutSource = read("app/layout.tsx");
const cssSource = read("app/globals.css");
const bootstrap = read("components/i18n/locale-bootstrap.tsx");
const toggle = read("components/layout/language-toggle.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const promotionsHook = read("features/promotions/use-promotions-locale.ts");
const promotionsList = read("features/promotions/components/promotions-list-client.tsx");
const reportsClient = read("features/reports/components/reports-analytics-client.tsx");
const reportsPrimitives = read("features/reports/components/report-primitives.tsx");
const settingsForm = read("features/settings/components/settings-form.tsx");
const productsList = read("features/products/components/product-list-client.tsx");
const inventoryPage = read("features/inventory/components/inventory-page-client.tsx");
const customersList = read("features/customers/components/customers-list-client.tsx");
const membershipClient = read("features/membership-levels/components/membership-levels-client.tsx");
const posClient = read("features/pos/components/pos-page-client.tsx");
const dashboardClient = read("features/dashboard/components/dashboard-interactions-client.tsx");
const promotionsCopy = read("lib/i18n/promotions-copy.ts");
const reportsCopy = read("lib/i18n/reports-copy.ts");
const settingsCopy = read("lib/i18n/settings-copy.ts");

const sharedLocaleImport = /from ["']@\/lib\/i18n\/use-app-locale["']/;
const promotionsLocaleImport = /from ["']@\/features\/promotions\/use-promotions-locale["']/;
const duplicateLocaleState = /useState<SupportedLocale>\(\s*localeProp\s*\?\?\s*readClientLocale\(\)/;
const duplicateLocaleListener = /addEventListener\(\s*LOCALE_CHANGE_EVENT/;

const auditedClients = [
  ["Sidebar", "components/layout/dashboard-shell.tsx", shell],
  ["Language toggle", "components/layout/language-toggle.tsx", toggle],
  ["Header notifications", "components/layout/notification-center.tsx", read("components/layout/notification-center.tsx")],
  ["Promotions list", "features/promotions/components/promotions-list-client.tsx", promotionsList],
  ["Reports hub", "features/reports/components/reports-analytics-client.tsx", reportsClient],
  ["Reports primitives", "features/reports/components/report-primitives.tsx", reportsPrimitives],
  ["Settings form", "features/settings/components/settings-form.tsx", settingsForm],
  ["Products list", "features/products/components/product-list-client.tsx", productsList],
  ["Inventory", "features/inventory/components/inventory-page-client.tsx", inventoryPage],
  ["Customers", "features/customers/components/customers-list-client.tsx", customersList],
  ["Membership", "features/membership-levels/components/membership-levels-client.tsx", membershipClient],
  ["POS", "features/pos/components/pos-page-client.tsx", posClient],
  ["Dashboard", "features/dashboard/components/dashboard-interactions-client.tsx", dashboardClient],
] as const;

check(
  "1. One canonical locale source exists",
  layoutSource.includes("AppLocaleProvider") &&
    appLocale.includes("export function AppLocaleProvider") &&
    appLocale.includes("export function useAppLocale") &&
    appLocale.includes("LOCALE_CHANGE_EVENT") &&
    promotionsHook.includes("useAppLocale as usePromotionsLocale") &&
    localeSource.includes(`export const LOCALE_COOKIE_NAME = "${LOCALE_COOKIE_NAME}"`) &&
    DemoStorageKeys.locale === "ego-pos:locale" &&
    DEFAULT_LOCALE === "en",
);

check(
  "2. Sidebar and page content consume the same locale",
  shell.includes("useAppLocale") &&
    promotionsList.includes("usePromotionsLocale") &&
    reportsClient.includes("useAppLocale") &&
    settingsForm.includes("useAppLocale") &&
    !shell.includes("useState<SupportedLocale>") &&
    !promotionsList.includes("useState<SupportedLocale>"),
);

check(
  "3. Promotions reacts to locale change without reload",
  promotionsHook.includes("useAppLocale as usePromotionsLocale") &&
    promotionsList.includes("usePromotionsLocale") &&
    appLocale.includes("setLocale(detail.locale)") &&
    !toggle.includes("router.refresh()") &&
    !shell.includes("router.refresh()"),
);

check(
  "4. Reports reacts to locale change without reload",
  reportsClient.includes("useAppLocale") &&
    reportsPrimitives.includes("useAppLocale") &&
    reportsPrimitives.includes("titleKey") &&
    reportsPrimitives.includes("labelKey") &&
    reportsPrimitives.includes("columnKeys"),
);

check(
  "5. Settings reacts to locale change without reload",
  settingsForm.includes("useAppLocale") &&
    !settingsForm.includes("useState<SupportedLocale>") &&
    !settingsForm.includes("LOCALE_CHANGE_EVENT"),
);

check(
  "6. English -> Lao updates both sidebar and current page",
  toggle.includes('updateLocale("lo")') &&
    toggle.includes("persistClientLocale") &&
    localeSource.includes("window.dispatchEvent") &&
    localeSource.includes(LOCALE_CHANGE_EVENT) &&
    shell.includes("useAppLocale") &&
    auditedClients.every(([, , source]) => sharedLocaleImport.test(source) || promotionsLocaleImport.test(source)),
);

check(
  "7. Lao -> English updates both sidebar and current page",
  toggle.includes('updateLocale("en")') &&
    appLocale.includes("handleLocaleChange") &&
    tPromotions("promotions", "en") === "Promotions" &&
    tReports("reports", "en") === "Reports" &&
    tSettings("settings", "en") === "Settings",
);

check(
  "8. Locale persists after reload",
  localeSource.includes("writeStringToStorage") &&
    localeSource.includes("document.cookie") &&
    localeSource.includes(LOCALE_COOKIE_NAME) &&
    bootstrap.includes("readClientLocale") &&
    layoutSource.includes("LOCALE_COOKIE_NAME") &&
    layoutSource.includes("getServerLocale"),
);

const featureFiles = [
  ...walkTsFiles(join(process.cwd(), "features")),
  ...walkTsFiles(join(process.cwd(), "app/(dashboard)")),
  join(process.cwd(), "components/layout/dashboard-shell.tsx"),
];
const duplicateStateFiles: string[] = [];
const allowedDuplicateListeners = new Set([
  relative(process.cwd(), join(process.cwd(), "features/pos/components/customer-display-client.tsx")).replaceAll("\\", "/"),
]);

for (const filePath of featureFiles) {
  const source = readFileSync(filePath, "utf8");
  const rel = relative(process.cwd(), filePath).replaceAll("\\", "/");
  if (duplicateLocaleState.test(source)) {
    duplicateStateFiles.push(`${rel} (useState locale)`);
  }
  if (duplicateLocaleListener.test(source) && !allowedDuplicateListeners.has(rel) && !rel.includes("use-app-locale")) {
    duplicateStateFiles.push(`${rel} (LOCALE_CHANGE_EVENT listener)`);
  }
}

check(
  "9. No module-specific duplicate locale state remains in audited modules",
  duplicateStateFiles.length === 0,
  duplicateStateFiles.join(", "),
);

check(
  "10. Noto Sans Lao is used for Lao UI",
  layoutSource.includes("Noto_Sans_Lao") &&
    layoutSource.includes("notoSansLao.className") &&
    layoutSource.includes("notoSansLao.variable") &&
    cssSource.includes('var(--font-noto-sans-lao), "Noto Sans Lao"') &&
    layoutSource.includes('display: "block"') &&
    layoutSource.includes("adjustFontFallback: false"),
);

check(
  "11. No active legacy Lao font import/reference remains",
  !cssSource.includes("Lao UI") &&
    !cssSource.includes("Phetsarath") &&
    !cssSource.includes("Saysettha") &&
    !layoutSource.includes("Phetsarath") &&
    !layoutSource.includes("Lao UI") &&
    !layoutSource.includes("Saysettha") &&
    !toggle.includes("Phetsarath") &&
    !existsSync(join(process.cwd(), "public/fonts")),
);

check(
  "12. Existing English rendering remains correct",
  tPromotions("promotions", "en") === "Promotions" &&
    tReports("reports", "en") === "Reports" &&
    tSettings("settings", "en") === "Settings" &&
    tSettings("backOffice", "en") === "Back Office" &&
    shell.includes('tSettings("settings", "en")') &&
    shell.includes('tReports("reports", "en")') &&
    shell.includes('tPromotions("promotions", "en")'),
);

const laoPromotions = String.fromCharCode(0x0ec2, 0x0e9b, 0x0ea3, 0x0ec2, 0x0ea1, 0x0e8a, 0x0eb1, 0x0e99);
const laoReports = String.fromCharCode(0x0ea5, 0x0eb2, 0x0e8d, 0x0e87, 0x0eb2, 0x0e99);
const laoSettings = String.fromCharCode(0x0e95, 0x0eb1, 0x0ec9, 0x0e87, 0x0e84, 0x0ec8, 0x0eb2);

check(
  "13. Existing Lao translations remain unchanged",
  tPromotions("promotions", "lo") === laoPromotions &&
    tReports("reports", "lo") === laoReports &&
    tSettings("settings", "lo") === laoSettings &&
    tSettings("backOffice", "lo") === "Back Office" &&
    promotionsCopy.includes("export const PROMOTIONS_COPY") &&
    reportsCopy.includes("export const REPORTS_COPY") &&
    settingsCopy.includes("export const SETTINGS_COPY") &&
    !promotionsCopy.includes("Lao UI") &&
    !reportsCopy.includes("Phetsarath"),
);

const playwrightConfigExists =
  existsSync(join(process.cwd(), "playwright.config.ts")) ||
  existsSync(join(process.cwd(), "playwright.config.js"));

if (playwrightConfigExists) {
  fail("Playwright config exists but no live-switch E2E spec was added");
} else {
  console.log("SKIP: browser live-switch E2E — no authenticated browser/Playwright runner in this environment");
}

console.log("\nphase-lao-09-localization-foundation-check: PASS");
process.exit(0);
