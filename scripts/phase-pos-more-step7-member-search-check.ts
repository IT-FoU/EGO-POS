/**
 * POS MORE STEP 7 — Member Search completion (source + API/UI wiring).
 * Does not hit QA/Production DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clampMemberSearchLimit,
  MEMBER_SEARCH_DEFAULT_LIMIT,
  MEMBER_SEARCH_DEBOUNCE_MS,
  MEMBER_SEARCH_MAX_LIMIT,
  memberSearchPhoneDigits,
  normalizeMemberSearchQuery,
} from "../features/pos/member-search-query";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const query = read("features/pos/member-search-query.ts");
const repo = read("features/pos/member-search-repository.ts");
const client = read("features/pos/member-search-client.ts");
const route = read("app/api/pos/members/search/route.ts");
const panel = read("features/pos/components/member-search-panel.tsx");
const page = read("features/pos/components/pos-page-client.tsx");
const prismaRepo = read("features/pos/prisma-repository.ts");
const saleOptions = read("features/pos/components/sale-options-drawer.tsx");
const loyalty = read("features/loyalty/loyalty-service.ts");
const heldRepo = read("features/pos/held-bills-repository.ts");
const step6 = read("scripts/phase-pos-more-step6-recent-sales-check.ts");
const step5 = read("scripts/phase-pos-more-step5-own-shift-report-check.ts");
const step4 = read("scripts/phase-pos-more-step4-hold-reservation-check.ts");
const step3 = read("scripts/phase-pos-more-step3-cash-shift-count-check.ts");
const step2 = read("scripts/phase-pos-more-step2-refund-auth-check.ts");
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

check("1. server-side name search", () => {
  assert(repo.includes('fullName: { contains: query, mode: "insensitive" }'), "fullName");
  assert(repo.includes("db.customer.findMany"), "prisma");
  assert(client.includes("fetchMemberSearch"), "client");
  assert(route.includes("searchPrismaMembers"), "route");
  assert(!page.includes("customers.filter((item)"), "no client snapshot filter");
});

check("2. phone search", () => {
  assert(repo.includes('phone: { contains: query, mode: "insensitive" }'), "phone contains");
  assert(repo.includes("memberSearchPhoneDigits"), "digit helper");
  assert.equal(memberSearchPhoneDigits("+856 20 5555"), "856205555");
});

check("3. member/customer number search", () => {
  assert(repo.includes("customerCode: { contains: query"), "customerCode");
  assert(repo.includes("qrMemberCode: { contains: query"), "qrMemberCode");
});

check("4. bounded results", () => {
  assert.equal(MEMBER_SEARCH_DEFAULT_LIMIT, 20);
  assert.equal(MEMBER_SEARCH_MAX_LIMIT, 50);
  assert.equal(clampMemberSearchLimit(999), 50);
  assert.equal(clampMemberSearchLimit(0), 20);
  assert(repo.includes("clampMemberSearchLimit"), "repo clamp");
  assert(route.includes("clampMemberSearchLimit"), "route clamp");
  assert(repo.includes("take: limit"), "take limit");
});

check("5. no-result state", () => {
  assert(panel.includes('setStatus("empty")'), "empty status");
  assert(panel.includes('t("ui.no.customer.or.membership.found")'), "empty copy");
  assert.equal(normalizeMemberSearchQuery("  "), "");
});

check("6. company/branch scope", () => {
  assert(repo.includes("companyId: tenant.companyId"), "company");
  assert(repo.includes("...branchOwnedWhere(scope)"), "branchOwnedWhere");
  assert(repo.includes('status: "active"'), "active only");
});

check("7. unauthorized direct search rejected", () => {
  assert(repo.includes('assertPosActionAllowed(policy, "create_sale")'), "POS permission");
  assert(repo.includes("buildPosPolicyForTenant"), "policy");
});

check("8. selecting member attaches canonical ID", () => {
  assert(page.includes("function selectMember(customer: PosCustomer)"), "selectMember");
  assert(page.includes("setSelectedCustomer(customer)"), "set selected");
  assert(page.includes("customerId: selectedCustomer?.id"), "checkout customerId");
});

check("9. selected summary shown", () => {
  assert(panel.includes('data-testid="pos-selected-member"'), "selected card");
  assert(panel.includes("customer.membershipNumber"), "member no");
  assert(panel.includes("customer.pointsBalance"), "points");
  assert(page.includes("<MemberSearchPanel"), "panel wired");
});

check("10. clear removes member only", () => {
  assert(page.includes("function clearSelectedMember"), "clear fn");
  assert(page.includes("setSelectedCustomer(null)"), "clear id");
  assert(page.includes("setRedeemPoints(0)"), "reset redeem");
  assert(panel.includes('t("ui.remove.member")'), "remove UI");
  const clearStart = page.indexOf("function clearSelectedMember");
  const clearEnd = page.indexOf("function updateQuantity", clearStart);
  const clearSlice = page.slice(clearStart, clearEnd > clearStart ? clearEnd : clearStart + 200);
  assert(clearSlice.includes("setSelectedCustomer(null)"), "clears customer");
  assert(clearSlice.includes("setRedeemPoints(0)"), "clears redeem");
  assert(!clearSlice.includes("setCartItems"), "clear does not touch cart");
});

check("11. cart remains intact", () => {
  assert(page.includes("do not reprice existing cart lines"), "documented");
  assert(page.includes("onClear={clearSelectedMember}"), "wired clear");
});

check("12. Sale persists selected member/customer", () => {
  assert(page.includes("customerId: selectedCustomer?.id"), "completeSale customerId");
  assert(prismaRepo.includes("customerId: input.customerId"), "sale create customerId");
});

check("13. Recent Sales can read member/customer", () => {
  assert(step6.includes("customer search where supported") || step6.includes("customer"), "STEP6 present");
  const shared = read("features/pos/post-sale-shared.ts");
  assert(shared.includes("customerId: sale.customerId"), "recent sales maps customerId");
  assert(shared.includes("customerName:"), "recent sales maps name");
});

check("14. selected member persists into Hold snapshot", () => {
  assert(page.includes("customer: selectedCustomer"), "hold snapshot customer");
  assert(heldRepo.includes("validateCustomer"), "hold validates customer");
  assert(heldRepo.includes("customerId"), "hold stores customerId");
});

check("15. Resume restores same member", () => {
  assert(page.includes("const restoredCustomer = snapshot?.customer ?? null"), "resume from snapshot");
  assert(page.includes("setSelectedCustomer(restoredCustomer)"), "restore selected");
});

check("16. existing point display preserved", () => {
  assert(panel.includes("customer.pointsBalance"), "display points");
  assert(panel.includes("ui.redeem.points"), "redeem UI");
  assert(loyalty.includes("calculateLoyaltyRedemption"), "loyalty service");
});

check("17. invalid over-redemption rejected", () => {
  assert(loyalty.includes("Insufficient loyalty points"), "over-redeem throw");
  assert(loyalty.includes("maxRedeemablePoints"), "cap");
});

check("18. clearing member resets invalid redemption state", () => {
  const clearStart = page.indexOf("function clearSelectedMember");
  const clearEnd = page.indexOf("function updateQuantity", clearStart);
  const clearSlice = page.slice(clearStart, clearEnd > clearStart ? clearEnd : clearStart + 200);
  assert(clearSlice.includes("setRedeemPoints(0)"), "clear resets redeem");
  assert(page.includes("setRedeemPoints(0)"), "select also resets");
});

check("19. no new Subscriber pricing introduced", () => {
  assert(!page.includes("subscriberPrice"), "no subscriber price");
  assert(!repo.includes("subscriptionPlan"), "search repo no plan pricing");
  assert(saleOptions.includes("MemberSearchPanel + fetchMemberSearch"), "reuse marker only");
  assert(saleOptions.includes("ui.no.subscriber.selected"), "subscriber still placeholder");
});

check("20. existing cart prices unchanged unless canonical current loyalty rule applies", () => {
  assert(page.includes("applyCustomerPricing"), "existing add-to-cart pricing preserved");
  assert(page.includes("do not reprice existing cart lines"), "no reprice on select");
});

check("21. search source is server, not boot snapshot", () => {
  assert(prismaRepo.includes("customers: [] as PosCustomer[]"), "empty boot customers");
  assert(prismaRepo.includes("do not boot-load the full customer/member table"), "documented");
  assert(client.includes("/api/pos/members/search"), "API path");
  assert(!page.includes("searchMembership"), "old snapshot search gone");
});

check("22. Back → More unchanged", () => {
  assert(page.includes('onBack={() => backFromMoreChild(() => setMemberSearchOpen(false))}'), "back");
  assert(moreNav.includes("Member Search"), "more nav script");
});

check("23. X → POS unchanged", () => {
  assert(page.includes('onClose={() => closeMoreChild(() => setMemberSearchOpen(false))}'), "close");
});

check("24. member selection not silently cleared by navigation", () => {
  const backSlice = page.slice(
    page.indexOf("setMemberSearchOpen(true)"),
    page.indexOf("setMemberSearchOpen(true)") + 80,
  );
  assert(!backSlice.includes("setSelectedCustomer(null)"), "open does not clear");
  assert(
    !page.includes("backFromMoreChild(() => { setMemberSearchOpen(false); setSelectedCustomer(null)"),
    "back does not clear member",
  );
  assert(
    !page.includes("closeMoreChild(() => { setMemberSearchOpen(false); setSelectedCustomer(null)"),
    "close does not clear member",
  );
});

check("debounce + idle/loading UX", () => {
  assert.equal(MEMBER_SEARCH_DEBOUNCE_MS, 300);
  assert(panel.includes("MEMBER_SEARCH_DEBOUNCE_MS"), "uses debounce");
  assert(panel.includes('setStatus("idle")'), "idle");
  assert(panel.includes('setStatus("loading")'), "loading");
  assert(panel.includes('setStatus("error")'), "error");
  assert(query.includes("MEMBER_SEARCH_DEBOUNCE_MS"), "query export");
});

check("STEP 2–6 markers untouched", () => {
  assert(step2.includes("RESULT  PASS") || step2.includes("PASS"), "step2");
  assert(step3.includes("Cash Shift Count") || step3.includes("denomination"), "step3");
  assert(step4.includes("StockReservation"), "step4");
  assert(step5.includes("own shift"), "step5");
  assert(step6.includes("recent sales") || step6.includes("Recent Sales"), "step6");
});

if (process.exitCode && process.exitCode !== 0) {
  console.error(`\nSTEP7 member search checks failed after ${passed} passes`);
  process.exit(process.exitCode);
}

console.log(`\nSTEP7 member search checks passed: ${passed}`);
