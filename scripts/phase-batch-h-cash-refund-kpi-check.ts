/**
 * BATCH H — Cash refund KPI semantics
 * Gross Cash Sales keep original cash tender after a full refund.
 * Cash Refunds count persisted cash-component outflow.
 * Expected Drawer = Opening + Gross + Cash In − Cash Out − Refunds − Voids.
 *
 * Does NOT hit QA/Production DB. Static source + unit-level ledger assertions.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateCashSessionLedger,
  calculateExpectedCash,
} from "../features/cash-sessions/cash-session-calculator";
import { CASH_SESSION_SALE_STATUSES } from "../features/pos/post-sale-shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function src(relative: string) {
  return readFileSync(join(ROOT, relative), "utf8");
}

let passed = 0;
let failed = 0;

function check(label: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✔ ${label}`);
  } catch (error: any) {
    failed++;
    console.error(`  ✘ ${label}: ${error.message}`);
    process.exitCode = 1;
  }
}

const calculator = src("features/cash-sessions/cash-session-calculator.ts");
const repo = src("features/cash-sessions/prisma-repository.ts");
const postSaleShared = src("features/pos/post-sale-shared.ts");
const returnRepo = src("features/pos/return-repository.ts");
const ownShift = src("features/reports/own-shift-report-service.ts");

const OPENING = 0;
const CASH_SALE = 2_000;
const PARTIAL_REFUND = 500;
const MIXED_CASH = 500;
const MIXED_TRANSFER = 1_500;
const MIXED_TOTAL = MIXED_CASH + MIXED_TRANSFER;

function cashPayment(amountLak: number, method = "cash") {
  return { amount: amountLak, changeAmount: 0, paymentMethod: method };
}

function refundRow(input: {
  id?: string;
  kind?: string;
  refundAmount: number;
  refundMethod?: string;
  saleStatus: string;
  salePayments: Array<{ amount: number; changeAmount?: number; paymentMethod: string }>;
  saleTotal: number;
}) {
  return {
    id: input.id ?? "refund-1",
    kind: input.kind ?? "refund",
    refundAmount: input.refundAmount,
    refundMethod: input.refundMethod ?? "cash",
    totalAmount: input.refundAmount,
    sale: {
      payments: input.salePayments,
      saleStatus: input.saleStatus,
      totalAmount: input.saleTotal,
    },
  };
}

console.log("\n=== BATCH H: Cash refund KPI semantics ===\n");

check("source: refunded is a cash-session gross status", () => {
  assert((CASH_SESSION_SALE_STATUSES as readonly string[]).includes("refunded"));
  assert(!(CASH_SESSION_SALE_STATUSES as readonly string[]).includes("cancelled"));
});

check("source: prisma-repository uses shared ledger aggregator", () => {
  assert(repo.includes("aggregateCashSessionLedger"));
  assert(repo.includes("'refunded'"));
  assert(calculator.includes("computeCashRefundLak"));
});

check("source: SQL payment window includes refunded + cancelled", () => {
  assert(repo.includes("'completed', 'partial_refunded', 'exchanged', 'adjusted', 'cancelled', 'refunded'"));
  assert(repo.includes("json_agg"));
  assert(repo.includes("salePayments"));
});

check("source: duplicate full refund remains blocked at persistence", () => {
  assert(returnRepo.includes("already refunded") || returnRepo.includes("alreadyRefunded"));
  assert(returnRepo.includes("returnRemainingSaleCore"));
});

check("source: Own Shift still includes refunded sales", () => {
  assert(ownShift.includes('"refunded"'));
  assert(ownShift.includes("computeCashRefundLak"));
});

check("source: Expected Drawer formula unchanged", () => {
  const expected = calculateExpectedCash({
    openingCashLak: 100,
    cashSalesLak: 200,
    cashInLak: 10,
    cashOutLak: 5,
    refundLak: 40,
    voidCashLak: 15,
  });
  assert.equal(expected, 250);
});

check("CASE A: cash sale 2000, no refund", () => {
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments: [cashPayment(CASH_SALE)],
    refundRows: [],
  });
  assert.equal(totals.cashSalesLak, 2000);
  assert.equal(totals.refundLak, 0);
  assert.equal(totals.expectedCashLak, 2000);
});

check("CASE B: cash sale 2000 + full cash refund 2000", () => {
  const payments = [cashPayment(CASH_SALE)];
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments,
    refundRows: [
      refundRow({
        refundAmount: CASH_SALE,
        saleStatus: "refunded",
        salePayments: payments,
        saleTotal: CASH_SALE,
      }),
    ],
  });
  assert.equal(totals.cashSalesLak, 2000, "gross remains");
  assert.equal(totals.refundLak, 2000, "refund visible");
  assert.equal(totals.expectedCashLak, 0, "net drawer 0");
});

check("CASE C: cash sale 2000 + partial cash refund 500", () => {
  const payments = [cashPayment(CASH_SALE)];
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments,
    refundRows: [
      refundRow({
        refundAmount: PARTIAL_REFUND,
        saleStatus: "partial_refunded",
        salePayments: payments,
        saleTotal: CASH_SALE,
      }),
    ],
  });
  assert.equal(totals.cashSalesLak, 2000);
  assert.equal(totals.refundLak, 500);
  assert.equal(totals.expectedCashLak, 1500);
});

check("CASE D: mixed sale cash 500 + transfer 1500, full refund cash component 500", () => {
  const payments = [cashPayment(MIXED_CASH), cashPayment(MIXED_TRANSFER, "transfer")];
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments,
    refundRows: [
      refundRow({
        refundAmount: MIXED_TOTAL,
        saleStatus: "refunded",
        salePayments: payments,
        saleTotal: MIXED_TOTAL,
      }),
    ],
  });
  assert.equal(totals.cashSalesLak, 500);
  assert.equal(totals.refundLak, 500);
  assert.equal(totals.nonCashSalesLak, 1500);
  assert.equal(totals.expectedCashLak, 0);
});

check("CASE E: noncash sale + noncash refund", () => {
  const payments = [cashPayment(CASH_SALE, "qr")];
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments,
    refundRows: [
      refundRow({
        refundAmount: CASH_SALE,
        refundMethod: "qr",
        saleStatus: "refunded",
        salePayments: payments,
        saleTotal: CASH_SALE,
      }),
    ],
  });
  assert.equal(totals.cashSalesLak, 0);
  assert.equal(totals.refundLak, 0);
  assert.equal(totals.expectedCashLak, 0);
});

check("CASE F: cash void — STEP9 gross + subtract once", () => {
  const voided = [cashPayment(CASH_SALE)];
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments: [],
    refundRows: [],
    voidedPayments: voided,
  });
  assert.equal(totals.cashSalesLak, 2000, "gross includes original cash");
  assert.equal(totals.voidCashLak, 2000, "void subtracts cash once");
  assert.equal(totals.refundLak, 0);
  assert.equal(totals.expectedCashLak, 0);
});

check("CASE G: mixed void — cash component only", () => {
  const voided = [cashPayment(MIXED_CASH), cashPayment(MIXED_TRANSFER, "transfer")];
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments: [],
    refundRows: [],
    voidedPayments: voided,
  });
  assert.equal(totals.cashSalesLak, 500);
  assert.equal(totals.voidCashLak, 500);
  assert.equal(totals.nonCashSalesLak, 0, "voided noncash is not session cash");
  assert.equal(totals.expectedCashLak, 0);
});

check("CASE H: duplicate refund id is not double-counted", () => {
  const payments = [cashPayment(CASH_SALE)];
  const row = refundRow({
    id: "same-refund",
    refundAmount: CASH_SALE,
    saleStatus: "refunded",
    salePayments: payments,
    saleTotal: CASH_SALE,
  });
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments,
    refundRows: [row, { ...row }],
  });
  assert.equal(totals.refundLak, 2000);
  assert.equal(totals.expectedCashLak, 0);
});

check("exchanged / adjusted cash still counts in gross", () => {
  const exchanged = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments: [cashPayment(CASH_SALE)],
    refundRows: [],
  });
  assert.equal(exchanged.cashSalesLak, 2000);
  assert((CASH_SESSION_SALE_STATUSES as readonly string[]).includes("exchanged"));
  assert((CASH_SESSION_SALE_STATUSES as readonly string[]).includes("adjusted"));
  assert((CASH_SESSION_SALE_STATUSES as readonly string[]).includes("completed"));
  assert((CASH_SESSION_SALE_STATUSES as readonly string[]).includes("partial_refunded"));
});

check("cancelled refund row is ignored (void path owns it)", () => {
  const totals = aggregateCashSessionLedger({
    openingCashLak: OPENING,
    payments: [],
    refundRows: [
      refundRow({
        refundAmount: CASH_SALE,
        saleStatus: "cancelled",
        salePayments: [cashPayment(CASH_SALE)],
        saleTotal: CASH_SALE,
      }),
    ],
    voidedPayments: [cashPayment(CASH_SALE)],
  });
  assert.equal(totals.refundLak, 0);
  assert.equal(totals.voidCashLak, 2000);
  assert.equal(totals.expectedCashLak, 0);
});

console.log(`\nBATCH H checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
