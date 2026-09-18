import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  applyExactPaymentToMethod,
  remainingDue,
} from "../features/pos/exact-payment";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ name: string; status: "FAIL" | "PASS"; detail?: string }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, status: "FAIL", detail });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

check("Cash Exact: Total 25000 → Cash 25000 → Due 0", () => {
  const total = 25_000;
  const next = applyExactPaymentToMethod("cash", total, {
    cashAmount: 0,
    qrAmount: 0,
    transferAmount: 0,
    cardAmount: 0,
  });
  assert(next, "Exact should apply");
  assert(next.cashAmount === 25_000, `cash=${next.cashAmount}`);
  assert(remainingDue(total, next) === 0, "due must be 0");
});

check("Mixed Exact Bank: Cash 10000 preserved, Bank gets remaining 15000", () => {
  const total = 25_000;
  const next = applyExactPaymentToMethod("transfer", total, {
    cashAmount: 10_000,
    qrAmount: 0,
    transferAmount: 0,
    cardAmount: 0,
  });
  assert(next, "Exact should apply");
  assert(next.cashAmount === 10_000, "cash must remain 10000");
  assert(next.transferAmount === 15_000, `bank=${next.transferAmount}`);
  assert(remainingDue(total, next) === 0, "due must be 0");
});

check("Multiple Mixed methods preserved when Exact fills Bank", () => {
  const total = 100_000;
  const next = applyExactPaymentToMethod("transfer", total, {
    cashAmount: 20_000,
    qrAmount: 40_000,
    transferAmount: 0,
    cardAmount: 0,
  });
  assert(next, "Exact should apply");
  assert(next.qrAmount === 40_000, "QR preserved");
  assert(next.cashAmount === 20_000, "Cash preserved");
  assert(next.transferAmount === 40_000, "Bank filled with remaining");
  assert(remainingDue(total, next) === 0, "due must be 0");
});

check("Due zero: Exact returns null (no-op)", () => {
  const total = 25_000;
  const next = applyExactPaymentToMethod("cash", total, {
    cashAmount: 25_000,
    qrAmount: 0,
    transferAmount: 0,
    cardAmount: 0,
  });
  assert(next === null, "Exact must no-op when due is 0");
});

check("Exact uses live remaining Due after prior split, not original total alone", () => {
  const total = 25_000;
  const partial = {
    cashAmount: 10_000,
    qrAmount: 0,
    transferAmount: 0,
    cardAmount: 0,
  };
  assert(remainingDue(total, partial) === 15_000, "live due is 15000");
  const bankExact = applyExactPaymentToMethod("transfer", total, partial);
  assert(bankExact?.transferAmount === 15_000, "bank gets live due remainder");
  assert(bankExact?.cashAmount === 10_000, "does not reset cash to original total");
});

check("QR Exact fills QR amount to cover total", () => {
  const total = 33_000;
  const next = applyExactPaymentToMethod("qr", total, {
    cashAmount: 0,
    qrAmount: 0,
    transferAmount: 0,
    cardAmount: 0,
  });
  assert(next?.qrAmount === 33_000, "qr exact");
  assert(remainingDue(total, next!) === 0, "due 0");
});

check("Card Exact fills card amount", () => {
  const total = 12_000;
  const next = applyExactPaymentToMethod("card", total, {
    cashAmount: 0,
    qrAmount: 0,
    transferAmount: 0,
    cardAmount: 0,
  });
  assert(next?.cardAmount === 12_000, "card exact");
});

check("Collapsed Cart stretches to match top-row peer (source)", () => {
  const client = readFileSync(
    join(process.cwd(), "features", "pos", "components", "pos-page-client.tsx"),
    "utf8",
  );
  assert(
    client.includes('cartCollapsed ? "xl:h-full xl:self-stretch" : "xl:self-start"'),
    "collapsed cart stretches with left panel row",
  );
  assert(
    client.includes('productGridVisible && cartCollapsed && "h-full min-h-[96px]"'),
    "collapsed panel fills stretched aside",
  );
  assert(client.includes("xl:grid-cols-6"), "product grid unchanged");
  assert(client.includes('t("ui.exact")'), "Exact button label wired");
  assert(client.includes("dueAmount <= 0"), "Exact disabled when Due=0");
});

const failed = results.filter((r) => r.status === "FAIL");
console.log("");
console.log(`Exact payment checks: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exitCode = 1;
