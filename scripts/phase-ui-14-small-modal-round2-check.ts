import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  if (start < 0) fail(`missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) fail(`missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const SKIP_DIR_NAMES = new Set(["node_modules", ".next", "dist", "coverage", "generated"]);
const SCAN_DIRS = ["app", "components", "features", "lib"];

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR_NAMES.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkTsFiles(full, out);
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

function findRuntimeNative(api: "confirm" | "prompt" | "alert"): string[] {
  const needle = `window.${api}(`;
  const hits: string[] = [];
  for (const dir of SCAN_DIRS) {
    const abs = resolve(process.cwd(), dir);
    try {
      statSync(abs);
    } catch {
      continue;
    }
    for (const file of walkTsFiles(abs)) {
      if (readFileSync(file, "utf8").includes(needle)) {
        hits.push(`${relative(process.cwd(), file).replaceAll("\\", "/")} ${needle}`);
      }
    }
  }
  return hits;
}

const posSmall = read("features/pos/components/pos-small-modal.tsx");
const productSmall = read("features/products/components/product-small-modal.tsx");
const appSmall = read("components/ui/app-small-modal.tsx");
const posClient = read("features/pos/components/pos-page-client.tsx");
const productForm = read("features/products/components/product-form.tsx");
const purchasing = read("features/purchasing/components/purchasing-page-client.tsx");
const membership = read("features/membership-levels/components/membership-levels-client.tsx");
const settingsForm = read("features/settings/components/settings-form.tsx");
const dashboard = read("features/dashboard/components/dashboard-interactions-client.tsx");
const inventory = read("features/inventory/components/inventory-page-client.tsx");
const customers = read("features/customers/components/customers-list-client.tsx");
const suppliers = read("features/suppliers/components/supplier-detail-client.tsx");
const promotionsList = read("features/promotions/components/promotions-list-client.tsx");
const promotionForm = read("features/promotions/components/promotion-form.tsx");
const reports = read("features/reports/components/reports-analytics-client.tsx");
const posWorkspace = read("features/pos/components/pos-workspace-modal.tsx");
const productList = read("features/products/components/product-list-client.tsx");
const productActions = read("features/products/actions.ts");
const posActions = read("features/pos/actions.ts");
const purchasingActions = read("features/purchasing/actions.ts");
const membershipActions = read("features/membership-levels/actions.ts");
const displaySettings = read("features/pos/customer-display-settings.ts");

const overlayClass = 'className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60"';
const cardClass =
  '"flex w-full max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"';
const closeClass =
  'className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground"';

const saleField = sliceBetween(posClient, "{saleFieldPrompt ? (", "{saleDeletePrompt ? (");
const saleDelete = sliceBetween(posClient, "{saleDeletePrompt ? (", "{returnExchangeOpen ? (");
const cancelPo = sliceBetween(purchasing, "{cancelOrder ? (", "function StatusActionButton(");
const levelConfirm = sliceBetween(membership, "{levelConfirm ? (", "function LevelForm(");
const settingsConfirm = sliceBetween(settingsForm, "{settingsConfirm ? (", "type BankDraft = {");
const productStatus = sliceBetween(productForm, "{statusConfirm && product ? (", "{previewSnapshot ? (");
const categoryCrud = sliceBetween(productForm, "function CategoryCrudDialog(", "function ImagePreviewDialog(");
const popup = sliceBetween(customers, "function CustomerPopup(", "function getInsightCustomers");
const detailView = sliceBetween(suppliers, "function DetailModalView(", "function PoDetail(");
const duplicate = sliceBetween(promotionsList, "function DuplicatePromotionModal(", "function ConfirmPromotionModal(");
const confirm = sliceBetween(promotionsList, "function ConfirmPromotionModal(", "function CardDetailModal(");

const confirmHits = findRuntimeNative("confirm");
const promptHits = findRuntimeNative("prompt");
const alertHits = findRuntimeNative("alert");

check(
  "1. POS edit prompt no longer uses window.prompt",
  !posClient.includes("window.prompt") &&
    saleField.includes("<PosSmallModal") &&
    saleField.includes("`Update ${saleFieldPrompt.label}`") &&
    saleField.includes("{t(\"ui.cancel\")}") &&
    saleField.includes(">Save</button>"),
);

check(
  "2. POS edit modal centered <= max-w-lg",
  saleField.includes('size="md"') &&
    saleField.includes("closeOnBackdrop={false}") &&
    saleField.includes("closeOnEscape={true}") &&
    saleField.includes('className="fixed inset-0 z-[70]"') &&
    posSmall.includes('size === "sm" ? "max-w-md" : "max-w-lg"') &&
    !saleField.includes("max-w-2xl") &&
    !saleField.includes("lg:left-72"),
);

check(
  "3. POS sale-delete reason no longer uses window.prompt",
  !posClient.includes("window.prompt") &&
    saleDelete.includes("<PosSmallModal") &&
    saleDelete.includes('title="Delete reason"') &&
    saleDelete.includes("{t(\"ui.delete\")}") &&
    saleDelete.includes("bg-danger") &&
    posClient.includes('setMessage("Delete reason is required.")'),
);

check(
  "4. POS delete reason modal centered <= max-w-lg",
  saleDelete.includes('size="md"') &&
    saleDelete.includes("closeOnBackdrop={false}") &&
    saleDelete.includes("closeOnEscape={false}") &&
    saleDelete.includes('className="fixed inset-0 z-[70]"') &&
    !saleDelete.includes("max-w-2xl") &&
    !saleDelete.includes("lg:left-72"),
);

check(
  "5. POS business actions unchanged",
  posClient.includes("demoSalesRepository.updateSale") &&
    posClient.includes("recordPosAudit(action, \"allowed\", \"not_required\"") &&
    posClient.includes('enforcePosAction("delete_sale")') &&
    posClient.includes("isPaymentMode(value)") &&
    posClient.includes("async function holdSale") &&
    posClient.includes("function completeSale()") &&
    posActions.includes("export async function completeSaleAction"),
);

check(
  "6. Cancel PO no longer uses window.confirm",
  !purchasing.includes("window.confirm") &&
    cancelPo.includes("<AppSmallModal") &&
    cancelPo.includes('t("confirmCancel")') &&
    cancelPo.includes("confirmCancelPurchase") &&
    cancelPo.includes("bg-danger") &&
    purchasing.includes("updatePurchaseStatusAction({ purchaseId: order.id, status: nextStatus })"),
);

check(
  "7. Cancel PO centered max-w-md",
  cancelPo.includes('size="sm"') &&
    cancelPo.includes("closeOnBackdrop={false}") &&
    cancelPo.includes("closeOnEscape={false}") &&
    appSmall.includes('size === "sm" ? "max-w-md"') &&
    !cancelPo.includes("max-w-2xl") &&
    !cancelPo.includes("lg:left-72") &&
    purchasingActions.includes("updatePurchaseStatusAction"),
);

check(
  "8. Membership archive no native confirm",
  !membership.includes("window.confirm") &&
    levelConfirm.includes("<AppSmallModal") &&
    levelConfirm.includes('"archiveConfirm"') &&
    levelConfirm.includes('copy("archive")') &&
    membership.includes("archiveMembershipLevelAction(level.id)"),
);

check(
  "9. Membership delete no native confirm",
  !membership.includes("window.confirm") &&
    levelConfirm.includes('"deleteConfirm"') &&
    levelConfirm.includes("bg-danger") &&
    membership.includes("deleteMembershipLevelAction(level.id)") &&
    membershipActions.includes("deleteMembershipLevelAction"),
);

check(
  "10. Membership archive/delete max-w-md centered",
  levelConfirm.includes('size="sm"') &&
    levelConfirm.includes("closeOnBackdrop={false}") &&
    levelConfirm.includes("closeOnEscape={false}") &&
    !levelConfirm.includes("max-w-2xl") &&
    !levelConfirm.includes("lg:left-72") &&
    membership.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"),
);

check(
  "11. Settings logo remove no native confirm",
  !settingsForm.includes("window.confirm") &&
    settingsConfirm.includes('settingsConfirm === "removeLogo"') &&
    settingsConfirm.includes('tSettings("removeLogoConfirm"') &&
    settingsForm.includes("clearCompanyLogoUrl()"),
);

check(
  "12. Settings CD page reset no native confirm",
  settingsConfirm.includes('settingsConfirm === "resetThisPage"') &&
    settingsConfirm.includes('tSettings("resetThisPageConfirm"') &&
    settingsConfirm.includes('tSettings("resetThisPage"') &&
    settingsForm.includes("resetCustomerDisplayAppearanceSettings(displaySettings)"),
);

check(
  "13. Settings CD reset-all no native confirm",
  settingsConfirm.includes('settingsConfirm === "resetAll"') &&
    settingsConfirm.includes('tSettings("resetAllCustomerDisplayConfirm"') &&
    settingsConfirm.includes('tSettings("resetAllCustomerDisplay"') &&
    settingsConfirm.includes('tSettings("resetAllCustomerDisplayHelp"') &&
    settingsForm.includes("resetAllCustomerDisplaySettings()") &&
    displaySettings.includes("export function resetAllCustomerDisplaySettings"),
);

check(
  "14. Settings confirms max-w-md centered and distinguishable",
  settingsConfirm.includes('size="sm"') &&
    settingsConfirm.includes("closeOnBackdrop={false}") &&
    settingsConfirm.includes("closeOnEscape={false}") &&
    settingsConfirm.includes("bg-danger") &&
    !settingsConfirm.includes("max-w-2xl") &&
    settingsForm.includes('title={tSettings("deleteBankTitle"') &&
    settingsForm.includes('title={tSettings("deleteQrAccountTitle"') &&
    settingsForm.includes('title={tSettings("qrPreview"'),
);

check(
  "15. Products archive/delete confirmation present",
  productStatus.includes("<ProductSmallModal") &&
    productForm.includes('setStatusConfirm("archive")') &&
    productForm.includes('setStatusConfirm("delete")') &&
    productForm.includes("function changeProductStatus(action: \"archive\" | \"delete\")") &&
    productForm.includes("archiveProductAction(product.id)") &&
    productForm.includes("deleteProductAction(product.id)") &&
    productActions.includes("export async function archiveProductAction") &&
    productActions.includes("export async function deleteProductAction"),
);

check(
  "16. Products archive/delete uses centered Product small-modal contract",
  productStatus.includes('size="sm"') &&
    productStatus.includes("closeOnBackdrop={false}") &&
    productStatus.includes("closeOnEscape={false}") &&
    productStatus.includes("bg-danger") &&
    productStatus.includes("{t(\"archive\")}") &&
    productStatus.includes("{t(\"delete\")}") &&
    productSmall.includes(overlayClass) &&
    !productStatus.includes("max-w-2xl") &&
    !productStatus.includes("lg:left-72") &&
    categoryCrud.includes("<ProductSmallModal"),
);

check(
  "17. no runtime window.alert",
  alertHits.length === 0,
  alertHits.join("; "),
);

check(
  "18. no unintended runtime window.confirm",
  confirmHits.length === 0,
  confirmHits.join("; "),
);

check(
  "19. no unintended runtime window.prompt",
  promptHits.length === 0,
  promptHits.join("; "),
);

check(
  "20. approved POS Small unchanged",
  posSmall.includes(overlayClass) &&
    posSmall.includes(cardClass) &&
    posSmall.includes(closeClass) &&
    posSmall.includes("bg-black/60") &&
    posSmall.includes("fixed inset-0 z-50") &&
    !posSmall.includes("max-w-2xl") &&
    posClient.includes('import { PosSmallModal } from "@/features/pos/components/pos-small-modal"') &&
    !posClient.includes("AppSmallModal"),
);

check(
  "21. approved Products Small unchanged",
  productSmall.includes(overlayClass) &&
    productSmall.includes(cardClass) &&
    productSmall.includes(closeClass) &&
    productSmall.includes('size === "sm" ? "max-w-md" : size === "xl" ? "max-w-xl" : "max-w-lg"') &&
    !productSmall.includes("max-w-2xl") &&
    productForm.includes('import { ProductSmallModal } from "@/features/products/components/product-small-modal"') &&
    !productForm.includes("AppSmallModal"),
);

check(
  "22. Round 1 custom surfaces unchanged",
  popup.includes('"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"') &&
    detailView.includes('"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"') &&
    duplicate.includes('size="xl"') &&
    confirm.includes('size="sm"') &&
    confirm.includes("bg-danger") &&
    appSmall.includes(overlayClass) &&
    !appSmall.includes("max-w-2xl"),
);

check(
  "23. approved Large Drawers unchanged",
  posWorkspace.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"') &&
    membership.includes("fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72") &&
    productList.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"') &&
    dashboard.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"'),
);

check(
  "24. Dashboard has no compact overlay / native dialog",
  !dashboard.includes("fixed inset-0") &&
    !dashboard.includes("window.confirm") &&
    !dashboard.includes("AppSmallModal"),
);

check(
  "25. Inventory has no compact overlay / native dialog",
  !inventory.includes("fixed inset-0") &&
    !inventory.includes("window.confirm") &&
    !inventory.includes("AppSmallModal") &&
    !inventory.includes("place-items-center bg-black"),
);

check(
  "26. Reports has no compact overlay / native dialog",
  !reports.includes("place-items-center bg-black") &&
    !reports.includes("window.confirm") &&
    !reports.includes("AppSmallModal"),
);

console.log("\nphase-ui-14-small-modal-round2-check: PASS");
