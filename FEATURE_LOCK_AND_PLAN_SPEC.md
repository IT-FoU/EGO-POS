# EGO POS Feature Lock and Plan Specification

## 1. Purpose

This document defines how EGO POS SaaS plans, feature locks, tenant status, staff permissions, and offline availability work together.

## 2. Source of Truth

Production tables:

- `Plan`
- `SaaSSubscription`
- `Company`
- `CompanySetting`
- `CompanyModule` or future feature entitlement table
- `User`
- `Role`
- `Permission`

Demo/current sources:

- Plan display fallback: `ego-pos:plan-name`, `ego-pos:plan-days-left`
- Business setup: `ego-pos:onboarding-*`
- Staff permissions: `ego.pos.staff.access.users` and future permission settings storage

## 3. Plan Evaluation Rule

Every protected feature/action must pass both checks:

1. Subscription/plan allows feature.
2. Staff permission allows action.

Priority:

- If plan blocks feature, staff permission cannot unlock it.
- If plan allows feature, staff permission can still block the action.
- Owner role bypasses staff restrictions but does not bypass plan entitlement.
- Super Admin can change plan/feature entitlement but does not perform merchant actions.

## 4. Free Plan Baseline

Free Plan should keep the store operational:

- Core POS sale
- Basic product create/edit
- Basic stock view
- Basic receipt
- Basic customer list
- Basic daily sales report
- Single branch
- Single warehouse
- Limited staff count
- Limited product count
- Limited backup/demo mode

Free Plan locked or limited:

- Advanced reports
- Import/export
- Multi-branch
- Multi-warehouse
- Advanced promotions
- Customer display
- Advanced printer profiles
- Barcode/shelf label batch printing
- Supplier payables
- Purchase order approval workflow
- Advanced staff permissions
- Cloud backup
- API integrations
- White label/custom branding beyond basic logo

## 5. Paid Plan Examples

Premium Plan:

- More products/staff
- Customer display
- QR accounts
- Import/export
- More reports

Gold Plan:

- Purchasing
- Suppliers
- Advanced inventory
- Barcode printing
- Promotion tools

Platinum Plan:

- Multi-branch
- Multi-warehouse
- Advanced reports
- Approval workflows
- Staff ranking/activity

Diamond Plan:

- Full analytics
- Scheduled reports
- Advanced printer profiles
- API/cloud integrations
- Priority support
- Higher limits

## 6. Business-Level Feature Flags

Feature flags should be stored by company/tenant:

- `feature.pos`
- `feature.products`
- `feature.inventory`
- `feature.purchasing`
- `feature.suppliers`
- `feature.customers`
- `feature.membership`
- `feature.promotions`
- `feature.reports.advanced`
- `feature.customerDisplay`
- `feature.printer.receipt`
- `feature.printer.barcode`
- `feature.printer.priceLabel`
- `feature.qrPayment`
- `feature.multiCurrency`
- `feature.importExport`
- `feature.multiBranch`
- `feature.multiWarehouse`
- `feature.approvals`
- `feature.auditReports`
- `feature.backup`

## 7. Upgrade Flow

1. User clicks locked feature.
2. System shows locked state and required plan.
3. Owner can request upgrade.
4. Super Admin updates plan/subscription.
5. Merchant portal reloads entitlement.
6. Feature becomes available only if staff permission also allows action.

## 8. Super Admin Plan Control

Super Admin can:

- Create/edit plans
- Assign company plan
- Set expiry date
- Suspend tenant
- Add/remove add-ons
- Lock/unlock feature groups
- View plan audit history

Super Admin actions must write platform audit logs.

## 9. Plan Expiry Behavior

When plan expires:

- Data remains preserved.
- Core POS should remain available according to grace policy.
- Locked paid features become read-only or unavailable.
- Advanced reports/import/export/automation pause.
- Owner sees clear expired plan banner.
- Cashier should not see confusing subscription controls.

Recommended grace behavior:

- Allow core POS sales and receipt printing for a configured grace period.
- Block new advanced configuration changes.
- Keep historical reports visible in limited form.

## 10. Offline Usability

Offline/demo-safe operations:

- POS sale queue
- Product lookup from local cache
- Receipt print/reprint from local cache
- Cash payments
- Default QR display if cached

Online-required operations:

- Plan upgrade
- Super Admin changes
- Cloud backup
- External integrations
- Payment provider validation
- Cross-branch sync

## 11. Enforcement Points

Feature lock checks must exist in:

- Sidebar navigation
- Page access
- Action buttons
- Server actions
- API routes
- POS checkout
- Reports export/schedule
- Printer jobs

## 12. Audit Requirements

Audit these events:

- Plan changed
- Feature unlocked/locked
- Tenant suspended/reactivated
- Plan expired
- Upgrade requested
- Locked feature clicked
- Add-on added/removed

## 13. Open Questions

1. What exact product/staff/report limits should each plan have?
2. Should Free Plan allow QR payment setup?
3. Should expired tenants be able to sell indefinitely offline?
4. Should Super Admin support manual payment records for subscription invoices?
5. Should add-ons be purchasable independently from plan tier?
