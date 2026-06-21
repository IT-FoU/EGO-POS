# EGO POS Phase Rebuild Plan

This plan is for rebuilding integration in controlled phases. Do not add new features inside these phases unless they are required to connect existing workflows.

## Phase A: Core Data + POS Workflow

Goal:

- Make POS sale reliable end to end.

Scope:

- Product source for POS.
- Cart line identity.
- Payment handling.
- Sale persistence.
- Receipt persistence.
- Stock deduction.
- Audit log.
- Reports source handshake.

Deliverables:

- One demo/production Sales repository interface.
- One product lookup source for POS.
- One stock deduction path.
- One receipt record path.
- POS UI tests for add product, pay, receipt, stock decrement.

Exit criteria:

- User can create product, sell it, see stock decrease, see sale in reports source.

## Phase B: Inventory + Products

Goal:

- Products, units, inventory balances, lots, and stock movements share one source.

Scope:

- Product create/edit/delete.
- Product unit conversion.
- Opening stock as stock movement.
- Inventory dashboard reads actual balances.
- Quick stock-in writes movements/lots.

Deliverables:

- Product repository adapter.
- Inventory repository adapter.
- Stock movement writer for product create/opening stock and POS sale.

Exit criteria:

- Inventory and POS show the same stock.

## Phase C: Staff + Permissions + Approval

Goal:

- Settings permission matrix controls actual navigation and actions.

Scope:

- Staff create/login.
- Role templates.
- Permission matrix.
- Approval rules.
- Pending approval center.
- Audit logs.

Deliverables:

- One permission service.
- One approval service.
- UI and server action enforcement.

Exit criteria:

- Owner/Manager/Cashier behavior matches Settings.

## Phase D: Customers + Membership

Goal:

- Customer profile, membership levels, points, credit, and POS lookup are connected.

Scope:

- Customer create/edit.
- Phone/QR/barcode lookup.
- Membership level discount.
- Points earn/redeem.
- Credit balance.
- Purchase history.

Deliverables:

- Customer repository adapter.
- Membership rule engine.
- POS customer lookup integration.

Exit criteria:

- Selling to a customer updates spend/points/history.

## Phase E: Purchasing + Suppliers

Goal:

- Purchasing, receiving, inventory increase, and supplier debt connect.

Scope:

- Supplier CRUD.
- Purchase order.
- Goods receiving.
- Supplier payable/payment.
- Supplier ledger.

Deliverables:

- Receiving transaction service.
- Supplier payable service.
- Inventory stock-in integration.

Exit criteria:

- Receiving goods increases stock and updates supplier debt.

## Phase F: Promotions

Goal:

- Promotions affect POS checkout and reports.

Scope:

- Promotion approval.
- Active promotion evaluation.
- Stack rules.
- Profit protection.
- Coupon/QR coupon.
- Promotion usage records.

Deliverables:

- Promotion rule engine.
- Stack engine.
- Profit protection service.
- POS checkout integration.

Exit criteria:

- Promotion discount is saved with sale and appears in reports.

## Phase G: Reports

Goal:

- Reports and Dashboard read real shared data.

Scope:

- Sales reports.
- Inventory reports.
- Customer reports.
- Promotion reports.
- Purchasing/supplier reports.
- Audit reports.

Deliverables:

- Report repository.
- Dashboard/report shared metric services.
- Export/print wiring.

Exit criteria:

- Reports reflect POS, stock, purchasing, customers, and promotions.

## Phase H: Settings + Printer + QR + Localization

Goal:

- Settings are runtime source of truth.

Scope:

- Company profile.
- Receipt settings.
- QR banks/accounts.
- Customer display.
- Tax/VAT.
- Currency.
- Printer profiles.
- Localization.

Deliverables:

- Stable settings keys.
- CompanySetting/API integration.
- QR account source.
- Print job service.
- Full dictionary-based localization.

Exit criteria:

- Settings changes visibly affect POS, receipt, customer display, reports, and print.

## Phase I: Super Admin + Plans + Feature Locks

Goal:

- Platform plan controls tenant features.

Scope:

- Super Admin business/user/subscription controls.
- Plan feature matrix.
- Tenant suspend/activate.
- Feature entitlement checks.

Deliverables:

- Entitlement service.
- Merchant route/action lock checks.
- Super Admin audit logs.

Exit criteria:

- Feature access requires both subscription entitlement and staff permission.

## Phase J: Production Readiness

Goal:

- Prepare real deployment.

Scope:

- PostgreSQL connection.
- Migrations.
- Seed strategy.
- Backups.
- Error handling.
- Monitoring.
- Security review.
- E2E tests.
- Performance.
- Browser/device/printer testing.

Deliverables:

- Production environment checklist.
- Migration verification.
- Role/permission tests.
- POS sale E2E tests.
- Backup/restore test.

Exit criteria:

- System is ready for pilot store use.

