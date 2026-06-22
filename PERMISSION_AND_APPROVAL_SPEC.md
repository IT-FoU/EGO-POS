# EGO POS Permission and Approval Specification

## 1. Purpose

This document defines role permissions, action checks, approval rules, pending approvals, and audit requirements across EGO POS.

## 2. Roles

Owner:

- Full merchant access.
- Cannot be restricted by merchant permission matrix.
- Still subject to subscription/feature locks.

Manager:

- Configurable by Owner.
- Can be allowed inventory, purchasing, customer, report, supplier, and promotion access.
- Profit/cost/margin visibility can be hidden.
- High-risk actions usually require Owner approval.

Cashier/Staff:

- POS-focused by default.
- Own sales report only.
- No Settings access by default.
- No profit/cost/margin by default.

Custom:

- Future custom role based on same permission matrix.

Super Admin:

- Platform role only.
- Separate portal and session.
- Does not perform merchant cashier actions.

## 3. Standard Permission Matrix

Each module supports:

- View
- Create
- Edit
- Delete
- Approve
- Export
- Print

Modules:

- Dashboard
- POS
- Products
- Inventory
- Purchasing
- Customers
- Membership
- Suppliers
- Promotions
- Reports
- Settings
- Super Admin platform modules

## 4. POS Permissions

Actions:

- Create sale
- Hold bill
- Resume bill
- Void bill
- Refund bill
- Apply discount
- Maximum discount percent
- Manual price override
- Delete item from bill
- Reprint receipt
- Open cash drawer
- Cash in
- Cash out
- Split payment
- Multi-currency payment

Default:

- Owner: allowed.
- Manager: allowed for normal sale actions; approval for refund/void/manual price/large discount.
- Cashier: create sale, hold/resume if enabled, no refund/void/manual price by default.

## 5. Product Permissions

Actions:

- View products
- Create product
- Edit product
- Delete product
- Change selling price
- Change cost price
- Manage categories
- Import/export
- Print labels

Rules:

- Product selling price change by Manager should create approval request if rule enabled.
- Product delete can require approval.
- Barcode changes must write barcode history and audit.
- Price changes must write price history and audit.

## 6. Inventory Permissions

Actions:

- View stock
- Receive stock
- Stock adjustment
- Stock count
- Stock transfer
- View cost
- View margin
- Export inventory

Rules:

- Stock adjustment can require approval.
- Negative stock adjustment above threshold can require Owner approval.
- Cost visibility follows manager profit visibility setting.

## 7. Purchasing Permissions

Actions:

- Create PO
- Edit PO
- Cancel PO
- Receive goods
- Return to supplier
- Supplier payment
- View supplier debt
- Approve PO

Rules:

- Purchase order above threshold can require approval.
- Supplier payment can require approval.
- Receiving must write inventory and supplier payable records.

## 8. Customer / Membership Permissions

Actions:

- View customer
- Add customer
- Edit customer
- Delete customer
- View customer credit
- Adjust credit
- Adjust points
- Create membership
- Edit membership tier
- Give manual reward
- View purchase history

Rules:

- Credit adjustment can require approval.
- Point adjustment can require approval.
- Membership rules belong to Membership module, not Customers.

## 9. Promotion Permissions

Actions:

- Create promotion
- Edit promotion
- Delete promotion
- Activate/deactivate
- Approve promotion
- View impact forecast
- Manage coupons
- Manage stack rules

Rules:

- High-risk promotions require approval.
- Negative profit promotions must be blocked, not approved.
- Near-threshold margin can request approval.

## 10. Settings Permissions

Settings sections:

- Company Profile
- Receipt Settings
- QR Payment Banks
- Customer Display
- Tax/VAT
- Currency
- Printer Settings
- Backup Settings
- Security Settings
- Staff Control

Default:

- Owner: full.
- Manager: limited if granted.
- Cashier: no Settings access.

## 11. Approval Request Data

Required fields:

- approvalId
- companyId
- branchId
- module
- action
- requestType
- requestedByUserId
- requestedByRole
- requestedAt
- oldValue
- newValue
- amount
- reason
- status
- approverUserId
- decidedAt
- decisionNote
- relatedEntityType
- relatedEntityId

Statuses:

- Pending
- Approved
- Rejected
- Cancelled
- Expired

## 12. Approval Flow

1. User attempts controlled action.
2. Permission service checks role/action/context.
3. Approval rule service checks thresholds.
4. If approval is required, pending approval is created.
5. Original action is not applied.
6. Owner/authorized approver approves or rejects.
7. Approved action applies using stored payload.
8. Rejected action remains unapplied.
9. Audit logs are written for request and decision.

## 13. Audit Requirements

Every permission-controlled action must log:

- User
- Role
- Module
- Action
- Result: allowed, blocked, approval requested, approved, rejected
- Old/new value when relevant
- Date/time
- Reason

## 14. Implementation Contract

Permission enforcement must exist in:

- UI button state
- Client handlers
- Server actions
- API routes

UI-only permission hiding is not enough.

## 15. POS Recent Sales Permissions

Recent Sales actions must pass through the same POS permission guard used by Pay and cart actions.

Permissions:

- View Recent Sales
- View Receipt
- Reprint Receipt
- Refund Sale
- Void Sale
- Edit Sale Note
- Edit Sale Customer
- Edit Sale Payment
- Delete Sale
- Duplicate Sale

Defaults:

- Owner: full access.
- Manager: view/reprint/duplicate/edit metadata if enabled; refund/void/delete may require Owner approval.
- Cashier: view own sales and own receipts by default; refund, void, and delete are blocked unless explicitly configured.

Approval requirements:

- Refund/Void/Delete must create pending approval when the approval rule requires it.
- The sale must not be refunded, voided, deleted, or stock-restored until approval is granted.
- Soft delete must always preserve the sale and audit history.

Audit requirements:

- View/reprint/refund/void/edit/delete/duplicate writes audit entries.
- Timeline entries should remain attached to the sale for receipt history and future reports.
