# EGO POS Rebuild Sequence Plan

This plan defines the correct implementation order after architecture documentation. Do not skip data foundation phases.

## Phase B.0 - Data Foundation Check

Goal:

- Verify central repositories, stable storage keys, migration layer, DTOs, and demo/production adapter boundaries.

Deliverables:

- Repository contracts
- DTO maps
- Remaining direct storage read list
- Remaining server mock list

Exit criteria:

- Products/POS/Inventory/Reports know which repository they must use.

## Phase B.1 - Products Source of Truth

Goal:

- Products create/edit/delete/category/unit/image all use one product repository.

Scope:

- Products
- Categories
- Product units
- Product images

Exit criteria:

- POS and Products show the same product state.

## Phase B.2 - POS Sales / Pay / Receipt

Goal:

- Complete sale workflow through one checkout service.

Scope:

- Cart
- Payment
- Sale save
- Receipt save
- Audit
- Customer display
- Cashier/session

Exit criteria:

- Pay completes sale and writes all required records.

## Phase B.3 - Inventory Movement

Goal:

- Stock movements and balances become source of truth.

Scope:

- Sale deduction
- Quick stock in
- Adjustment
- Count
- Transfer
- Lot/expiry

Exit criteria:

- Inventory stock reflects POS sales and stock-in.

## Phase B.4 - Reports From Real Sales

Goal:

- Reports and Dashboard read from sales/payments/products/inventory movements.

Scope:

- Sales report
- Product report
- Inventory report
- Payment breakdown
- Dashboard KPIs

Exit criteria:

- Reports change after POS sale.

## Phase B.5 - Customer / Membership Integration

Goal:

- POS customer lookup, membership discount, points, spend, and history are connected.

Scope:

- Customers
- Membership levels
- Points ledger
- POS checkout

Exit criteria:

- Sale updates customer and points records.

## Phase B.6 - Promotion Engine Integration

Goal:

- Promotion wizard rules affect POS checkout through one promotion engine.

Scope:

- Promotion rules
- Coupons
- Stacking
- Profit protection
- Usage history
- Promotion reports

Exit criteria:

- Promotion applies in POS and reports show usage.

## Phase B.7 - Purchasing / Supplier / Debt

Goal:

- Purchasing receiving increases stock and creates supplier payables.

Scope:

- Suppliers
- PO
- Receiving
- Payables
- Supplier payments
- Supplier ledger

Exit criteria:

- Receive goods updates inventory and supplier debt.

## Phase B.8 - Settings / Staff / Approval Enforcement

Goal:

- Settings are no longer UI-only.

Scope:

- Staff login
- Permission matrix
- Approval rules
- Pending approval center
- VAT
- Currency
- QR
- Receipt
- Customer display

Exit criteria:

- Permissions and approvals are enforced in UI, actions, and APIs.

## Phase B.9 - Printing Module

Goal:

- Receipt, barcode, price label, document, and report printing use one print service.

Scope:

- Printer profiles
- Label templates
- Print preview
- PDF export
- Browser print fallback

Exit criteria:

- Product barcode/price labels can be printed from selected products.

## Phase B.10 - Super Admin Plan / Feature Lock

Goal:

- Plan entitlements are enforced across merchant portal.

Scope:

- Plan management
- Tenant status
- Feature locks
- Plan expiry
- Upgrade prompts

Exit criteria:

- Feature access requires plan entitlement and staff permission.

## Phase B.11 - Localization Final Pass

Goal:

- Full Lao/English localization without mixed UI.

Scope:

- All merchant pages
- Customer display
- Receipts
- Super Admin
- Modals
- Validation

Exit criteria:

- Remaining English UI strings in Lao mode = 0 excluding approved terms.

## Phase B.12 - Full End-to-End QA

Goal:

- Verify real business workflows.

Test flows:

- Login roles
- Product create/edit/delete
- POS sale/pay/receipt
- Stock deduction
- Quick stock-in
- Customer membership
- Promotion apply
- Purchase receiving
- Supplier payable/payment
- Reports update
- Settings behavior
- Printing
- Feature locks
- Audit logs

Exit criteria:

- GO/NO-GO report for production hardening.
