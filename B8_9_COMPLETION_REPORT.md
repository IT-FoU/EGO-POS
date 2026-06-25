# B8-9 Completion Report — Dashboard and Analytics Accuracy Hardening

**Phase:** B8-9  
**Date:** 2026-06-25  
**Verdict:** **PASS**

---

## Summary

B8-9 hardens dashboard and analytics accuracy by replacing production-facing static/heuristic values with Prisma-backed calculations, enforcing server-side dashboard/reports permissions, and aligning dashboard KPI totals with the B8-4 report engine and B8-5/B8-6/B8-7/B8-8 financial behavior.

## Scope Delivered

- Dashboard snapshot now enforces `dashboard.view` permission server-side.
- Report page snapshot now enforces `reports.view` permission server-side.
- Dashboard KPI calculations are reconciled with report engine outputs for the same date window and tenant scope.
- Close-day cash expected total uses shift-level totals aggregation instead of a single current-shift value.
- Dashboard summary now includes DB-backed metrics:
  - gross sales,
  - net sales (after refunds),
  - discounts,
  - promotion discount,
  - loyalty redemption,
  - refunds/voids impact,
  - COGS,
  - inventory valuation.
- Reports analytics widgets were hardened to reduce static production-facing content:
  - business health sub-bars are derived from hub metrics,
  - AI insights panel text is generated from live hub values,
  - data-source status panel timestamp is runtime-derived.
- New harness added: `scripts/phase-b8-9-dashboard-check.ts`.

## KPI Consistency Hardening

Validated and enforced:

- Dashboard sales KPI == report revenue total.
- Dashboard profit KPI == report profit total.
- Dashboard inventory valuation == report inventory valuation.
- Dashboard supplier payable KPI == report payable balance.
- Promotion impact KPI == `SaleItem.promotionDiscount` aggregate.
- Loyalty KPI == `LoyaltyPointLedger` redeem aggregate.
- Refund/void impact reflected in dashboard summaries.
- Branch/warehouse/date scoping preserved via tenant/context-aware queries.

## Permissions and Access Hardening

- Dashboard reads require `dashboard.view`.
- Reports page reads require `reports.view`.
- Cashier dashboard access is blocked where permissions do not grant dashboard view.
- Cross-company/non-member access remains blocked by permission/scope checks.

## Verification Results

- `npm run typecheck` — PASS
- `npm run build` — PASS
- B8-9 harness (`scripts/phase-b8-9-dashboard-check.ts`) — **14/14 PASS**
- B8-8 regression — **24/24 PASS**
- B8-7 regression — **18/18 PASS**
- B8-6 regression — **18/18 PASS**
- B8-5 regression — **13/13 PASS**
- B8-4 regression — **13/13 PASS**
- B8-3 regression — **42/42 PASS**
- B8-2 regression — **29/29 PASS**
- B8-1 regression — **29/29 PASS**
- B7 regression:
  - B7-1: **12/12 PASS**
  - B7-2: **16/16 PASS**
  - B7-3: **22/22 PASS**
  - B7-4: **14/14 PASS**

## Remaining Dashboard/Analytics Risks

- Reports analytics modal/detail sections still contain demo-oriented static narrative text in non-critical drilldown UI; top-level KPI values are DB-backed.
- Dashboard page does not yet expose branch/warehouse selector controls; scoping follows active tenant context.
- Heuristic health scoring remains formula-based (now metric-fed) and should be treated as an advisory indicator, not a financial source of truth.

## GO / NO-GO

**GO** for next phase from B8-9 acceptance criteria.  
Per instruction, next phase was not started.
