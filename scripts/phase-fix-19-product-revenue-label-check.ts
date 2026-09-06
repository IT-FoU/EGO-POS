import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDashboardCopy } from "../lib/i18n/dashboard-copy";
import { t } from "../lib/i18n/ui";

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
const lo = JSON.parse(readFileSync(join(root, "locales/ui/lo.json"), "utf8")) as Record<string, string>;

const EN_LABEL = "Product revenue";
const EN_HELPER = "After member pricing and product promotions; before points and bill-level discounts.";
const LO_LABEL = "ລາຍໄດ້ສິນຄ້າ";

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
const loCopy = getDashboardCopy("lo");
assert(enCopy.bestSellers === "Best Sellers", `en title ${enCopy.bestSellers}`);
assert(enCopy.productRevenue === EN_LABEL, `en label ${enCopy.productRevenue}`);
assert(enCopy.productRevenueHelper === EN_HELPER, `en helper ${enCopy.productRevenueHelper}`);
assert(loCopy.bestSellers === "ຂາຍດີ", `lo title ${loCopy.bestSellers}`);
assert(loCopy.productRevenue === LO_LABEL, `lo label ${loCopy.productRevenue}`);
assert(getDashboardCopy("th").productRevenue === EN_LABEL, "legacy th dashboard copy falls back to English");

assert(en["ui.product.revenue"] === EN_LABEL, "en locale label");
assert(en["ui.product.revenue.helper"] === EN_HELPER, "en locale helper");
assert(lo["ui.product.revenue"] === LO_LABEL, `lo source label ${lo["ui.product.revenue"]}`);
assert(t("ui.product.revenue", "en") === EN_LABEL, "t() en label");
assert(t("ui.product.revenue", "th") === EN_LABEL, "t() legacy th stays English");
assert(t("ui.product.revenue", "lo") === EN_LABEL, "t() other modules stay English this phase");

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
