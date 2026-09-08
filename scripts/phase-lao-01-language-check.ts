import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "../lib/constants";
import { dashboardCopyKeyParity, getDashboardCopy } from "../lib/i18n/dashboard-copy";
import { getServerLocale, isSupportedLocale, normalizeLocale } from "../lib/i18n/locale";
import { t } from "../lib/i18n/ui";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const results: Array<{ detail: string; name: string; ok: boolean }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

check("1. Supported locales are only en and lo", SUPPORTED_LOCALES.join(",") === "en,lo", SUPPORTED_LOCALES.join(","));
check("2. Default locale is English", DEFAULT_LOCALE === "en", DEFAULT_LOCALE);
check(
  "3. Legacy th falls back to en",
  normalizeLocale("th") === "en" && getServerLocale("th", "fr") === "en" && !isSupportedLocale("th"),
);
check("4. lo is a supported Mini Mart locale", normalizeLocale("lo") === "lo" && isSupportedLocale("lo"));
check("5. Unknown locale falls back to en", normalizeLocale("fr") === "en" && getServerLocale(undefined, null) === "en");

const toggleSource = readFileSync(resolve(process.cwd(), "components/layout/language-toggle.tsx"), "utf8");
check(
  "6. Thai is not selectable in Mini Mart toggle",
    toggleSource.includes('updateLocale("lo")') &&
    toggleSource.includes("LO") &&
    !toggleSource.includes('updateLocale("th")') &&
    !toggleSource.includes("TH"),
);

const enCopy = getDashboardCopy("en");
const loCopy = getDashboardCopy("lo");
const thCopy = getDashboardCopy("th");
check("7. Dashboard key parity en/lo", dashboardCopyKeyParity());
check("8. Legacy th dashboard copy is English", thCopy.dashboard === enCopy.dashboard && thCopy.todaySales === enCopy.todaySales);
check(
  "9. Dashboard Lao has no raw keys and is not Thai/English copy",
  loCopy.dashboard === "ໜ້າຫຼັກ" &&
    loCopy.todaySales === "ຍອດຂາຍມື້ນີ້" &&
    loCopy.bestSellers === "ຂາຍດີ" &&
    !Object.values(loCopy).some((value) => value.includes("แดชบอร์ด") || value.includes("ยอดขายวันนี้")),
);
check(
  "10. Dashboard Lao keeps approved English terms",
  loCopy.qrTransfer.startsWith("QR") && loCopy.taxVat === "Tax/VAT" && loCopy.card === "Card",
);
check("11. t() does not expose Thai and keeps other modules English", t("ui.no.membership", "th") === "No Membership" && t("ui.no.membership", "lo") === "No Membership");

const layoutSource = readFileSync(resolve(process.cwd(), "app/layout.tsx"), "utf8");
const cssSource = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
check(
  "12. Lao locale uses Noto Sans Lao",
  layoutSource.includes("Noto_Sans_Lao") &&
    layoutSource.includes("notoSansLao.className") &&
    layoutSource.includes("notoSansLao.variable") &&
    !layoutSource.includes('locale === "lo"') &&
    cssSource.includes('html[data-locale="lo"]') &&
    cssSource.includes("Noto Sans Lao") &&
    !cssSource.includes("Lao UI") &&
    !cssSource.includes("Phetsarath") &&
    !cssSource.includes('html[data-locale="th"]'),
);
check("13. English font rule is preserved", cssSource.includes('html[data-locale="en"]'));

const dashboardService = readFileSync(resolve(process.cwd(), "features/dashboard/dashboard-service.ts"), "utf8");
check(
  "14. Dashboard business data path unchanged",
  dashboardService.includes("const salesTodayLak = amount(salesKpis.totalRevenue)") &&
    dashboardService.includes("const topProducts = salesKpis.productRows.slice(0, 10)"),
);

const posClient = readFileSync(resolve(process.cwd(), "features/pos/components/pos-page-client.tsx"), "utf8");
const productsClient = readFileSync(resolve(process.cwd(), "features/products/components/product-list-client.tsx"), "utf8");
const settingsForm = readFileSync(resolve(process.cwd(), "features/settings/components/settings-form.tsx"), "utf8");
check(
  "15. Other modules were not switched onto Dashboard Lao copy",
  !posClient.includes("getDashboardCopy") &&
    !productsClient.includes("getDashboardCopy") &&
    !settingsForm.includes("getDashboardCopy"),
);

const failed = results.filter((result) => !result.ok);
console.log(`\nLAO PHASE 01 language: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) {
  process.exit(1);
}
