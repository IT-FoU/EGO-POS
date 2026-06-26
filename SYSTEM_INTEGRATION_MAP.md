# EGO POS — System Integration Map

> Code-verified integration status at commit `29af75d` (+ audit-doc phase).
> Legend — **Connected** = production DB end-to-end · **Partial** = real backend but gaps · **Client-only** = browser/localStorage logic, no server persistence · **Mock** = static/demo data · **Missing** = not implemented.
> Project renamed IGO POS → EGO POS (legacy `IGO_DEMO_MODE` / `igo-admin` names remain in code).

---

## Summary table

| # | Integration | Status | Risk |
| --- | --- | --- | --- |
| 1 | POS → Inventory | **Connected** | Medium |
| 2 | POS → Membership | **Connected** | Low |
| 3 | POS → Promotion | **Connected** | Low |
| 4 | POS → Reports | **Partial** | Medium |
| 5 | Promotion → Reports | **Partial** | Medium |
| 6 | Supplier → Purchase | **Connected** | Low |
| 7 | Purchase → Inventory | **Connected** | Medium |
| 8 | Recent Sales → Receipt View / Reprint | **Client-only / Mock** | **Critical** |
| 9 | POS → Receipt Print Workflow | **Client-only** | High |
| 10 | POS → Permissions / Approval Rules | **Partial** (checkout enforced; rest client-only) | **Critical** |
| 11 | Store login → template workspace redirect | **Connected** (LP-5 DB `businessTemplateKey`) | Low |

---

## 11. Store login → template workspace redirect — **Connected** (LP-5)
- **Source files:** `lib/auth/store-post-login-redirect.ts`, `lib/auth/store-membership.ts`, `app/api/auth/store-entry-path/route.ts`, `components/auth/login-form.tsx`, `app/(platform)/businesses/page.tsx`.
- **DB models:** `Company.businessTemplateKey`, `CompanyUser`, `User`, `Role`.
- **Flow:** After `/login`, store session resolves assigned company memberships from DB, reads `businessTemplateKey`, and redirects by role/template (owner/manager → dashboard or template shell; cashier → POS).
- **Production `/businesses`:** DB company picker for multi-company users; single-company auto-redirect; no localStorage tenant creation when `IGO_DEMO_MODE=false` (LP-6).
- **Production `/register`:** Request-access message only; no signup API; no redirect to `/businesses` setup (LP-6).
- **Demo onboarding:** `/businesses` template picker + `/businesses/setup` localStorage flow gated to `IGO_DEMO_MODE=true` only (LP-6).
- **Deferred:** Full removal of demo template picker (LP-6); rental template shell.

## 1. POS → Inventory — **Connected**
- **Source files:** `features/pos/prisma-repository.ts` (`completePrismaSale`), `features/inventory/stock-concurrency.ts` (`applyAtomicStockDelta`), `features/pos/components/pos-page-client.tsx` (checkout call), `features/pos/actions.ts`.
- **DB models:** `Sale`, `SaleItem`, `SalePayment`, `InventoryBalance`, `StockMovement`, `Product`, `ProductUnit`.
- **API / actions:** `POST /api/pos/sales`; server action `completeSaleAction`.
- **Flow:** On checkout (non-demo), each line is converted to base units (`quantity × conversionQty`) and stock is decremented atomically inside `withTenantTransaction`; a `StockMovement` (sale) row is written.
- **Missing endpoints:** None for the sell path. Stock **restock on void/refund is NOT persisted** (see #8) — voids in Recent Sales restore stock only in localStorage.
- **Risk:** Medium — sell path is solid; reversal path (void/refund) does not touch DB stock, so DB stock can drift from reality once voids/refunds are used.
- **Recommended next fix phase:** Phase that wires void/refund to DB (POS lifecycle persistence).

## 2. POS → Membership — **Connected**
- **Source files:** `features/pos/prisma-repository.ts` (`resolveMembershipDiscountPercent`, `completePrismaSale`), `features/membership-levels/*`.
- **DB models:** `Customer`, `MembershipLevel`, `LoyaltyPointLedger`.
- **API / actions:** `completeSaleAction` / `POST /api/pos/sales`.
- **Flow:** Membership discount % is resolved **server-side** from the customer's `MembershipLevel.discountPercent` (B8-1); client-sent prices are ignored. Loyalty points earned/redeemed are computed server-side.
- **Missing endpoints:** None.
- **Risk:** Low.
- **Recommended next fix phase:** N/A (monitor only).

## 3. POS → Promotion — **Connected**
- **Source files:** `features/pos/prisma-repository.ts` (`applyActivePromotions`), `features/promotions/*`.
- **DB models:** `Promotion`, `PromotionProduct`, `PromotionCategory`, `PromotionMembershipLevel`, `PromotionUsage`.
- **API / actions:** `completeSaleAction`.
- **Flow:** Active promotions are loaded server-side and applied to qualifying lines using pre-resolved category/membership context; a `PromotionUsage` row is written per applied promotion.
- **Gap:** The **client cart does not preview DB promotions** (only banner promos), so the on-screen total can differ from the server total; B8-1 added a directional mismatch guard (rejects only client-below-server).
- **Risk:** Low (integrity) / Medium (UX mismatch).
- **Recommended next fix phase:** Client promo-preview parity (UI phase).

## 4. POS → Reports — **Partial**
- **Source files:** `features/reports/prisma-repository.ts`, `features/reports/report-service.ts`, `app/(dashboard)/reports/**`, `features/reports/components/reports-analytics-client.tsx`.
- **DB models:** `Sale`, `SaleItem`, `SalePayment` (+ inventory/purchasing for other tabs).
- **API / actions:** `GET /api/reports`; SSR via `getReportsSnapshot()`.
- **Flow:** Sub-report pages (`/reports/sales|inventory|customers|products|purchasing`) and dashboard KPIs aggregate **real `Sale` data**. BUT the **Report Center tab** in `reports-analytics-client.tsx` renders `features/reports/mock-full-data.ts` (executive reports, catalog rows, currency rates), and several hub filters are **UI-only** (no server re-query); aggregates are all-time (no server date-range param).
- **Missing endpoints:** Date-range-parameterized reports query.
- **Risk:** Medium — decisions may be made on mock figures in the Report Center.
- **Recommended next fix phase:** Reports authority phase (remove `mock-full-data`, add server date filtering).

## 5. Promotion → Reports — **Partial**
- **Source files:** `features/reports/prisma-repository.ts`, `app/(dashboard)/promotions/analytics/page.tsx`, `features/promotions/*`.
- **DB models:** `PromotionUsage`, `Promotion`, `Sale`.
- **API / actions:** SSR snapshot reads.
- **Flow:** `PromotionUsage` is written at checkout and is readable; however `/promotions/analytics` shows **placeholder** ratios (e.g., "62% / 38%"), placeholder usage-trend charts and margin panels; `/promotions/stack-rules` and `/promotions/integration-map` are static.
- **Missing endpoints:** Promotion analytics aggregation; stack-rule persistence (`PromotionRule`/`PromotionAction` models unused).
- **Risk:** Medium.
- **Recommended next fix phase:** Promotion analytics phase.

## 6. Supplier → Purchase — **Connected**
- **Source files:** `features/purchasing/prisma-repository.ts`, `features/suppliers/prisma-repository.ts`, `features/purchasing/components/*`.
- **DB models:** `Supplier`, `Purchase`, `PurchaseItem`, `SupplierPayable`, `PurchasePayment`.
- **API / actions:** `POST /api/purchasing/purchase-orders`, `/status`, `/receiving`, `/payments`; purchasing server actions.
- **Flow:** POs reference a supplier; lifecycle (draft→ordered→partial→received→closed/cancelled) and payables/outstanding-balance sync are DB-backed (B7-1/2/3).
- **Missing endpoints:** Supplier activate/deactivate from the supplier **detail** page (UI stub); supplier documents/linked-products panels are placeholders.
- **Risk:** Low.
- **Recommended next fix phase:** Supplier detail completion (UI phase).

## 7. Purchase → Inventory — **Connected**
- **Source files:** `features/purchasing/prisma-repository.ts` (`receiveGoods`), `features/inventory/stock-concurrency.ts`.
- **DB models:** `GoodsReceipt`, `GoodsReceiptItem`, `StockMovement`, `InventoryBalance`, `InventoryLot`.
- **API / actions:** `POST /api/purchasing/receiving`.
- **Flow:** Receiving converts to base units and increments stock atomically with a traceable `StockMovement` (purchase) row; partial/over-receive guarded (B7-2).
- **Missing endpoints:** None.
- **Risk:** Medium (only because no independent reconciliation/count-vs-receipt audit exists yet).
- **Recommended next fix phase:** N/A (monitor).

## 8. Recent Sales → Receipt View / Reprint — **Client-only / Mock**  ⚠️
- **Source files:** `features/pos/components/pos-page-client.tsx` (`recentSales`, `openReceiptForSale`, `refundSale`, `voidSale`, `softDeleteSale`, `duplicateSaleToCart`), `lib/demo/repositories.ts` (`demoSalesRepository`, `demoReceiptsRepository`).
- **DB models:** **NONE used.** (`Sale`, `Refund`, `RefundItem` exist in schema but are not read/written by Recent Sales.)
- **API / actions:** **None.** All reads/writes go to **browser localStorage** in *every* mode.
- **Flow:** Recent Sales is loaded only from `demoSalesRepository.listSales()`. Critically, the **production** `completeSaleAction` (DB sale) does **not** add to `demoSalesRepository`, so DB sales never appear in Recent Sales; only `completeDemoSale` (demo mode) populates it. Refund/Void/Edit/Soft-delete/Duplicate mutate localStorage only.
- **Missing endpoints:** `GET /api/pos/sales` (list/history), `GET` receipt by sale, `POST /api/pos/refund`, `POST /api/pos/void`, sale-edit/soft-delete/timeline endpoints.
- **Risk:** **Critical** — sales history, refunds, and voids are not durable, not auditable in DB, device-local, and lost on cache clear.
- **Recommended next fix phase:** **POS Sales History & Lifecycle Persistence** (highest priority POS phase).

## 9. POS → Receipt Print Workflow — **Client-only**
- **Source files:** `features/pos/components/pos-page-client.tsx` (`receiptPrintMode`, `handleReceiptPrintModeAfterSale`, `buildReceiptSnapshot`), `features/settings/prisma-repository.ts` + `features/settings/types.ts` (DB `receiptPrintMode`), `features/settings/components/settings-form.tsx`, `lib/demo/repositories.ts` (`demoSettingsRepository`).
- **DB models:** `CompanySetting` (stores `receiptPrintMode` + receipt display settings).
- **API / actions:** `GET/PATCH /api/settings` (mode is saved to DB), but POS **reads the mode from `demoSettingsRepository` (localStorage)**, not the DB value passed to the page.
- **Flow:** Modes = Ask Every Time / Auto Print / No Auto Print. Receipt renders from an in-memory/saved snapshot; printing uses the **browser print dialog**. No printer-profile / ESC-POS / hardware integration.
- **Missing endpoints:** Direct printer integration; reconciling localStorage print mode with the DB setting.
- **Risk:** High — print behavior is device-local and diverges from saved settings; no hardware printing.
- **Recommended next fix phase:** Receipt/printing productionization (after Sales History persistence).

## 10. POS → Permissions / Approval Rules — **Partial**  ⚠️
- **Source files:** `features/pos/pos-permission-guard.ts`, `features/access-control/pos-policy-loader.ts`, `features/pos/permissions.ts` (`evaluatePosPermission`), `features/pos/prisma-repository.ts` (server enforcement), `features/pos/components/pos-page-client.tsx` (`enforcePosAction`), `features/approvals/approval-engine.ts`, `lib/demo/repositories.ts` (`demoPendingApprovalRepository`, `demoAuditLogRepository`).
- **DB models:** `Role`, `Permission`, `RolePermission`, `UserRole`, `CompanyUser`, `ApprovalRule`, `Approval`, `AuditLog`.
- **API / actions:** `completeSaleAction` (server-enforces `create_sale` + `apply_discount` using the user's **actual role**, B8-3); `POST /api/approvals` + `/decision` (DB approval engine, B8-2).
- **Flow:** **Checkout** discount/create are enforced **server-side** with role-aware limits (Owner 100% / Manager threshold / Cashier 0%). BUT all **Recent Sales actions** and over-limit/override approvals in `enforcePosAction` are **client-only**, recording to **localStorage** `demoPendingApprovalRepository`/`demoAuditLogRepository`. The hardened **B8-2 DB approval engine is NOT wired** to POS overrides (void/refund/over-limit discount).
- **Missing endpoints:** Server actions for void/refund/cash/shift that call the guard + approval engine; replacing the localStorage approval/audit panel with `POST /api/approvals`.
- **Risk:** **Critical** — high-value overrides (void, refund, over-limit discount outside checkout) are authorized only in the browser and audited only in localStorage; bypassable and non-durable.
- **Recommended next fix phase:** **Wire POS overrides → B8-2 approval engine + DB audit** (security phase, pairs with #8).

---

## Cross-cutting conclusions
- **Production-solid core:** Sell path (POS→Inventory/Membership/Promotion), Purchasing (Supplier→Purchase→Inventory), and checkout permission enforcement are real and DB-backed.
- **Biggest integration debt is the POS post-sale surface:** Recent Sales, receipts, refunds, voids, and POS-side approvals/audit are **localStorage**, disconnected from the DB sale that checkout actually persisted. This is the dominant correctness/audit risk.
- **Reports** are half-real (sub-pages) and half-mock (Report Center).
