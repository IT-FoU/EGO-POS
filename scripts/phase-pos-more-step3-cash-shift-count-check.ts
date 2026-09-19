import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CASH_DENOMINATIONS_LAK,
  assertDenominationTotalMatches,
  denominationLineSubtotal,
  mergeClosingCountBreakdown,
  parseCashSessionCountBreakdown,
  parseDenominationCountMap,
  sumDenominationCounts,
  sumParsedDenominationCounts,
  toDenominationCountMap,
  varianceKind,
} from "../features/cash-sessions/denominations";
import {
  calculateExpectedCash,
  calculateVariance,
  varianceStatus,
} from "../features/cash-sessions/cash-session-calculator";
import { claimCashMovementSubmit } from "../features/pos/cash-movement";
import { STORE_ACTIONS, STORE_ROLES, canPerformStoreAction } from "../features/permissions/store-permissions";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(name: string, run: () => void) {
  try {
    run();
    throw new Error(`${name}: expected throw`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${name}: expected throw`)) {
      throw error;
    }
  }
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

const root = process.cwd();
const client = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const cashClient = readFileSync(join(root, "features/pos/cash-session-client.ts"), "utf8");
const closeRoute = readFileSync(join(root, "app/api/pos/cash-sessions/close/route.ts"), "utf8");
const openRoute = readFileSync(join(root, "app/api/pos/cash-sessions/open/route.ts"), "utf8");
const repo = readFileSync(join(root, "features/cash-sessions/prisma-repository.ts"), "utf8");
const calculator = readFileSync(join(root, "features/cash-sessions/cash-session-calculator.ts"), "utf8");
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(root, "prisma/migrations/20260918_cash_session_count_breakdown/migration.sql"),
  "utf8",
);
const ownShift = readFileSync(join(root, "features/reports/own-shift-report-service.ts"), "utf8");
const moreNav = readFileSync(join(root, "scripts/phase-pos-more-back-navigation-check.ts"), "utf8");
const ownShiftDrawer = readFileSync(join(root, "features/pos/components/own-shift-report-drawer.tsx"), "utf8");

// --- DENOMINATIONS ---
check("1. denomination line subtotal correct", () => {
  assert(denominationLineSubtotal(50_000, 3) === 150_000, "50k×3");
  assert(denominationLineSubtotal(20_000, 2) === 40_000, "20k×2");
  assert(denominationLineSubtotal(500, 1) === 500, "500×1");
});

check("2. counted total correct", () => {
  const total = sumDenominationCounts({
    50000: 3,
    20000: 2,
    10000: 4,
    5000: 0,
    2000: 0,
    1000: 0,
    500: 0,
  });
  assert(total === 230_000, `total=${total}`);
});

check("3. integer LAK only (no float qty)", () => {
  assert(denominationLineSubtotal(10_000, 2.9) === 20_000, "floor qty");
  assert(Number.isInteger(sumDenominationCounts({ 50000: 1.7, 20000: 0.4 })), "integer sum");
  assert(CASH_DENOMINATIONS_LAK.join(",") === "50000,20000,10000,5000,2000,1000,500", "LAK set");
});

// --- EXPECTED ---
check("4. opening + cash sales + cash in - cash out - refunds", () => {
  const expected = calculateExpectedCash({
    openingCashLak: 500_000,
    cashSalesLak: 300_000,
    cashInLak: 100_000,
    cashOutLak: 50_000,
    refundLak: 20_000,
    voidCashLak: 0,
  });
  assert(expected === 830_000, `expected=${expected}`);
});

check("5. Cash In increases expected", () => {
  const base = calculateExpectedCash({
    openingCashLak: 100_000,
    cashSalesLak: 0,
    cashInLak: 0,
    cashOutLak: 0,
    refundLak: 0,
    voidCashLak: 0,
  });
  const after = calculateExpectedCash({
    openingCashLak: 100_000,
    cashSalesLak: 0,
    cashInLak: 25_000,
    cashOutLak: 0,
    refundLak: 0,
    voidCashLak: 0,
  });
  assert(after === base + 25_000, `after=${after}`);
});

check("6. Cash Out decreases expected", () => {
  const after = calculateExpectedCash({
    openingCashLak: 100_000,
    cashSalesLak: 0,
    cashInLak: 0,
    cashOutLak: 40_000,
    refundLak: 0,
    voidCashLak: 0,
  });
  assert(after === 60_000, `after=${after}`);
});

check("7. cash refund decreases expected", () => {
  const after = calculateExpectedCash({
    openingCashLak: 100_000,
    cashSalesLak: 50_000,
    cashInLak: 0,
    cashOutLak: 0,
    refundLak: 15_000,
    voidCashLak: 0,
  });
  assert(after === 135_000, `after=${after}`);
});

// --- VARIANCE ---
check("8. exact = 0", () => {
  assert(calculateVariance(825_000, 825_000) === 0, "exact");
  assert(varianceKind(0) === "exact", "kind");
  assert(varianceStatus(0) === "exact", "status");
});

check("9. over > 0", () => {
  assert(calculateVariance(840_000, 830_000) === 10_000, "over");
  assert(varianceKind(10_000) === "over", "kind");
});

check("10. short < 0", () => {
  assert(calculateVariance(825_000, 830_000) === -5_000, "short");
  assert(varianceKind(-5_000) === "short", "kind");
});

// --- CLOSING UI / API wiring ---
check("11. Confirm Closing calls real close API", () => {
  assert(client.includes("closeCashSessionRequest("), "client calls close");
  assert(client.includes("onConfirmClosing={confirmClosingSummary}"), "wired to button");
  assert(client.includes('data-testid="confirm-closing-summary"'), "testid");
  assert(cashClient.includes('/api/pos/cash-sessions/close'), "fetch close");
  assert(closeRoute.includes("closeCashSession("), "route → repo");
  assert(closeRoute.includes("STORE_ACTIONS.SHIFT_CLOSE"), "SHIFT_CLOSE");
});

check("12. submits exactly once (in-flight lock)", () => {
  assert(client.includes("cashCloseInFlightRef"), "close lock ref");
  assert(client.includes("claimCashMovementSubmit(cashCloseInFlightRef)"), "claim lock");
  const lock = { current: false };
  assert(claimCashMovementSubmit(lock) === true, "first claim");
  assert(claimCashMovementSubmit(lock) === false, "second claim blocked");
});

check("13. disabled while submitting", () => {
  assert(client.includes("disabled={cashCloseBusy}"), "disabled busy");
  assert(client.includes('cashCloseBusy ? t("ui.confirming")'), "loading label");
});

check("14. already closed session rejected", () => {
  assert(repo.includes("Cash session is already closed."), "already closed");
  assert(repo.includes("!options?.allowClosed && session.closedAt"), "guard");
});

check("15. no active session rejected", () => {
  assert(client.includes('t("ui.no.open.cash.session.to.close")'), "no session message");
  assert(client.includes('activeCashSession.status !== "open"'), "open check");
});

check("16. success state reflects closed session", () => {
  assert(client.includes("setClosingSummaryVisible(true)"), "success flag");
  assert(client.includes("setLastCloseSummary"), "summary retained");
  assert(client.includes('t("ui.cash.session.closed")'), "closed badge");
  assert(cashClient.includes("countedCashLak"), "close returns counted");
  assert(cashClient.includes("varianceLak"), "close returns variance");
});

// --- PERMISSIONS ---
check("17. unauthorized direct close rejected (policy)", () => {
  assert(canPerformStoreAction({ role: STORE_ROLES.CASHIER }, STORE_ACTIONS.SHIFT_CLOSE), "cashier may close own");
  assert(canPerformStoreAction({ role: STORE_ROLES.MANAGER }, STORE_ACTIONS.SHIFT_CLOSE), "manager");
  assert(canPerformStoreAction({ role: STORE_ROLES.OWNER }, STORE_ACTIONS.SHIFT_CLOSE), "owner");
  assert(repo.includes('PermissionDeniedError("pos.cash_session.manage")'), "owner-of-session enforced");
  assert(closeRoute.includes("WRITE_PERMISSIONS.posCashSessionManage"), "write permission");
});

check("18. allowed role succeeds (SHIFT_CLOSE + open path)", () => {
  assert(openRoute.includes("STORE_ACTIONS.SHIFT_OPEN"), "open action");
  assert(client.includes("openCashSessionRequest(openingCashTotal,"), "open uses denom total + breakdown");
});

// --- STATE safety (source) ---
check("19. cart unchanged by close path", () => {
  const closeFn = client.slice(client.indexOf("async function confirmClosingSummary"), client.indexOf("async function submitCashMovement"));
  assert(!closeFn.includes("setCartItems"), "no cart mutation");
});

check("20. stock unchanged by close path", () => {
  const closeFn = client.slice(client.indexOf("async function confirmClosingSummary"), client.indexOf("async function submitCashMovement"));
  assert(!closeFn.includes("stock"), "no stock refs");
});

check("21. revenue unchanged by close path", () => {
  const closeFn = client.slice(client.indexOf("async function confirmClosingSummary"), client.indexOf("async function submitCashMovement"));
  assert(!closeFn.includes("completeSale"), "no sale");
  assert(repo.includes("closingCash: countedCashLak"), "persists counted only");
  assert(repo.includes("expectedCash: expectedCashLak"), "persists expected");
  assert(repo.includes("cashDifference: varianceLak"), "persists variance");
});

// --- REGRESSIONS ---
check("22. Cash In/Out business logic unchanged (calculator)", () => {
  assert(calculator.includes("input.openingCashLak +"), "formula present");
  assert(calculator.includes("input.cashInLak"), "cash in");
  assert(calculator.includes("input.cashOutLak"), "cash out");
  assert(calculator.includes("input.refundLak"), "refund");
  assert(calculator.includes("input.voidCashLak"), "void cash in formula (STEP 9)");
});

check("23. Own Shift Report still reads counted/expected/variance", () => {
  assert(ownShift.includes("closingCashLak"), "counted");
  assert(ownShift.includes("expectedCashLak"), "expected");
  assert(ownShift.includes("cashDifference") || ownShift.includes("variance"), "variance");
});

check("24. More navigation check script still present", () => {
  assert(moreNav.includes("Cash Shift Count"), "Cash Shift Count label");
  assert(moreNav.includes("cashShiftCountOpen"), "open flag");
});

check("25. fake staff/OT UI removed from Cash Shift Count", () => {
  const staffSlice = client.slice(client.indexOf("function StaffControl("), client.indexOf("function SettlementValue("));
  assert(!staffSlice.includes("ui.start.ot"), "no start OT");
  assert(!staffSlice.includes("ui.end.ot"), "no end OT");
  assert(!staffSlice.includes("ui.work.ot"), "no work/ot hours");
  assert(!staffSlice.includes("selectedStaffName"), "no staff picker");
  assert(staffSlice.includes("onConfirmClosing"), "confirm wired");
  assert(staffSlice.includes("closingCashCounts"), "closing denoms");
});

check("26. denomination breakdown persisted via DB JSON, not localStorage", () => {
  assert(schema.includes('countBreakdown Json?     @map("count_breakdown")') || schema.includes('countBreakdown Json?'), "schema field");
  assert(migration.includes('ADD COLUMN "count_breakdown" JSONB'), "migration SQL");
  assert(!migration.toLowerCase().includes("drop "), "no drop");
  const closeFn = client.slice(client.indexOf("async function confirmClosingSummary"), client.indexOf("async function submitCashMovement"));
  assert(!closeFn.includes("localStorage"), "no localStorage fake persist");
  assert(client.includes("toDenominationCountMap(openingCashCounts)"), "open sends breakdown");
  assert(client.includes("toDenominationCountMap(closingCashCounts)"), "close sends breakdown");
});

check("27. authoritative expected from session accounting", () => {
  assert(client.includes("activeCashSession.expectedCashLak"), "uses session expected");
  assert(calculator.includes("calculateExpectedCash"), "server formula");
});

// --- DENOMINATION PERSISTENCE / VALIDATION ---
check("P1. opening breakdown persists (open path)", () => {
  assert(repo.includes("countBreakdown: { opening: openingBreakdown }"), "open write");
  assert(openRoute.includes("readOpeningCountBreakdown"), "open route");
  assert(cashClient.includes("countBreakdown: options?.countBreakdown"), "client open payload");
});

check("P2. closing breakdown persists (close path)", () => {
  assert(repo.includes("mergeClosingCountBreakdown"), "merge on close");
  assert(closeRoute.includes("readClosingCountBreakdown"), "close route");
  assert(cashClient.includes("countBreakdown: options?.countBreakdown"), "client close payload");
});

check("P3. closing preserves opening breakdown", () => {
  const merged = mergeClosingCountBreakdown(
    { opening: { "50000": 2 } },
    { "20000": 1 },
  );
  assert(merged.opening?.["50000"] === 2, "opening kept");
  assert(merged.closing?.["20000"] === 1, "closing set");
});

check("P4. valid denomination total matches submitted total", () => {
  const counts = parseDenominationCountMap({ "50000": 3, "20000": 2 }, "Opening");
  assert(sumParsedDenominationCounts(counts) === 190_000, "sum");
  assertDenominationTotalMatches(counts, 190_000, "Opening");
});

check("P5. invalid denomination rejected", () => {
  expectThrow("unknown denom", () => parseDenominationCountMap({ "100": 1 }, "Opening"));
});

check("P6. negative quantity rejected", () => {
  expectThrow("negative", () => parseDenominationCountMap({ "50000": -1 }, "Opening"));
});

check("P7. float quantity rejected", () => {
  expectThrow("float", () => parseDenominationCountMap({ "50000": 1.5 }, "Closing"));
});

check("P8. total mismatch rejected", () => {
  const counts = parseDenominationCountMap({ "50000": 1 }, "Closing");
  expectThrow("mismatch", () => assertDenominationTotalMatches(counts, 40_000, "Closing"));
});

check("P9. already-closed session cannot rewrite breakdown", () => {
  assert(repo.includes("Cash session is already closed."), "already closed blocks update");
  assert(repo.includes("getScopedSession(tx, tenant, sessionId)"), "scoped before update");
});

check("P10. existing sessions with NULL breakdown remain readable", () => {
  assert(parseCashSessionCountBreakdown(null) === null, "null → null");
  assert(repo.includes("readCountBreakdown(session.countBreakdown)"), "summary maps null-safe");
  assert(ownShift.includes("countBreakdown:"), "own shift exposes field");
  // STEP 5 Own Shift Report may render breakdown when present; NULL must stay safe.
  assert(
    ownShift.includes("parseCashSessionCountBreakdown") || ownShiftDrawer.includes("noBreakdown"),
    "NULL breakdown remains readable / safe in report",
  );
});

check("P11. expected cash calculation unchanged", () => {
  const expected = calculateExpectedCash({
    openingCashLak: 500_000,
    cashSalesLak: 300_000,
    cashInLak: 100_000,
    cashOutLak: 50_000,
    refundLak: 20_000,
    voidCashLak: 0,
  });
  assert(expected === 830_000, `expected=${expected}`);
  assert(!calculator.includes("countBreakdown"), "calculator ignores breakdown");
});

check("P12. Cash In/Out accounting unchanged", () => {
  assert(calculator.includes("input.cashInLak"), "cash in");
  assert(calculator.includes("input.cashOutLak"), "cash out");
  assert(repo.includes('transactionType: type'), "movement rows");
});

check("P13. variance calculation unchanged", () => {
  assert(calculateVariance(825_000, 830_000) === -5_000, "short");
  assert(varianceStatus(0) === "exact", "exact");
  assert(toDenominationCountMap({ 50000: 1, 20000: 0 })["50000"] === 1, "omit zeros");
  assert(toDenominationCountMap({ 50000: 1, 20000: 0 })["20000"] === undefined, "no zero key");
});

const failed = results.filter((row) => row.status === "FAIL");
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  process.exitCode = 1;
}
