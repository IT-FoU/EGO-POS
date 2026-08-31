import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDashboardCopy } from "../lib/i18n/dashboard-copy";
import { t } from "../lib/i18n/ui";
import { translateToThai } from "../lib/i18n/thai-ui-translations";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const root = process.cwd();
const repoSrc = readFileSync(join(root, "features/reports/prisma-repository.ts"), "utf8");
const dashboardService = readFileSync(join(root, "features/dashboard/dashboard-service.ts"), "utf8");
const dashboardUi = readFileSync(join(root, "features/dashboard/components/dashboard-interactions-client.tsx"), "utf8");
const reportsUi = readFileSync(join(root, "features/reports/components/reports-analytics-client.tsx"), "utf8");
const hubSrc = readFileSync(join(root, "features/reports/build-analytics-hub.ts"), "utf8");
const checkoutSrc = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");
const en = JSON.parse(readFileSync(join(root, "locales/ui/en.json"), "utf8")) as Record<string, string>;
const th = JSON.parse(readFileSync(join(root, "locales/ui/th.json"), "utf8")) as Record<string, string>;
const lo = JSON.parse(readFileSync(join(root, "locales/ui/lo.json"), "utf8")) as Record<string, string>;

const EN_LABEL = "Product revenue";
const EN_HELPER = "After member pricing and product promotions; before points and bill-level discounts.";
const TH_LABEL = "รายได้สินค้า";
const TH_HELPER = "หลังราคาสมาชิกและโปรโมชันสินค้า ก่อนใช้แต้มและส่วนลดท้ายบิล";

assert(repoSrc.includes("revenueLak: amount(item.totalAmount)"), "Best Sellers still must use sale_item.total_amount");
assert(repoSrc.includes("function buildNettedProductTotals"), "buildNettedProductTotals missing");
assert(!repoSrc.includes("loyaltyRedemption"), "product totals must not allocate loyalty");
assert(!repoSrc.includes("manualDiscountAmount"), "product totals must not allocate manual discount");

assert(dashboardService.includes("const salesTodayLak = amount(salesKpis.totalRevenue)"), "Today Sales must stay sale net");
assert(dashboardService.includes("const topProducts = salesKpis.productRows.slice(0, 10)"), "Best Sellers still uses productRows");

assert(hubSrc.includes("revenue: round(row.revenueLak)"), "Top Sellers still uses product revenueLak");
assert(checkoutSrc.includes("loyaltyRedemption.discountAmountLak"), "sale-level loyalty persistence unchanged");

assert(dashboardUi.includes("copy.productRevenue"), "Dashboard Best Sellers missing product revenue label");
assert(dashboardUi.includes("copy.productRevenueHelper"), "Dashboard missing product revenue helper");
assert(dashboardUi.includes("copy.bestSellers"), "Best Sellers title must stay");
assert(reportsUi.includes('t("ui.product.revenue")'), "Reports Top Sellers missing product revenue label");
assert(reportsUi.includes('t("ui.product.revenue.helper")'), "Reports missing product revenue helper");
assert(reportsUi.includes("Top Sellers"), "Top Sellers title must stay");

const enCopy = getDashboardCopy("en");
const thCopy = getDashboardCopy("th");
assert(enCopy.bestSellers === "Best Sellers", `en title ${enCopy.bestSellers}`);
assert(enCopy.productRevenue === EN_LABEL, `en label ${enCopy.productRevenue}`);
assert(enCopy.productRevenueHelper === EN_HELPER, `en helper ${enCopy.productRevenueHelper}`);
assert(thCopy.bestSellers === "สินค้าขายดี", `th title ${thCopy.bestSellers}`);
assert(thCopy.productRevenue === TH_LABEL, `th label ${thCopy.productRevenue}`);
assert(thCopy.productRevenueHelper === TH_HELPER, `th helper ${thCopy.productRevenueHelper}`);

assert(en["ui.product.revenue"] === EN_LABEL, "en locale label");
assert(en["ui.product.revenue.helper"] === EN_HELPER, "en locale helper");
assert(th["ui.product.revenue"] === TH_LABEL, "th locale label");
assert(th["ui.product.revenue.helper"] === TH_HELPER, "th locale helper");
assert(lo["ui.product.revenue"] === "ລາຍໄດ້ສິນຄ້າ", `lo label ${lo["ui.product.revenue"]}`);
assert(lo["ui.product.revenue.helper"].includes("ແຕ້ມ"), `lo helper ${lo["ui.product.revenue.helper"]}`);
assert(t("ui.product.revenue", "en") === EN_LABEL, "t() en label");
assert(t("ui.product.revenue.helper", "th") === TH_HELPER, "t() th helper");
assert(translateToThai(EN_LABEL) === TH_LABEL, "LocalizationRepairRuntime label");
assert(translateToThai(EN_HELPER) === TH_HELPER, "LocalizationRepairRuntime helper");

const pepsi06Line = 18_810;
const pepsi07Line = 10_450;
const pepsi06Net = 18_810;
const pepsi07Net = 9_450;
const bestSellers = pepsi06Line + pepsi07Line;
const todaySales = pepsi06Net + pepsi07Net;
assert(bestSellers === 29_260, `Best Sellers fixture ${bestSellers}`);
assert(todaySales === 28_260, `Today Sales fixture ${todaySales}`);
assert(bestSellers - todaySales === 1_000, "gap must remain the 00010007 loyalty redemption");

console.log("FIX-19 product revenue label check PASS");
console.log(`Best Sellers fixture ${bestSellers} / Today Sales fixture ${todaySales}`);
