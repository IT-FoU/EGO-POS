import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

function count(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

const list = read("features/promotions/components/promotions-list-client.tsx");
const form = read("features/promotions/components/promotion-form.tsx");
const newPage = read("app/(dashboard)/promotions/new/page.tsx");
const editPage = read("app/(dashboard)/promotions/[id]/edit/page.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const copySource = read("lib/i18n/promotions-copy.ts");
const actions = read("features/promotions/actions.ts");
const checkout = read("features/promotions/promotion-checkout.ts");
const dashboardDrawer = read("features/dashboard/components/dashboard-interactions-client.tsx");
const posFrame = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");
const customersList = read("features/customers/components/customers-list-client.tsx");
const membershipClient = read("features/membership-levels/components/membership-levels-client.tsx");
const suppliersList = read("features/suppliers/components/suppliers-list-client.tsx");

const overlay =
  '"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"';
const panel =
  '"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"';
const smallOverlay =
  '"fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"';

const frameStart = list.indexOf("function PromotionsLargeFrame(");
const utilityStart = list.indexOf("function UtilityModal(");
const detailStart = list.indexOf("function PromotionDetailModal(");
const duplicateStart = list.indexOf("function DuplicatePromotionModal(");
const confirmStart = list.indexOf("function ConfirmPromotionModal(");
const cardStart = list.indexOf("function CardDetailModal(");
const selectorStart = form.indexOf("function SelectorModal(");
const qrStart = form.indexOf("function QrPreviewModal(");
const validationStart = form.indexOf("function ValidationErrorModal(");

check("0. Promotions large frames exist", frameStart >= 0 && utilityStart >= 0 && detailStart >= 0 && selectorStart >= 0);

const frameFn = list.slice(frameStart, utilityStart);
const utilityFn = list.slice(utilityStart, detailStart);
const detailFn = list.slice(detailStart, duplicateStart);
const duplicateFn = list.slice(duplicateStart, confirmStart);
const confirmFn = list.slice(confirmStart, cardStart);
const cardFn = list.slice(cardStart, list.indexOf("function PlaceholderPanel("));
const selectorFn = form.slice(selectorStart, qrStart);
const qrFn = form.slice(qrStart, validationStart);
const validationFn = form.slice(validationStart);

check(
  "1. UtilityModal large frame respects lg:left-72",
  frameFn.includes(overlay) &&
    utilityFn.includes("<PromotionsLargeFrame") &&
    !utilityFn.includes("max-w-5xl") &&
    !utilityFn.includes("fixed inset-0") &&
    !frameFn.includes("md:left-72") &&
    shell.includes('className="fixed inset-y-0 left-0 hidden w-72') &&
    list.includes('kind === "profit"') &&
    list.includes('kind === "approval"') &&
    list.includes('kind === "coupon"') &&
    list.includes('kind === "near_expiry"') &&
    list.includes('kind === "slow_moving"') &&
    list.includes('["import", "export", "bulk"].includes(kind)'),
);

check(
  "2. visible UtilityModal shell is w-full max-w-none",
  frameFn.includes(panel) &&
    frameFn.includes("h-full") &&
    frameFn.includes("w-full") &&
    frameFn.includes("max-w-none") &&
    count(list, overlay) === 1 &&
    count(list, panel) === 1,
);

check(
  "3. PromotionDetailModal uses the same approved boundary",
  detailFn.includes("<PromotionsLargeFrame") &&
    detailFn.includes("promotion.promotionName") &&
    !detailFn.includes("max-w-5xl") &&
    !detailFn.includes("fixed inset-0") &&
    list.includes('setModal("detail")'),
);

check(
  "4. target/category/product selector uses approved large-drawer geometry",
  selectorFn.includes(overlay) &&
    selectorFn.includes(panel) &&
    selectorFn.includes("kind === \"products\"") &&
    selectorFn.includes("kind === \"categories\"") &&
    selectorFn.includes("onSelectProducts(productIds)") &&
    selectorFn.includes("onSelectCategories(categoryIds)") &&
    !selectorFn.includes("max-w-4xl") &&
    !selectorFn.includes("fixed inset-0") &&
    form.includes('setSelector("products")'),
);

check(
  "5. no large Promotions surface leaves a narrow max-w-5xl/max-w-4xl outer shell",
  !frameFn.includes("max-w-5xl") &&
    !frameFn.includes("max-w-4xl") &&
    !utilityFn.includes("max-w-5xl") &&
    !detailFn.includes("max-w-5xl") &&
    !cardFn.includes("max-w-4xl") &&
    !selectorFn.includes("max-w-4xl") &&
    count(list, "max-w-5xl") === 0 &&
    count(list, "max-w-4xl") === 0 &&
    cardFn.includes("<PromotionsLargeFrame"),
);

check(
  "6. Sidebar is not covered or dimmed at lg+",
  frameFn.includes("lg:left-72") &&
    selectorFn.includes("lg:left-72") &&
    frameFn.includes("inset-y-0") &&
    frameFn.includes("right-0") &&
    !frameFn.includes("inset-0") &&
    !selectorFn.includes("place-items-center"),
);

check(
  "7. Create/Edit page navigation remains unchanged",
  newPage.includes('import { PromotionForm } from "@/features/promotions/components/promotion-form"') &&
    newPage.includes("<PromotionForm") &&
    editPage.includes('import { PromotionForm } from "@/features/promotions/components/promotion-form"') &&
    list.includes('href="/promotions/new"') &&
    list.includes("href={`/promotions/${promotion.id}/edit`}") &&
    !newPage.includes("PromotionsLargeFrame") &&
    !editPage.includes("PromotionsLargeFrame"),
);

check(
  "8. small Promotions modals remain unchanged",
  duplicateFn.includes(smallOverlay) &&
    duplicateFn.includes("max-w-xl") &&
    confirmFn.includes(smallOverlay) &&
    confirmFn.includes("max-w-lg") &&
    qrFn.includes(smallOverlay) &&
    qrFn.includes("max-w-md") &&
    validationFn.includes(smallOverlay) &&
    validationFn.includes("max-w-xl") &&
    !duplicateFn.includes("lg:left-72") &&
    !confirmFn.includes("lg:left-72") &&
    !qrFn.includes("lg:left-72") &&
    !validationFn.includes("lg:left-72"),
);

check(
  "9. Promotions business logic remains unchanged",
  list.includes("createPromotionAction") &&
    list.includes("archivePromotionAction") &&
    list.includes("updatePromotionAction") &&
    list.includes("function buildPromotionForecast(") &&
    form.includes("onSelectProducts(productIds)") &&
    actions.includes("createPromotionAction") &&
    checkout.includes("export function calculatePromotionDiscount(") &&
    checkout.includes("export async function applyActivePromotions("),
);

check(
  "10. Lao localization unchanged",
  copySource.includes("PROMOTIONS_COPY") &&
    list.includes("tPromotions") &&
    form.includes("tPromotions") &&
    !list.includes("กำไร") &&
    dashboardDrawer.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    posFrame.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    customersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72") &&
    membershipClient.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72") &&
    suppliersList.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"),
);

console.log("\nphase-ui-08-promotions-drawer-geometry-check: PASS");
