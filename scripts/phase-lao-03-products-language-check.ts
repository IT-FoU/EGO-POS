import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localizedProductName } from "../features/pos/product-display-name";
import {
  fillProductsCopy,
  getProductsCopy,
  localizeProductError,
  productsCopyHasNoReplacementChars,
  productsCopyKeepsMimeAccept,
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

check(
  "1. Products has Lao copy coverage",
  Boolean(lo.products && lo.createProduct && lo.productName && lo.searchPlaceholder && lo.skuAlreadyExists),
);
check("2. Products key parity en/lo", productsCopyKeyParity());
check("3. No raw missing Products keys in Lao", !Object.entries(lo).some(([key, value]) => value === key));
check(
  "4. Products has no live Thai runtime path",
  !Object.values(lo).some((value) => /[\u0E00-\u0E7F]/.test(value)) &&
    th.products === en.products &&
    tProducts("products", "th") === en.products,
);

const listClient = readFileSync(resolve(process.cwd(), "features/products/components/product-list-client.tsx"), "utf8");
const productForm = readFileSync(resolve(process.cwd(), "features/products/components/product-form.tsx"), "utf8");
const statusBadge = readFileSync(resolve(process.cwd(), "features/products/components/status-badge.tsx"), "utf8");
const imagePanel = readFileSync(resolve(process.cwd(), "features/products/components/product-image-placeholder.tsx"), "utf8");
const productsPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/products/page.tsx"), "utf8");
const categoriesClient = readFileSync(resolve(process.cwd(), "features/products/components/categories-client.tsx"), "utf8");
const categoriesPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/products/categories/page.tsx"), "utf8");
const repository = readFileSync(resolve(process.cwd(), "features/products/prisma-repository.ts"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "features/products/actions.ts"), "utf8");

check(
  "5. Product form fields have Lao copy",
  lo.productName !== en.productName &&
    lo.sellingPrice !== en.sellingPrice &&
    lo.costPrice !== en.costPrice &&
    lo.basicProductInformation !== en.basicProductInformation &&
    productForm.includes("from \"@/lib/i18n/products-copy\"") &&
    productForm.includes('unitName: "Piece"') &&
    productForm.includes('const QUICK_UNIT_NAMES = [') &&
    productForm.includes('"Piece"') &&
    productForm.includes('"Pack"') &&
    productForm.includes('"Box"'),
);
check(
  "6. Product validation/error strings have Lao copy",
  lo.skuAlreadyExists !== en.skuAlreadyExists &&
    lo.barcodeAlreadyExists !== en.barcodeAlreadyExists &&
    lo.productSaveFailed !== en.productSaveFailed &&
    lo.sellingPriceInvalid !== en.sellingPriceInvalid &&
    localizeProductError("SKU already exists.", "lo") === lo.skuAlreadyExists &&
    localizeProductError("Barcode already exists.", "lo") === lo.barcodeAlreadyExists &&
    localizeProductError("Permission denied: products.create", "lo") === lo.permissionDenied,
);
check(
  "7. Product image controls have Lao copy",
  lo.uploadImage !== en.uploadImage &&
    lo.removeImage !== en.removeImage &&
    lo.noImageSelected !== en.noImageSelected &&
    lo.uploadPngJpgWebpGif !== en.uploadPngJpgWebpGif &&
    imagePanel.includes("from \"@/lib/i18n/products-copy\"") &&
    productsCopyKeepsMimeAccept() &&
    lo.acceptImages === en.acceptImages,
);
check(
  "8. SKU/Barcode technical terms remain English",
  lo.sku === "SKU" &&
    lo.barcode === "Barcode" &&
    lo.piece === "Piece" &&
    lo.pack === "Pack" &&
    lo.box === "Box" &&
    listClient.includes('t("sku")') &&
    listClient.includes('t("barcode")'),
);

const laoProduct = localizedProductName({ nameEn: "Water", nameLo: "ນ້ຳ" }, "lo");
const enProduct = localizedProductName({ nameEn: "Water", nameLo: "ນ້ຳ" }, "en");
const fallbackProduct = localizedProductName({ nameEn: "Water", nameLo: "" }, "lo");
const thProduct = localizedProductName({ nameEn: "Water", nameLo: "ນ້ຳ" }, "th");
check(
  "9. Product localized-name fallback still works",
  laoProduct === "ນ້ຳ" && enProduct === "Water" && fallbackProduct === "Water" && thProduct === "Water" &&
    listClient.includes("localizedProductName"),
);

check(
  "10. Existing Product CRUD/business behavior remains unchanged",
  !repository.includes("products-copy") &&
    !actions.includes("products-copy") &&
    categoriesClient.includes('from "@/lib/i18n/products-copy"') &&
    categoriesPage.includes("getServerLocale") &&
    listClient.includes('from "@/lib/i18n/products-copy"') &&
    productsPage.includes("ProductsPageHeader") &&
    productsPage.includes("products-page-header") &&
    listClient.includes("function useProductsT()") &&
    !productsPage.includes("getProductsCopy") &&
    !productsPage.includes("getServerLocale") &&
    statusBadge.includes("productStatusLabel") &&
    !listClient.includes('"en" | "th"') &&
    !productForm.includes('"en" | "th"') &&
    !listClient.includes("getDashboardCopy") &&
    productsCopyHasNoReplacementChars() &&
    fillProductsCopy(en.showingRange, { from: 1, to: 25, total: 100 }) === "Showing 1-25 of 100 products." &&
    productStatusLabel("active", "lo") === lo.statusActive &&
    t("ui.no.membership", "lo") === "No Membership",
);

const failed = results.filter((result) => !result.ok);
console.log(`\nLAO PHASE 03 Products language: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) {
  process.exit(1);
}

assert(results.length >= 10, "expected focused Products Lao checks");
