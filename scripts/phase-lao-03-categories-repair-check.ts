import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localizedProductName } from "../features/pos/product-display-name";
import {
  getProductsCopy,
  localizeCategoryError,
  productsCopyHasNoReplacementChars,
  productsCopyKeyParity,
  productStatusLabel,
  tProducts,
} from "../lib/i18n/products-copy";
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

const en = getProductsCopy("en");
const lo = getProductsCopy("lo");
const th = getProductsCopy("th");

const shell = readFileSync(resolve(process.cwd(), "components/layout/dashboard-shell.tsx"), "utf8");
const categoriesClient = readFileSync(resolve(process.cwd(), "features/products/components/categories-client.tsx"), "utf8");
const categoriesPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/products/categories/page.tsx"), "utf8");
const categoriesLoading = readFileSync(resolve(process.cwd(), "app/(dashboard)/products/categories/loading.tsx"), "utf8");
const mapper = readFileSync(resolve(process.cwd(), "features/products/dto-mapper.ts"), "utf8");
const repository = readFileSync(resolve(process.cwd(), "features/products/prisma-repository.ts"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "features/products/actions.ts"), "utf8");
const toggle = readFileSync(resolve(process.cwd(), "components/layout/language-toggle.tsx"), "utf8");

const thaiUi = /Thai|nameTh|locale === ["']th["']|Search categories by Thai|updateLocale\(["']th["']\)/i;
const visibleThai = /[\u0E00-\u0E7F]/;

check(
  "A. Sidebar Products label uses Products copy for en/lo",
  tProducts("products", "en") === "Products" &&
    tProducts("products", "lo") === lo.products &&
    lo.products !== en.products &&
    shell.includes('tProducts("products", "en")') &&
    shell.includes('tProducts("products", "lo")') &&
    shell.includes("useAppLocale") &&
    !shell.includes('products: "Products"'),
);

check(
  "A2. Later sidebar modules stay English in Lao and Thai is unavailable",
  shell.includes('tInventory("inventory", "en")') &&
    shell.includes('tInventory("inventory", "lo")') &&
    (shell.includes('customers: "Customers"') || shell.includes('tCustomers("customers"')) &&
    (shell.includes('membership: "Membership"') || shell.includes('tMemberships("membership"')) &&
    (shell.includes('suppliers: "Suppliers"') || shell.includes('tSuppliers("suppliers"')) &&
    (shell.includes('settings: "Settings"') || shell.includes('tSettings("settings"')) &&
    (shell.includes('promotions: "Promotions"') || shell.includes('tPromotions("promotions"')) &&
    (shell.includes('reports: "Reports"') || shell.includes('tReports("reports"')) &&
    !toggle.includes('updateLocale("th")') &&
    !toggle.includes("TH") &&
    tProducts("products", "th") === en.products,
);

check(
  "B. Categories page has en/lo parity and no Thai-facing copy",
  productsCopyKeyParity() &&
    lo.categories !== en.categories &&
    lo.productManagement !== en.productManagement &&
    lo.categoriesPageSubtitle !== en.categoriesPageSubtitle &&
    lo.categoriesSearchPlaceholder !== en.categoriesSearchPlaceholder &&
    en.categoriesSearchPlaceholder.includes("Lao or English") &&
    !en.categoriesSearchPlaceholder.toLowerCase().includes("thai") &&
    !lo.categoriesSearchPlaceholder.toLowerCase().includes("thai") &&
    !Object.values(lo).some((value) => visibleThai.test(value)) &&
    !thaiUi.test(categoriesClient) &&
    !thaiUi.test(categoriesPage) &&
    !categoriesClient.includes("Thai or English") &&
    categoriesClient.includes('from "@/lib/i18n/products-copy"') &&
    !categoriesClient.includes('from "@/lib/i18n/ui"') &&
    categoriesPage.includes("getServerLocale"),
);

check(
  "C. Create/Edit uses English Name / Lao Name and Lao actions",
  en.categoryNameEnglish === "English Name" &&
    en.categoryNameLao === "Lao Name" &&
    lo.categoryNameEnglish !== en.categoryNameEnglish &&
    lo.categoryNameLao !== en.categoryNameLao &&
    lo.saveCategory !== en.saveCategory &&
    lo.cancel !== en.cancel &&
    lo.createCategory !== en.createCategory &&
    lo.editCategory !== en.editCategory &&
    categoriesClient.includes('t("categoryNameEnglish")') &&
    categoriesClient.includes('t("categoryNameLao")') &&
    categoriesClient.includes('t("saveCategory")') &&
    categoriesClient.includes('t("cancel")'),
);

check(
  "D. Empty/error/loading/ARIA paths exist in Lao",
  lo.noCategories !== en.noCategories &&
    lo.noCategoryResults !== en.noCategoryResults &&
    lo.failedToLoadCategories !== en.failedToLoadCategories &&
    lo.loadingCategories !== en.loadingCategories &&
    lo.categoryRequired !== en.categoryRequired &&
    lo.categoryDeleteFailed !== en.categoryDeleteFailed &&
    lo.archiveCategoryUnavailable !== en.archiveCategoryUnavailable &&
    localizeCategoryError("Category cannot be deleted while it has child categories.", "lo") === lo.categoryHasChildren &&
    localizeCategoryError("Category cannot be deleted while products or promotions reference it.", "lo") === lo.categoryInUse &&
    localizeCategoryError(undefined, "lo") === lo.categorySaveFailed &&
    productStatusLabel("active", "lo") === lo.statusActive &&
    productStatusLabel("inactive", "lo") === lo.statusInactive &&
    categoriesClient.includes('t("noCategories")') &&
    categoriesClient.includes('t("noCategoryResults")') &&
    categoriesClient.includes("aria-label") &&
    categoriesLoading.includes("loadingCategories"),
);

const laoName = localizedProductName({ nameEn: "Drinks", nameLo: lo.categories }, "lo");
const enName = localizedProductName({ nameEn: "Drinks", nameLo: lo.categories }, "en");
const fallbackName = localizedProductName({ nameEn: "Drinks", nameLo: "" }, "lo");
const thName = localizedProductName({ nameEn: "Drinks", nameLo: lo.categories }, "th");

check(
  "E. Category localized-name fallback reuses existing helper",
  laoName === lo.categories &&
    enName === "Drinks" &&
    fallbackName === "Drinks" &&
    thName === "Drinks" &&
    categoriesClient.includes("localizedProductName") &&
    mapper.includes("parentNameEn") &&
    mapper.includes("parentNameLo"),
);

check(
  "F. Category business logic and other modules were not rewritten",
  !repository.includes("products-copy") &&
    !actions.includes("products-copy") &&
    repository.includes("Category cannot be deleted while it has child categories.") &&
    categoriesClient.includes("upsertCategoryAction") &&
    categoriesClient.includes("deleteCategoryAction") &&
    t("ui.no.membership", "lo") === "No Membership" &&
    productsCopyHasNoReplacementChars() &&
    th.categories === en.categories,
);

const failed = results.filter((result) => !result.ok);
console.log(
  `\nLAO PHASE 03 Categories repair: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`,
);
if (failed.length) {
  process.exit(1);
}

assert(results.length >= 7, "expected focused Categories repair checks");
