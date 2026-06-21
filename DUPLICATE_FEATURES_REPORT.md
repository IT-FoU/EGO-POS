# Duplicate Features Report

## 1. Store Membership vs IGO POS Subscription

Where it appears:

- Customers/Membership Levels: customer membership, discounts, points, QR cards.
- Super Admin/Subscriptions/Feature Lock: merchant SaaS plan and business access.
- Settings and Dashboard: plan display and days left.

Recommended source of truth:

- Store customer membership: Customers + Membership Levels + Loyalty Ledger.
- SaaS subscription: Super Admin Subscription/Entitlements.

What to merge/remove:

- Do not use "membership" for SaaS plan names.
- Rename SaaS concepts consistently to "Subscription Plan" or "IGO Plan".
- POS should apply customer membership only to customer discounts/points, not merchant feature access.

## 2. Staff Permissions vs Subscription Feature Locks

Where it appears:

- Settings Staff Control & Permissions.
- Dashboard sidebar locked feature badges.
- Super Admin subscription/feature lock foundation.
- `lib/auth/permissions.ts` server permission keys.

Recommended source of truth:

- Feature availability: subscription entitlement service.
- User action permission: role/permission service.
- Final rule: feature allowed by plan AND action allowed by staff role.

What to merge/remove:

- Remove static lock assumptions from navigation once entitlement service exists.
- Settings permission matrix must write/read the same permission records used by server actions.

## 3. QR Payment Bank vs POS Payment Method

Where it appears:

- Settings QR Payment Banks and QR Accounts.
- POS QR/Transfer payment UI.
- Receipt settings and customer display settings.
- Mock QR banks in `features/pos/mock-data.ts`.

Recommended source of truth:

- Settings QR Bank/QR Account records, scoped by company/branch.

What to merge/remove:

- Replace POS mock QR banks and localStorage fallback with server-loaded branch default QR account.
- Keep POS payment method as payment choice, not bank/account source.

## 4. Supplier Debt in Suppliers vs Purchasing/AP

Where it appears:

- Suppliers module outstanding balance cards, ledger, invoices, documents.
- Purchasing payables, supplier payments, purchase orders.
- Reports supplier debt/payables.

Recommended source of truth:

- Purchasing/AP owns supplier invoices, payables, payment records, ledger movements.
- Suppliers owns supplier profile/master data.

What to merge/remove:

- Supplier detail should read AP ledger data from Purchasing/AP service.
- Remove placeholder supplier invoice concepts once AP tables/services are final.

## 5. Reports Data vs Dashboard Data

Where it appears:

- Dashboard service.
- Reports service and mock full-data files.
- Individual report pages under `/reports/*`.

Recommended source of truth:

- Shared analytics/report repository over real transaction tables.

What to merge/remove:

- Dashboard KPIs and Reports KPIs should use the same aggregation functions.
- Remove duplicated mock metrics from report-specific files once real queries are implemented.

## 6. Promotion Member Discount vs Membership Level Discount

Where it appears:

- Membership Levels discount percent/fixed/rounding UI.
- Promotions member discount promotion type.
- POS checkout customer pricing.

Recommended source of truth:

- Membership Levels owns standing customer tier discount rules.
- Promotions owns campaign discounts.
- POS Checkout is the only calculation engine combining them.

What to merge/remove:

- Avoid creating permanent membership discounts inside Promotions.
- Promotion member targeting should select customer/membership segment, not duplicate tier rules.

## 7. Points / Loyalty in Customers, Membership, POS, Promotions

Where it appears:

- Customer points balance.
- Loyalty ledger.
- Membership levels/points settings.
- Promotions point redemption.
- POS checkout earn/redeem.

Recommended source of truth:

- Loyalty Settings + Loyalty Ledger + Customer points balance.

What to merge/remove:

- Promotions can trigger bonus point campaigns later, but should not own customer point balance.

## 8. Local Onboarding Business Context vs Tenant/Company Records

Where it appears:

- Platform onboarding localStorage context.
- Prisma Company/Branch/Warehouse tenant records.
- Dashboard shell active business display.

Recommended source of truth:

- Company/Tenant/Branch/Warehouse tables.

What to merge/remove:

- Convert onboarding completion into real company/branch/warehouse creation in sandbox DB.
- Keep localStorage only as temporary draft until server save succeeds.

## 9. Product Category Management in Product Form vs Categories Page

Where it appears:

- Product form inline category add/edit/delete controls.
- `/products/categories` management page.

Recommended source of truth:

- Product category repository/actions.

What to merge/remove:

- Both UIs may remain, but must call the same server action and validation.
- Remove any local mock-only category behavior.

## 10. Customer Display Settings vs Customer Display Runtime

Where it appears:

- Settings customer display controls.
- `features/pos/customer-display-settings.ts` localStorage helpers.
- `/customer-display` runtime.

Recommended source of truth:

- Settings table scoped by company/branch/register.

What to merge/remove:

- Runtime should read server settings on load and subscribe/poll for active checkout state.
- localStorage can remain as demo transport only.
