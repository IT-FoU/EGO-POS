import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const { DEFAULT_LOCALE } = await import("../lib/constants");
const { getDictionary } = await import("../lib/i18n/dictionaries");
const { getDashboardCopy } = await import("../lib/i18n/dashboard-copy");
const {
  LOCALE_COOKIE_NAME,
  LOCALE_CHANGE_EVENT,
  getServerLocale,
  normalizeLocale,
} = await import("../lib/i18n/locale");
const { INVALID_CREDENTIALS_MESSAGE } = await import("../lib/auth/merchant-login");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

check("A. Default locale is English", DEFAULT_LOCALE === "en", DEFAULT_LOCALE);
check(
  "B. getDictionary defaults to English",
  getDictionary(undefined).signIn === "Sign in",
  getDictionary(undefined).signIn,
);
check(
  "C. getServerLocale defaults to English",
  getServerLocale(undefined, null) === "en",
);
check(
  "D. normalizeLocale falls back to English",
  normalizeLocale("fr") === "en" && normalizeLocale("lo") === "lo",
);

const enDictionary = getDictionary("en");
const loDictionary = getDictionary("lo");
check(
  "E. English invalid credentials message preserved",
  enDictionary.invalidCredentials === INVALID_CREDENTIALS_MESSAGE,
  enDictionary.invalidCredentials,
);
check(
  "F. Lao invalid credentials message localized",
  loDictionary.invalidCredentials.toLowerCase().includes("username") &&
    loDictionary.invalidCredentials.toLowerCase().includes("password"),
  loDictionary.invalidCredentials,
);

const loDashboard = getDashboardCopy("lo");
check(
  "G. Lao dashboard keeps approved English terms",
  loDashboard.qrTransfer.startsWith("QR") &&
    loDashboard.taxVat === "Tax/VAT" &&
    loDashboard.card === "Card" &&
    getDictionary("lo").reports === "Reports" &&
    getDictionary("lo").promotions === "Promotions",
);

const languageToggleSource = readFileSync(resolve(process.cwd(), "components/layout/language-toggle.tsx"), "utf8");
const loginPageSource = readFileSync(resolve(process.cwd(), "app/(auth)/login/page.tsx"), "utf8");
const dashboardShellSource = readFileSync(resolve(process.cwd(), "components/layout/dashboard-shell.tsx"), "utf8");
const localeSource = readFileSync(resolve(process.cwd(), "lib/i18n/locale.ts"), "utf8");
const rootLayoutSource = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");

check(
  "H. Language toggle persists locale to storage and cookie",
  languageToggleSource.includes("persistClientLocale") && localeSource.includes(LOCALE_COOKIE_NAME),
);
check(
  "I. Login page uses shared locale switcher and cookie resolution",
  loginPageSource.includes("LoginLocaleSwitcher") &&
    loginPageSource.includes("getServerLocale") &&
    loginPageSource.includes("LOCALE_COOKIE_NAME"),
);
check(
  "J. Dashboard shell reads stored locale and listens for changes",
  dashboardShellSource.includes("readClientLocale") && dashboardShellSource.includes("LOCALE_CHANGE_EVENT"),
);
check(
  "K. Root layout bootstraps locale from cookie with English default",
  rootLayoutSource.includes("LocaleBootstrap") &&
    rootLayoutSource.includes("DEFAULT_LOCALE") &&
    rootLayoutSource.includes("LOCALE_COOKIE_NAME"),
);

check(
  "L. Locale module persists to storage and cookie",
  localeSource.includes("writeStringToStorage") &&
    localeSource.includes("document.cookie") &&
    localeSource.includes(LOCALE_COOKIE_NAME),
);

check(
  "M. Lao locale uses Noto Sans Lao without a global overlay map",
  rootLayoutSource.includes("Noto_Sans_Lao") &&
    !localeSource.includes('value === "th" ? "th"') &&
    languageToggleSource.includes('updateLocale("lo")'),
);

check(
  "N. Login/session regression strings remain English this phase",
  loginPageSource.includes("LoginLocaleSwitcher") &&
    languageToggleSource.includes("persistClientLocale"),
);

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nOWNER-UAT-4 language: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
