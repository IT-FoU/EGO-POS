import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Mixed Payment amount focus regression.
 *
 * Browser focus cannot be exercised reliably in this source-check stack.
 * Coverage is component/source-level against the known remount/focus-steal cause:
 * PosSmallModal re-focusing the dialog whenever `onClose` identity changes.
 */

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
const mixedPayment = sliceBetween(posClient, "function MixedPaymentModal(", "function SaleCompletedModal(");
const numberInput = sliceBetween(posClient, "function PosNumberInput(", "function PaymentButton(");

check(
  "1. PosSmallModal keeps mount-only dialog focus (no onClose identity steal)",
  shell.includes("onCloseRef") &&
    shell.includes("onCloseRef.current = onClose") &&
    shell.includes("}, [closeOnEscape]);") &&
    !shell.includes("}, [closeOnEscape, onClose]);") &&
    shell.includes("dialogRef.current?.focus()") &&
    shell.includes("Do NOT depend on `onClose`"),
);

check(
  "2. Mixed Payment uses PosSmallModal (shared focus fix applies)",
  mixedPayment.includes("<PosSmallModal") &&
    mixedPayment.includes('size="md"') &&
    posClient.includes('onClose={() => setMixedPaymentOpen(false)}'),
);

check(
  "3. Cash / QR / Card / Transfer inputs have stable method identity markers",
  mixedPayment.includes('data-mixed-method="cash"') &&
    mixedPayment.includes('data-mixed-method="qr"') &&
    mixedPayment.includes('data-mixed-method="card"') &&
    mixedPayment.includes('data-mixed-method="transfer"') &&
    mixedPayment.includes('data-testid="mixed-amount-cash"') &&
    mixedPayment.includes('data-testid="mixed-amount-qr"') &&
    mixedPayment.includes('data-testid="mixed-amount-card"') &&
    mixedPayment.includes('data-testid="mixed-amount-transfer"'),
);

check(
  "4. Mixed amount fields are not keyed by amount/value (no remount-on-type keys)",
  !/key=\{[^}]*(cashAmount|qrAmount|cardAmount|transferAmount|paid|due)/.test(mixedPayment) &&
    !mixedPayment.includes("key={String(") &&
    !mixedPayment.includes("key={`${"),
);

check(
  "5. PosNumberInput stays controlled without autofocus/setTimeout focus hacks",
  numberInput.includes("value={draft}") &&
    numberInput.includes("onValueChange") &&
    !numberInput.includes(".focus(") &&
    !numberInput.includes("setTimeout") &&
    !numberInput.includes("autofocus") &&
    !numberInput.includes("autoFocus"),
);

check(
  "6. Exact wiring inside Mixed Payment is preserved",
  mixedPayment.includes('onExact("cash")') &&
    mixedPayment.includes('onExact("qr")') &&
    mixedPayment.includes('onExact("card")') &&
    mixedPayment.includes('onExact("transfer")') &&
    mixedPayment.includes("ExactPaymentButton"),
);

console.log("\nNOTE: DOM activeElement / continuous typing is Owner Visual QA.");
console.log("Mixed Payment focus source checks: PASS");
