# EGO POS System Integration Map

This document is the central module connection map. Future implementation must follow these flows before changing UI behavior.

## 1. Product -> POS

Flow:

1. Product is created/edited/deleted in Products.
2. Product repository stores product, units, barcode, SKU, price, cost, category, image, status.
3. POS reads active products and active sale units from product repository.
4. Deleted/inactive products are hidden from POS.
5. Edited name, price, barcode, SKU, unit, image, and stock display update in POS.

Owner:

- Products module owns product catalog data.

Dependencies:

- POS depends on Products.
- Inventory depends on Products for product metadata.
- Reports depend on Products for display names/categories.

## 2. POS -> Sales

Flow:

1. POS cart is confirmed.
2. Checkout engine validates cart, permission, stock, customer, promotion, VAT, currency, and payment.
3. Sale header and sale items are written.
4. Sale payments are written.

Owner:

- Sales/POS module owns sale transaction records.

Consumers:

- Reports
- Dashboard
- Customer purchase history
- Staff ranking/activity
- Audit logs

## 3. POS -> Receipts

Flow:

1. Sale completes.
2. Receipt snapshot is generated.
3. Receipt settings apply logo/header/footer/VAT/QR/print options.
4. Receipt is stored.
5. Print service receives receipt print job.

Settings dependencies:

- Receipt settings
- QR account settings
- Currency settings
- Printer profile

## 4. POS -> Stock Deduction

Flow:

1. Each sale item converts selected unit quantity to base-unit quantity.
2. Inventory balance decreases.
3. Stock movement is written as sale deduction.
4. Low stock/expiry alerts update.

Owner:

- Inventory owns stock balances and stock movements.
- POS emits the deduction event.

## 5. POS -> Inventory Movement

Movement type:

- `SALE_DEDUCTION`

Required data:

- companyId
- branchId
- warehouseId
- saleId
- saleItemId
- productId
- productUnitId
- quantity entered
- conversion quantity
- base quantity deducted
- before stock
- after stock
- cashier userId
- createdAt

## 6. POS -> Customer

Flow:

1. Cashier searches/scans customer by phone, code, QR, or barcode.
2. POS attaches customerId to sale.
3. Sale updates customer lifetime spend, visits, last purchase, credit if applicable.
4. Customer purchase history reads sale records.

Customer module owns profile and credit data.

## 7. POS -> Membership

Flow:

1. Customer references membership level.
2. POS loads active membership rules.
3. Checkout applies membership discount according to discount type and rounding rule.
4. Points are earned/redeemed.
5. Tier auto-upgrade may run after sale.

Membership owns rules; POS applies them.

## 8. POS -> Promotion Engine

Flow:

1. POS loads active promotions for branch/warehouse/date/customer/product/category.
2. Promotion engine orders by priority.
3. Stack engine applies stack rules.
4. Coupon/QR coupon is validated if present.
5. Profit protection checks final price against cost/min margin.
6. Valid discount is applied.
7. Promotion usage is saved with sale.

Promotion engine must be shared by:

- POS checkout
- Promotion preview
- Reports
- Promotion analytics

## 9. POS -> Payment / QR / Currency

Flow:

1. Cashier selects payment method.
2. If QR/Transfer, POS loads branch default QR account.
3. If multi-currency, POS loads exchange rate and rounding rules.
4. SalePayment records method, amount, currency, rate, base LAK value.
5. Receipt and Customer Display show correct payment details.

Settings owns QR/currency configuration.

## 10. Sales -> Reports

Reports read:

- Sale
- SaleItem
- SalePayment
- Refund/Void
- PromotionUsage
- LoyaltyPointLedger
- CashTransaction

Dashboard must use the same report repositories.

## 11. Inventory -> Reports

Reports read:

- InventoryBalance
- InventoryLot
- StockMovement
- StockAdjustment
- StockTransfer
- Product metadata

Inventory valuation = current stock in base unit multiplied by cost basis.

## 12. Purchasing -> Inventory

Flow:

1. Purchase order is created.
2. Goods receiving confirms received product/unit/quantity.
3. Receiving converts to base unit.
4. Inventory balance increases.
5. Stock movement is written as purchase receive.
6. Lot/expiry is created if needed.
7. PO status updates.

Movement type:

- `PURCHASE_RECEIVE`

## 13. Supplier -> Purchasing / Debt / Payment

Flow:

1. Supplier is selected on PO.
2. Receiving or invoice creates payable.
3. Payment reduces payable.
4. Supplier ledger derives balance from purchases, receiving, invoices, payments, credit notes, debit notes, and adjustments.

Supplier owns profile. Purchasing/AP owns debt.

## 14. Staff Permission -> Every Module

All modules must check:

- View
- Create
- Edit
- Delete
- Approve
- Export
- Print

Permission checks must exist in:

- Navigation/sidebar
- Buttons/actions
- Client handlers
- Server actions
- API routes

Unauthorized message:

- "You do not have permission to perform this action."

## 15. Approval Rules -> Action Modules

Approval rules connect to:

- POS: refund, void, discount, manual price, cash out
- Products: price change, delete
- Inventory: adjustment, stock count variance
- Purchasing: PO above amount, supplier payment
- Promotions: create/edit/activate high-risk promotion
- Customers: credit/point adjustment

If approval is required:

1. Create pending approval.
2. Do not apply change.
3. Owner/authorized approver approves/rejects.
4. Approved action applies change.
5. Rejected action does nothing.
6. Audit log records all steps.

## 16. Settings -> POS / Receipt / Printer / Customer Display / QR

Settings drives:

- POS VAT and currency
- POS QR account
- POS customer display mode
- Receipt logo/header/footer/QR/VAT
- Printer profile selection
- Permission matrix
- Approval rules
- Staff login access

Settings must not be UI-only.

## 17. Super Admin -> Business / User / Plan / Feature Lock

Super Admin controls:

- Business status
- Tenant suspension
- Subscription plan
- Plan expiry
- Feature locks
- Add-ons
- Platform users overview
- Platform audit

Merchant feature access requires:

1. Business subscription allows feature.
2. Staff permission allows action.

## 18. Localization -> Every Page

Language preference connects to:

- Login
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
- Customer Display
- Super Admin

Storage keys must be stable and untranslated.

## 19. Integration Status Summary

Connected/partially connected now:

- Products and POS demo product source are moving toward one repository.
- POS demo sale writes sales, receipts, audit logs, and product stock.
- Settings QR/staff/logo are moving toward stable repository paths.

Major remaining gaps:

- Reports still use independent mock data.
- Inventory demo page still uses server mock data.
- Purchasing and Promotions still use product mocks.
- Global permission enforcement is not complete.
- Approval flow is not consistently connected.
- Printing module is specification-only.
- Feature locks are not globally enforced.
