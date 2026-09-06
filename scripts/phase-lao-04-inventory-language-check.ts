import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { localizedProductName } from "../features/pos/product-display-name";
import {
  STOCK_COUNT_CHANGED_MESSAGE,
  STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE,
} from "../features/inventory/stock-count-errors";
import {
  fillInventoryCopy,
  getInventoryCopy,
  inventoryCopyHasNoReplacementChars,
  inventoryCopyKeepsMimeAccept,
  inventoryCopyKeyParity,
  inventoryMovementLabel,
  inventoryStockFilterLabel,
  localizeInventoryError,
  tInventory,
} from "../lib/i18n/inventory-copy";
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

const en = getInventoryCopy("en");
const lo = getInventoryCopy("lo");
const th = getInventoryCopy("th");

const pageClient = readFileSync(resolve(process.cwd(), "features/inventory/components/inventory-page-client.tsx"), "utf8");
const dashboardCards = readFileSync(resolve(process.cwd(), "features/inventory/components/inventory-dashboard-cards.tsx"), "utf8");
const alertLists = readFileSync(resolve(process.cwd(), "features/inventory/components/inventory-alert-lists.tsx"), "utf8");
const overviewTable = readFileSync(resolve(process.cwd(), "features/inventory/components/stock-overview-table.tsx"), "utf8");
const movementHistory = readFileSync(resolve(process.cwd(), "features/inventory/components/stock-movement-history.tsx"), "utf8");
const actionForm = readFileSync(resolve(process.cwd(), "features/inventory/components/inventory-action-form.tsx"), "utf8");
const quickStockIn = readFileSync(resolve(process.cwd(), "features/inventory/components/quick-stock-in-form.tsx"), "utf8");
const warehouseSelector = readFileSync(resolve(process.cwd(), "features/inventory/components/warehouse-selector.tsx"), "utf8");
const inventoryStatus = readFileSync(resolve(process.cwd(), "features/inventory/components/inventory-status.tsx"), "utf8");
const inventoryPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/inventory/page.tsx"), "utf8");
const inventoryLoading = readFileSync(resolve(process.cwd(), "app/(dashboard)/inventory/loading.tsx"), "utf8");
const adjustmentPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/inventory/adjustment/page.tsx"), "utf8");
const countPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/inventory/count/page.tsx"), "utf8");
const stockInPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/inventory/stock-in/page.tsx"), "utf8");
const quickStockInPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/inventory/quick-stock-in/page.tsx"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "components/layout/dashboard-shell.tsx"), "utf8");
const mapper = readFileSync(resolve(process.cwd(), "features/inventory/dto-mapper.ts"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "features/inventory/actions.ts"), "utf8");
const repository = readFileSync(resolve(process.cwd(), "features/inventory/prisma-repository.ts"), "utf8");
const reportsInventory = readFileSync(resolve(process.cwd(), "app/(dashboard)/reports/inventory/page.tsx"), "utf8");
const customersPage = readFileSync(resolve(process.cwd(), "app/(dashboard)/customers/page.tsx"), "utf8");
const settingsForm = readFileSync(resolve(process.cwd(), "features/settings/components/settings-form.tsx"), "utf8");

const thaiUi = /Thai|nameTh|locale === ["']th["']|"en" \| "th"|updateLocale\(["']th["']\)/i;
const visibleThai = /[\u0E00-\u0E7F]/;
const inventoryUiFiles = [
  pageClient,
  dashboardCards,
  alertLists,
  overviewTable,
  movementHistory,
  actionForm,
  quickStockIn,
  warehouseSelector,
  inventoryStatus,
  inventoryPage,
  inventoryLoading,
  adjustmentPage,
  countPage,
  stockInPage,
  quickStockInPage,
];

check(
  "1. Inventory has Lao copy coverage",
  Boolean(
    lo.inventory &&
      lo.inventorySubtitle &&
      lo.totalProducts &&
      lo.lowStock &&
      lo.outOfStock &&
      lo.expiringSoon &&
      lo.deadStock &&
      lo.stockAdjustment &&
      lo.stockCount &&
      lo.quickStockIn &&
      lo.stockMovementHistory &&
      lo.quantityMustBePositive,
  ),
);

check("2. Inventory EN/LO key parity", inventoryCopyKeyParity());

check(
  "3. No live Thai Inventory path",
  !Object.values(lo).some((value) => visibleThai.test(value)) &&
    th.inventory === en.inventory &&
    tInventory("inventory", "th") === en.inventory &&
    inventoryUiFiles.every((source) => !thaiUi.test(source) && !visibleThai.test(source)) &&
    !pageClient.includes('"en" | "th"') &&
    !actionForm.includes('"en" | "th"') &&
    !quickStockIn.includes('"en" | "th"'),
);

check(
  "4. No raw missing Inventory translation keys",
  !Object.entries(lo).some(([key, value]) => value === key) &&
    inventoryCopyHasNoReplacementChars() &&
    inventoryCopyKeepsMimeAccept() &&
    lo.acceptImages === en.acceptImages &&
    lo.sku === "SKU" &&
    lo.barcode === "Barcode" &&
    lo.lotNumber === "Lot Number" &&
    lo.category === "ໝວດ" &&
    lo.category.charCodeAt(0) === 0x0edd,
);

check(
  "5. Inventory actions/modals have Lao copy",
  lo.stockAdjustment !== en.stockAdjustment &&
    lo.stockCount !== en.stockCount &&
    lo.quickStockIn !== en.quickStockIn &&
    lo.adjustmentReason !== en.adjustmentReason &&
    lo.countedQuantity !== en.countedQuantity &&
    lo.confirmStockIn !== en.confirmStockIn &&
    lo.save !== en.save &&
    lo.cancel !== en.cancel &&
    actionForm.includes('from "@/lib/i18n/inventory-copy"') &&
    quickStockIn.includes('from "@/lib/i18n/inventory-copy"') &&
    pageClient.includes('from "@/lib/i18n/inventory-copy"') &&
    !actionForm.includes('from "@/lib/i18n/ui"') &&
    !quickStockIn.includes('from "@/lib/i18n/ui"') &&
    !pageClient.includes('from "@/lib/i18n/ui"') &&
    actionForm.includes('t("stockAdjustment")') &&
    actionForm.includes('t("stockCount")') &&
    actionForm.includes('t("adjustmentReasonRequired")') &&
    quickStockIn.includes('t("confirmStockIn")') &&
    shell.includes('tInventory("inventory", "lo")'),
);

check(
  "6. Inventory validation/errors have Lao copy",
  lo.quantityMustBePositive !== en.quantityMustBePositive &&
    lo.warehouseRequired !== en.warehouseRequired &&
    lo.adjustmentFailed !== en.adjustmentFailed &&
    lo.countFailed !== en.countFailed &&
    lo.permissionDenied !== en.permissionDenied &&
    lo.stockCountChanged !== en.stockCountChanged &&
    localizeInventoryError("Quantity must be greater than zero.", "lo") === lo.quantityMustBePositive &&
    localizeInventoryError("Warehouse is required.", "lo") === lo.warehouseRequired &&
    localizeInventoryError("Stock Adjustment failed.", "lo") === lo.adjustmentFailed &&
    localizeInventoryError("Stock Count failed.", "lo") === lo.countFailed &&
    localizeInventoryError("Permission denied: inventory.adjust", "lo") === lo.permissionDenied &&
    localizeInventoryError(STOCK_COUNT_CHANGED_MESSAGE, "lo") === lo.stockCountChanged &&
    localizeInventoryError(STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE, "lo") === lo.stockCountLotUnsupported &&
    actionForm.includes("localizeInventoryError") &&
    quickStockIn.includes("localizeInventoryError"),
);

const laoProduct = localizedProductName({ nameEn: "Water", nameLo: "ນ້ຳ" }, "lo");
const enProduct = localizedProductName({ nameEn: "Water", nameLo: "ນ້ຳ" }, "en");
const fallbackProduct = localizedProductName({ nameEn: "Water", nameLo: "" }, "lo");
const thProduct = localizedProductName({ nameEn: "Water", nameLo: "ນ້ຳ" }, "th");
const laoCategory = localizedProductName({ nameEn: "Drinks", nameLo: lo.category }, "lo");
const fallbackCategory = localizedProductName({ nameEn: "Drinks", nameLo: "" }, "lo");

check(
  "7. Product/category localized-name fallback works",
  laoProduct === "ນ້ຳ" &&
    enProduct === "Water" &&
    fallbackProduct === "Water" &&
    thProduct === "Water" &&
    laoCategory === lo.category &&
    fallbackCategory === "Drinks" &&
    pageClient.includes("localizedProductName") &&
    overviewTable.includes("localizedProductName") &&
    overviewTable.includes("categoryNameEn") &&
    mapper.includes("categoryNameEn") &&
    mapper.includes("categoryNameLo") &&
    mapper.includes("productNameEn") &&
    mapper.includes("productNameLo"),
);

check(
  "8. Existing Inventory business behavior remains unchanged",
  !actions.includes("inventory-copy") &&
    !repository.includes("inventory-copy") &&
    !repository.includes("tInventory") &&
    actions.includes("stockAdjustmentAction") &&
    actions.includes("stockCountAction") &&
    actions.includes("stockInAction") &&
    actionForm.includes("expectedSystemQuantity: selectedItem.quantity") &&
    actionForm.includes("STOCK_COUNT_CHANGED_MESSAGE") &&
    actionForm.includes("STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE") &&
    quickStockIn.includes("function generateClientStockInNo()") &&
    quickStockIn.includes("setStockInNo((current) => current || generateClientStockInNo())") &&
    !quickStockIn.includes("useState(generateClientStockInNo)") &&
    inventoryPage.includes("getInventoryListPage") &&
    inventoryLoading.includes("loadingInventory") &&
    reportsInventory.includes('from "@/lib/i18n/ui"') &&
    !reportsInventory.includes("inventory-copy") &&
    !customersPage.includes("inventory-copy") &&
    !settingsForm.includes("inventory-copy") &&
    fillInventoryCopy(en.showingRange, { from: 1, to: 25, total: 100 }) === "Showing 1-25 of 100" &&
    inventoryMovementLabel("transfer_in", "lo") === lo.movementTransferIn &&
    inventoryStockFilterLabel("low_stock", "lo") === lo.filterLowStock &&
    t("ui.no.membership", "lo") === "No Membership",
);

const failed = results.filter((result) => !result.ok);
console.log(
  `\nLAO PHASE 04 Inventory language: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`,
);
if (failed.length) {
  process.exit(1);
}

assert(results.length >= 8, "expected focused Inventory Lao checks");
