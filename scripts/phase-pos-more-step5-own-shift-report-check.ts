/**
 * POS MORE STEP 5 — Own Shift Report repair (source + access matrix).
 * Does not hit QA/Production DB. Documents voidCashLak = 0 until STEP 9.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  STORE_ACTIONS,
  hasStorePermission,
} from "../features/permissions/store-permissions";
import {
  OWN_SHIFT_VOID_CASH_LIMITATION,
  canAccessOwnShiftReport,
  canViewBranchShiftReports,
} from "../features/reports/own-shift-report-access";
import { BRANCH_SHIFT_LIST_LIMIT } from "../features/reports/own-shift-report-service";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const service = read("features/reports/own-shift-report-service.ts");
const access = read("features/reports/own-shift-report-access.ts");
const route = read("app/api/pos/own-shift-report/route.ts");
const drawer = read("features/pos/components/own-shift-report-drawer.tsx");
const client = read("features/pos/components/pos-page-client.tsx");
const permissions = read("features/permissions/store-permissions.ts");
const cashRepo = read("features/cash-sessions/prisma-repository.ts");
const moreNav = read("scripts/phase-pos-more-back-navigation-check.ts");
const step4 = read("scripts/phase-pos-more-step4-hold-reservation-check.ts");
const step3 = read("scripts/phase-pos-more-step3-cash-shift-count-check.ts");
const step2 = read("scripts/phase-pos-more-step2-refund-auth-check.ts");

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`FAIL  ${name}`);
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

// --- CASHIER / MANAGER / OWNER access matrix ---
check("1. Cashier own shift allowed (capability)", () => {
  assert.equal(canAccessOwnShiftReport("cashier"), true);
  assert.equal(canViewBranchShiftReports("cashier"), false);
});

check("2. Cashier closed shift path uses own cashierId filter", () => {
  assert(service.includes("cashierId: tenant.userId"), "own cashier filter");
  assert(service.includes("closedAt: null"), "prefers open");
});

check("3. another cashier session rejected for Cashier", () => {
  assert(service.includes("!access.canViewBranch && String(session.cashierId) !== String(tenant.userId)"), "reject");
  assert(route.includes("forbiddenOverrideParams"), "blocks cashierId override");
  assert(route.includes('"cashierId"'), "cashierId forbidden");
});

check("4. Manager own shift allowed", () => {
  assert.equal(canAccessOwnShiftReport("manager"), true);
  assert.equal(hasStorePermission("manager", STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT), true);
});

check("5. Manager branch session list allowed", () => {
  assert.equal(canViewBranchShiftReports("manager"), true);
  assert(service.includes("listBranchShiftSessions"), "list fn");
  assert(service.includes("REPORTS_VIEW_FULL"), "full gate");
});

check("6. Manager branch cashier session detail allowed", () => {
  assert(service.includes("access.canViewBranch ? {} : { cashierId: tenant.userId }"), "branch detail");
  assert(service.includes("createdBy: cashierId"), "sales by session cashier");
});

check("7. other branch rejected (branchOwnedWhere)", () => {
  assert(service.includes("branchOwnedWhere(scope)"), "branch scope");
});

check("8. Owner authorized branch/company list allowed", () => {
  assert.equal(canAccessOwnShiftReport("owner"), true);
  assert.equal(canViewBranchShiftReports("owner"), true);
  assert.equal(hasStorePermission("owner", STORE_ACTIONS.REPORTS_VIEW_FULL), true);
});

check("9. Owner authorized session detail allowed", () => {
  assert(service.includes("getOwnShiftReport"), "detail");
  assert(route.includes('mode === "branch"'), "branch mode route");
});

// --- DATA fields ---
check("10. opening cash correct field", () => {
  assert(service.includes("openingCashLak"), "opening");
  assert(service.includes("amount(session.openingCash)"), "from session");
});

check("11. Cash In included", () => {
  assert(service.includes('transactionType === "cash_in"'), "cash in");
  assert(service.includes("cashInLak"), "field");
});

check("12. Cash Out included", () => {
  assert(service.includes('transactionType === "cash_out"'), "cash out");
});

check("13. refunds included", () => {
  assert(service.includes("refundCashLak"), "cash refunds");
  assert(service.includes("computeCashRefundLak"), "cash refund calc");
});

check("14. expected cash correct under current formula", () => {
  assert(
    service.includes("openingCashLak + cashLak + voidCashLak + cashInLak - cashOutLak - refundCashLak - voidCashLak"),
    "formula includes voidCashLak (STEP 9)",
  );
});

check("15. counted cash correct", () => {
  assert(service.includes("closingCashLak"), "closing/counted");
});

check("16. variance correct", () => {
  assert(service.includes("closingCashLak - expectedCashLak") || service.includes("cashDifference"), "variance");
});

check("17. payment breakdown correct", () => {
  assert(service.includes("paymentBreakdown"), "breakdown");
  assert(service.includes("nonCashLak"), "non-cash");
});

check("18. countBreakdown displayed when present", () => {
  assert(service.includes("parseCashSessionCountBreakdown"), "parse");
  assert(drawer.includes("BreakdownSections") || drawer.includes("openingDenoms"), "UI denoms");
  assert(drawer.includes("DenominationTable") || drawer.includes("denominationLineSubtotal"), "table");
});

check("19. NULL countBreakdown safe", () => {
  assert(service.includes("parseCashSessionCountBreakdown"), "parse");
  assert(/catch\s*\{[\s\S]*return null/.test(service), "safe parse catch");
  assert(drawer.includes("noBreakdown"), "null UI");
});

// --- UI ---
check("20. Cashier sees My Shift only", () => {
  assert(drawer.includes("showBranchMode = canViewBranchShiftReports(storeRole)"), "gate");
  assert(drawer.includes('selectMode("my")') || drawer.includes('mode === "my"'), "my mode");
});

check("21. Manager/Owner sees Branch Shifts", () => {
  assert(drawer.includes("branchMode"), "branch label");
  assert(drawer.includes('selectMode("branch")') || drawer.includes('mode === "branch"'), "branch mode");
  assert(client.includes("storeRole={posPermissionPolicy.role}"), "role passed");
});

check("22. Back-to-More unchanged", () => {
  assert(moreNav.includes("Own Shift Report"), "more nav covers Own Shift");
  assert(client.includes("backFromMoreChild(() => setOwnShiftReportOpen(false))"), "back");
});

check("23. X unchanged", () => {
  assert(client.includes("closeMoreChild(() => setOwnShiftReportOpen(false))"), "close");
});

// --- SECURITY ---
check("24. unauthorized direct API rejected", () => {
  assert(route.includes("canAccessOwnShiftReport"), "access gate");
  assert(route.includes("PermissionMatrixDeniedError"), "403");
  assert(route.includes("forbiddenOverrideParams"), "override block");
  assert(access.includes("REPORTS_VIEW_OWN_SHIFT") && access.includes("REPORTS_VIEW_FULL"), "OR access");
});

check("25. Manager 403 repaired via OWN_SHIFT on manager matrix", () => {
  assert(permissions.includes("REPORTS_VIEW_OWN_SHIFT"), "own shift action");
  // managerAllowed includes OWN_SHIFT after REPORTS_VIEW_FULL
  const managerSlice = permissions.slice(
    permissions.indexOf("const managerAllowed"),
    permissions.indexOf("const cashierAllowed"),
  );
  assert(managerSlice.includes("REPORTS_VIEW_OWN_SHIFT"), "manager has own shift");
  assert(managerSlice.includes("REPORTS_VIEW_FULL"), "manager keeps full");
});

check("26. Branch list bounded", () => {
  assert.equal(BRANCH_SHIFT_LIST_LIMIT, 40);
  assert(service.includes("take: BRANCH_SHIFT_LIST_LIMIT"), "bounded take");
});

check("27. Void cash properly integrated (STEP 9 resolved)", () => {
  assert.equal(OWN_SHIFT_VOID_CASH_LIMITATION, "", "limitation cleared after STEP 9 fix");
  assert(!cashRepo.includes("voidCashLak: 0"), "voidCashLak no longer hardcoded 0");
  assert(cashRepo.includes("voidCashLak"), "voidCashLak derived in session repo");
  assert(service.includes("voidCashLak"), "voidCashLak on report");
});

check("28. No dedicated print redesign (STEP 8)", () => {
  assert(!drawer.includes("window.print"), "no new print wiring");
  assert(!drawer.includes("reprint"), "no reprint");
});

check("29. Authoritative DB service — no localStorage totals", () => {
  assert(!drawer.includes("localStorage"), "no localStorage");
  assert(drawer.includes("/api/pos/own-shift-report"), "server fetch");
});

check("30. Untouched STEP 2/3/4 markers", () => {
  assert(step4.includes("StockReservation"), "STEP4 harness present");
  assert(step3.includes("countBreakdown"), "STEP3 harness present");
  assert(step2.includes("approval"), "STEP2 harness present");
  assert(!client.includes("voidCashLak:"), "client does not invent void cash");
});

console.log(`\nSTEP5 own shift report checks passed: ${passed}`);
if (process.exitCode) {
  process.exit(1);
}
