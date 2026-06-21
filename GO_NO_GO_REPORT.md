# IGO POS GO / NO-GO Report

## Decision

NO-GO for production launch.

GO for continued controlled demo/QA and integration hardening.

## What Is Working

- Main merchant routes load by HTTP smoke test.
- Login API accepts demo owner, manager, and cashier credentials.
- Wrong password is rejected.
- TypeScript passes.
- Prisma schema validates.
- Next production build passes.
- POS real repository path includes sale, sale items, payments, stock deduction, stock movements, promotion usage, loyalty ledger, and audit log through transaction.
- Inventory and Purchasing repositories/actions exist for key write flows.
- Settings company/tax/loyalty repository exists and no longer crashes in demo fallback.
- Super Admin has separated login/session foundation.

## Production Blockers

### P0. Demo mode write strategy is unresolved

Production write actions throw when `IGO_DEMO_MODE=true`, while the app is still expected to operate in demo mode. This causes ambiguous behavior: some flows are local/mock, some call real server actions that intentionally fail.

### P0. Permissions are not production-enforced end to end

Demo mode bypasses server permission checks. Settings permission matrix is not the source of truth for server authorization. Manager/Cashier restrictions, approval workflow, and sidebar/action locks are not fully connected.

### P0. Reports are not real source-of-truth analytics

Reports still read large mock/demo datasets. Production cannot rely on sales/profit/inventory/customer/promotion/supplier reports until real shared aggregation queries are implemented.

### P0. Promotion engine is incomplete compared with UI

Promotion UI promises stack rules, profit protection, coupons, QR coupons, approval, forecasts, and many promotion types. POS checkout currently supports a smaller simplified subset.

### P1. Settings integration is incomplete

QR payment banks, staff access, approval rules, customer display settings, currency settings, staff ranking/activity, printer/backup/security settings are not consistently persisted and enforced across POS, receipts, reports, and customer display.

### P1. Audit logging is incomplete

Only real transaction writes through `withTenantTransaction()` reliably write audit logs. Many UI/demo/localStorage actions do not.

### P1. Full localization is incomplete

Many modules still contain hardcoded English placeholders and mixed language resources. Full Lao/English switching is not complete.

### P1. Subscription/feature lock is not enforced with staff permissions

Super Admin subscription foundation exists, but merchant route/action entitlement enforcement is not integrated.

## What Can Wait

- Advanced AI insights.
- Final PDF/Excel export formatting.
- Full offline/PWA behavior.
- Advanced supplier score calculation.
- Advanced documents management.
- WhatsApp/Telegram scheduled report delivery.
- Business-specific POS templates beyond Mini Mart.
- Visual polish for non-core placeholder pages.

## Recommended Next Steps

1. Create a single execution mode matrix:
   - Demo local/mock mode.
   - Sandbox real DB mode.
   - Production DB mode.
2. Complete server-side permission and entitlement enforcement:
   - Subscription allows feature.
   - Staff role allows action.
   - Approval rule decides whether action is immediate or pending.
3. Convert Settings Staff Control, QR Bank, Approval Rules, Customer Display, Currency into persisted server-backed settings.
4. Finish POS Checkout as final calculation engine:
   - Product pricing/unit.
   - Promotions/coupons.
   - Membership discounts.
   - Points earn/redeem.
   - Tax/VAT.
   - Multi-currency.
   - Stock.
   - Payments.
   - Audit.
5. Replace Reports mock data with real repositories shared by Dashboard.
6. Merge supplier debt/ledger into Purchasing/AP source of truth.
7. Complete module-by-module i18n migration.
8. Add missing scripts:
   - `lint`
   - `test`
   - `test:e2e`
9. Run browser E2E tests for:
   - Login.
   - POS sale.
   - Inventory stock-in.
   - Purchasing receive.
   - Customer membership.
   - Promotion checkout.
   - Settings permission denial.

## Validation Results

- `npm run typecheck`: PASS
- `prisma validate`: PASS
- `npm run build`: PASS
- `npm run lint`: FAIL, script missing.
- `npm test`: FAIL, script missing.
- `npm run test:e2e`: FAIL, script missing.

## Final Recommendation

Do not move to production until P0 blockers are resolved.

Recommended next milestone: Production Integration Hardening Phase 1, focused only on permission/entitlement enforcement, settings persistence, and POS checkout source-of-truth integration.
