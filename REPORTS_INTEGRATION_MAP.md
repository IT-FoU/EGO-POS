# IGO POS Reports Integration Map

Purpose: explain how Reports & Analytics connects to IGO POS modules when backend integration is completed.

## Sales

- Reads transactions, sale items, refunds, voids, discounts, cashier shifts, payment methods, and tax.
- Produces revenue, profit, transaction count, average bill value, hourly sales, sales by product/category/cashier, refund and void reports.
- Actions: Revenue -> Sales Report, Transactions -> Transaction Detail, Cash Difference -> Cash Drawer Audit.

## Inventory

- Reads current stock, stock movements, stock counts, adjustments, expiry dates, dead stock, transfers, branch and warehouse quantities.
- Produces current stock, low stock, out of stock, inventory valuation, dead stock, expiry report, stock adjustment audit, and warehouse transfer reports.
- Actions: Low Stock -> Create Purchase Order, Dead Stock -> Create Promotion, Expiry -> Clearance Promotion.

## Purchasing

- Reads purchase orders, goods receiving/GRN, supplier invoices, supplier payments, returns to supplier, and purchase cost history.
- Produces supplier purchases, supplier payables, purchase trends, receiving history, and supplier credit reports.
- Actions: Supplier Debt -> Supplier Payment, Purchase Cost Trend -> Product Cost Review.

## Products

- Reads product categories, price tiers, barcode coverage, product image coverage, unit conversion, cost, and selling price.
- Produces product profitability, price history, barcode coverage, image coverage, top selling and low selling products.
- Actions: Top Product -> Product Detail, Missing Barcode -> Product Edit.

## Customers

- Reads customer profile, credit, outstanding balance, purchase history, spending, and segmentation.
- Produces customer list, top customers, customer spending, new vs returning, customer credit, and outstanding balance reports.
- Actions: Top Customer -> Customer Detail, Outstanding Balance -> Customer Payment.

## Membership

- Reads member tier, points earned, points redeemed, points expired, subscription type, student/general membership, and retention.
- Produces points reports, tier analysis, membership usage, and retention reports.
- Actions: Tier Analysis -> Membership Levels, Points Redeemed -> Loyalty Ledger.

## Promotions

- Reads promotion usage, coupon usage, discount cost, free gift cost, redemption, and profit impact.
- Produces promotion performance, coupon usage, discount impact, free gift cost, promotion profit impact, and redemption reports.
- Actions: Promotion Impact -> Promotion Performance, Expiring Products -> Create Promotion.

## Finance

- Reads payments, cash drawer sessions, expenses, multi-currency payment values, and exchange rates.
- Produces payment breakdown, cash drawer reports, tax reports, discount reports, profit and loss, gross margin, and multi-currency summary.
- Currency base is LAK with THB/USD display conversion.

## Audit

- Reads user actions, approvals, login history, price changes, stock adjustments, refund approvals, discount approvals, and customer/supplier updates.
- Produces user activity, price change history, stock adjustment audit, discount approval history, refund approval history, and login history.
- Every important report action should write an audit event when production persistence is connected.

## Multi-Branch / Multi-Warehouse / Tenant

- Every report query must scope by `companyId`, `branchId`, and `warehouseId` where relevant.
- Company owner may consolidate all branches.
- Branch users should only see assigned branch data.
- Warehouse filters must affect inventory, receiving, stock movement, transfer, and valuation reports.

## Required Report Services Later

- `reportDashboardService`
- `salesReportService`
- `productReportService`
- `inventoryReportService`
- `financialReportService`
- `customerReportService`
- `membershipReportService`
- `promotionReportService`
- `purchasingReportService`
- `supplierReportService`
- `branchWarehouseReportService`
- `auditReportService`
- `reportExportService`
- `reportScheduleService`
- `reportFavoriteService`

## Required APIs Later

- `GET /api/reports/dashboard`
- `GET /api/reports/sales`
- `GET /api/reports/products`
- `GET /api/reports/inventory`
- `GET /api/reports/financial`
- `GET /api/reports/customers`
- `GET /api/reports/membership`
- `GET /api/reports/promotions`
- `GET /api/reports/purchasing`
- `GET /api/reports/suppliers`
- `GET /api/reports/branches`
- `GET /api/reports/audit`
- `POST /api/reports/export`
- `POST /api/reports/schedules`
- `PATCH /api/reports/favorites`

## Important Rule

Reports must read from real transaction records, not UI mock state. Dashboard and Reports must use the same source services so totals match across the system.

## Seamless System Connection Blueprint

Reports must not calculate business numbers in isolation. Every widget should follow this path:

1. Source module writes a real transaction or event.
2. Shared repository/service validates company, branch, and warehouse scope.
3. Report aggregate service reads the normalized records.
4. Dashboard widget and Report Center detail use the same aggregate result.
5. User action navigates back to the source module.
6. Export, print, schedule, and sensitive report opens write audit logs.

## Shared Report Event Flow

POS sale completed:

- POS writes `sales`, `sale_items`, `payments`, `promotion_usage`, `loyalty_point_ledger`, `stock_movements`.
- Reports reads sales, payments, discounts, customer, product, and stock movement records.
- Dashboard updates revenue, profit, transactions, items sold, top sellers, customer totals, promotion impact.
- Audit logs record report export, schedule, and sensitive financial access.

Inventory stock changed:

- Inventory writes `inventory_balances`, `inventory_lots`, `stock_movements`.
- Reports reads current stock, stock value, low stock, out of stock, expiry, dead stock, stock movement history.
- Dashboard updates inventory value and alert widgets.
- Actions route to purchase order, stock count, adjustment, or promotion creation.

Purchase received:

- Purchasing writes purchase order updates, goods receipt, supplier payable, inventory increase, stock movement.
- Reports reads purchase cost, supplier outstanding, receiving history, product cost trends.
- Dashboard updates inventory value, purchasing trend, supplier debt, and margin risk.

Promotion used:

- POS writes promotion usage and applied discount breakdown.
- Reports reads usage, discount cost, free gift cost, revenue generated, margin impact.
- Dashboard updates promotion performance and health score.

Customer/member transaction:

- POS writes sale customer link, points earned/redeemed, customer spend, membership tier changes.
- Reports reads top customers, new vs returning, credit, points, tier analysis, and retention.

## Data Contract By Common IDs

All report queries must preserve these IDs:

- `companyId`
- `branchId`
- `warehouseId`
- `saleId`
- `saleItemId`
- `paymentId`
- `productId`
- `categoryId`
- `supplierId`
- `purchaseId`
- `goodsReceiptId`
- `customerId`
- `membershipLevelId`
- `promotionId`
- `couponId`
- `stockMovementId`
- `cashierId`
- `auditLogId`

## Source To Action Map

| Report Signal | Source Module | Report Service | User Action |
| --- | --- | --- | --- |
| Revenue drop | POS/Sales | `salesReportService` | View Sales Report |
| Low stock | Inventory | `inventoryReportService` | Create Purchase Order |
| Dead stock | Inventory + Sales | `inventoryReportService` | Create Clearance Promotion |
| Expiring stock | Inventory Lots | `inventoryReportService` | Create Expiry Promotion |
| Supplier debt | Purchasing/Suppliers | `purchasingReportService` | Supplier Payment |
| Margin drop | Products + POS + Purchasing | `financialReportService` | Review Cost / Price |
| Promotion loss | Promotions + POS | `promotionReportService` | Edit Promotion / Approval |
| Customer debt | Customers + Sales | `customerReportService` | Customer Payment |
| Cash difference | POS Shift/Cash Drawer | `financialReportService` | Cash Drawer Audit |
| Suspicious change | Audit Logs | `auditReportService` | Audit Log Detail |

## No-Duplicate Logic Rule

- Reports must not duplicate POS discount logic.
- Reports must not duplicate Inventory stock calculation logic.
- Reports must not duplicate Membership point calculation logic.
- Reports must not duplicate Promotion stack/profit protection logic.
- Reports must read final persisted transaction results and only aggregate them.

## Data Source Status Rule

Each module should expose:

- last sync time
- record count
- data quality status
- warning/offline/demo state
- related report links

This feeds the Data Source Status panel in `/reports`.
