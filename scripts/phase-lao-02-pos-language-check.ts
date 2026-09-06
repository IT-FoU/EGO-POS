import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localizedProductName } from "../features/pos/product-display-name";
import {
  fillPosCopy,
  getPosCopy,
  posCopyHasNoReplacementChars,
  posCopyKeepsCssClass,
  posCopyKeyParity,
  tPos,
} from "../lib/i18n/pos-copy";
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

const en = getPosCopy("en");
const lo = getPosCopy("lo");
const th = getPosCopy("th");

check("1. POS Lao copy coverage", Boolean(lo["ui.shopping.cart"] && lo["ui.pay"] && lo["ui.recent.sales"] && lo["ui.own.shift.report"]));
check("2. POS key parity en/lo", posCopyKeyParity());
check("3. No raw missing POS keys in Lao", !Object.entries(lo).some(([key, value]) => value === key));
check(
  "4. No replacement-char Lao and CSS class preserved",
  posCopyHasNoReplacementChars() && posCopyKeepsCssClass() && lo["ui.text.ffd700"] === "text-[#FFD700]",
);
check(
  "5. Major POS modals have Lao copy",
  lo["ui.hold.bill"] !== en["ui.hold.bill"] &&
    lo["ui.mixed.payment"] !== en["ui.mixed.payment"] &&
    lo["ui.return.exchange.void"] !== en["ui.return.exchange.void"] &&
    lo["ui.manager.approval.refund"] !== en["ui.manager.approval.refund"] &&
    lo["ui.own.shift.report"] !== en["ui.own.shift.report"],
);
check(
  "6. Error/validation copy has Lao paths",
  lo["ui.cart.is.empty"] !== en["ui.cart.is.empty"] &&
    lo["ui.stock.insufficient"] !== en["ui.stock.insufficient"] &&
    lo["ui.permission.denied"] !== en["ui.permission.denied"] &&
    lo["ui.sale.completion.failed"] !== en["ui.sale.completion.failed"],
);

const posClient = readFileSync(resolve(process.cwd(), "features/pos/components/pos-page-client.tsx"), "utf8");
const ownShift = readFileSync(resolve(process.cwd(), "features/pos/components/own-shift-report-drawer.tsx"), "utf8");
const returnModal = readFileSync(resolve(process.cwd(), "features/pos/components/return-exchange-void-modal.tsx"), "utf8");
const cashModal = readFileSync(resolve(process.cwd(), "features/pos/components/cash-in-out-modal.tsx"), "utf8");
const saleStatus = readFileSync(resolve(process.cwd(), "features/pos/sale-status-presentation.ts"), "utf8");
const cdClient = readFileSync(resolve(process.cwd(), "features/pos/components/customer-display-client.tsx"), "utf8");
const notification = readFileSync(resolve(process.cwd(), "components/layout/notification-center.tsx"), "utf8");

check(
  "7. POS has no live Thai runtime path",
  !posClient.includes('"en" | "th"') &&
    !posClient.includes("รายงานกะ") &&
    !posClient.includes('dataset.locale === "th"') &&
    !ownShift.includes('"en" | "th"') &&
    !ownShift.includes("รายงานกะของฉัน") &&
    !ownShift.includes('dataset.locale === "th"') &&
    !notification.includes("labels.th"),
);
check(
  "8. POS UI uses tPos, Customer Display stays on t()",
  posClient.includes('from "@/lib/i18n/pos-copy"') &&
    cashModal.includes('from "@/lib/i18n/pos-copy"') &&
    saleStatus.includes('from "@/lib/i18n/pos-copy"') &&
    returnModal.includes('from "@/lib/i18n/pos-copy"') &&
    cdClient.includes('from "@/lib/i18n/ui"') &&
    !cdClient.includes("tPos") &&
    !posClient.includes("getDashboardCopy"),
);

const laoProduct = localizedProductName({ nameEn: "Water", nameLo: "Nam" }, "lo");
const enProduct = localizedProductName({ nameEn: "Water", nameLo: "Nam" }, "en");
const fallbackProduct = localizedProductName({ nameEn: "Water", nameLo: "" }, "lo");
const thProduct = localizedProductName({ nameEn: "Water", nameLo: "Nam" }, "th");
check(
  "9. Localized product names work",
  laoProduct === "Nam" && enProduct === "Water" && fallbackProduct === "Water" && thProduct === "Water",
);

check(
  "10. Legacy th POS copy is English and t() stays English for other modules",
  th["ui.shopping.cart"] === en["ui.shopping.cart"] &&
    t("ui.no.membership", "lo") === "No Membership" &&
    tPos("ui.pay", "lo") === lo["ui.pay"] &&
    tPos("ui.pay", "th") === en["ui.pay"],
);

check(
  "11. Technical English retained",
  lo["ui.card"] === "Card" &&
    lo["ui.cashier"] === "Cashier" &&
    lo["ui.qr.bank"] === "QR" &&
    lo["ui.tax"] === "Tax" &&
    fillPosCopy(en["ui.stock.insufficient"], { name: "Water", available: 1, requested: 2 }).includes("Water"),
);

check(
  "12. Interpolation helper works",
  fillPosCopy(en["ui.bill.held"], { saleNo: "S-1" }) === "Bill S-1 held.",
);

const failed = results.filter((result) => !result.ok);
console.log(`\nLAO PHASE 02 POS language: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
if (failed.length) {
  process.exit(1);
}

assert(results.length >= 8, "expected focused POS Lao checks");
