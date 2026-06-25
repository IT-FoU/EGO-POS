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
| **Reports** | Prisma only | n/a (read) | n/a | `reports.view` (B8-3) | **Solid** (B8-4) |
| **Dashboard** | Prisma | n/a | n/a | session | **Mostly real** (per-shift cash fixed B8-5; error-masking remains) |
| **POS** | Prisma snapshot | sale + cash session + refund/void persisted + audited | Yes (sale, cash session, post-sale) | `pos.sell` + granular post-sale actions | **Core solid** (checkout B8-1; session B8-5; post-sale B8-6) |
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

### G2 — Approval workflow is half-built **(CRITICAL)** — server engine **DONE (B8-2)**
- `ApprovalRule` (thresholds) is DB-backed and seeded; `decideApproval` updates status. **But no code ever creates an `Approval`/pending request** (`approval.create` — zero matches). POS pending approvals + POS permission audit go to **localStorage** (`demoPendingApprovalRepository`, `demoAuditLogRepository`).
- `decideApproval` updates status only — does **not** execute the approved action (PO/payment/refund/discount).
- Manager-discount (≤20%) / refund / stock-adjustment approval rules from spec are **not enforced server-side**.
- Detail: [POS/Settings/Permissions audit](5219055a-415c-4c07-8166-8c322df41fae).

**B8-2 status (server engine complete):** a DB-backed approval engine now exists (`features/approvals/`):
- **Creation:** `createApprovalRequest` persists a pending `Approval` (company/branch scoped, requester role captured, execution payload stored in `newValue`) and writes an audit row. Exposed via `createApprovalRequestAction` (server action) and `POST /api/approvals`, both gated by the requester's base module permission.
- **Decision:** `decideApprovalRequest` enforces **approver role** (owner/manager per `ApprovalRule.approverRole`; cashier/custom blocked), blocks **self-approval**, and is **cross-company isolated**. The existing settings `decideApproval` now delegates to this engine. Exposed via `decideApprovalRequestAction` and `POST /api/approvals/decision`, gated by `approvals.approve`.
- **Execution on approve:** an executor registry runs the approved action. `stock_adjustment` is fully wired — stock is unchanged until approval, then the balance is updated atomically with a `StockMovement` (`adjustment`, referenced to the approval) and a `StockAdjustment` record (`approvedBy` = approver). Reject performs no mutation.
- **Audit:** every create/approve/reject writes an `AuditLog` row (who/when/action/before-after via `withTenantTransaction`); the `Approval` row also retains `requestBy`, `approvedBy`, `decidedAt`, `reason`, `decisionNote`.
- Verified by `scripts/phase-b8-2-approval-check.ts` (29/29). B8-1 and B7-1..B7-4 regressions still pass.
- **Remaining for later sub-phases (NOT B8-2):** wire originating flows to *raise* requests through the engine (POS over-limit discount/refund, purchasing over-threshold) and register their executors; replace the demo-gated POS localStorage approval panel (`demoPendingApprovalRepository`/`demoAuditLogRepository`, shown only when `demoMode && devDebug`) with the server actions in the POS UI. These are UI/flow-wiring items tracked under G2/G3 and are out of B8-2 scope.

### G3 — POS granular permissions **(HIGH)** — **DONE (B8-3)**

**POS checkout:** `pos-policy-loader.ts` uses actual roles via `getUserPermissionKeys`; `pos-permission-guard.ts` enforces `create_sale` + `apply_discount` in `completePrismaSale` with role-aware discount caps.

**All critical modules (expanded B8-3):**
- Server **write** actions: `requireWritePermission` per module (`WRITE_PERMISSIONS`).
- API **writes:** `runWrite` + `requireApiSession` (401) + `assertPermission` (403).
- API **reads:** `runRead` + `READ_PERMISSIONS` on GET routes (products, customers, suppliers, promotions, membership, reports, settings). Reports data unchanged — auth gate only.
- Harness: `scripts/phase-b8-3-pos-permission-check.ts` — **42/42 PASS**.

**Remaining (NOT B8-3):** POS void/refund/hold/cash/shift (no server endpoints); POS localStorage approval panel; wire overrides to B8-2 engine.

### G4 — Reports financial accuracy & mock UI **(HIGH; spec requires 5 accurate reports)** — **DONE (B8-4)**

**B8-4 status (report engine hardened):**
- Removed runtime dependency on `mock-full-data.ts` in `reports-analytics-client.tsx`; Report Center catalog moved to `report-catalog.ts`; FX display rates to `currency-rates.ts`; KPI keys to `types.ts`.
- `getPrismaReportsSnapshot(tenant, filters?)` accepts server-side filters (date preset/range, branch, warehouse, category, supplier, cashier, payment method, customer) via `report-filters.ts`; `/reports` page and `GET /api/reports` pass query params; FilterBar Apply triggers server re-fetch.
- Removed synthetic `supplier-*` PO rows; purchasing report uses real `Purchase` records only.
- Supplier payables exposed from `SupplierPayable` groupBy (`supplierPayables`); purchasing report prefers payable balance with outstanding fallback.
- COGS computed from `SaleItem.costPrice × quantity` (`cogsLak` on snapshot).
- Inventory `daysWithoutSale` and `unitsSold30Days` computed from real sale history (`inventory/prisma-repository.ts`); dead-stock hub KPIs now DB-backed.
- Report modal product tables use live `productRows` from Prisma.
- Permissions remain server-enforced via B8-3 `runRead` + `reports.view`.
- Verified by `scripts/phase-b8-4-report-check.ts` (**13/13 PASS**). B8-3 (42/42), B8-2 (29/29), B8-1 (29/29), B7-1..B7-4 regressions still pass.

**Remaining (NOT B8-4):** Day/hour detail modals and business-health sub-bars still use illustrative UI copy (not financial data); AI insights panel is heuristic text; report sub-pages do not yet expose filter query params; dashboard shift-cash fixed in B8-5.

### G5 — Loyalty redemption & spend-based tiers **(MEDIUM)** — **DONE (B8-7)**

**B8-7 status (loyalty/membership hardened):**
- Central `features/loyalty/loyalty-service.ts`: earn, redeem, manual adjust, tier recompute, refund/void reversal.
- Server-authoritative member discount (`resolveMembershipDiscountPercent`); expired subscription blocks benefits.
- POS sends `redeemPoints` on checkout; redeem discount included in server total.
- Duplicate earn/redeem and double loyalty reversal blocked; negative balance rejected.
- `recomputeMembershipTier` evaluates `membershipLevel.minSpendLak` on spend changes.
- Manual point adjustment via `POST /api/customers/points-adjust` + `customers.update` permission.
- Customer purchase-history `pointsEarned` uses company `loyaltySpendPerPointLak` (not hardcoded `/10000`).
- POS customer mapper: no synthetic `2099-12-31` expiry; admin tier without subscription stays active.
- Verified by `scripts/phase-b8-7-loyalty-check.ts` (**18/18 PASS**). B8-6..B8-1 and B7 regressions still pass.

**Remaining (NOT B8-7):** partial-refund loyalty split; dedicated redeem approval rule/UX; subscription billing automation; student-plan lifecycle automation.

### G6 — Promotions completeness **(MEDIUM)** — **DONE (B8-8)**

**B8-8 status (promotion hardening complete):**
- Server-authoritative promotion engine added in `features/promotions/promotion-checkout.ts` and integrated into checkout.
- Client promotion claims are rejected; server recalculates discounts from DB rules.
- Eligibility hardened: active/schedule/coupon/member/product/category/store-wide threshold checks.
- Priority and non-stacking behavior enforced server-side; duplicate promotion usage blocked.
- Below-cost protection enforced where cost is available.
- Promotion target update now replaces product/category/membership scopes in promotion update flow.
- Promotion usage and sales totals are surfaced through `PromotionUsage` aggregation (`totalSalesLak` no longer stubbed).
- Verified by `scripts/phase-b8-8-promotion-check.ts` (**24/24 PASS**).
- Implementation reference: commit `c07a41f`.
- Deliverable report: `B8_8_COMPLETION_REPORT.md`.

### G7 — Cash session persistence + audit **(MEDIUM)** — **DONE (B8-5)**

**B8-5 status (cash session hardened):**
- `CashSession` / `CashTransaction` are the source of truth in PostgreSQL (no localStorage for shift state).
- Server calculator: expected cash = opening + cash sales + cash in − cash out − refunds − void cash; variance = counted − expected.
- API routes: open, close, cash-in, cash-out, current — all permission-gated (`pos.cash_session.manage` / view aliases).
- POS `StaffControl` start/end work wired to server; sale completion requires open session (`assertOpenCashSessionForSale`).
- Dashboard shift summaries use per-session `computeCashSessionTotalsForShift` (fixes company-wide cash KPI bug).
- Audit via `withTenantTransaction` on all session mutations; owner-only mutation scoping (cashier manages own session).
- Verified by `scripts/phase-b8-5-cash-session-check.ts` (**13/13 PASS**). B8-4 (13/13), B8-3 (42/42), B8-2 (29/29), B8-1 (29/29), B7-1..B7-4 regressions still pass.

**Remaining (NOT B8-5):** ~~refund/void POS flows not fully wired~~ **DONE (B8-6)**; `CashierShiftPanel` legacy component unused; demo mode local shift UI; manager session list/detail API; dedicated cash reconciliation report page.

### G13 — Post-sale refund/void/receipt **(CRITICAL)** — **DONE (B8-6)**

**B8-6 status (post-sale hardened):**
- Recent Sales reads from PostgreSQL via `GET /api/pos/sales` (no localStorage in production).
- Receipt view/reprint from `Sale` + items + payments; reprint writes audit log.
- Full refund: `Refund`/`RefundItem`, stock restore, loyalty/promotion reversal, `saleStatus: refunded`, cash-session impact (cash portion only).
- Void: `saleStatus: cancelled`, stock restore, loyalty/promotion reversal, cash-session impact via completed-sale removal.
- Server permissions via `assertPosActionAllowed`; approval executors for refund/void when policy requires.
- Verified by `scripts/phase-b8-6-post-sale-check.ts` (**18/18 PASS**). B8-5..B8-1 and B7 regressions still pass.

**Remaining (NOT B8-6):** partial refund UI; manager approval UX wiring in POS; soft-delete/edit sale server paths; demo localStorage audit panel.

### G8 — Dashboard correctness **(LOW/MEDIUM)**
- ~~Shift expected-cash uses period-wide cash for each shift (wrong for multi-shift days).~~ **Fixed in B8-5** for `CashSession`-backed shifts.
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
| P2 | **G7** Cash session persistence + audit | Medium | **DONE (B8-5)** |
| P2 | **G13** Post-sale refund/void/receipt | Critical | **DONE (B8-6)** |
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
5. Cash sessions persisted with audit; reconciliation accurate (G7). **DONE (B8-5)**
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
