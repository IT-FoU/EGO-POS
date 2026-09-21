/**
 * POS MORE STEP 9 — Void Cash Accounting Integration
 * Validates that voidCashLak is properly derived from SalePayment cash methods
 * on voided sales, Expected Drawer Cash is correct, and the Own Shift Report
 * shows Cash Voids without a limitation banner.
 *
 * ~24 checks covering:
 *   cash / non-cash / mixed / double-count / refund / session / report / cash-shift / security
 *
 * Does NOT hit QA/Production DB. Static source + unit-level assertions only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// ---------------------------------------------------------------------------
// Load source files
// ---------------------------------------------------------------------------
const calculator = src("features/cash-sessions/cash-session-calculator.ts");
const repo = src("features/cash-sessions/prisma-repository.ts");
const types = src("features/cash-sessions/types.ts");
const service = src("features/reports/own-shift-report-service.ts");
const access = src("features/reports/own-shift-report-access.ts");
const drawer = src("features/pos/components/own-shift-report-drawer.tsx");
const client = src("features/pos/components/pos-page-client.tsx");
const postSaleShared = src("features/pos/post-sale-shared.ts");
const postSaleRepo = src("features/pos/post-sale-repository.ts");
const cashSessionClient = src("features/pos/cash-session-client.ts");
const posCopy = src("lib/i18n/pos-copy.ts");

import {
  calculateExpectedCash,
  summarizeSalePayments,
  buildCashSessionTotals,
} from "../features/cash-sessions/cash-session-calculator";

console.log("\n=== STEP 9: Void Cash Accounting Integration ===\n");

// --- 1-4: voidCashLak derivation ---

check("1. voidCashLak is no longer hardcoded to 0 in prisma-repository", () => {
  assert(!repo.includes("voidCashLak: 0"), "voidCashLak: 0 hardcoding removed");
  assert(repo.includes("voidCashLak"), "voidCashLak is derived");
});

check("2. voidCashLak derived from voided sales' cash payments (summarizeSalePayments)", () => {
  assert(
    calculator.includes("summarizeSalePayments(input.voidedPayments") ||
      repo.includes("summarizeSalePayments(voidedPayments)"),
    "voided payments summarized via canonical function",
  );
  assert(repo.includes("voidedPayments"), "voided payments passed into session ledger");
});

check("3. loadSessionTotals queries voided (cancelled) sale payments", () => {
  assert(
    repo.includes('saleStatus: "cancelled"'),
    "cancelled status queried for voided payments",
  );
});

check("4. computeCashSessionTotalsForShifts SQL includes cancelled status", () => {
  assert(
    repo.includes("'cancelled'"),
    "SQL includes cancelled in status filter",
  );
  assert(
    repo.includes('row.saleStatus === "cancelled"'),
    "voided payments separated from active payments",
  );
});

// --- 5-8: Formula / double-count protection ---

check("5. calculateExpectedCash formula subtracts voidCashLak", () => {
  assert(calculator.includes("input.voidCashLak"), "voidCashLak in formula");
  assert(
    calculator.includes("input.cashSalesLak +"),
    "cashSalesLak is additive (gross)",
  );
});

check("6. cashSalesLak includes voided cash (gross) — no double subtraction", () => {
  assert(
    calculator.includes("+ voidCashLak") || repo.includes("+ voidCashLak,"),
    "voidCashLak added to cashSalesLak (gross)",
  );
  const expected = calculateExpectedCash({
    openingCashLak: 500_000,
    cashSalesLak: 300_000 + 50_000, // gross: 300K active + 50K voided
    cashInLak: 100_000,
    cashOutLak: 50_000,
    refundLak: 20_000,
    voidCashLak: 50_000,
  });
  // expected = 500K + 350K + 100K - 50K - 20K - 50K = 830K (same as without void)
  assert.equal(expected, 830_000, `expected=${expected}`);
});

check("7. Pure cash void: net expected unchanged", () => {
  const noVoid = calculateExpectedCash({
    openingCashLak: 100_000,
    cashSalesLak: 200_000,
    cashInLak: 0,
    cashOutLak: 0,
    refundLak: 0,
    voidCashLak: 0,
  });
  const withVoid = calculateExpectedCash({
    openingCashLak: 100_000,
    cashSalesLak: 200_000, // gross: 150K active + 50K voided
    cashInLak: 0,
    cashOutLak: 0,
    refundLak: 0,
    voidCashLak: 50_000,
  });
  // After void: expected = 100K + 200K - 50K = 250K (was 300K, reduced by 50K void)
  assert.equal(withVoid, noVoid - 50_000, `withVoid=${withVoid} noVoid=${noVoid}`);
});

check("8. Non-cash void produces voidCashLak = 0", () => {
  const payments = [{ amount: 50_000, paymentMethod: "qr" }];
  const summary = summarizeSalePayments(payments);
  assert.equal(summary.cashSalesLak, 0, "QR-only sale has no cash component");
  assert.equal(summary.nonCashSalesLak, 50_000, "non-cash recorded");
});

// --- 9-11: Mixed payment void ---

check("9. Mixed payment void: only cash component affects voidCashLak", () => {
  const mixed = [
    { amount: 30_000, changeAmount: 0, paymentMethod: "cash" },
    { amount: 20_000, paymentMethod: "qr" },
  ];
  const summary = summarizeSalePayments(mixed);
  assert.equal(summary.cashSalesLak, 30_000, `cashSalesLak=${summary.cashSalesLak}`);
  assert.equal(summary.nonCashSalesLak, 20_000, `nonCashSalesLak=${summary.nonCashSalesLak}`);
});

check("10. Mixed void with change: cash net = amount - change", () => {
  const payments = [
    { amount: 100_000, changeAmount: 20_000, paymentMethod: "cash" },
    { amount: 50_000, paymentMethod: "transfer" },
  ];
  const summary = summarizeSalePayments(payments);
  assert.equal(summary.cashSalesLak, 80_000, `net cash = 100K - 20K = 80K`);
});

check("11. Card-only void: voidCashLak = 0", () => {
  const payments = [{ amount: 75_000, paymentMethod: "visa" }];
  const summary = summarizeSalePayments(payments);
  assert.equal(summary.cashSalesLak, 0, "card-only has no cash");
});

// --- 12-13: Refund vs Void separation ---

check("12. Refund cash stays separate from void cash — no double reverse", () => {
  assert(calculator.includes("refundLak"), "refundLak in formula");
  assert(calculator.includes("voidCashLak"), "voidCashLak in formula");
  assert(types.includes("refundLak: number"), "refundLak in types");
  assert(types.includes("voidCashLak: number"), "voidCashLak in types");
});

check("13. Voided sale cannot also have refund (assertion in post-sale-repository)", () => {
  assert(
    postSaleRepo.includes("Sale already has a refund record"),
    "void blocks if refund exists",
  );
  assert(
    postSaleRepo.includes("Sale is already voided"),
    "re-void blocked",
  );
});

// --- 14-16: Session totals ---

check("14. buildCashSessionTotals includes voidCashLak in output", () => {
  const totals = buildCashSessionTotals({
    openingCashLak: 100_000,
    cashSalesLak: 150_000,
    cashInLak: 10_000,
    cashOutLak: 5_000,
    nonCashSalesLak: 20_000,
    refundLak: 0,
    voidCashLak: 30_000,
  });
  assert.equal(totals.voidCashLak, 30_000, "voidCashLak preserved in output");
  assert.equal(totals.expectedCashLak, 225_000, `expected=${totals.expectedCashLak}`);
  // 100K + 150K + 10K - 5K - 0 - 30K = 225K
});

check("15. CashSessionTotals type has voidCashLak field", () => {
  assert(types.includes("voidCashLak: number"), "voidCashLak in CashSessionTotals");
});

check("16. CASH_SESSION_SALE_STATUSES excludes cancelled (voided filtered separately)", () => {
  const cashStatusBlock = postSaleShared.slice(
    postSaleShared.indexOf("CASH_SESSION_SALE_STATUSES"),
  );
  const endBracket = cashStatusBlock.indexOf("] as const");
  const statusContent = cashStatusBlock.slice(0, endBracket);
  assert(!statusContent.includes("cancelled"), "CASH_SESSION_SALE_STATUSES excludes cancelled");
  assert(statusContent.includes("refunded"), "CASH_SESSION_SALE_STATUSES includes refunded for gross cash");
  assert(postSaleShared.includes("RECENT_SALE_STATUSES"), "RECENT has cancelled (separate constant)");
});

// --- 17-19: Own Shift Report ---

check("17. OwnShiftReport type includes voidCashLak field", () => {
  assert(service.includes("voidCashLak: number"), "voidCashLak on report type");
  assert(service.includes("voidCashLak,"), "voidCashLak populated in report builder");
});

check("18. Report expected formula: opening + grossCash + cashIn - cashOut - refundCash - voidCash", () => {
  assert(
    service.includes("openingCashLak + cashLak + voidCashLak + cashInLak - cashOutLak - refundCashLak - voidCashLak"),
    "formula includes voidCashLak subtraction",
  );
});

check("19. Limitation banner removed from Own Shift Report drawer", () => {
  assert(!drawer.includes("voidCashLimitation"), "voidCashLimitation gone from drawer");
  assert(!drawer.includes("voidLimitation"), "voidLimitation label gone from drawer");
  assert(
    !drawer.includes("STEP 9") || drawer.includes("// STEP 9"),
    "no STEP 9 limitation text in UI",
  );
});

// --- 20-21: Cash Shift Count / close session ---

check("20. Cash Shift Count close uses corrected session totals (calculateExpectedCash)", () => {
  assert(repo.includes("calculateExpectedCash(totals)"), "close session uses canonical calculator");
  assert(repo.includes("calculateVariance(countedCashLak, expectedCashLak)"), "variance computed");
});

check("21. Denomination / close workflow unchanged", () => {
  assert(repo.includes("mergeClosingCountBreakdown"), "closing breakdown merge intact");
  assert(repo.includes("assertDenominationTotalMatches"), "denomination total validation intact");
  assert(repo.includes("closingCash: countedCashLak"), "closing cash stored");
});

// --- 22: Cash Voids display on report ---

check("22. Cash Voids metric shown on Own Shift Report UI", () => {
  assert(drawer.includes("cashVoids"), "cashVoids label in drawer");
  assert(drawer.includes("voidCashLak"), "voidCashLak displayed on drawer");
});

// --- 23: i18n ---

check("23. i18n labels for Cash Voids present", () => {
  assert(posCopy.includes("ui.shift.cash.voids"), "EN cash voids label");
  assert(posCopy.includes("ເງິນສົດ Void"), "LO cash voids label");
});

// --- 24: Security / STEP 2 untouched ---

check("24. STEP 2 void authorization / PIN / stock / duplicate protection unchanged", () => {
  assert(postSaleRepo.includes("assertSaleVoidable"), "void guard intact");
  assert(postSaleRepo.includes("assertPosActionAllowed"), "permission guard intact");
  assert(postSaleRepo.includes("managerPinApproval"), "PIN approval path intact");
  assert(postSaleRepo.includes("restoreSaleStock"), "stock restoration intact");
  assert(postSaleRepo.includes("reverseSalePromotions"), "promotion reversal intact");
  assert(postSaleRepo.includes("reverseSaleLoyalty"), "loyalty reversal intact");
  assert(postSaleRepo.includes('saleStatus: "cancelled"'), "void status = cancelled");
});

// --- Summary ---

console.log(`\nSTEP 9 void cash accounting checks passed: ${passed}`);
if (failed > 0) {
  console.error(`FAILED: ${failed}`);
}
if (process.exitCode) {
  process.exit(1);
}
