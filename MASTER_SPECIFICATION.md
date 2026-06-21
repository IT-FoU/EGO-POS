# EGO POS Master Specification

## 1. Purpose

EGO POS is a SaaS point-of-sale and business management platform for Lao retail and service businesses. The first real operating business is GO BOX Mini Mart. The system must support future business templates, tenant isolation, branch and warehouse control, staff permissions, sales, stock, purchasing, customers, membership, promotions, reporting, printing, QR payments, localization, and Super Admin subscription control.

The system must not behave as disconnected demo screens. Each business workflow must use one source of truth, one calculation path, one permission path, and one audit path.

## 2. Core Principles

1. POS Checkout is the final calculation engine for sales, discounts, promotions, membership, points, VAT, currency, payments, receipts, stock deduction, and audit.
2. Products and Inventory are separate concepts: Products define sellable/catalog data; Inventory owns stock balances, movements, lots, and valuation.
3. Customers own customer profile, credit, spend, and purchase history; Membership owns membership levels, benefits, discounts, duration, and point rules.
4. Purchasing and Suppliers own supplier purchase flow, receiving, payables, and supplier ledger.
5. Reports and Dashboard must read from real transaction records, not independent mock numbers.
6. Settings must drive actual behavior in POS, receipts, printers, QR payment, customer display, VAT, currency, staff permission, and approvals.
7. Feature access must pass both SaaS plan entitlement and staff permission.
8. Lao and English localization must never change storage keys or data keys.
9. Demo mode may use local/browser storage, but it must use the same DTO shapes and workflow order as production mode.
10. All important actions must write audit logs.

## 3. Business Selection / Onboarding

Supported business templates:

- Mini Mart
- Restaurant
- Pharmacy
- Coffee Shop
- Beauty Salon
- Clothing
- Wholesale Store
- Online Seller

Onboarding must collect:

- Business template
- Store/business name
- Owner profile
- Currency
- Locale
- Branch
- Warehouse
- Default modules
- Receipt defaults
- Printer defaults
- QR payment defaults if available

Source of truth:

- Demo: `ego-pos:onboarding-*` stable keys through the demo storage layer.
- Production: `Company`, `Branch`, `Warehouse`, `CompanySetting`, `CompanyModule`, `Plan`, `SaaSSubscription`.

After onboarding:

- `activeBusinessId` and `activeTenantId` are set.
- Mini Mart enters `/dashboard` or `/pos`.
- Other templates may enter template shell until fully implemented.

## 4. Login / Roles / Staff Control

Roles:

- Owner: full access; cannot be restricted by merchant settings.
- Manager: configurable by Owner; usually sales, inventory, purchasing, selected reports; profit can be hidden.
- Cashier/Staff: POS-focused; own-sales reports only; no Settings by default.
- Custom: future role template based on permission matrix.
- Super Admin: platform owner only; uses separate `/igo-admin` portal and separate session/cookie.

Login requirements:

- Username/password login for Owner, Manager, Cashier.
- Disabled staff cannot login.
- Inactive role cannot login.
- Session stores user, role, active company, active branch, warehouse, terminal, locale, access flags, and permission summary.
- Password must never appear in URL or be stored in plain text.

Staff Control must own:

- Staff access records
- Role assignment
- Branch assignment
- POS terminal assignment
- Status
- Allow POS access
- Allow Back Office access
- Password reset
- Activity tracking

## 5. Dashboard

Dashboard must summarize live business state:

- Sales
- Profit
- Inventory alerts
- Customer credit
- Supplier payables
- Cash drawer
- Top products
- Alerts
- Day status
- Quick actions

Dashboard must read from the same repositories as Reports:

- Sales
- Payments
- Inventory balances
- Stock movements
- Customers
- Supplier payables
- Promotions
- Audit logs

Dashboard must not keep its own independent mock calculations after rebuild.

## 6. POS

POS responsibilities:

- Product search and scan
- Unit selection
- Cart
- Customer/member lookup
- Promotion and coupon evaluation
- Membership discounts
- Point redemption
- Manual discounts with permission checks
- VAT calculation
- Multi-currency payment
- QR/transfer payment
- Cash/card/bank/mixed payment
- Receipt generation
- Customer display update
- Stock deduction
- Inventory movement creation
- Sale report source
- Audit log source

Required POS write outputs:

- `Sale`
- `SaleItem`
- `SalePayment`
- `Receipt`
- `StockMovement`
- `InventoryBalance` update
- `Customer` spend update
- `LoyaltyPointLedger`
- `PromotionUsage`
- `CashTransaction`
- `AuditLog`

Demo keys:

- `ego.pos.products`
- `ego.pos.sales`
- `ego.pos.receipts`
- `ego.pos.auditLogs`
- `ego.pos.pendingApprovals`
- `ego.pos.customerDisplay.state`

## 7. Products

Products own catalog information:

- Product id
- Product code
- Barcode
- SKU
- Name
- Category
- Brand
- Supplier reference
- Images
- Status
- Base unit
- Product units
- Unit barcodes
- Unit prices
- Unit cost
- Stock display mode

Multi-unit rules:

- Each product has exactly one base unit.
- Stock is stored internally in base-unit quantity.
- Unit conversions are product-specific.
- Units may have optional barcode and image.
- Inactive units are hidden from POS but retained for history.

Product changes must update POS product grid and inventory/report product names through the shared product repository.

## 8. Inventory

Inventory owns:

- Current stock by branch/warehouse/product/base unit
- Inventory lots
- Expiry dates
- Stock movements
- Stock adjustments
- Stock counts
- Stock transfers
- Inventory valuation
- Low stock and expiry alerts

Inventory movements must be created for:

- POS sale deduction
- Quick stock in
- Goods receiving
- Stock adjustment
- Stock count variance
- Transfer out
- Transfer in
- Return/refund restore

Inventory must not directly duplicate product catalog details beyond display snapshots required for history.

## 9. Purchasing

Purchasing owns:

- Purchase orders
- Goods receiving
- Partial receiving
- Receiving status
- Supplier invoices/payables
- Supplier payments
- Purchase cost history
- Return to supplier

Statuses:

- Draft
- Sent
- Ordered
- Partial Receive
- Completed
- Cancelled

Goods receiving must increase inventory in base units and create stock movements and payable records in one transaction.

## 10. Suppliers

Suppliers own:

- Supplier code
- Company name
- Tax number
- Contact person
- Phone
- Email
- Address
- Payment terms
- Credit limit
- Status
- Rating
- Tags
- Default currency
- Document references

Suppliers read purchasing/payables history. Supplier ledger must be derived from purchase orders, goods receiving, payments, credit notes, debit notes, and adjustments.

## 11. Customers

Customers own:

- Customer code
- Name
- Phone
- Email
- Address
- Birthday
- Tags
- Credit balance
- Outstanding/overdue balance
- Lifetime spend
- Visits
- Favorite categories/products
- Purchase history

Customers reference membership; they do not define membership rules.

## 12. Membership / Loyalty

Membership owns:

- Membership levels
- Duration
- Discount type
- Discount amount/percent
- Rounding rules
- Points earning
- Points redeeming
- Tier upgrade rules
- Membership status
- Membership QR/barcode rules

POS must apply membership rules after product/promotion rules according to the checkout calculation policy.

## 13. Promotions / Coupons / Discounts

Promotions own:

- Campaign definition
- Targets
- Schedule
- Stacking rules
- Coupons
- QR coupons
- Buy X Get Y
- Free gifts
- Profit protection
- Approval status
- Usage tracking

Promotion engine must run in POS checkout and write usage records. Promotion reports must read from usage records, not wizard mock data.

## 14. Reports & Analytics

Reports must read:

- Sales
- Sale items
- Payments
- Refunds/voids
- Inventory balances
- Stock movements
- Purchases
- Supplier payables
- Customers
- Membership/points
- Promotions
- Staff activities
- Audit logs

Reports must support:

- Filtering
- Export
- Print
- Favorites
- Scheduled report definitions

Reports must not own business data.

## 15. Settings

Settings owns configuration:

- Company profile
- Receipt settings
- QR payment banks/accounts
- Customer display
- Tax/VAT
- Currency/exchange/rounding
- Printer profiles
- Staff control
- Permission matrix
- Approval rules
- Backup
- Security
- Localization preference

Settings must not be UI-only. Every setting must map to a runtime consumer.

## 16. Printer / Receipt / Barcode / Price Label

Printer types:

- Receipt thermal printer: 58mm, 80mm
- Sticker/barcode label printer: Xprinter, Zebra, TSC, Godex, generic thermal label
- A4 document printer
- Price tag/shelf label printer

Connection types:

- USB
- LAN/IP
- Bluetooth
- Windows installed printer
- Browser print fallback

Output modes:

- Direct thermal print
- Browser print preview
- PDF export
- A4 sticker sheet layout

Printer configuration must be per branch and per print job type.

## 17. QR Payment Banks

Bank and QR Account are separate:

- Bank: bank name, code, logo, status, sort order.
- QR Account: bank, account name, account number, QR image, branch, default flag, print receipt flag, customer display flag, status.

Rules:

- Only one default QR account per branch.
- POS QR/Transfer uses branch default QR account.
- Owner/Manager may override only if permission allows.
- Receipt and customer display follow QR account flags.

## 18. Multi-Currency

Base currency: LAK.

Supported display/payment currencies:

- LAK
- THB
- USD

Rules:

- Reports use base LAK value plus payment currency detail.
- Exchange rates must be stored with sale payment at transaction time.
- Rounding and decimal settings come from Settings.
- Customer display and receipt show configured currency behavior.

## 19. Approval Workflow

Approval can apply to:

- Discount above limit
- Refund
- Void bill
- Product price change
- Product delete
- Stock adjustment
- Promotion creation/change
- Purchase order above amount
- Supplier payment
- Customer credit adjustment
- Point adjustment

Approval request stores:

- Type
- Requested by
- Role
- Date/time
- Old value
- New value
- Reason
- Status
- Approver
- Decision time
- Decision note

Approved actions apply changes; rejected actions do not.

## 20. Audit Logs

Audit logs are required for:

- Login/logout
- Staff changes
- Permission changes
- Setting changes
- Product create/edit/delete
- Price/barcode changes
- Stock movements and adjustments
- POS sales/refunds/voids
- Promotion changes
- Purchase/receiving/payment
- Supplier changes
- Customer credit/points
- Super Admin actions

Audit must record user, company, branch, action, result, before/after where relevant, date/time, and source module.

## 21. Super Admin

Super Admin owns:

- Platform login
- Business management
- User/tenant overview
- Subscription management
- Plan control
- Feature locks
- Tenant suspension
- Platform audit logs

Super Admin must use separate session/cookie and not conflict with merchant login.

## 22. Subscription Plans / Feature Locks

Plan access must be checked before staff permission:

1. Plan entitlement allows feature.
2. Staff role/permission allows action.

If either fails, action is blocked or locked.

Free plan keeps core POS usable. Paid plans unlock advanced modules, limits, automation, reports, multi-branch, printers, import/export, and integrations.

Expired plan behavior must preserve data and allow limited safe operation according to plan policy.

## 23. Localization Lao / English

Rules:

- English mode: English UI only.
- Lao mode: Lao UI only except approved technical terms.
- Approved technical terms: EGO POS, POS, QR, VAT, SKU, PIN, WiFi, USB, API, Backup, Cloud, Login, Username, Password.
- Storage keys must never be translated.
- No hardcoded user-facing UI strings after localization rebuild.
- Lao font stack: `"Phetsarath OT", "Noto Sans Lao", sans-serif`.
- Super Admin is included in localization scope.

## 24. Offline Demo Mode and Future Production Mode

Demo mode:

- Uses stable local/browser storage repositories.
- Must follow production DTOs and workflow order.
- Must not expose fake products in normal flow unless explicitly seeded by debug/demo setup.

Production mode:

- Uses Prisma/PostgreSQL repositories.
- Applies tenant/company/branch/warehouse scoping.
- Writes transactional records atomically.
- Enforces permissions and plan locks on both client and server/API.

Target architecture:

- Same service contracts for demo and production.
- Different adapters for local demo storage and Prisma database.
