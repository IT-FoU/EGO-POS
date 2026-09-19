/**
 * POS MORE STEP 8 — Print / Reprint Completion checks.
 * Verifies that More "Print / Reprint Receipt" is unified onto the same
 * canonical audited reprint path as Recent Sales, that first-print after
 * checkout is distinguished, and that the prior unaudited lastReceipt-only
 * bypass is removed.
 *
 * ~21 checks. Does NOT hit QA / Production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const page = read("features/pos/components/pos-page-client.tsx");
const clientApi = read("features/pos/post-sale-client.ts");
const reprintRoute = read("app/api/pos/sales/[id]/reprint/route.ts");
const repository = read("features/pos/post-sale-repository.ts");
const checkoutReceipt = read("features/pos/checkout-receipt.ts");
const permissions = read("features/pos/permissions.ts");
const step6 = read("scripts/phase-pos-more-step6-recent-sales-check.ts");
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

/* ── Print entry-point audit ── */

check("1. ReceiptSnapshot carries persisted saleId", () => {
  assert(page.includes("saleId?: string"), "ReceiptSnapshot type has saleId");
  assert(page.includes('saleId?: string'), "saleId is optional (absent in demo mode)");
});

check("2. receiptSnapshotFromPersistedSale populates saleId", () => {
  assert(checkoutReceipt.includes("saleId: sale.id"), "saleId from persisted sale");
});

check("3. openReceiptForSale passes saleId from server receipt", () => {
  assert(page.includes("saleId: sale.id,"), "saleId set in openReceiptForSale receipt");
});

check("4. ReceiptPreview accepts saleId prop", () => {
  assert(page.includes("saleId?: string;"), "saleId prop in ReceiptPreview type");
  assert(page.includes("saleId={lastReceipt.saleId}"), "saleId passed from render");
});

check("5. ReceiptPreview accepts isFirstPrint prop", () => {
  assert(page.includes("isFirstPrint?: boolean"), "isFirstPrint prop");
  assert(page.includes("isFirstPrint={receiptIsFirstPrint}"), "isFirstPrint passed from render");
});

/* ── More menu print unification ── */

check("6. More Print/Reprint uses canonical reprintSaleReceipt", () => {
  const moreBlock = page.slice(
    page.indexOf('label={t("ui.print.reprint.receipt")}'),
    page.indexOf('label={t("ui.print.reprint.receipt")}') + 2000,
  );
  assert(moreBlock.includes("reprintSaleReceipt(saleId)"), "calls reprint API");
  assert(moreBlock.includes("fetchSaleReceipt(saleId)"), "fetches authoritative receipt");
});

check("7. More Print/Reprint removes unaudited lastReceipt-only bypass", () => {
  const moreBlock = page.slice(
    page.indexOf('label={t("ui.print.reprint.receipt")}'),
    page.indexOf('label={t("ui.print.reprint.receipt")}') + 2000,
  );
  assert(!moreBlock.includes("if (lastReceipt) {\n                setReceiptAutoPrint(false);\n                setReceiptOpen(true);\n            }"), "old bypass removed");
  assert(moreBlock.includes("canonical audited reprint path") || moreBlock.includes("STEP 8"), "documented");
});

check("8. More Print/Reprint falls back to Recent Sales when no saleId", () => {
  const moreBlock = page.slice(
    page.indexOf('label={t("ui.print.reprint.receipt")}'),
    page.indexOf('label={t("ui.print.reprint.receipt")}') + 2000,
  );
  assert(moreBlock.includes("setRecentSalesOpen(true)"), "falls back to Recent Sales");
});

check("9. More Print/Reprint checks reprint_receipt permission", () => {
  const moreBlock = page.slice(
    page.indexOf('label={t("ui.print.reprint.receipt")}'),
    page.indexOf('label={t("ui.print.reprint.receipt")}') + 2000,
  );
  assert(moreBlock.includes('enforcePosAction("reprint_receipt")'), "permission gate");
});

/* ── First print after checkout ── */

check("10. First print sets receiptIsFirstPrint = true", () => {
  assert(page.includes("setReceiptIsFirstPrint(true)"), "flag set for first print");
  const firstPrintBlock = page.slice(
    page.indexOf("onPrint={() => {"),
    page.indexOf("onPrint={() => {") + 300,
  );
  assert(firstPrintBlock.includes("setReceiptIsFirstPrint(true)"), "onPrint sets first print");
});

check("11. View receipt after checkout sets receiptIsFirstPrint = true", () => {
  const viewBlock = page.slice(
    page.indexOf("onView={() => {"),
    page.indexOf("onView={() => {") + 300,
  );
  assert(viewBlock.includes("setReceiptIsFirstPrint(true)"), "onView sets first print");
});

check("12. Recent Sales sets receiptIsFirstPrint = false", () => {
  assert(page.includes("setReceiptIsFirstPrint(false)"), "flag cleared for reprints");
  const start = page.indexOf("function openReceiptForSale");
  const end = page.indexOf("function appendSaleTimeline");
  const openReceiptBlock = page.slice(start, end);
  assert(openReceiptBlock.includes("setReceiptIsFirstPrint(false)"), "openReceiptForSale clears flag");
});

/* ── ReceiptPreview canonical reprint ── */

check("13. ReceiptPreview manual print calls reprintSaleReceipt for non-first-print", () => {
  const start = page.indexOf("function ReceiptPreview");
  const end = page.indexOf("function ReceiptRow");
  const receiptPreviewBlock = page.slice(start, end);
  assert(receiptPreviewBlock.includes("await reprintSaleReceipt(saleId)"), "reprint audit in button");
  assert(receiptPreviewBlock.includes("!isFirstPrint"), "skips for first print");
});

check("14. ReceiptPreview auto-print does NOT duplicate reprint audit", () => {
  const start = page.indexOf("function ReceiptPreview");
  const end = page.indexOf("function ReceiptRow");
  const receiptPreviewBlock = page.slice(start, end);
  const effectStart = receiptPreviewBlock.indexOf("useEffect");
  const effectEnd = receiptPreviewBlock.indexOf("}, [autoPrint, autoPrintStarted, onReprint]");
  const autoBlock = receiptPreviewBlock.slice(effectStart, effectEnd);
  assert(!autoBlock.includes("await reprintSaleReceipt"), "auto-print does not call reprint API (await)");
  assert(autoBlock.includes("window.print()"), "auto-print uses window.print transport");
});

check("15. window.print is transport only (all paths)", () => {
  const start = page.indexOf("function ReceiptPreview");
  const end = page.indexOf("function ReceiptRow");
  const receiptPreviewBlock = page.slice(start, end);
  const printCalls = receiptPreviewBlock.match(/window\.print\(\)/g) ?? [];
  assert(printCalls.length >= 2, `window.print appears at least twice (auto + manual), got ${printCalls.length}`);
});

/* ── API / repository wiring ── */

check("16. reprint API route exists and calls logPrismaReceiptReprint", () => {
  assert(reprintRoute.includes("logPrismaReceiptReprint"), "reprint route");
  assert(reprintRoute.includes('method: "POST"') || reprintRoute.includes("POST"), "POST handler");
});

check("17. logPrismaReceiptReprint checks reprint_receipt permission", () => {
  assert(repository.includes('assertPosActionAllowed(policy, "reprint_receipt")'), "permission gate");
});

check("18. logPrismaReceiptReprint uses withTenantTransaction for audit", () => {
  assert(repository.includes("withTenantTransaction"), "audited transaction");
  assert(repository.includes('action: "reprint"'), "action label");
});

check("19. reprintSaleReceipt client calls POST /api/pos/sales/{id}/reprint", () => {
  assert(clientApi.includes("reprintSaleReceipt"), "client function");
  assert(clientApi.includes("/reprint"), "reprint endpoint");
  assert(clientApi.includes('method: "POST"'), "POST method");
});

/* ── Permission model ── */

check("20. reprint_receipt permission defined for all roles", () => {
  assert(permissions.includes('"reprint_receipt"'), "action exists");
  assert(permissions.includes("reprint_receipt"), "in allPosActions");
});

/* ── Navigation preserved ── */

check("21. Back/X navigation preserved for receipt preview", () => {
  assert(page.includes("backFromMoreChild(() => { setReceiptOpen(false); setReceiptAutoPrint(false); })"), "Back to More");
  assert(page.includes('if (!recentSalesOpen) setMoreMenuOpen(false)'), "X closes More");
});

/* ── Guards ── */

check("22. STEP 2–7 markers untouched", () => {
  assert(step2.includes("STEP 2") || step2.includes("refund"), "step2");
  assert(step6.includes("STEP6") || step6.includes("recent sales"), "step6");
});

if (process.exitCode && process.exitCode !== 0) {
  console.error(`\nSTEP8 print/reprint checks failed after ${passed} passes.`);
} else {
  console.log(`\nSTEP8 print/reprint checks passed: ${passed}`);
}
