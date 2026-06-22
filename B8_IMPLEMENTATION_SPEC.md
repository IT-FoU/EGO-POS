# B8 Implementation Specification

**Phase:** B8 (Post-B7 production-readiness hardening)
**Mode:** Specification only. No application code, UI, or schema changed. No commits.
**Date:** 2026-06-22
**Source of truth:** `MASTER_SPECIFICATION.md` + confirmed audit prerequisites in `PROJECT_CURRENT_STATE_SUMMARY.md`.

---

## 1. Current System Status (after B7)

Engineering baseline is green: `typecheck` PASS, `build` PASS, B7 harnesses 64/64 PASS (B7-1/2/3/4).

| Module | Read source | Write path | Audit | Permission | Status |
|--------|-------------|-----------|-------|------------|--------|
| **Purchasing** | Prisma only (B7-4) | `withTenantTransaction` | Yes | `requireWritePermission` | **Solid** (B7) |
| **Inventory** | Prisma only (B7-4) | `withTenantTransaction` | Yes | `requireWritePermission` | **Solid** |
| **Products** | Prisma | `withTenantTransaction` | Yes | `requireWritePermission` | **Solid** |
| **Suppliers** | Prisma only | `withTenantTransaction` | Yes | `requireWritePermission` | **Solid** |
| **Customers** | Prisma only | `withTenantTransaction` | Yes | per action | **Mostly solid** (loyalty redeem/adjust gaps) |
| **Membership Levels** | Prisma only | manual assignment only | Yes | per action | **Partial** (no spend-based tiering) |
| **Promotions** | Prisma only | usage persisted on sale | Yes (sale) | per action | **Partial** (POS totals omit promos; combo unimplemented; analytics stubbed) |
| **Reports** | Prisma only | n/a (read) | n/a | session | **Weak** (mock UI, calc gaps, scoping) |
| **Dashboard** | Prisma | n/a | n/a | session | **Mostly real** (shift cash bug, error-masking) |
| **POS** | Prisma snapshot | sale fully persisted + audited | Yes (sale) | only `pos.sell` server-side | **Core solid, controls weak** |
| **Settings** | Prisma (+demo fallback when no company) | `withTenantTransaction` | Yes | `settingsManage` | **Mostly solid** (logo/display localStorage) |
| **Permissions** | Prisma (`getUserPermissionKeys`) | `withTenantTransaction` | Yes | per action | **Solid for admin CRUD** |
| **Approval Flows** | rules in DB; requests not created | decide-only | partial | `approvalsManage` | **Half-built** (no request creation; POS approvals localStorage) |

Demo-fallback read paths were removed in B7-4; `isDemoMode()` is now fail-safe (default OFF). Remaining `isDemoMode` references: write guard (intended) + `settings` no-company fallback + `igo-admin` dashboard fallback.

---

## 2. Remaining Gaps (consolidated from module audits)

### G1 — POS checkout UI/server math divergence **(CRITICAL)** — server hardening **DONE (B8-1)**
- POS UI computes `subtotal`/`totalAmount`/`tax` and applies membership % client-side; `completePrismaSale` **recalculates tax/total and applies DB promotions server-side** (`applyActivePromotions`), ignoring client totals.
- Result: the amount the cashier sees / collects can differ from the persisted sale when DB promotions or server tax differ. No payment-vs-server-total validation.
- Detail: [Customers/Membership/Promotions audit](d01e14ea-67e5-4e44-acfe-41ffb92343a5).

**B8-1 status (server side complete):** `completePrismaSale` is now fully server-authoritative.
- Line price, cost, unit conversion are sourced from the **DB product/unit**, never the client payload; an unknown/inactive `unitId` is rejected.
- Membership tier discount is applied **server-side** from the DB membership level (mirrors the client rule) so member pricing no longer depends on a trusted client price.
- Server recomputes subtotal → promotion → manual discount → loyalty → tax → total, and **rejects a client total that is below the server total beyond a 1 LAK rounding tolerance** (under-charge / tamper guard). The server total is the sole persisted authority.
- Payment is validated: tender amounts must be non-negative and cover the server total; **`changeAmount` is recomputed on the server** and the client value is ignored.
- Guards added: empty cart, missing/inactive product, non-positive quantity, negative/over-100% discount, negative payment, invalid computed total.
- Verified by `scripts/phase-b8-1-checkout-check.ts` (29/29). B7-1/B7-2/B7-3/B7-4 regression harnesses still pass.
- **Remaining for a later sub-phase (NOT B8-1):** the POS client UI should call a shared server quote so the *displayed* preview equals the server total when DB promotions apply (currently the client preview omits DB promotions; the server simply charges the correct lower amount). This UI parity work is tracked under the G1 quote-engine item and is out of B8-1 scope.

### G2 — Approval workflow is half-built **(CRITICAL)**
- `ApprovalRule` (thresholds) is DB-backed and seeded; `decideApproval` updates status. **But no code ever creates an `Approval`/pending request** (`approval.create` — zero matches). POS pending approvals + POS permission audit go to **localStorage** (`demoPendingApprovalRepository`, `demoAuditLogRepository`).
- `decideApproval` updates status only — does **not** execute the approved action (PO/payment/refund/discount).
- Manager-discount (≤20%) / refund / stock-adjustment approval rules from spec are **not enforced server-side**.
- Detail: [POS/Settings/Permissions audit](5219055a-415c-4c07-8166-8c322df41fae).

### G3 — POS granular permissions client-only **(HIGH)**
- Server enforces only `pos.sell`. `apply_discount`, `void_bill`, `delete_item`, `cash_in/out`, refund/override are gated **only in the client** (`enforcePosAction`) and bypassable via the API.
- `pos-policy-loader.ts` loads permissions from a **template role** (by `templateKey`), not the logged-in user's actual `roleId` → custom roles / per-user matrix edits may not match POS behavior.

### G4 — Reports financial accuracy & mock UI **(HIGH; spec requires 5 accurate reports)**
- `reports-analytics-client.tsx` still renders **mock** data: `reportRows`, `executiveReports`, `reportCategories`, `currencyRates` from `mock-full-data.ts`; hardcoded modal KPIs (day/hour/detail), AI insights, health sub-bars, client FX.
- Filters (date range) are **UI-only** — never re-query the server; `getReportsSnapshot` has no date-range parameter (all-time aggregates).
- `reports/prisma-repository.ts` builds **synthetic duplicate PO rows** (L201–209) merged with real supplier POs → double counting; `supplierPayments` fetched but unused; reports AP uses `Supplier.outstandingBalance` while dashboard uses `supplierPayable` (can disagree).
- No explicit **COGS / gross-vs-net margin** metric; profit trusts sale-time `profitAmount` (≈ revenue if `costPrice` was 0).
- Detail: [Reports/Dashboard audit](456adaf0-7f04-4bd0-b156-2109c35a5040).

### G5 — Loyalty redemption & spend-based tiers **(MEDIUM)**
- Earn is persisted on sale; **redeem path exists server-side but POS UI never sends `redeemPoints`**. No manual points adjust/redeem action.
- `membershipLevel.minSpendLak` is stored but **never evaluated** — no auto tier upgrade on `totalSpent` change. Membership expiry in POS is synthetic (`2099-12-31`).
- Customer purchase-history `pointsEarned` uses a hardcoded `total/10000` formula, not company loyalty settings.

### G6 — Promotions completeness **(MEDIUM)**
- `combo_set` discount returns 0 (unimplemented at checkout). `PromotionRule`/`PromotionAction` models unused (dead rules engine).
- Guest eligibility bug: member-target promos match customers without `membershipLevelId`.
- `updatePrismaPromotion` updates scalars only — does **not** replace product/category/membership targets.
- Analytics: `totalSalesLak` hardcoded 0; `PromotionUsage` has no read/report surface.

### G7 — Audit-trail gaps **(MEDIUM)**
- No audit log for: held bills, cash session start/end (not persisted at all), company logo, customer display settings, POS permission actions. Spec requires cash reconciliation accuracy → cash session persistence is required.

### G8 — Dashboard correctness **(LOW/MEDIUM)**
- Shift expected-cash uses period-wide cash for each shift (wrong for multi-shift days).
- `emptySnapshot` fallback silently returns zeros on Prisma error (masks failures).
- Optional branch filter: company-wide sales when session lacks `activeBranchId`.

### G9 — Inventory analytics fields **(LOW)**
- `daysWithoutSale: 0` hardcoded in inventory mapper → reports hub dead-stock always empty; `unitsSold30Days` uses lifetime count.

### G10 — Settings propagation & residual localStorage **(LOW)**
- Company logo and customer-display settings persist to localStorage, not DB; `getPrismaSettings` returns fake "GO BOX" company under `isDemoMode` when no company row.

### G11 — Offline mode **(OUT OF B8 SCOPE — FLAG)**
- `MASTER_SPECIFICATION` lists offline POS as required; current architecture is online-first. Large, separate initiative; **explicitly out of B8** unless re-scoped.

### G12 — Naming / housekeeping **(LOW)**
- IGO→EGO split in env/storage keys/`igo-admin`; `igo-admin/admin-data.ts` demo fallback; dead mock-data files retained as test artifacts.

---

## 3. Priority Ranking

| Rank | Gap | Severity | Rationale (spec link) |
|------|-----|----------|-----------------------|
| P0 | **G1** POS checkout math divergence | Critical | "Sales work correctly"; financially accurate sales |
| P0 | **G2** Approval request creation + server enforcement | Critical | Manager/Owner approval rules are a hard spec requirement |
| P1 | **G3** POS server-side granular permissions | High | Cashier cannot discount/refund — must be server-enforced |
| P1 | **G4** Reports accuracy (5 financial reports) + remove mock UI | High | "Reports are accurate" is a pilot gate |
| P2 | **G7** Cash session persistence + audit | Medium | Cash reconciliation is a required accurate report |
| P2 | **G5** Loyalty redeem + spend-based tiers | Medium | Membership earn/redeem/tier in spec |
| P2 | **G6** Promotions completeness (combo, targets, eligibility) | Medium | 5 promo types required |
| P3 | **G8/G9** Dashboard + inventory analytics correctness | Low/Med | Informational may be approximate |
| P3 | **G10/G12** Settings propagation + naming cleanup | Low | Polish |
| —  | **G11** Offline mode | Deferred | Separate phase |

---

## 4. Integration Map Updates (target state)

- **POS = single calculation engine.** UI must call a shared server-side quote/preview (price → promotion → tax → membership → loyalty) so displayed totals equal persisted totals. Checkout validates `payments == server total`.
- **Approvals: DB-backed end-to-end.** `Approval.create` on threshold breach (discount > rule, refund, stock adjustment) → Settings/POS approval center reads pending rows → `decideApproval` both records status **and** triggers the gated action. Replace `demoPendingApprovalRepository`/`demoAuditLogRepository` with Prisma + `auditLog`.
- **Reports ↔ Dashboard share one aggregation layer.** Single date-range-aware Prisma query module feeding both; reports AP reads `supplierPayable` (consistent with dashboard); remove synthetic PO rows.
- **Loyalty/Membership wired into checkout.** `redeemPoints` plumbed from UI; tier recompute on `totalSpent` change; expiry from real subscription.

---

## 5. Database Impact

- **No destructive migrations expected.** Schema already has `Approval`, `ApprovalRule`, `PromotionUsage`, `PromotionRule/Action`, `LoyaltyPointLedger`, `CashSession`.
- Possible **additive** changes only (decide during implementation, each gated):
  - `Promotion.totalSalesLak` column (or compute from `PromotionUsage`) — prefer compute, no column.
  - Cash session persistence may need to ensure `CashSession`/transactions are written from POS (model exists; verify fields).
  - Optional index additions for date-ranged report queries.
- Tenant scoping rules unchanged; fix scope **consistency** in queries (code, not schema).

## 6. API Impact

- New/extended server endpoints/actions:
  - POS quote/preview action (server-computed totals) — new read action.
  - `createApprovalRequestAction` + wire `decideApproval` to execute action — new write paths (audited, permission-gated).
  - POS server-side permission checks for discount/void/refund/cash in the sale + approval endpoints.
  - Reports snapshot accepts a date-range (and branch) parameter.
- All new writes must go through `withTenantTransaction` (audit) and `requireWritePermission`.

## 7. UI Impact

- POS: consume server quote; show server-applied promotion names/amounts; surface loyalty redeem input; production approval modal (replace dev-only `PosPermissionPanel`).
- Reports: replace mock tables/modals with snapshot/`productRows`; wire filters to server; fix data-source status panel.
- Settings: move logo + customer-display settings to DB-backed persistence.
- No redesign — data-source/wiring changes only.

## 8. Rollback Plan

- Work in small, independently revertable commits per gap (G1, G2, …), mirroring B7's sub-phase commit discipline.
- Each change verified by a targeted harness (pattern: `scripts/phase-b8-*-check.ts`) before commit.
- Git baseline is clean on `main` (B7-4 = `d3b67f3`); any B8 commit can be reverted via `git revert` without touching B7 logic.
- Feature-flag risky checkout changes behind the existing settings/permission gates; keep the current sale path importable until the quote engine passes parity tests.
- No destructive DB migration; additive-only, so rollback = revert code + (if added) drop additive column in a follow-up migration.

## 9. Success Criteria

1. POS displayed total === persisted `sale.totalAmount`; payments validated against server total; promotions/loyalty reflected in both (G1).
2. Over-threshold discount / refund / stock adjustment creates a DB `Approval`, blocks until decided, and on approval executes the action; POS approvals + audit persisted to Prisma (G2).
3. Server rejects POS discount/void/refund/cash actions without the matching permission (G3).
4. The 5 financial reports (Sales, Profit, Inventory valuation, Supplier payable, Cash reconciliation) compute from live Prisma with consistent AP source and no mock rows; report filters re-query (G4).
5. Cash sessions persisted with audit; reconciliation accurate (G7).
6. Loyalty redeem works end-to-end; tiers update on spend (G5).
7. `typecheck`, `build`, all B7 harnesses, and new B8 harnesses PASS; no B7 regression.

## 10. GO / NO-GO Gate (entry to B8 implementation)

- ✅ Build health green (typecheck + build PASS).
- ✅ B7 committed and verified; clean tree.
- ✅ Gaps enumerated, prioritized, and mapped to spec requirements.
- ✅ No blocking unknowns for P0/P1 (schema already supports required models).
- ⚠️ Offline mode (G11) acknowledged as out-of-scope; must be confirmed with stakeholder if pilot requires it.

**Gate verdict: GO** to begin B8 implementation, recommended order **G1 → G2 → G3 → G4 → G7 → G5 → G6 → G8/G9 → G10/G12**, one gated sub-phase at a time.

---

*Generated from live repository inspection + three read-only module audits. No code modified.*
