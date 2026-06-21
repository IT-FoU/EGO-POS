# EGO POS Settings Integration Map

## Purpose

This map defines how each Settings area must connect to live modules, actions, permissions, audit logs, and tests. Settings must be the control layer for merchant behavior, not isolated UI.

## Integration Table

| Setting name | Connected module | Connected action | Expected behavior | Permission rule | Audit log event | Test checklist |
|---|---|---|---|---|---|---|
| Company Profile | Dashboard, Receipt, Reports, Exports, Customer Display | Read business name, phone, email, address, logo | Store identity appears consistently in POS shell, receipts, reports, invoices, exports, and display | Owner or Settings.Company Profile edit | receipt/profile/company setting changed | Update profile, refresh dashboard/receipt/report preview |
| Receipt Settings | POS, Receipt Preview, Printed Receipt | Receipt prefix, logo visibility, header, footer, tax visibility | Receipts use configured prefix, logo, header/footer, QR print option, and VAT display | settings.receipt.edit | receipt setting changed | Create sale, preview receipt, verify prefix/logo/tax/header/footer |
| QR Payment Banks | POS Payment, Receipt, Customer Display | Default QR account by branch, QR override, receipt QR, display QR | QR/Transfer loads branch default; Manager override only if allowed; staff uses default | pos.qr.override or Owner/Manager | QR bank/account added/edited/deleted/default changed | Add bank/account, set default, select QR payment, verify receipt/display |
| Customer Display | POS Checkout, Advertisement Mode | Checkout screen, QR screen, thank-you screen, auto return | Sale start switches display to checkout; QR payment shows active QR; complete sale shows thank-you; auto returns after configured seconds | settings.customerDisplay.edit | customer display setting changed | Start cart, select QR, complete sale, wait auto return |
| Staff Access & Login Management | Auth, Session, POS, Back Office | Username/password login, role, branch, terminal, active status | Owner/Manager/Cashier login with username/password; disabled staff blocked; role permissions loaded | Owner only for staff management | staff created/edited/disabled/password reset/role changed | Create staff, reset password, disable staff, test login allowed/blocked |
| Permission Matrix | Navigation, API Routes, Server Actions, POS Actions | View/Create/Edit/Delete/Approve/Export/Print | Menus hidden or locked; forbidden actions disabled and blocked server-side | Owner cannot be restricted; Manager/Staff configurable | permission changed | Toggle permission, verify sidebar/action/API enforcement |
| Manager Profit Visibility | Dashboard, Reports, Products, Inventory, POS | Hide cost/profit/margin/gross profit | Manager sees sales only when configured; staff never sees profit by default | Owner-controlled setting | profit visibility setting changed | Login as manager/staff, verify profit/cost fields hidden |
| Product Price Change Rule | Products, POS Price Override, Approval Center | Price change pending approval | Manager price edits become pending requests and do not update live price until approved | product.price.approve | price change request created/approved/rejected | Manager submits price change, owner approves/rejects |
| Approval Rules | Products, POS, Inventory, Purchasing, Suppliers, Customers, Promotions | Create pending approval requests | Sensitive actions create pending request; approved action applies; rejected action does not apply | rule-specific approver | approval rule changed/request created/approved/rejected | Test refund, void, stock adjustment, PO approval, supplier payment |
| Pending Approval Center | Owner Dashboard, Settings, Approval Workflow | Approve/reject requests | Authorized approver can apply or reject pending actions with reason and audit log | approval.view / approval.approve | approval approved/rejected | Open request, approve/reject, verify target action state |
| Staff Activity Monitor | Auth, POS, Inventory, Products, Cash Drawer | Track login/logout, bills, discounts, refunds, voids, cash, stock, price requests | Activity records drive ranking and reports | Owner/Manager view; staff own activity only | staff activity event recorded | Login/logout, create bill, discount/refund/void, verify activity |
| Staff Ranking | Reports, Staff Activity | Ranking metrics | Ranking uses real tracked activity; staff sees own ranking by default | ranking.view.all or ranking.view.own | ranking setting changed | Generate staff activity, verify ranking visibility |
| Tax/VAT Settings | POS Cart, Receipt, Reports, Product Pricing | VAT enabled, inclusive/exclusive, VAT rate, show on receipt | POS totals, receipts, reports, and pricing display follow VAT rules | settings.tax.edit | tax setting changed | Change VAT, add item, verify cart/receipt/report |
| Currency Settings | POS Payment, Receipt, Reports, Customer Display, Multi-currency | Base currency, display, decimals, rounding | LAK base; THB/USD display by exchange rate; rounding and decimals apply consistently | settings.currency.edit | currency setting changed | Change rounding/decimals, verify POS/receipt/report/display |
| Loyalty Rules | POS, Customers, Membership, Reports | Earn/redeem rules | Checkout earns/redeems points using configured spend/value/minimum rules | settings.loyalty.edit | loyalty setting changed | Complete customer sale, verify points ledger/report |
| Printer Profiles | Products, POS, Receipt, Reports, Purchasing, Inventory | Configure branch printers, label sizes, output modes, print templates | Each branch can choose printer profiles per print job; barcode labels, receipts, reports, purchase orders, documents, and shelf labels route to the configured printer/output mode | settings.printer.manage / print.job.create | printer profile changed / print job created/completed/failed | Configure sticker printer, receipt printer, A4 fallback, label size, print barcode, print receipt, export PDF |

## POS Permission Enforcement Map

| POS action | Required permission | Missing permission behavior | Approval fallback |
|---|---|---|---|
| Create sale | POS.Create sale | Show "You do not have permission to perform this action." | None |
| Hold bill | POS.Hold bill | Disable Hold Bill | None |
| Resume bill | POS.Resume bill | Disable Resume Bill | None |
| Void bill | POS.Void bill | Block action | Create approval request if configured |
| Refund bill | POS.Refund bill | Block action | Manager/Owner/custom threshold approval |
| Apply discount | POS.Apply discount | Disable discount controls | Approval if above max discount |
| Open cash drawer | POS.Open cash drawer | Hide/disable cash drawer button | Approval if configured |
| Cash in / Cash out | POS.Cash in/out | Block cash movement | Approval if configured |
| Split payment | POS.Split payment | Disable split payment | None |
| Multi-currency payment | POS.Multi-currency payment | Disable non-LAK payment | None |
| Manual price override | POS.Manual price override | Disable override | Owner approval for price change |
| Reprint receipt | POS.Reprint receipt | Disable reprint | None |
| Delete item from bill | POS.Delete item from bill | Disable delete item | Approval if configured |

## Backend Services Needed

- `staffAccessService`: create/edit/disable staff, reset password, assign branch/terminal.
- `staffAuthService`: username/password login, password hashing, status/role validation, session creation.
- `permissionService`: resolve effective role permissions and feature locks.
- `actionGuardService`: shared server-side guard for API routes and server actions.
- `approvalWorkflowService`: create/approve/reject/apply pending actions.
- `settingsRuntimeService`: reads active receipt, tax, currency, QR, display, loyalty, and permission settings.
- `auditLogService`: records all setting and permission changes.
- `staffActivityService`: records login/logout, POS, cash, inventory, and price request activity.
- `staffRankingService`: aggregates ranking metrics from real activity.

## Required Server-Side Enforcement

UI hiding is not enough. Every write API/server action must check:

1. User session.
2. Company/branch scope.
3. Staff status and role active status.
4. Permission key for the action.
5. Approval rule if the action is sensitive.
6. Audit log write for allowed, blocked, and approval-triggered actions.

## Test Checklist

- Staff can be created with username and password.
- Password is never stored as plain text.
- Disabled staff cannot login.
- Inactive role cannot login.
- Successful login loads role permission.
- Sidebar/action buttons respect permissions.
- POS actions are blocked without permission.
- Approval-required actions create pending requests.
- QR payment loads branch default QR account.
- Receipt settings affect preview/print.
- Printer profiles route barcode labels, receipts, A4 reports/documents, purchase orders, and shelf labels.
- Customer display follows POS checkout state.
- VAT affects cart, receipt, reports, and pricing display.
- Currency affects POS, receipt, reports, display, and rounding.
- Staff activity records feed ranking.
- Every settings change writes audit log.

## Current Implementation Status

- Settings UI foundation: partially connected.
- Staff Access UI: demo/local foundation added.
- Password storage: hashed in demo localStorage, production must move hashing server-side.
- Permission Matrix: UI foundation exists; full server-side route/action enforcement still required.
- QR bank/account: demo/local foundation exists; POS/receipt/display runtime consumption still required.
- Integration map: complete for implementation guidance.
- Printer Profiles: architecture requirement added; UI/backend implementation remains future work.

## Printer Profile Requirements

Printer configuration must be branch-scoped and print-job-specific. EGO POS must not be locked to a single printer brand.

Supported printer types:

- Sticker / barcode label printer
- Receipt thermal printer, 58mm and 80mm
- A4 document printer for reports, purchase orders, documents, and sheet label printing
- Price tag / shelf label printer

Supported sticker/label printer profiles:

- Generic thermal label printer
- Xprinter
- Zebra
- TSC
- Godex

Supported connection types:

- USB
- LAN / IP printer
- Bluetooth
- Windows installed printer
- Browser print dialog fallback

Supported output modes:

- Direct thermal label print
- Browser print preview
- PDF export
- A4 sticker sheet layout

Supported label sizes:

- 40x30 mm
- 50x30 mm
- 60x40 mm
- 70x50 mm
- 100x50 mm
- Custom width/height

Default architecture:

1. Use generic printer profiles first.
2. Allow optional brand-specific profiles later.
3. Store printer type and connection per branch.
4. Store label size per template or print job.
5. Route each print job by job type:
   - Product barcode label
   - Shelf price tag
   - POS receipt
   - Report
   - Purchase order
   - A4 document
6. Keep browser print and PDF export as safe fallbacks.
