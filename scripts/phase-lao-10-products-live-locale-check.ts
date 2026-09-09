import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import { ProductsPageHeader } from "../features/products/components/products-page-header";
import { ProductSmallModal } from "../features/products/components/product-small-modal";
import { StatusBadge } from "../features/products/components/status-badge";
import { getProductsCopy } from "../lib/i18n/products-copy";
import { AppLocaleProvider } from "../lib/i18n/use-app-locale";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function check(label: string, ok: boolean, extra = ""): void {
  if (!ok) fail(`${label}${extra ? ` — ${extra}` : ""}`);
  console.log(`PASS: ${label}`);
}

const page = read("app/(dashboard)/products/page.tsx");
const pageHeader = read("features/products/components/products-page-header.tsx");
const listClient = read("features/products/components/product-list-client.tsx");
const statusBadge = read("features/products/components/status-badge.tsx");
const smallModal = read("features/products/components/product-small-modal.tsx");
const appLocale = read("lib/i18n/use-app-locale.tsx");

const enCopy = getProductsCopy("en");
const loCopy = getProductsCopy("lo");

function renderWithLocale(locale: "en" | "lo", node: ReturnType<typeof createElement>) {
  return renderToString(
    createElement(AppLocaleProvider, { initialLocale: locale }, node),
  );
}

const enHeader = renderWithLocale("en", createElement(ProductsPageHeader));
const loHeader = renderWithLocale("lo", createElement(ProductsPageHeader));
const enHeaderAgain = renderWithLocale("en", createElement(ProductsPageHeader));

const enBadge = renderWithLocale("en", createElement(StatusBadge, { status: "active" }));
const loBadge = renderWithLocale("lo", createElement(StatusBadge, { status: "active" }));
const enBadgeAgain = renderWithLocale("en", createElement(StatusBadge, { status: "active" }));

const enModal = renderWithLocale(
  "en",
  createElement(ProductSmallModal, { onClose() {}, size: "sm", title: "Preview" }, "body"),
);
const loModal = renderWithLocale(
  "lo",
  createElement(ProductSmallModal, { onClose() {}, size: "sm", title: "Preview" }, "body"),
);
const enModalAgain = renderWithLocale(
  "en",
  createElement(ProductSmallModal, { onClose() {}, size: "sm", title: "Preview" }, "body"),
);

check(
  "1. /products page header is a live client surface, not frozen server copy",
  page.includes("ProductsPageHeader") &&
    page.includes("products-page-header") &&
    page.includes("ProductListClient") &&
    !page.includes("getProductsCopy") &&
    !page.includes("getServerLocale") &&
    !page.includes("copy.products") &&
    !page.includes("locale={locale}") &&
    pageHeader.includes("export function ProductsPageHeader") &&
    pageHeader.includes("const locale = useAppLocale()") &&
    pageHeader.includes("getProductsCopy(locale)") &&
    listClient.includes("function useProductsT()") &&
    listClient.includes("const locale = useAppLocale()"),
);

check(
  "2. EN Products header, KPI labels, and status badge render English",
  enHeader.includes(enCopy.products) &&
    enHeader.includes(enCopy.productsSubtitle) &&
    enBadge.includes(enCopy.statusActive) &&
    enCopy.products === "Products" &&
    enCopy.productManagementOverview === "Product management overview" &&
    enCopy.searchPlaceholder.includes("Search") &&
    enCopy.viewAll.includes("View All"),
);

check(
  "3. Same Products surfaces switch to Lao without navigation",
  loHeader.includes(loCopy.products) &&
    loHeader.includes(loCopy.productsSubtitle) &&
    loBadge.includes(loCopy.statusActive) &&
    !loHeader.includes(enCopy.productsSubtitle) &&
    !loHeader.includes(">Products<") &&
    !loBadge.includes(enCopy.statusActive) &&
    loCopy.products !== enCopy.products &&
    loCopy.productManagementOverview !== enCopy.productManagementOverview &&
    loCopy.searchPlaceholder !== enCopy.searchPlaceholder &&
    loCopy.viewAll !== enCopy.viewAll,
);

check(
  "4. LO -> EN returns immediately on the same Products surfaces",
  enHeaderAgain.includes(enCopy.products) &&
    enHeaderAgain.includes(enCopy.productsSubtitle) &&
    enBadgeAgain.includes(enCopy.statusActive) &&
    enHeaderAgain === enHeader &&
    enBadgeAgain === enBadge,
);

check(
  "5. Drawers and the /products image modal consume live useProductsT / useAppLocale",
  listClient.includes("function ProductDrawerFrame(") &&
    listClient.includes("function ImportProductsDrawer(") &&
    listClient.includes("function ExportProductsDrawer(") &&
    listClient.includes("function BarcodeAuditDrawer(") &&
    listClient.includes("function PrintBarcodeDrawer(") &&
    listClient.includes("function PrintShelfLabelDrawer(") &&
    listClient.includes("function BulkPricePreviewDrawer(") &&
    listClient.includes("function ImagePreviewModal(") &&
    listClient.includes("function SummaryCard(") &&
    listClient.includes("function ProductsVisualShell(") &&
    (listClient.match(/const \{ (?:locale, t|t, locale|t|locale) \} = useProductsT\(\);/g) ?? []).length >= 16 &&
    statusBadge.includes("const locale = useAppLocale(localeProp)") &&
    statusBadge.includes("productStatusLabel(status, locale)") &&
    smallModal.includes("const locale = useAppLocale()") &&
    smallModal.includes('tProducts("close", locale)'),
);

check(
  "6. /products image modal close fallback switches EN <-> LO live",
  enModal.includes('aria-label="Close"') &&
    loModal.includes(`aria-label="${loCopy.close}"`) &&
    enModalAgain.includes('aria-label="Close"') &&
    loCopy.close !== enCopy.close,
);

check(
  "7. No navigation/remount/refresh workaround and no module-level frozen translator",
  !page.includes("router.refresh") &&
    !listClient.includes("LOCALE_CHANGE_EVENT") &&
    !listClient.includes("readClientLocale") &&
    !listClient.includes("document.documentElement.dataset.locale") &&
    !listClient.includes("const t = tProducts") &&
    !statusBadge.includes("const t = tProducts") &&
    !smallModal.includes("const t = tProducts") &&
    appLocale.includes("setLocale(detail.locale)") &&
    listClient.includes("tProducts(key, locale)"),
);

check(
  "8. Product names and status filters on /products pass the live locale",
  listClient.includes("localizedProductName(product, locale)") &&
    listClient.includes("localizedProductName(previewProduct, locale)") &&
    listClient.includes("productStatusLabel(option, locale)") &&
    listClient.includes("productStatusLabel(product.status, locale)") &&
    listClient.includes("getBarcodeAudit(products, locale)") &&
    listClient.includes("buildBulkPricePreview(targetProducts, {") &&
    listClient.includes("}, locale).slice(0, 20)") &&
    !/localizedProductName\((?:product|previewProduct)\)/.test(listClient) &&
    !/productStatusLabel\((?:option|product\.status)\)/.test(listClient),
);

console.log("\nphase-lao-10-products-live-locale-check: PASS");
