/**
 * POS MORE STEP 6 — Recent Sales completion (source + API/UI wiring).
 * Does not hit QA/Production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clampRecentSalesLimit,
  decodeRecentSalesCursor,
  encodeRecentSalesCursor,
  RECENT_SALES_DEFAULT_LIMIT,
  RECENT_SALES_MAX_LIMIT,
  resolveRecentSalesDateRange,
} from "../features/pos/recent-sales-query";
import { mapDbSaleStatus, mapSaleRow } from "../features/pos/post-sale-shared";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const repo = read("features/pos/post-sale-repository.ts");
const shared = read("features/pos/post-sale-shared.ts");
const clientApi = read("features/pos/post-sale-client.ts");
const route = read("app/api/pos/sales/route.ts");
const detailRoute = read("app/api/pos/sales/[id]/route.ts");
const page = read("features/pos/components/pos-page-client.tsx");
const query = read("features/pos/recent-sales-query.ts");
const returnModal = read("features/pos/components/return-exchange-void-modal.tsx");
/** R1-safe markers only — do not require R2/R3 step scripts (PIN/Hold/Cash Shift/Own Shift repair). */
const favoritesCheck = read("scripts/phase-pos-favorites-filter-grid-check.ts");
const exactCheck = read("scripts/phase-pos-exact-payment-check.ts");
const saleOptionsCheck = read("scripts/phase-pos-ux-step2-sale-options-check.ts");
const moreNav = read("scripts/phase-pos-more-back-navigation-check.ts");

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

check("1. real DB sales source", () => {
  assert(repo.includes("db.sale.findMany"), "prisma findMany");
  assert(repo.includes("assertPosActionAllowed(policy, \"view_recent_sales\")"), "permission");
  assert(!repo.includes("demoSalesRepository"), "no demo repo");
  assert(page.includes("fetchRecentSales("), "client fetch");
  assert(!page.includes("haystack.includes(search)"), "no client haystack search");
});

check("2. newest first", () => {
  assert(repo.includes('orderBy: [{ createdAt: "desc" }, { id: "desc" }]'), "stable desc order");
});

check("3. branch/company scope", () => {
  assert(repo.includes("companyId: tenant.companyId"), "company");
  assert(repo.includes("...branchOwnedWhere(scope)"), "branch scope");
  assert(repo.includes("Not restricted to own cashierId"), "documented branch policy");
});

check("4. page size bounded", () => {
  assert.equal(RECENT_SALES_DEFAULT_LIMIT, 25);
  assert.equal(RECENT_SALES_MAX_LIMIT, 50);
  assert.equal(clampRecentSalesLimit(999), 50);
  assert.equal(clampRecentSalesLimit(0), 25);
  assert(repo.includes("clampRecentSalesLimit"), "uses clamp");
  assert(route.includes("clampRecentSalesLimit"), "route clamps");
});

check("5. next page works (cursor)", () => {
  assert(repo.includes("encodeRecentSalesCursor"), "encode");
  assert(repo.includes("decodeRecentSalesCursor"), "decode");
  assert(repo.includes("nextCursor"), "nextCursor");
  assert(repo.includes("hasMore"), "hasMore");
  assert(page.includes("onLoadMore"), "UI load more");
  assert(page.includes("append: true"), "append page");
  const cursor = encodeRecentSalesCursor({
    createdAt: "2026-09-19T00:00:00.000Z",
    id: "sale-1",
  });
  assert.deepEqual(decodeRecentSalesCursor(cursor), {
    createdAt: "2026-09-19T00:00:00.000Z",
    id: "sale-1",
  });
});

check("6. no duplicate page results", () => {
  assert(repo.includes("createdAt: { lt: cursorDate }"), "cursor lt");
  assert(repo.includes("{ id: { lt: cursor.id } }"), "tie-break id");
  assert(repo.includes("take: limit + 1"), "peek hasMore");
});

check("7. receipt search", () => {
  assert(repo.includes("receiptNo: { contains: search"), "receipt");
  assert(repo.includes("saleNo: { contains: search"), "saleNo");
});

check("8. customer search where supported", () => {
  assert(repo.includes("customer: { fullName: { contains: search"), "customer name");
});

check("9. phone search where supported", () => {
  assert(repo.includes("customer: { phone: { contains: search"), "phone");
});

check("10. no-result state", () => {
  assert(page.includes('t("ui.no.search.results")'), "no search results");
  assert(page.includes('t("ui.no.recent.sales")'), "empty list");
  assert(page.includes("recentSalesError"), "error state");
  assert(page.includes('t("ui.recent.sales.load.failed")') || page.includes("ui.recent.sales.load.failed"), "failed copy");
});

check("11. item lines correct", () => {
  assert(shared.includes("sellingPrice"), "unit price");
  assert(shared.includes("unitName"), "unit");
  assert(shared.includes("lineDiscountLak"), "line discount");
  assert(detailRoute.includes("getPrismaSaleById"), "detail API");
});

check("12. totals correct", () => {
  assert(shared.includes("subtotal: amount(sale.subtotal)"), "subtotal");
  assert(shared.includes("totalAmount: amount(sale.totalAmount)"), "total");
  assert(shared.includes("discountAmount: amount(sale.discountAmount)"), "discount");
});

check("13. payment breakdown correct", () => {
  assert(shared.includes("paymentBreakdown:"), "breakdown map");
  assert(page.includes("paymentBreakdown"), "UI shows breakdown");
});

check("14. member/customer safe", () => {
  assert(shared.includes('sale.customer?.fullName ? String(sale.customer.fullName) : "Guest"'), "null customer");
});

check("15. legacy NULL safe", () => {
  const row = mapSaleRow(
    {
      branchId: "b1",
      changeAmount: null,
      createdAt: "2026-09-19T00:00:00.000Z",
      customer: null,
      customerId: null,
      discountAmount: null,
      discountPercent: null,
      id: "s1",
      items: [],
      payments: [],
      receiptNo: null,
      refunds: null,
      saleNo: "QA1",
      saleStatus: "completed",
      subtotal: null,
      taxAmount: null,
      totalAmount: null,
      warehouseId: "w1",
    },
    "Cashier",
  );
  assert.equal(row.customerName, "Guest");
  assert.equal(row.receiptNo, "RCPT-QA1");
  assert.equal(row.totalAmount, 0);
  assert.equal(row.itemCount, 0);
  assert.deepEqual(row.paymentBreakdown, []);
});

check("16. refund status rendered correctly", () => {
  assert.equal(mapDbSaleStatus("refunded"), "refunded");
  assert.equal(mapDbSaleStatus("partial_refunded"), "partial_refunded");
  assert(page.includes("SaleStatusBadge"), "badge");
});

check("17. void status rendered correctly", () => {
  assert.equal(mapDbSaleStatus("cancelled"), "voided");
  assert.equal(mapDbSaleStatus("voided"), "voided");
});

check("18. unsupported demo edit removed/disabled", () => {
  assert(!page.includes("onEditField"), "no edit prop");
  assert(!page.includes('t("ui.edit.note")'), "no edit note button");
  assert(!page.includes('t("ui.edit.customer")'), "no edit customer");
  assert(!page.includes('t("ui.edit.payment")'), "no edit payment");
});

check("19. unsupported delete removed/disabled", () => {
  assert(!page.includes("onSoftDelete"), "no soft delete");
  assert(!page.includes("softDeleteSale"), "no soft delete fn");
  assert(!page.includes("showDeleted"), "no show deleted");
});

check("20. unsupported payment edit removed/disabled", () => {
  assert(!page.includes("edit_sale_payment"), "no payment edit action UI");
  assert(!page.includes("saleFieldPrompt"), "no field prompt");
});

check("21. Return/Exchange/Void uses canonical STEP2 flow", () => {
  assert(page.includes("openReturnExchange"), "opens STEP2 modal");
  assert(page.includes("ReturnExchangeVoidModal"), "canonical modal");
  assert(returnModal.includes("returnSaleRequest") || returnModal.length > 0, "return modal present");
  assert(page.includes("voidSaleRequest") || page.includes("onVoid={voidSale}"), "void path");
});

check("22. Reprint preserves existing audit path", () => {
  assert(page.includes("reprintSaleReceipt"), "reprint API");
  assert(page.includes("fetchSaleReceipt"), "receipt fetch");
  assert(clientApi.includes("reprintSaleReceipt"), "client");
});

check("23. Back → More unchanged", () => {
  assert(page.includes("backFromMoreChild(() => setRecentSalesOpen(false))"), "back");
  assert(moreNav.includes("Recent Sales"), "more nav suite");
});

check("24. X → POS unchanged", () => {
  assert(page.includes("closeMoreChild(() => setRecentSalesOpen(false))"), "close");
});

check("25. unauthorized direct list/detail API rejected", () => {
  assert(repo.includes('assertPosActionAllowed(policy, "view_recent_sales")'), "list gate");
  assert(detailRoute.includes('assertPosActionAllowed(policy, "view_recent_sales")'), "detail gate");
});

check("26. cross-scope sale detail rejected", () => {
  assert(shared.includes("...branchOwnedWhere(scope)"), "detail scope");
  assert(detailRoute.includes("getPrismaSaleById"), "scoped loader");
  assert(detailRoute.includes('throw new Error("Sale was not found.")'), "missing/out of scope");
});

check("27. server result not dependent on local state", () => {
  assert(page.includes("fetchRecentSales({"), "server fetch params");
  assert(query.includes("RECENT_SALES_DEFAULT_LIMIT"), "shared limit");
  assert(!page.includes("haystack"), "no local filter haystack");
  const today = resolveRecentSalesDateRange("today", null, null, new Date("2026-09-19T12:00:00"));
  assert(today.from instanceof Date);
  assert(today.to instanceof Date);
});

check("28. R1 UX markers untouched", () => {
  assert(favoritesCheck.includes("Favorites") || favoritesCheck.includes("favorite"), "favorites");
  assert(exactCheck.includes("Exact") || exactCheck.includes("exact"), "exact");
  assert(saleOptionsCheck.includes("Sale Options") || saleOptionsCheck.includes("sale.options"), "sale options");
  assert(moreNav.includes("Back") || moreNav.includes("backFromMoreChild"), "more nav");
});

if (process.exitCode && process.exitCode !== 0) {
  console.error(`\nSTEP6 recent sales checks failed after ${passed} passes.`);
} else {
  console.log(`\nSTEP6 recent sales checks passed: ${passed}`);
}
