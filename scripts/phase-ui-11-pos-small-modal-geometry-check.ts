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
  const from = start + startNeedle.length;
  const end = source.indexOf(endNeedle, from);
  if (end < 0) fail(`missing end marker after ${startNeedle}: ${endNeedle}`);
  return source.slice(start, end);
}

const shell = read("features/pos/components/pos-small-modal.tsx");
const posClient = read("features/pos/components/pos-page-client.tsx");
const frame = read("features/pos/components/pos-workspace-modal.tsx");
const ownShift = read("features/pos/components/own-shift-report-drawer.tsx");
const cashInOut = read("features/pos/components/cash-in-out-modal.tsx");
const returnExchange = read("features/pos/components/return-exchange-void-modal.tsx");
const posActions = read("features/pos/actions.ts");

const overlayClass = 'className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60"';
const cardClass =
  '"flex w-full max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"';
const closeClass =
  'className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground"';
const largeOverlay =
  'className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"';

const unitSelector = sliceBetween(posClient, "function UnitSelectorModal(", "function ActionButton(");
const mixedPayment = sliceBetween(posClient, "function MixedPaymentModal(", "function SaleCompletedModal(");
const saleCompleted = sliceBetween(posClient, "function SaleCompletedModal(", "function ManagerApprovalModal(");

check(
  "1. Unit Selector is centered",
  posClient.includes('import { PosSmallModal } from "@/features/pos/components/pos-small-modal"') &&
    unitSelector.includes("<PosSmallModal") &&
    unitSelector.includes('size="md"') &&
    shell.includes(overlayClass) &&
    shell.includes("place-items-center") &&
    !unitSelector.includes("lg:left-72") &&
    !unitSelector.includes("inset-y-0"),
);

check(
  "2. Unit Selector uses bg-black/60",
  shell.includes("bg-black/60") &&
    !shell.includes("bg-black/70") &&
    !unitSelector.includes("bg-black/70"),
);

check(
  "3. Unit Selector uses z-50",
  shell.includes("fixed inset-0 z-50") &&
    !shell.includes("z-40") &&
    !unitSelector.includes("z-40"),
);

check(
  "4. Unit Selector uses max-w-lg",
  unitSelector.includes('size="md"') &&
    shell.includes('size === "sm" ? "max-w-md" : "max-w-lg"') &&
    !unitSelector.includes("max-w-2xl") &&
    !unitSelector.includes("max-w-md"),
);

check(
  "5. Mixed Payment is centered",
  mixedPayment.includes("<PosSmallModal") &&
    mixedPayment.includes('size="md"') &&
    !mixedPayment.includes("flex items-center justify-center") &&
    !mixedPayment.includes("lg:left-72"),
);

check(
  "6. Mixed Payment uses the same overlay/chrome family",
  mixedPayment.includes("<PosSmallModal") &&
    shell.includes(overlayClass) &&
    shell.includes(cardClass) &&
    shell.includes(closeClass) &&
    shell.includes("rounded-lg") &&
    shell.includes("border border-border") &&
    shell.includes("bg-card") &&
    shell.includes("shadow-2xl"),
);

check(
  "7. Mixed Payment remains max-w-lg",
  mixedPayment.includes('size="md"') &&
    !mixedPayment.includes("max-w-2xl") &&
    !mixedPayment.includes('size="sm"') &&
    mixedPayment.includes('setPaymentMode("mixed")') &&
    mixedPayment.includes("{t(\"ui.apply.mixed.payment\")}"),
);

check(
  "8. Sale Completed is centered",
  saleCompleted.includes("<PosSmallModal") &&
    saleCompleted.includes('size="sm"') &&
    !saleCompleted.includes("flex items-center justify-center") &&
    !saleCompleted.includes("lg:left-72"),
);

check(
  "9. Sale Completed uses max-w-md",
  saleCompleted.includes('size="sm"') &&
    shell.includes('size === "sm" ? "max-w-md" : "max-w-lg"') &&
    !saleCompleted.includes("max-w-lg") &&
    !saleCompleted.includes("max-w-2xl"),
);

check(
  "10. Sale Completed uses z-50",
  saleCompleted.includes("<PosSmallModal") &&
    shell.includes("z-50") &&
    !saleCompleted.includes("z-40") &&
    !shell.includes("z-40"),
);

check(
  "11. all three use role=dialog / aria-modal",
  shell.includes('role="dialog"') &&
    shell.includes('aria-modal="true"') &&
    unitSelector.includes("<PosSmallModal") &&
    mixedPayment.includes("<PosSmallModal") &&
    saleCompleted.includes("<PosSmallModal"),
);

check(
  "12. all three share consistent close/header styling",
  shell.includes(closeClass) &&
    shell.includes("text-lg font-semibold") &&
    shell.includes("<X className=\"size-4\" aria-hidden=\"true\" />") &&
    unitSelector.includes("closeAriaLabel={t(\"ui.close.unit.selector\")}") &&
    !unitSelector.includes("grid size-9") &&
    !mixedPayment.includes("grid size-9") &&
    !saleCompleted.includes("grid size-9"),
);

check(
  "13. no POS Large Drawer geometry changed",
  frame.includes(largeOverlay) &&
    frame.includes("lg:left-72") &&
    !frame.includes("fixed inset-0") &&
    posClient.includes("return <PosWorkspaceModal onClose={onClose} title={title}>{children}</PosWorkspaceModal>;") &&
    posClient.includes('<PosWorkspaceModal onClose={onClose} title={t("ui.recent.sales")}>') &&
    posClient.includes('<PosWorkspaceModal headerClassName="print:hidden" onClose={onClose} title={t("ui.receipt.preview")}>') &&
    ownShift.includes("<PosWorkspaceModal") &&
    cashInOut.includes('<PosWorkspaceModal onClose={onClose} title={t("ui.cash.in.cash.out")}>') &&
    returnExchange.includes("<PosWorkspaceModal onClose={onClose} title={tPos(\"ui.return.exchange.void\")}>"),
);

check(
  "14. POS checkout/payment/business logic unchanged",
  posClient.includes("async function holdSale") &&
    posClient.includes("async function resumeSale") &&
    posClient.includes("function completeSale()") &&
    posClient.includes("function addToCart(product: PosProduct, selectedUnit?: PosProductUnit)") &&
    mixedPayment.includes('setPaymentMode("mixed")') &&
    unitSelector.includes("onSelect(unit)") &&
    saleCompleted.includes("{t(\"ui.print.receipt\")}") &&
    saleCompleted.includes("{t(\"ui.view.receipt\")}") &&
    saleCompleted.includes("{t(\"ui.save.and.new.sale\")}") &&
    posActions.includes("export async function completeSaleAction") &&
    shell.includes("event.key === \"Escape\"") &&
    !posClient.includes("max-w-2xl"),
);

console.log("\nphase-ui-11-pos-small-modal-geometry-check: PASS");
