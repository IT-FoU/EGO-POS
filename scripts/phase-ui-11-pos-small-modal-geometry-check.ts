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
const overlayClassWithOptionalLayer =
  'className={cn("fixed inset-0 z-50 grid place-items-center p-4 bg-black/60", overlayClassName)}';
const cardClass =
  '"flex w-full max-h-[85vh] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"';
const closeClass =
  'className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground"';
const largeOverlay =
  'className="fixed inset-y-0 left-0 right-0 z-[60] overflow-x-hidden bg-black/70 lg:left-72"';

const unitSelector = sliceBetween(posClient, "function UnitSelectorModal(", "function ActionButton(");
const mixedPayment = sliceBetween(posClient, "function MixedPaymentModal(", "function SaleCompletedModal(");
const saleCompleted = sliceBetween(posClient, "function SaleCompletedModal(", "function ManagerApprovalModal(");

const shellUsesCenteredOverlay =
  shell.includes(overlayClass) || shell.includes(overlayClassWithOptionalLayer);

check(
  "1. all three remain centered",
  posClient.includes('import { PosSmallModal } from "@/features/pos/components/pos-small-modal"') &&
    unitSelector.includes("<PosSmallModal") &&
    mixedPayment.includes("<PosSmallModal") &&
    saleCompleted.includes("<PosSmallModal") &&
    unitSelector.includes('size="md"') &&
    mixedPayment.includes('size="md"') &&
    saleCompleted.includes('size="sm"') &&
    shellUsesCenteredOverlay &&
    shell.includes("place-items-center") &&
    !unitSelector.includes("lg:left-72") &&
    !mixedPayment.includes("lg:left-72") &&
    !saleCompleted.includes("lg:left-72"),
);

check(
  "2. shared visual standard unchanged",
  shellUsesCenteredOverlay &&
    shell.includes(cardClass) &&
    shell.includes(closeClass) &&
    shell.includes("bg-black/60") &&
    !shell.includes("bg-black/70") &&
    shell.includes("fixed inset-0 z-50") &&
    !shell.includes("z-40") &&
    shell.includes('size === "sm" ? "max-w-md" : "max-w-lg"') &&
    shell.includes("text-lg font-semibold") &&
    shell.includes('role="dialog"') &&
    shell.includes('aria-modal="true"') &&
    shell.includes("dialogRef.current?.focus()") &&
    !posClient.includes("max-w-2xl"),
);

check(
  "3. Unit Selector dismissal policy is explicitly configured",
  unitSelector.includes("closeOnBackdrop={true}") &&
    unitSelector.includes("closeOnEscape={true}") &&
    unitSelector.includes("onClose={onClose}") &&
    unitSelector.includes("closeAriaLabel={t(\"ui.close.unit.selector\")}") &&
    shell.includes("onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}") &&
    shell.includes("event.key === \"Escape\" && closeOnEscape"),
);

check(
  "4. Mixed Payment backdrop does not close",
  mixedPayment.includes("closeOnBackdrop={false}") &&
    mixedPayment.includes("onClose={onClose}") &&
    shell.includes("onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}"),
);

check(
  "5. Mixed Payment Escape does not close",
  mixedPayment.includes("closeOnEscape={false}") &&
    shell.includes("closeOnEscape = false") &&
    shell.includes("event.key === \"Escape\" && closeOnEscape"),
);

check(
  "6. Sale Completed backdrop does not close",
  saleCompleted.includes("closeOnBackdrop={false}") &&
    saleCompleted.includes("onClose={onClose}"),
);

check(
  "7. Sale Completed Escape does not bypass the workflow",
  saleCompleted.includes("closeOnEscape={false}") &&
    saleCompleted.includes("{t(\"ui.print.receipt\")}") &&
    saleCompleted.includes("{t(\"ui.view.receipt\")}") &&
    saleCompleted.includes("{t(\"ui.save.and.new.sale\")}"),
);

check(
  "8. explicit close/actions still work",
  unitSelector.includes("onClose={onClose}") &&
    mixedPayment.includes("onClose={onClose}") &&
    mixedPayment.includes('setPaymentMode("mixed")') &&
    mixedPayment.includes("{t(\"ui.apply.mixed.payment\")}") &&
    saleCompleted.includes("onClose={onClose}") &&
    saleCompleted.includes("onClick={onPrint}") &&
    saleCompleted.includes("onClick={onView}") &&
    saleCompleted.includes("onClick={onNewSale}") &&
    shell.includes("onClick={onClose}") &&
    shell.includes(closeClass),
);

check(
  "9. POS business logic unchanged",
  posClient.includes("async function holdSale") &&
    posClient.includes("async function resumeSale") &&
    posClient.includes("function completeSale()") &&
    posClient.includes("function addToCart(product: PosProduct, selectedUnit?: PosProductUnit)") &&
    mixedPayment.includes('setPaymentMode("mixed")') &&
    unitSelector.includes("onSelect(unit)") &&
    posActions.includes("export async function completeSaleAction"),
);

check(
  "10. Large Drawer geometry unchanged",
  frame.includes(largeOverlay) &&
    frame.includes("lg:left-72") &&
    !frame.includes("fixed inset-0") &&
    posClient.includes("return <PosWorkspaceModal") &&
    posClient.includes("title={title}>{children}</PosWorkspaceModal>;") &&
    posClient.includes('title={t("ui.recent.sales")}') &&
    posClient.includes('headerClassName="print:hidden"') &&
    posClient.includes('title={t("ui.receipt.preview")}') &&
    ownShift.includes("<PosWorkspaceModal") &&
    cashInOut.includes('title={t("ui.cash.in.cash.out")}') &&
    cashInOut.includes("<PosWorkspaceModal") &&
    returnExchange.includes('title={tPos("ui.return.exchange.void")}') &&
    returnExchange.includes("<PosWorkspaceModal"),
);

console.log("\nphase-ui-11-pos-small-modal-geometry-check: PASS");
