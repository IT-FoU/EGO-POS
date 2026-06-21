# IGO POS Promotions Integration Map

Purpose: explain how the Promotions Module connects to the rest of IGO POS when backend integration is completed.

## A. Connected Modules

- Products: promotion targeting, product price, product cost, barcode/SKU lookup, category/brand filtering.
- Pricing: base price, tier price, price history, manual price override, promotion-adjusted final price.
- Inventory: stock availability, expiry dates, warehouse stock, branch stock, last sold date, slow-moving signals.
- POS Register: cart evaluation, stacking rules, coupon entry, member discount, point redemption, profit protection, checkout blocking.
- Membership: member tier eligibility, member-only promotions, membership discounts, approval/risk behavior.
- Customers: customer-specific usage limits, coupon usage, member status, points balance.
- Coupons: manual coupon, generated coupon, QR coupon, usage limits, member-only rules.
- Points: points redemption, point value conversion, redemption limits, point adjustment after refund.
- Purchasing: product cost signals, supplier cost history, margin protection inputs.
- Reports: promotion usage, sales, discount, profit, margin, customer usage, promotion ROI.
- Dashboard: active campaigns, risk warnings, margin impact, expiring campaigns.
- Audit Trail: create/edit/activate/deactivate/archive/delete/approve/reject/use/warning/block events.
- Approval Flow: owner/admin review for high-risk or near-minimum-margin campaigns.
- Permissions: promotion view/create/edit/delete/approve/activate/analytics/stack/coupon/recommendation management.
- Multi-branch: branch-specific eligibility and usage reporting.
- Multi-warehouse: warehouse stock, expiry and slow-moving stock targeting.
- Tenant / Company: every promotion, rule, usage, and audit event must be scoped by company and branch.

## B. Promotion Calculation Flow at Checkout

1. Cashier scans product.
2. POS loads product price and cost.
3. POS loads active promotions.
4. POS filters by date/time/branch/customer/member/product/category.
5. POS applies priority order.
6. POS applies stack rules.
7. POS applies coupon/QR coupon if entered.
8. POS applies member discount/point redemption.
9. POS checks max discount limits.
10. POS checks minimum profit protection.
11. If safe, apply discount.
12. If unsafe, block or request approval.
13. Save sale.
14. Save promotion usage history.
15. Update reports and analytics.
16. Write audit log.

## C. Data Needed From Each Module

Products:

- `product_id`
- barcode
- SKU
- name
- `category_id`
- `brand_id`
- cost
- selling price
- stock quantity
- expiry date

Membership:

- `customer_id`
- member tier
- points balance
- member status

Inventory:

- stock quantity
- expiry date
- `warehouse_id`
- `branch_id`
- last sold date

POS:

- cart items
- `cashier_id`
- `branch_id`
- `terminal_id`
- payment method

Pricing:

- base price
- price tier
- price history
- manual price override

Reports:

- sales amount
- discount amount
- profit
- margin
- promotion usage

## D. Backend Services Needed

- `promotionService`
- `promotionRuleEngine`
- `promotionStackEngine`
- `profitProtectionService`
- `couponService`
- `membershipDiscountService`
- `pointRedemptionService`
- `inventoryExpiryService`
- `slowMovingService`
- `promotionAnalyticsService`
- `auditLogService`
- `approvalService`

## E. Required APIs Later

- `GET /api/promotions`
- `POST /api/promotions`
- `PATCH /api/promotions/:id`
- `DELETE /api/promotions/:id`
- `POST /api/promotions/:id/activate`
- `POST /api/promotions/:id/deactivate`
- `POST /api/promotions/:id/duplicate`
- `GET /api/promotions/active`
- `POST /api/promotions/evaluate-cart`
- `POST /api/promotions/validate-profit`
- `GET /api/promotions/analytics`
- `GET /api/promotions/calendar`
- `GET /api/promotions/near-expiry`
- `GET /api/promotions/slow-moving`
- `POST /api/coupons/validate`
- `POST /api/points/redeem`

## F. Database Tables Later

- `promotions`
- `promotion_rules`
- `promotion_targets`
- `promotion_schedule`
- `promotion_stack_rules`
- `promotion_coupons`
- `promotion_usage`
- `promotion_approval_history`
- `promotion_audit_logs`
- `promotion_forecasts`

## G. Important Rule

Promotion must never allow negative profit.

If discount causes final price below product cost or minimum margin:

- Block save.
- Block checkout.
- Show warning.
- Suggest fix.
- Allow owner/admin approval only for near-threshold cases, never for negative profit.
