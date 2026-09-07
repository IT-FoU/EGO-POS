import fs from "node:fs";
import path from "node:path";
import {
  PROMOTIONS_COPY,
  fillPromotionsCopy,
  promotionsCopyHasNoReplacementChars,
  promotionsCopyKeyParity,
  promotionRiskLabel,
  promotionStatusLabel,
  promotionTypeLabel,
  tPromotions,
} from "../lib/i18n/promotions-copy";

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

const lo = PROMOTIONS_COPY.lo;
const en = PROMOTIONS_COPY.en;
const hook = read("features/promotions/use-promotions-locale.ts");
const list = read("features/promotions/components/promotions-list-client.tsx");
const form = read("features/promotions/components/promotion-form.tsx");
const detail = read("features/promotions/components/promotion-detail-client.tsx");
const stackPage = read("app/(dashboard)/promotions/stack-rules/page.tsx");
const analyticsPage = read("app/(dashboard)/promotions/analytics/page.tsx");
const analyticsClient = read("features/promotions/components/promotion-analytics-client.tsx");
const calendarPage = read("app/(dashboard)/promotions/calendar/page.tsx");
const calendarClient = read("features/promotions/components/promotion-calendar-client.tsx");
const mapPage = read("app/(dashboard)/promotions/integration-map/page.tsx");
const promotionsPage = read("app/(dashboard)/promotions/page.tsx");
const shell = read("components/layout/dashboard-shell.tsx");
const copySource = read("lib/i18n/promotions-copy.ts");
const actions = read("features/promotions/actions.ts");
const repo = read("features/promotions/prisma-repository.ts");
const checkout = read("features/promotions/promotion-checkout.ts");
const service = read("features/promotions/promotion-service.ts");
const reportsSales = read("app/(dashboard)/reports/sales/page.tsx");
const settingsForm = read("features/settings/components/settings-form.tsx");

const ownerScreenshotKeys = [
  "maxDiscountPerItem",
  "maxDiscountPerBill",
  "approval",
  "negativeProfit",
  "productDiscount",
  "coupon",
  "qrCoupon",
  "memberDiscount",
  "freeGift",
  "maxDiscount",
  "addExcludedCombination",
  "bulkActions",
  "profitProtection",
  "approvalQueue",
  "coupons",
  "nearExpiry",
  "slowMoving",
  "target",
  "branch",
] as const;

function isStillEnglishUi(value: string) {
  return /[A-Za-z]{5,}/.test(value) && !/Coupon|QR|LAK|POS|VIP/.test(value);
}

check(
  "1. Promotions EN -> LO updates without refresh",
  hook.includes("LOCALE_CHANGE_EVENT") &&
    hook.includes("readClientLocale") &&
    hook.includes("setLocale(detail.locale)") &&
    list.includes("usePromotionsLocale") &&
    form.includes("usePromotionsLocale") &&
    detail.includes("usePromotionsLocale") &&
    stackPage.includes('"use client"') &&
    stackPage.includes("usePromotionsLocale") &&
    !list.includes("if (localeProp) setLocale(localeProp)") &&
    !form.includes("if (localeProp) setLocale(localeProp)") &&
    !stackPage.includes("getServerLocale"),
);

check(
  "2. Promotions LO -> EN updates without refresh",
  hook.includes("handleLocaleChange") &&
    analyticsClient.includes("usePromotionsLocale") &&
    calendarClient.includes("usePromotionsLocale") &&
    mapPage.includes('"use client"') &&
    mapPage.includes("usePromotionsLocale") &&
    analyticsPage.includes("locale={locale}") &&
    calendarPage.includes("locale={locale}"),
);

check(
  "3. Sidebar and main content use same current locale",
  shell.includes("LOCALE_CHANGE_EVENT") &&
    shell.includes("readClientLocale") &&
    hook.includes("readClientLocale(localeProp)") &&
    hook.includes("LOCALE_CHANGE_EVENT") &&
    promotionsPage.includes("locale={locale}"),
);

check(
  "4. /promotions Lao copy coverage",
  lo.promotions === String.fromCharCode(0x0ec2, 0x0e9b, 0x0ea3, 0x0ec2, 0x0ea1, 0x0e8a, 0x0eb1, 0x0e99) &&
    lo.searchPlaceholder !== en.searchPlaceholder &&
    lo.bulkActions !== en.bulkActions &&
    lo.profitProtection !== en.profitProtection &&
    lo.noPromotionsMatch !== en.noPromotionsMatch &&
    list.includes('t("searchPlaceholder")') &&
    list.includes('t("bulkActions")') &&
    list.includes('t("selectVisiblePromotions")') &&
    list.includes("promotionStatusLabel") &&
    promotionsCopyKeyParity(),
);

check(
  "5. /promotions/stack-rules Lao copy coverage",
  stackPage.includes('t("maxDiscountPerItem")') &&
    stackPage.includes('t("maxDiscountPerBill")') &&
    stackPage.includes('t("approval")') &&
    stackPage.includes('t("addExcludedCombination")') &&
    stackPage.includes('t("productDiscount")') &&
    stackPage.includes('t("freeGift")') &&
    lo.maxDiscountPerItem !== en.maxDiscountPerItem &&
    lo.maxDiscountPerBill !== en.maxDiscountPerBill &&
    lo.addExcludedCombination !== en.addExcludedCombination &&
    lo.stackRules !== en.stackRules,
);

check(
  "6. No known English UI leftovers from Owner screenshots under LO",
  ownerScreenshotKeys.every((key) => !isStillEnglishUi(lo[key])) &&
    lo.negativeProfit !== en.negativeProfit &&
    lo.productDiscount !== "Product discount" &&
    lo.memberDiscount !== "Member Discount" &&
    lo.freeGift !== "Free Gift" &&
    lo.target !== "Target" &&
    lo.branch !== "Branch",
);

check(
  "7. Create/edit copy coverage",
  form.includes('t("createPromotion")') &&
    form.includes('t("editPromotion")') &&
    form.includes('t("promotionName")') &&
    form.includes("localizePromotionError") &&
    form.includes('t("templateApplied")') &&
    form.includes("previewPromotionLabel") &&
    lo.basicInfo !== en.basicInfo &&
    lo.saveActivate !== en.saveActivate &&
    lo.missingName !== en.missingName,
);

check(
  "8. Status/type/scope labels localized",
  promotionStatusLabel("active", "lo") === lo.active &&
    promotionStatusLabel("expired", "en") === "Expired" &&
    promotionTypeLabel("percentage", "lo") === lo.percentageDiscount &&
    promotionTypeLabel("member_discount", "lo") === lo.memberDiscount &&
    promotionRiskLabel("High", "lo") === lo.riskHigh &&
    list.includes("t(\"wholeBill\")") &&
    lo.wholeBill !== en.wholeBill &&
    lo.entireStore !== en.entireStore,
);

check(
  "9. No live Thai Promotions branch",
  !copySource.includes('"th"') &&
    !list.includes('"en" | "th"') &&
    !form.includes('"en" | "th"') &&
    !stackPage.includes('"en" | "th"') &&
    !list.includes('from "@/lib/i18n/ui"') &&
    !form.includes('from "@/lib/i18n/ui"') &&
    !Object.values(lo).some((value) => /[\u0E00-\u0E7F]/.test(value)),
);

check(
  "10. User-entered promotion names unchanged",
  list.includes("promotion.promotionName") &&
    form.includes("promotionName: name.trim()") &&
    analyticsClient.includes("promotion.promotionName") &&
    calendarClient.includes("promotion.promotionName") &&
    fillPromotionsCopy("{name}", { name: "Summer Sale" }) === "Summer Sale",
);

check(
  "11. Branch names/data unchanged",
  list.includes('const branchNames = ["Main Branch", "Branch Warehouse", "Mini Mart Counter"]') &&
    form.includes('"Main Branch"') &&
    form.includes('couponCode: "SAVE10"') === false &&
    form.includes('useState("SAVE10")') &&
    list.includes('code: "SAVE10"'),
);

check(
  "12. Business logic files unchanged",
  actions.includes("export async function createPromotionAction") &&
    actions.includes("export async function updatePromotionAction") &&
    repo.includes("createPrismaPromotion") &&
    checkout.includes("apply") &&
    service.includes("getPromotionsSnapshot") &&
    !actions.includes("promotions-copy") &&
    !checkout.includes("promotions-copy") &&
    !repo.includes("promotions-copy") &&
    !service.includes("promotions-copy") &&
    !actions.includes("use-promotions-locale") &&
    !checkout.includes("use-promotions-locale"),
);

check(
  "13. No mojibake/replacement characters",
  promotionsCopyHasNoReplacementChars() &&
    !copySource.includes("\uFFFD") &&
    !list.includes("\uFFFD") &&
    !form.includes("\uFFFD") &&
    !stackPage.includes("\uFFFD") &&
    lo.analytics.includes(String.fromCharCode(0x0eb0)) &&
    lo.allProducts.includes(String.fromCharCode(0x0edd, 0x0ebb, 0x0e94)) &&
    lo.newMembers.includes(String.fromCharCode(0x0ec3, 0x0edd, 0x0ec8)) &&
    lo.studentMembers.includes(String.fromCharCode(0x0eae, 0x0ebd, 0x0e99)),
);

console.log(
  `NOTE: Reports sales page still uses getServerLocale=${reportsSales.includes("getServerLocale")}; Settings form LOCALE_CHANGE=${settingsForm.includes("LOCALE_CHANGE_EVENT")}`,
);
console.log("\nphase-lao-08-promotions-repair-check: PASS");
process.exit(0);
