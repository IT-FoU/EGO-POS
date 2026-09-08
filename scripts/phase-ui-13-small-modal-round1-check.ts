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

function sliceBetween(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  if (start < 0) fail(`missing start marker: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  if (end < 0) fail(`missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const shell = read("components/ui/app-small-modal.tsx");
const customers = read("features/customers/components/customers-list-client.tsx");
const supplierDetail = read("features/suppliers/components/supplier-detail-client.tsx");
const promotionsList = read("features/promotions/components/promotions-list-client.tsx");
const promotionForm = read("features/promotions/components/promotion-form.tsx");
const settingsForm = read("features/settings/components/settings-form.tsx");
const posSmall = read("features/pos/components/pos-small-modal.tsx");
const productSmall = read("features/products/components/product-small-modal.tsx");
const posClient = read("features/pos/components/pos-page-client.tsx");
const productForm = read("features/products/components/product-form.tsx");
const dashboard = read("features/dashboard/components/dashboard-interactions-client.tsx");
const reports = read("features/reports/components/reports-analytics-client.tsx");
const posWorkspace = read("features/pos/components/pos-workspace-modal.tsx");

const overlayClass = 'className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60"';
const largeOverlay = '"fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/60 lg:left-72"';
const largePanel = '"flex h-full w-full max-w-none flex-col overflow-hidden border-l border-border bg-card shadow-2xl"';

const popup = sliceBetween(customers, "function CustomerPopup(", "function getInsightCustomers");
const detailView = sliceBetween(supplierDetail, "function DetailModalView(", "function PoDetail(");
const duplicate = sliceBetween(promotionsList, "function DuplicatePromotionModal(", "function ConfirmPromotionModal(");
const confirm = sliceBetween(promotionsList, "function ConfirmPromotionModal(", "function CardDetailModal(");
const qr = sliceBetween(promotionForm, "function QrPreviewModal(", "function ValidationErrorModal(");
const validation = sliceBetween(promotionForm, "function ValidationErrorModal(", "function buildLivePosPreview(");

check(
  "1. Customers Import/Export no longer use centered max-w-3xl",
  popup.includes('modal.type === "import"') &&
    popup.includes('modal.type === "export"') &&
    !popup.includes("max-w-3xl") &&
    !popup.includes("place-items-center"),
);

check(
  "2. Customers Import/Export use lg:left-72 / full shell",
  popup.includes(largeOverlay) &&
    popup.includes(largePanel) &&
    popup.includes("lg:left-72") &&
    customers.includes('t("selectCsvExcel")') &&
    customers.includes('t("exportCsv")'),
);

check(
  "3. Supplier PO/Receiving/Payment/Ledger details use Large Drawer",
  detailView.includes(largeOverlay) &&
    detailView.includes(largePanel) &&
    detailView.includes('modal.kind === "po"') &&
    detailView.includes('modal.kind === "receiving"') &&
    detailView.includes('modal.kind === "payment"') &&
    detailView.includes('modal.kind === "ledger"') &&
    !detailView.includes("max-w-3xl"),
);

check(
  "4. Record Payment placeholder is centered <= max-w-lg",
  detailView.includes('modal.kind === "payment_placeholder"') &&
    detailView.includes("<AppSmallModal") &&
    detailView.includes('size="md"') &&
    shell.includes('size === "sm" ? "max-w-md" : size === "xl" ? "max-w-xl" : "max-w-lg"') &&
    !detailView.includes('size="xl"'),
);

check(
  "5. Promotions Duplicate is centered <= max-w-xl",
  duplicate.includes("<AppSmallModal") &&
    duplicate.includes('size="xl"') &&
    duplicate.includes("closeOnBackdrop={false}") &&
    !duplicate.includes("lg:left-72"),
);

check(
  "6. Promotions Confirm is max-w-md",
  confirm.includes("<AppSmallModal") &&
    confirm.includes('size="sm"') &&
    confirm.includes("closeOnBackdrop={false}") &&
    confirm.includes("closeOnEscape={false}") &&
    confirm.includes("bg-danger"),
);

check(
  "7. Promotions QR is max-w-md with Escape/backdrop",
  qr.includes("<AppSmallModal") &&
    qr.includes('size="sm"') &&
    qr.includes("closeOnBackdrop={true}") &&
    qr.includes("closeOnEscape={true}"),
);

check(
  "8. Promotions Validation is centered <= max-w-xl",
  validation.includes("<AppSmallModal") &&
    (validation.includes('size="md"') || validation.includes('size="xl"')) &&
    !validation.includes("max-w-2xl") &&
    validation.includes("closeOnBackdrop={true}"),
);

check(
  "9. Settings Delete Bank / Delete QR / QR preview sizes",
  settingsForm.includes("<AppSmallModal") &&
    settingsForm.includes('title={tSettings("deleteBankTitle"') &&
    settingsForm.includes('title={tSettings("deleteQrAccountTitle"') &&
    settingsForm.includes('title={tSettings("qrPreview"') &&
    !settingsForm.includes("function SettingsDialog(") &&
    !settingsForm.includes("max-w-2xl") &&
    settingsForm.includes('size="sm"') &&
    settingsForm.includes("closeOnBackdrop={false}") &&
    settingsForm.includes("closeOnBackdrop={true}"),
);

check(
  "10. shared remaining Small Modal chrome",
  shell.includes(overlayClass) &&
    shell.includes("bg-black/60") &&
    shell.includes("z-50") &&
    shell.includes('role="dialog"') &&
    shell.includes('aria-modal="true"') &&
    promotionsList.includes('import { AppSmallModal } from "@/components/ui/app-small-modal"') &&
    settingsForm.includes('import { AppSmallModal } from "@/components/ui/app-small-modal"'),
);

check(
  "11. POS and Products approved Small Modals unchanged",
  posSmall.includes(overlayClass) &&
    productSmall.includes(overlayClass) &&
    posClient.includes('import { PosSmallModal } from "@/features/pos/components/pos-small-modal"') &&
    productForm.includes('import { ProductSmallModal } from "@/features/products/components/product-small-modal"') &&
    !posClient.includes("AppSmallModal") &&
    !productForm.includes("AppSmallModal") &&
    posWorkspace.includes('className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"'),
);

check(
  "12. no-change modules remain",
  !dashboard.includes("fixed inset-0") &&
    !reports.includes("place-items-center bg-black") &&
    dashboard.includes('className="fixed inset-y-0 left-0 right-0 z-50 overflow-x-hidden bg-black/45 lg:left-72"'),
);

console.log("\nphase-ui-13-small-modal-round1-check: PASS");
