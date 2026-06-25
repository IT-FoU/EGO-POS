# B8-8 Completion Report — Promotion Hardening

**Phase:** B8-8 Promotion Hardening  
**Date:** 2026-06-25  
**Implementation commit:** `c07a41f`  
**Verdict:** **PASS**

---

## What Changed

B8-8 moved promotion handling to a production-safe, server-authoritative path used by checkout and reporting:

- Added central promotion checkout engine in `features/promotions/promotion-checkout.ts`.
- Integrated POS checkout with server promotion enforcement in `features/pos/prisma-repository.ts`.
- Hardened promotion CRUD/target updates and permission checks in `features/promotions/prisma-repository.ts`.
- Added comprehensive phase harness in `scripts/phase-b8-8-promotion-check.ts`.

## Server-Authoritative Promotion Calculation

- Client-provided `promotionId` / `promotionDiscount` is rejected (`rejectClientPromotionClaims`).
- Server recalculates promotions from DB rules during checkout (`applyActivePromotions`).
- Invalid or manipulated promotion usage is blocked before sale persistence.
- Promotion usage is recorded from server-computed sale lines only (`recordPromotionUsage`), with duplicate-usage guard per sale/promotion.

## Promotion Eligibility and Stacking Behavior

- Eligibility checks include:
  - active status + schedule window,
  - coupon/code match when a code is configured,
  - product/category targeting,
  - membership targeting where configured.
- Store-wide spend-threshold fixed discount is applied only when `buyQuantity` minimum spend is met.
- Priority order is enforced (`priority desc`, then start date), and line-level tie breaks choose higher priority.
- Stacking is disabled for checkout (`allowStacking: false`) to prevent double-discounting.
- Same promotion cannot be recorded twice for one sale.

## Negative Profit / Below-Cost Handling

- Below-cost guard is enforced server-side (`assertPromotionProfitSafe`).
- If net unit price after promotion is below known cost, checkout is blocked.
- Cost-missing lines (`costPrice <= 0`) are treated as deferred-risk cases and do not hard-block by this rule.

## Member Pricing and Loyalty Interaction

Calculation order in checkout is enforced as:

1. Product/unit DB price  
2. Member discount pricing  
3. Promotion discount  
4. Manual discount  
5. Loyalty redemption  
6. Tax  
7. Final total

- B8-7 loyalty behavior is preserved.
- Member pricing + promotion interaction is validated by harness.
- Loyalty redemption continues to work after promotion discounts.

## Refund/Void Promotion Reversal Behavior

- Refund and void reverse promotion usage records.
- Promotion usage counters/discount aggregates are decremented on reversal.
- Double-count or stale usage records are prevented by the usage model + checks.

## Permission Enforcement Summary

- Promotion create/update/archive operations enforce server-side permissions:
  - `promotions.create`
  - `promotions.update`
  - `promotions.delete`
- Cross-company access is blocked by tenant-scoped queries and permission checks.
- Cashier unauthorized promotion mutations are rejected.

## Audit Behavior

- Promotion create/update/archive writes flow through tenant transaction wrapper and are auditable.
- Promotion application in completed sales is persisted via `PromotionUsage` records.
- Promotion reject/block events are observable through server errors and harness assertions.

## Verification Results

- `npm run typecheck` — PASS
- `npm run build` — PASS
- B8-8 harness (`scripts/phase-b8-8-promotion-check.ts`) — **24/24 PASS**

Harness coverage includes:
- percentage/fixed/spend-threshold/product/category promotions,
- inactive/expired/future eligibility rejection,
- stacking and priority behavior,
- duplicate usage guard,
- manipulated client promotion rejection,
- below-cost block,
- member + promotion + loyalty interaction,
- refund/void reversal,
- unauthorized/cross-company access rejection,
- report impact and promotion analytics sales totals.

## Remaining Promotion Risks

- POS cart preview still does not fully mirror all DB promotion outcomes before final checkout (server total remains authoritative).
- Advanced promotion analytics visualizations and stack-rule UI are still medium-risk polish items.
- Cost-missing items cannot be fully validated for below-cost protection and remain a documented deferred case.

## GO / NO-GO for Next Phase

**GO** for B8-9 from a promotion-hardening standpoint, with the above medium/low residual risks tracked.  
Per instruction, next phase is not started in this report.
