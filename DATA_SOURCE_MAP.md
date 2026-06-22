# EGO POS — Data Source Map

> Code-verified at commit `29af75d` (+ audit-doc phase). Documents where each screen/module gets its data.
> **Production-real** = live PostgreSQL via Prisma when `IGO_DEMO_MODE` is unset/false. **Demo/Mock** = static fixtures or browser localStorage.
> `isDemoMode()` is fail-safe OFF (requires `IGO_DEMO_MODE="true"`).

---

## Quick matrix

| Screen / Module | Primary data source | Production-real? |
| --- | --- | --- |
| Dashboard | Prisma (SSR service) + localStorage (header logo/plan) | Mostly real; header chrome localStorage |
| POS (checkout) | Server action → Prisma | **Real** (demo path only if flag on) |
| Recent Sales | **localStorage** (`demoSalesRepository`) | **No — client-only** |
| Receipt View / Reprint | **localStorage** (`demoReceiptsRepository`) | **No — client-only** |
| Products | Prisma (SSR + actions/REST) | Real (images stubbed) |
| Inventory | Prisma (SSR + actions/REST) | **Real** |
| Suppliers | Prisma (SSR + actions/REST) | Real (detail panels stubbed) |
| Purchase | Prisma (SSR + actions/REST) | **Real** |
| Customers | Prisma (SSR + actions/REST) | Real (import/export stub) |
| Membership | Prisma (SSR + actions/REST) | **Real** |
| Promotions | Prisma (SSR + actions/REST) | Real (analytics/stack-rules stub) |
| Reports | Prisma (sub-pages) + **mock-full-data** (Report Center) | Partial |
| Settings | Prisma (`CompanySetting`) + localStorage mirror | Real; localStorage mirror for logo/print mode |
| Role / Permission system | Prisma | **Real** |

---

## 1. Dashboard
- **UI file:** `app/(dashboard)/dashboard/page.tsx`, `features/dashboard/dashboard-service.ts`, `features/dashboard/components/*`, `components/layout/dashboard-shell.tsx`.
- **Data source:** Prisma SSR (`getMiniMartDashboardSnapshot`) for metrics/charts; **localStorage** (`demoSettingsRepository`) for header logo + plan name/days.
- **DB models:** `Sale`, `SaleItem`, `InventoryBalance`, `CashSession`, `Product`, `Company`, `Plan`.
- **Real vs mock:** KPIs/charts **real**; "Status: OPEN" + Close Day button are **hardcoded UI** (no action); header logo/plan from localStorage.
- **Before production:** Wire Close Day to a real cash/shift action; move logo/plan to DB-served props.

## 2. POS (checkout)
- **UI file:** `app/(dashboard)/pos/page.tsx`, `features/pos/components/pos-page-client.tsx`.
- **Data source:** SSR snapshot (`getPosSnapshot` → Prisma) for products/customers/promotions/loyalty/QR/settings; checkout via server action `completeSaleAction` → `completePrismaSale` (Prisma). Demo path (`completeDemoSale`) only when `IGO_DEMO_MODE=true`.
- **DB models:** `Sale`, `SaleItem`, `SalePayment`, `Product`, `ProductUnit`, `InventoryBalance`, `StockMovement`, `Customer`, `MembershipLevel`, `Promotion*`, `LoyaltyPointLedger`.
- **Real vs mock:** Checkout **production-real** and server-authoritative (B8-1/B8-3). Customer-display state via localStorage.
- **Before production:** Ensure `IGO_DEMO_MODE` is false in prod; the completed sale must also surface in a DB-backed Recent Sales (see #3).

## 3. Recent Sales  ⚠️
- **UI file:** `features/pos/components/pos-page-client.tsx` (`recentSales`, `RecentSalesModal`).
- **Data source:** **Browser localStorage** via `demoSalesRepository` — in **all modes**. Production `completeSaleAction` does NOT populate it.
- **DB models:** none used (`Sale` exists but unused here).
- **Real vs mock:** **Demo/Client-only.** Device-local, non-durable, not auditable.
- **Before production:** Add `GET /api/pos/sales` (history) + DTO; load Recent Sales from DB; persist refund/void/edit/soft-delete server-side.

## 4. Receipt View / Reprint  ⚠️
- **UI file:** `features/pos/components/pos-page-client.tsx` (`openReceiptForSale`, `receiptFromSale`, `ReceiptModal`).
- **Data source:** **localStorage** `demoReceiptsRepository` (falls back to reconstructing from the localStorage sale record).
- **DB models:** none (no receipt persistence model wired).
- **Real vs mock:** **Demo/Client-only.**
- **Before production:** Persist receipt snapshots server-side (or render from DB `Sale`/`SaleItem`); back reprint with a DB read + audit.

## 5. Products
- **UI file:** `app/(dashboard)/products/**`, `features/products/components/*`, `features/products/product-service.ts`.
- **Data source:** Prisma SSR + server actions; `GET/POST /api/products`, `PATCH/DELETE /api/products/[id]`, categories routes.
- **DB models:** `Product`, `ProductUnit`, `Category`, `Brand`, `ProductPriceHistory`, `ProductBarcodeHistory`, `ProductImage`.
- **Real vs mock:** CRUD **real**. **Product images stub** — `getPrismaProductImages()` returns `[]`; image search/scanner are mock UI. Import/export/barcode-audit modals are placeholders.
- **Before production:** Implement image storage backend; complete/disable import-export placeholders.

## 6. Inventory
- **UI file:** `app/(dashboard)/inventory/**`, `features/inventory/components/*`, `features/inventory/inventory-service.ts`.
- **Data source:** Prisma SSR + actions; `POST /api/inventory/stock-in|adjustment|count`.
- **DB models:** `InventoryBalance`, `InventoryLot`, `StockMovement`, `StockAdjustment`.
- **Real vs mock:** **Production-real** (B7-4 removed mock fallbacks). Locale read from localStorage for formatting only.
- **Before production:** None critical (consider stock-transfer if needed — models unused).

## 7. Suppliers
- **UI file:** `app/(dashboard)/suppliers/**`, `app/(dashboard)/purchasing/suppliers/page.tsx`, `features/suppliers/*`.
- **Data source:** Prisma SSR + actions; `GET/POST /api/suppliers`, `PATCH/DELETE /api/suppliers/[id]`.
- **DB models:** `Supplier`, `SupplierPayable`, `Purchase`, `PurchasePayment`.
- **Real vs mock:** CRUD + payable reads **real**. Detail-page documents, linked products, AP invoices, charts, "Record Payment" modal, activate/deactivate = **placeholders**.
- **Before production:** Complete or hide detail placeholders; wire activate/deactivate.

## 8. Purchase
- **UI file:** `app/(dashboard)/purchasing/**`, `features/purchasing/*`.
- **Data source:** Prisma SSR + actions; `POST /api/purchasing/purchase-orders|status|receiving|payments`.
- **DB models:** `Purchase`, `PurchaseItem`, `GoodsReceipt`, `GoodsReceiptItem`, `SupplierPayable`, `PurchasePayment`, `StockMovement`, `InventoryBalance`.
- **Real vs mock:** **Production-real** (B7-1/2/3). Locale from localStorage for formatting only.
- **Before production:** None critical.

## 9. Customers
- **UI file:** `app/(dashboard)/customers/**`, `features/customers/*`.
- **Data source:** Prisma SSR + actions; `GET/POST /api/customers`, `PATCH/DELETE /api/customers/[id]`, `POST /api/customers/payments`.
- **DB models:** `Customer`, `CustomerPayment`, `LoyaltyPointLedger`, `MembershipLevel`.
- **Real vs mock:** CRUD + payments **real**. CSV/Excel import/export = **placeholder**.
- **Before production:** Complete or hide import/export.

## 10. Membership
- **UI file:** `app/(dashboard)/membership-levels/page.tsx`, `features/membership-levels/*`.
- **Data source:** Prisma SSR + actions; `GET/POST /api/membership-levels`, `PATCH/DELETE /api/membership-levels/[id]`.
- **DB models:** `MembershipLevel`, `Customer`.
- **Real vs mock:** **Production-real.** (REST GET returns `[]` only during the `next build` static phase.)
- **Before production:** None critical.

## 11. Promotions
- **UI file:** `app/(dashboard)/promotions/**`, `features/promotions/*`.
- **Data source:** Prisma SSR + actions; `GET/POST /api/promotions`, `PATCH/DELETE /api/promotions/[id]`.
- **DB models:** `Promotion`, `PromotionProduct`, `PromotionCategory`, `PromotionMembershipLevel`, `PromotionUsage`.
- **Real vs mock:** CRUD + checkout application **real**. `/promotions/analytics` (ratios/charts), `/promotions/stack-rules`, `/promotions/integration-map`, parts of `/promotions/calendar` = **static/placeholder** (`PromotionRule`/`PromotionAction` models unused).
- **Before production:** Implement analytics aggregation + stack-rule persistence or mark as roadmap.

## 12. Reports
- **UI file:** `app/(dashboard)/reports/**`, `features/reports/components/reports-analytics-client.tsx`, `features/reports/report-service.ts`.
- **Data source:** Prisma SSR (`getReportsSnapshot`) + `GET /api/reports` for sub-pages and dashboard KPIs; **`features/reports/mock-full-data.ts`** for the Report Center tab.
- **DB models:** `Sale`, `SaleItem`, `SalePayment`, `Purchase`, `InventoryBalance`, `Supplier`, `Customer`, `PromotionUsage`.
- **Real vs mock:** Sub-pages + KPIs **real**; **Report Center tab = mock**; date-range filters partly **UI-only**; aggregates all-time.
- **Before production:** Remove `mock-full-data` from runtime; add server date-range filtering.

## 13. Settings
- **UI file:** `app/(dashboard)/settings/page.tsx`, `features/settings/components/settings-form.tsx`, `features/settings/prisma-repository.ts`.
- **Data source:** Prisma (`CompanySetting`) via `GET/PATCH /api/settings` + actions; **localStorage mirror** (`demoSettingsRepository`) for logo URL and `receiptPrintMode` consumed by POS.
- **DB models:** `CompanySetting`, `Company`.
- **Real vs mock:** Settings writes **real**; logo + receipt-print-mode are **also** mirrored to localStorage and POS reads the localStorage copy (divergence risk). Demo "GO BOX" fallback only if no company row **and** demo mode on.
- **Before production:** POS should consume DB settings (logo, print mode) directly; drop localStorage mirror.

## 14. Role / Permission system
- **UI file:** `app/(dashboard)/settings/page.tsx` (staff section), `features/access-control/*`, `features/settings/components/staff-control-section.tsx`.
- **Data source:** Prisma (`getStaffAccessSnapshot`, `getUserPermissionKeys`) + server actions; approvals via `POST /api/approvals` + `/decision`.
- **DB models:** `Role`, `Permission`, `RolePermission`, `UserRole`, `CompanyUser`, `ApprovalRule`, `Approval`, `AuditLog`.
- **Real vs mock:** **Production-real.** POS checkout enforcement uses the **actual** user role (B8-3). NOTE: POS *override* approvals (void/refund/over-limit) are still recorded to **localStorage**, not the DB engine (see Integration Map #10).
- **Before production:** Wire POS override approvals to the DB approval engine; ensure `IGO_DEMO_MODE` off disables demo login/session fallbacks.

---

## Global "must change before production"
1. **POS sales history/receipts/refund/void → DB** (currently localStorage in all modes).
2. **POS override approvals/audit → DB approval engine** (currently localStorage).
3. **Reports Report Center → DB** (remove `mock-full-data`); add date-range queries.
4. **Settings logo + receipt print mode → DB-served** (drop localStorage mirror).
5. **Product image storage backend** (currently stub).
6. Confirm **`IGO_DEMO_MODE` is false** in production so demo login/session/checkout fallbacks are inert.
