import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localizedProductName } from "../features/pos/product-display-name";
import {
  fillPurchasingCopy,
  getPurchasingCopy,
  localizePurchasingError,
  payableStatusLabel,
  purchaseStatusLabel,
  purchasingCopyHasNoReplacementChars,
  purchasingCopyKeyParity,
  tPurchasing,
} from "../lib/i18n/purchasing-copy";

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

const en = getPurchasingCopy("en");
const lo = getPurchasingCopy("lo");
const th = getPurchasingCopy("th");

const pageClient = readFileSync(resolve(process.cwd(), "features/purchasing/components/purchasing-page-client.tsx"), "utf8");
const poForm = readFileSync(resolve(process.cwd(), "features/purchasing/components/purchase-order-form.tsx"), "utf8");
const receiving = readFileSync(resolve(process.cwd(), "features/purchasing/components/receiving-page-client.tsx"), "utf8");
const payables = readFileSync(resolve(process.cwd(), "features/purchasing/components/payables-page-client.tsx"), "utf8");
const suppliers = readFileSync(resolve(process.cwd(), "features/purchasing/components/suppliers-page-client.tsx"), "utf8");
const statusBadges = readFileSync(resolve(process.cwd(), "features/purchasing/components/purchasing-status.tsx"), "utf8");
const purchasingPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/purchasing/page.tsx"), "utf8");
const newPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/purchasing/new/page.tsx"), "utf8");
const receivingPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/purchasing/receiving/page.tsx"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "components/layout/dashboard-shell.tsx"), "utf8");
const inventoryPage = readFileSync(resolve(process.cwd(), "features/inventory/components/inventory-page-client.tsx"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "features/purchasing/actions.ts"), "utf8");
const repository = readFileSync(resolve(process.cwd(), "features/purchasing/prisma-repository.ts"), "utf8");
const purchaseStatus = readFileSync(resolve(process.cwd(), "features/purchasing/purchase-status.ts"), "utf8");
const mapper = readFileSync(resolve(process.cwd(), "features/purchasing/dto-mapper.ts"), "utf8");
const customersPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/customers/page.tsx"), "utf8");
const standaloneSuppliers = readFileSync(resolve(process.cwd(), "app/(dashboard)/suppliers/page.tsx"), "utf8");
const reportsPurchasing = readFileSync(resolve(process.cwd(), "app/(dashboard)/reports/purchasing/page.tsx"), "utf8");

const thaiUi = /Thai|nameTh|locale === ["']th["']|"en" \| "th"|updateLocale\(["']th["']\)/i;
const visibleThai = /[\u0E00-\u0E7F]/;
const purchasingUiFiles = [pageClient, poForm, receiving, payables, suppliers, statusBadges, purchasingPage, newPage, receivingPage];

const headerNewPo = /className="inline-flex h-12[\s\S]*?href="\/purchasing\/new"[\s\S]*?(New Purchase Order|t\("newPurchaseOrder"\))/;
const headerReceive = /className="inline-flex h-12[\s\S]*?href="\/purchasing\/receiving"[\s\S]*?(Receive Goods|t\("receiveGoods"\))/;
const lowerNewPo = /className="inline-flex min-h-16[\s\S]*?href="\/purchasing\/new"/;
const lowerReceive = /className="inline-flex min-h-16[\s\S]*?href="\/purchasing\/receiving"/;

check(
  "1. Top duplicate New Purchase Order and Receive Goods are gone",
  !headerNewPo.test(pageClient) &&
    !headerReceive.test(pageClient) &&
    !pageClient.includes('className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary') &&
    !pageClient.includes('className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border px-5'),
);

check(
  "2. Lower New Purchase Order and Receive Goods remain",
  lowerNewPo.test(pageClient) &&
    lowerReceive.test(pageClient) &&
    pageClient.includes('href="/purchasing/new"') &&
    pageClient.includes('href="/purchasing/receiving"') &&
    pageClient.includes('t("newPurchaseOrder")') &&
    pageClient.includes('t("receiveGoods")') &&
    (pageClient.match(/href="\/purchasing\/new"/g) || []).length === 1 &&
    (pageClient.match(/href="\/purchasing\/receiving"/g) || []).length >= 1,
);

check(
  "3. Lower Pay Supplier and Supplier List remain",
  pageClient.includes('href="/purchasing/payables"') &&
    pageClient.includes('href="/purchasing/suppliers"') &&
    pageClient.includes('t("paySupplier")') &&
    pageClient.includes('t("supplierList")'),
);

check(
  "4. Purchasing Lao copy coverage",
  Boolean(
    lo.purchasing &&
      lo.purchasingSubtitle &&
      lo.newPurchaseOrder &&
      lo.receiveGoods &&
      lo.purchaseOrders &&
      lo.receivingGoods &&
      lo.supplier &&
      lo.addAtLeastOneLine &&
      lo.goodsReceivedSuccessfully &&
      lo.permissionDenied,
  ),
);

check("5. Purchasing EN/LO key parity", purchasingCopyKeyParity());

check(
  "6. No live Thai Purchasing path",
  !Object.values(lo).some((value) => visibleThai.test(value)) &&
    th.purchasing === en.purchasing &&
    tPurchasing("purchasing", "th") === en.purchasing &&
    purchasingUiFiles.every((source) => !thaiUi.test(source) && !visibleThai.test(source)) &&
    !pageClient.includes('"en" | "th"') &&
    !poForm.includes('"en" | "th"') &&
    !payables.includes('"en" | "th"') &&
    !suppliers.includes('"en" | "th"'),
);

check(
  "7. Sidebar Purchasing label is localized",
  shell.includes('tPurchasing("purchasing", "en")') &&
    shell.includes('tPurchasing("purchasing", "lo")') &&
    en.purchasing === "Purchasing" &&
    lo.purchasing === "ຈັດຊື້" &&
    lo.purchasing.charCodeAt(0) === 0x0e88,
);

check(
  "8. PO form has Lao copy",
  lo.newPurchaseOrderTitle !== en.newPurchaseOrderTitle &&
    lo.orderDetails !== en.orderDetails &&
    lo.addAtLeastOneLine !== en.addAtLeastOneLine &&
    lo.save !== en.save &&
    poForm.includes('from "@/lib/i18n/purchasing-copy"') &&
    !poForm.includes('from "@/lib/i18n/ui"') &&
    poForm.includes('t("newPurchaseOrderTitle")') &&
    poForm.includes('t("newPurchaseOrderSubtitle")') &&
    poForm.includes('t("addAtLeastOneLine")') &&
    poForm.includes("localizedProductName"),
);

check(
  "9. Goods Receiving has Lao copy",
  lo.receivingGoods !== en.receivingGoods &&
    lo.saveReceive !== en.saveReceive &&
    lo.enterReceiveQuantity !== en.enterReceiveQuantity &&
    lo.goodsReceivedSuccessfully !== en.goodsReceivedSuccessfully &&
    receiving.includes('from "@/lib/i18n/purchasing-copy"') &&
    !receiving.includes('from "@/lib/i18n/ui"') &&
    receiving.includes('t("receivingGoods")') &&
    receiving.includes('t("saveReceive")') &&
    receiving.includes("localizedProductName"),
);

check(
  "10. Validation and errors have Lao copy",
  lo.addAtLeastOneLine !== en.addAtLeastOneLine &&
    lo.enterReceiveQuantity !== en.enterReceiveQuantity &&
    lo.goodsReceivingFailed !== en.goodsReceivingFailed &&
    lo.permissionDenied !== en.permissionDenied &&
    lo.receivedQtyExceedsRemaining !== en.receivedQtyExceedsRemaining &&
    localizePurchasingError("Add at least one product line.", "lo") === lo.addAtLeastOneLine &&
    localizePurchasingError("Goods receiving failed.", "lo") === lo.goodsReceivingFailed &&
    localizePurchasingError("Permission denied: purchasing.create", "lo") === lo.permissionDenied &&
    localizePurchasingError("Receipt quantity exceeds remaining quantity for product x.", "lo") ===
      lo.receivedQtyExceedsRemaining &&
    poForm.includes("localizePurchasingError") &&
    receiving.includes("localizePurchasingError"),
);

check(
  "11. Inventory entry points still route to Purchasing",
  inventoryPage.includes('href="/purchasing/new"') &&
    inventoryPage.includes('href="/purchasing/receiving"') &&
    !inventoryPage.includes("purchasing-copy") &&
    newPage.includes("PurchaseOrderForm") &&
    receivingPage.includes("ReceivingPageClient"),
);

check(
  "12. Purchasing business behavior remains unchanged",
  !actions.includes("purchasing-copy") &&
    !repository.includes("purchasing-copy") &&
    !repository.includes("tPurchasing") &&
    !purchaseStatus.includes("purchasing-copy") &&
    actions.includes("createPurchaseOrderAction") &&
    actions.includes("receiveGoodsAction") &&
    actions.includes("updatePurchaseStatusAction") &&
    purchaseStatus.includes('send: "ordered"') &&
    purchaseStatus.includes('cancel: "cancelled"') &&
    mapper.includes("productNameEn") &&
    mapper.includes("productNameLo") &&
    !customersPage.includes("purchasing-copy") &&
    !standaloneSuppliers.includes("purchasing-copy") &&
    !reportsPurchasing.includes("purchasing-copy") &&
    lo.sku === "SKU" &&
    lo.barcode === "Barcode" &&
    lo.po === "PO" &&
    lo.lot === "lot" &&
    purchasingCopyHasNoReplacementChars() &&
    purchaseStatusLabel("partial", "lo") === lo.statusPartial &&
    payableStatusLabel("unpaid", "lo") === lo.statusUnpaid &&
    fillPurchasingCopy(en.confirmCancel, { no: "PO-1" }) === "Cancel PO-1?" &&
    localizedProductName({ nameEn: "Water", nameLo: "ນ້ຳ" }, "lo") === "ນ້ຳ" &&
    localizedProductName({ nameEn: "Water", nameLo: "" }, "lo") === "Water",
);

const failed = results.filter((result) => !result.ok);
console.log(
  `\nLAO PHASE 05 Purchasing language: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`,
);
if (failed.length) {
  process.exit(1);
}

assert(results.length >= 12, "expected focused Purchasing Lao checks");
