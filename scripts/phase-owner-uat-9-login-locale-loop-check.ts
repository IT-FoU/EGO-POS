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
const {
  LOCALE_COOKIE_NAME,
  getServerLocale,
  readCookieLocale,
} = await import("../lib/i18n/locale");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const languageToggleSource = readFileSync(resolve(process.cwd(), "components/layout/language-toggle.tsx"), "utf8");
const loginLocaleSwitcherSource = readFileSync(
  resolve(process.cwd(), "components/auth/login-locale-switcher.tsx"),
  "utf8",
);
const portalLocaleSwitcherSource = readFileSync(
  resolve(process.cwd(), "components/auth/portal-locale-switcher.tsx"),
  "utf8",
);
const localeBootstrapSource = readFileSync(
  resolve(process.cwd(), "components/i18n/locale-bootstrap.tsx"),
  "utf8",
);
const loginPageSource = readFileSync(resolve(process.cwd(), "app/(auth)/login/page.tsx"), "utf8");
const superAdminLoginSource = readFileSync(
  resolve(process.cwd(), "app/(super-admin)/super-admin/login/page.tsx"),
  "utf8",
);
const egoAdminLoginSource = readFileSync(
  resolve(process.cwd(), "app/(ego-admin)/ego-admin/login/page.tsx"),
  "utf8",
);
const loginFormSource = readFileSync(resolve(process.cwd(), "components/auth/login-form.tsx"), "utf8");
const localeSource = readFileSync(resolve(process.cwd(), "lib/i18n/locale.ts"), "utf8");

const syncEffectMatch = languageToggleSource.match(/useEffect\(\(\) => \{[\s\S]*?\}, \[locale\]\);/);
check(
  "A. Language toggle does not notify parent on initial sync",
  Boolean(syncEffectMatch && !syncEffectMatch[0].includes("onLocaleChange")),
);
check(
  "B. Language toggle notifies parent only on user action",
  languageToggleSource.includes("function updateLocale") &&
    languageToggleSource.includes("onLocaleChange?.(nextLocale)") &&
    languageToggleSource.includes("persistClientLocale(nextLocale)"),
);
check(
  "C. Login locale switcher guards unchanged locale",
  loginLocaleSwitcherSource.includes("if (nextLocale === locale)") &&
    loginLocaleSwitcherSource.includes("router.replace(`/login?locale=${nextLocale}`)"),
);
check(
  "D. Portal locale switcher guards unchanged locale",
  portalLocaleSwitcherSource.includes("if (nextLocale === locale)") &&
    portalLocaleSwitcherSource.includes("router.replace(`${loginPath}?locale=${nextLocale}`)"),
);
check(
  "E. Locale bootstrap skips writes when already synced",
  localeBootstrapSource.includes("isClientLocaleSynced(locale)"),
);
check(
  "F. persistClientLocale is idempotent",
  localeSource.includes("isClientLocaleSynced(locale)") &&
    localeSource.includes("if (typeof window !== \"undefined\" && isClientLocaleSynced(locale))"),
);
check(
  "G. /login defaults to English without query param",
  loginPageSource.includes("getServerLocale(params?.locale, cookieStore.get(LOCALE_COOKIE_NAME)?.value)") &&
    DEFAULT_LOCALE === "en",
);
check(
  "H. /login?locale=en resolves English dictionary",
  getServerLocale("en") === "en" && getDictionary("en").signIn === "Sign in",
);
check(
  "I. /login?locale=lo resolves Lao dictionary",
  getServerLocale("lo") === "lo" && getDictionary("lo").signIn !== getDictionary("en").signIn,
);
check(
  "J. Super Admin login uses guarded portal locale switcher",
  superAdminLoginSource.includes("PortalLocaleSwitcher") &&
    superAdminLoginSource.includes('loginPath="/super-admin/login"'),
);
check(
  "K. EGO Admin login uses guarded portal locale switcher",
  egoAdminLoginSource.includes("PortalLocaleSwitcher") &&
    egoAdminLoginSource.includes('loginPath="/ego-admin/login"'),
);
check(
  "L. Login button and password toggle preserved",
  loginFormSource.includes("canSubmitLoginCredentials") &&
    loginFormSource.includes("value={password}") &&
    loginFormSource.includes('type="submit"'),
);
check(
  "M. Cookie locale helper exported",
  typeof readCookieLocale === "function" && localeSource.includes("readCookieLocale"),
);
check(
  "N. Locale cookie name unchanged",
  LOCALE_COOKIE_NAME === "ego-pos-locale",
);

check(
  "O. Login switcher uses stable callback",
  loginLocaleSwitcherSource.includes("useCallback"),
);
check(
  "P. Portal switcher uses stable callback",
  portalLocaleSwitcherSource.includes("useCallback"),
);

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nOWNER-UAT-9 login locale loop: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
