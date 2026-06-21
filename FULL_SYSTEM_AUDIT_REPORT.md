# IGO POS Full System Audit Report

## Overall Status

Current recommendation: NO-GO for production launch.

The app is stable enough for continued demo and controlled QA. Core routes build and load, and several backend repositories/actions exist. However, production readiness is blocked by demo-mode write behavior, UI-only workflows, incomplete permission enforcement, incomplete audit coverage, and multiple duplicated/overlapping feature concepts.

## Verification Summary

- Route smoke test: PASS for main merchant routes by HTTP status.
- Super Admin protected routes: redirect to `/igo-admin/login` when not admin-authenticated, expected.
- `npm run typecheck`: PASS
- `prisma validate`: PASS
- `npm run build`: PASS
- `npm run lint`: NOT CONFIGURED, missing script.
- `npm test`: NOT CONFIGURED, missing script.
- `npm run test:e2e`: NOT CONFIGURED, missing script.
- Browser console/hydration validation: NOT VERIFIED in browser. In-app Browser plugin failed in this environment with a Windows sandbox process error during the previous rendered check.

## Route Audit

Routes verified by HTTP smoke test after merchant login:

- `/`, `/login`: 307 redirect as expected when authenticated.
- `/register`: 200
- `/businesses`: 200
- `/businesses/new`: 307
- `/businesses/setup`: 200
- `/dashboard`: 200
- `/pos`: 200
- `/products`: 200
- `/products/new`: 200
- `/products/categories`: 200
- `/inventory`: 200
- `/inventory/quick-stock-in`: 200
- `/inventory/adjustment`: 200
- `/inventory/count`: 200
- `/inventory/stock-in`: 200
- `/purchasing`: 200
- `/purchasing/new`: 200
- `/purchasing/receiving`: 200
- `/purchasing/payables`: 200
- `/purchasing/suppliers`: 200
- `/customers`: 200
- `/customers/new`: 200
- `/membership-levels`: 200
- `/suppliers`: 200
- `/suppliers/new`: 200
- `/promotions`: 200
- `/promotions/new`: 200
- `/promotions/calendar`: 200
- `/promotions/analytics`: 200
- `/promotions/stack-rules`: 200
- `/promotions/integration-map`: 200
- `/reports`: 200
- `/reports/sales`: 200
- `/reports/products`: 200
- `/reports/inventory`: 200
- `/reports/customers`: 200
- `/reports/purchasing`: 200
- `/settings`: 200
- `/customer-display`: 200
- `/igo-admin/login`: 200
- `/igo-admin/*`: 307 redirect without super-admin session, expected.

Limitations:

- HTTP route checks do not prove no console errors, hydration warnings, broken client-side buttons, or responsive issues.
- Dynamic detail routes such as `/customers/[id]`, `/suppliers/[id]`, `/products/[productId]/edit`, `/promotions/[id]` were not exhaustively smoke-tested with real IDs in this audit.

## Critical Issues

### C1. Demo mode blocks production-style writes

`withTenantTransaction()` calls `assertProductionWritesEnabled()` and throws while `IGO_DEMO_MODE=true`. Many server actions are wired to Prisma repositories, but demo mode intentionally prevents writes. This means UI write flows can look connected while returning failure unless code paths use separate mock/local behavior.

Impact:

- POS sale, inventory stock-in/adjustment/count, purchasing, settings, products, customers, suppliers, promotions, and membership writes may not persist in demo mode through the production write path.

Recommended fix:

- Define one explicit mode strategy:
  - Demo mode uses mock repositories that persist in memory/local demo store; or
  - Real QA mode sets `IGO_DEMO_MODE=false` against sandbox DB.
- Do not mix production server actions with demo-safe UI expectations.

### C2. Permission system is partial and bypassed in demo mode

`assertPermission()` returns immediately in demo mode. Settings UI has a large permission matrix, staff access, role templates, approval rules, and staff login UI, but the actual enforcement layer does not consume those dynamic settings in demo mode.

Impact:

- Owner/Manager/Cashier permission behavior cannot be trusted from UI alone.
- Sidebar/action lock behavior is mostly static or UI-level.
- Approval-required actions are mostly demo notifications, not server-enforced workflows.

Recommended fix:

- Make permission source of truth server-side.
- Load role permissions from persisted settings/roles after login.
- Enforce action-level permissions in every server action and API route.
- In demo mode, enforce the same permissions against seeded demo permission records.

### C3. Audit log coverage is incomplete

`withTenantTransaction()` writes audit logs for production writes, but many UI-only actions use local state, localStorage, demo notices, or mock data and do not create audit records.

Impact:

- Settings permission changes, approval decisions, QR bank/account changes, import/export placeholders, promotion UI actions, customer/supplier UI-only actions, and staff activity are not consistently audited.

Recommended fix:

- Route all important actions through server actions/API endpoints that write audit logs.
- Add audit event types for settings, permission, login/logout, QR account, approval, POS exceptions, import/export, and feature-lock decisions.

### C4. Reports and Dashboard do not consistently read real shared records

Reports still use significant mock aggregation and module mock data. Dashboard has Prisma service logic, but Reports module uses mock data for many report categories and advanced analytics.

Impact:

- Sales, profit, supplier debt, customer/member, promotion impact, staff ranking, branch, and audit reports may not reflect real writes.

Recommended fix:

- Implement report repositories over real sales, sale items, payments, stock movements, purchase orders, receiving, customers, membership ledgers, promotions, and audit logs.
- Dashboard and Reports must share the same aggregation service.

## High Issues

### H1. Promotion UI is far ahead of POS promotion engine

Promotion pages include stack rules, forecast, calendar, analytics, QR coupons, near-expiry recommendations, slow-moving promotions, approval, and profit protection. POS repository currently applies a simplified active promotion pass for percentage, fixed amount, member discount, and buy X get Y line discounts.

Missing:

- Full stack rules.
- Coupon/QR coupon validation at checkout.
- Approval workflow enforcement.
- Profit protection block at checkout.
- Max discount by item/bill/type.
- Free gift, bundle, tiered, mix-and-match, happy hour, flash sale engines.

### H2. Settings are partially connected

Connected:

- Company/settings update server action exists.
- Tax/VAT settings are read by POS repository for real sales.
- Basic tax/loyalty settings are read by POS.

Partial/UI-only:

- QR bank management mostly uses localStorage.
- Customer display settings mostly use localStorage.
- Staff Control & Permissions mostly UI/local state.
- Approval rules mostly UI/local/demo notifications.
- Currency/multi-currency settings are not consistently enforced across POS, receipts, reports, and customer display.

### H3. Supplier and purchasing overlap

Supplier module has rich UI for supplier details, outstanding balance, products supplied, rating, documents, ledger, and quick actions. Purchasing module has PO/receiving/payment repositories. The supplier UI still contains many placeholders and mock/demo supplier data.

Recommended source of truth:

- Supplier master data: Suppliers module.
- PO, receiving, supplier payment, AP ledger: Purchasing/AP services.
- Supplier UI should read those records, not own duplicate ledger/invoice concepts.

### H4. Customer, membership, loyalty, and promotion concepts overlap

Customer module owns customer profile, credit, points balance, purchase history. Membership Levels owns level rules. POS applies some loyalty and member discount behavior. Promotions also includes member discount and point redemption concepts.

Recommended source of truth:

- Customers: profile, customer code, phone, credit balance, points balance.
- Membership Levels: tier rules and membership discount rules.
- Loyalty Settings/Ledger: point earning/redeem.
- Promotions: campaign rules only.
- POS Checkout: final calculation engine.

### H5. Login/Auth needs browser-level QA

API callback verified:

- `igo-admin / AdminChangeMe123!`: 200
- `manager / Manager123!`: 200
- `cashier / Cashier123!`: 200
- wrong password: 401

Remaining:

- Password eye toggle was fixed at code level, but not visually verified in browser during this audit.
- Disabled user/role inactive scenarios were not verified with real disabled records.
- Logout/session persistence need browser QA.

## Medium Issues

- Full-app localization is incomplete. Several modules still contain hardcoded English labels, placeholders, and mixed language resources.
- Import/export flows exist mostly as placeholders in Products, Customers, Promotions, and Reports.
- Product category management has working server actions, but some UI copy still says local mock.
- Product image search/upload includes placeholder workflows and no final storage integration.
- Quick Stock In includes print/download placeholders.
- Purchasing supplier profile links still show "will be connected later" messages.
- Customer import/export and some card click actions show placeholder modals.
- Membership Levels has rich UI but POS integration for discount amount/rounding is not fully proven.
- Super Admin dashboard pages are foundational and demo-oriented; subscription entitlement is not enforced across merchant app.
- Business template selection stores local onboarding context; it is not yet persisted as real tenant/business records in DB.

## Low Issues

- Many labels are still hardcoded in components.
- Many client components read localStorage after mount; mostly acceptable, but needs systematic ClientOnly pattern for any UI that can mismatch SSR.
- Multiple reports and completion documents exist; roadmap needs consolidation.
- Route `/businesses/new` redirects and may be legacy/dead after simplified onboarding decision.
- App metadata still contains `EGO POS` in `app/layout.tsx`; product naming needs final consistency with IGO POS decision.

## Duplicated Features

See `DUPLICATE_FEATURES_REPORT.md` for full detail.

Top duplicates:

- Store membership vs SaaS subscription/plan.
- Staff permissions vs subscription feature locks.
- QR banks in Settings vs POS payment methods.
- Supplier debt in Suppliers vs Purchasing/AP.
- Reports data in Dashboard vs Reports.
- Promotion member discount vs Membership Levels discounts.
- Local onboarding business context vs database tenant/company records.

## Broken or Disconnected Actions

Examples found by code scan:

- Promotions import/export/bulk are UI-ready placeholders.
- Promotion stack rules/approval/profit protection are not fully enforced at checkout.
- Reports export/print/schedule/favorites are mostly UI shell behavior.
- Quick Stock In print/download receiving slip placeholders.
- Supplier documents/upload/ledger/products supplied are UI placeholders.
- Customer import/export placeholder.
- Settings permission changes and approval actions show demo notifications and are not consistently persisted/enforced.
- QR payment bank/account management uses localStorage and is not authoritative server data.

## UI/UX Issues

- Full browser visual audit was not available in this environment.
- Prior layout work fixed many overflow issues, but code still has several wide table/modal surfaces that need visual regression checks at 1366x768.
- Lao/English consistency remains incomplete outside platform onboarding/reports partial updates.
- Locked state/permissions are not consistently tied to real entitlement and role permissions.
- Several pages include "placeholder", "demo mode", or "will be connected later" visible text.

## Recommended Fix Order

1. Decide and implement one demo/real write strategy.
2. Enforce staff permissions and subscription entitlements server-side everywhere.
3. Convert Settings permission/approval/QR/staff access from localStorage/UI-only to real server data.
4. Complete POS checkout as final calculation engine: promotions, coupons, membership discounts, points, tax, currency, audit.
5. Connect Reports/Dashboard to real shared repositories.
6. Merge supplier debt/AP logic into Purchasing/AP source of truth.
7. Finish full localization module by module.
8. Add automated lint, unit, and E2E test scripts.
9. Run browser visual QA for 1366x768, 1440x900, 1920x1080.
