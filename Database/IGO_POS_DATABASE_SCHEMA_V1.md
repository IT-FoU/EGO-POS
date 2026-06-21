# EGO POS Database Schema v1.0

Company: IGO Technology
Product: EGO POS

---

# 1. Core SaaS Structure

## companies

Stores / Companies

Fields

* id
* name
* owner_user_id
* plan_id
* status
* created_at
* updated_at

---

## branches

Fields

* id
* company_id
* name
* phone
* address
* is_main_branch
* created_at
* updated_at

---

## warehouses

Fields

* id
* company_id
* branch_id
* name
* type
* created_at
* updated_at

---

# 2. Users & Permissions

## users

Fields

* id
* company_id
* username
* email
* phone
* password_hash
* pin_hash
* full_name
* status
* created_at
* updated_at

---

## roles

Fields

* id
* company_id
* name
* description

---

## permissions

Fields

* id
* key
* name
* module

---

## role_permissions

Fields

* role_id
* permission_id

---

## user_roles

Fields

* user_id
* role_id

---

# 3. Products

## products

Fields

* id
* company_id
* category_id
* supplier_id
* sku
* barcode
* name_lo
* name_en
* image_url
* product_type
* base_unit_id
* cost_price_lak
* selling_price_lak
* min_stock
* is_active
* created_at
* updated_at

---

## product_units

Fields

* id
* product_id
* unit_name
* conversion_qty
* barcode
* selling_price_lak
* is_base_unit

Example

Pepsi Can = 1

Pepsi Pack = 6

Pepsi Carton = 24

---

## categories

Fields

* id
* company_id
* name_lo
* name_en
* parent_id

---

## product_images

Fields

* id
* product_id
* image_url
* is_primary
---

# 4. Inventory

## inventory_balances

Current stock by warehouse

Fields

- id
- company_id
- warehouse_id
- product_id
- quantity
- updated_at

---

## stock_movements

Every stock movement

Fields

- id
- company_id
- warehouse_id
- product_id
- movement_type
- reference_type
- reference_id
- quantity
- before_qty
- after_qty
- note
- created_by
- created_at

Movement Types

- purchase
- sale
- transfer_in
- transfer_out
- adjustment
- damaged
- expired
- lost
- return

---

## stock_adjustments

Fields

- id
- company_id
- warehouse_id
- product_id
- adjustment_type
- quantity
- reason
- approved_by
- created_by
- created_at

---

## stock_transfers

Fields

- id
- company_id
- from_warehouse_id
- to_warehouse_id
- transfer_no
- status
- note
- created_by
- created_at

Status

- draft
- pending
- completed
- cancelled

---

## stock_transfer_items

Fields

- id
- transfer_id
- product_id
- quantity

---

# 5. Suppliers

## suppliers

Fields

- id
- company_id
- supplier_code
- name
- phone
- email
- address
- note
- credit_limit
- status
- created_at

---

## supplier_payables

Outstanding supplier balance

Fields

- id
- company_id
- supplier_id
- purchase_id
- total_amount
- paid_amount
- balance_amount
- due_date
- status

Status

- unpaid
- partial
- paid

---

# 6. Purchasing

## purchases

Fields

- id
- company_id
- warehouse_id
- supplier_id
- purchase_no
- currency
- exchange_rate
- subtotal
- discount_amount
- tax_amount
- total_amount
- paid_amount
- balance_amount
- status
- purchase_date
- created_by

Currency

- LAK
- THB
- USD

---

## purchase_items

Fields

- id
- purchase_id
- product_id
- quantity
- unit_cost
- total_cost

---

## purchase_payments

Fields

- id
- purchase_id
- payment_method
- amount
- payment_date
- note

Payment Methods

- cash
- transfer
- qr
- visa
- mastercard

---

# 7. Price History

## product_price_history

Fields

- id
- company_id
- product_id
- old_price
- new_price
- change_type
- changed_by
- created_at

Change Types

- manual
- bulk_update
- promotion
- import

---

# 8. Bulk Price Update

## bulk_price_jobs

Fields

- id
- company_id
- update_type
- target_type
- target_id
- adjustment_type
- adjustment_value
- total_products
- created_by
- created_at

Adjustment Types

- increase_percent
- decrease_percent
- increase_amount
- decrease_amount
---

# 9. Customers

## customers

Fields

- id
- company_id
- customer_code
- full_name
- phone
- email
- gender
- birthday
- address
- national_id
- passport_no
- qr_member_code
- points_balance
- total_spent
- status
- created_at

---

## customer_groups

Fields

- id
- company_id
- name
- description

Examples

- General
- VIP
- Student

---

## customer_group_members

Fields

- customer_id
- customer_group_id

---

# 10. Customer Subscription

## subscription_plans

Fields

- id
- company_id
- name
- subscription_type
- monthly_fee
- yearly_fee
- discount_percent
- benefit_description
- is_active

Subscription Types

- student
- general
- vip

---

## customer_subscriptions

Fields

- id
- customer_id
- plan_id
- start_date
- end_date
- status
- auto_renew

Status

- active
- expired
- cancelled

---

# 11. Sales

## sales

Fields

- id
- company_id
- branch_id
- warehouse_id
- customer_id
- sale_no
- subtotal
- discount_amount
- tax_amount
- total_amount
- profit_amount
- payment_status
- created_by
- created_at

---

## sale_items

Fields

- id
- sale_id
- product_id
- unit_id
- quantity
- cost_price
- selling_price
- discount_amount
- total_amount
- profit_amount

---

## sale_payments

Fields

- id
- sale_id
- payment_method
- amount
- payment_date

Payment Methods

- cash
- transfer
- qr
- visa
- mastercard

---

# 12. Hold Bills

## hold_bills

Fields

- id
- company_id
- cashier_id
- hold_no
- customer_id
- note
- created_at

---

## hold_bill_items

Fields

- id
- hold_bill_id
- product_id
- quantity
- selling_price

---

# 13. Refunds

## refunds

Fields

- id
- company_id
- sale_id
- refund_no
- reason
- total_amount
- approved_by
- created_by
- created_at

---

## refund_items

Fields

- id
- refund_id
- product_id
- quantity
- amount

---

# 14. Cash Management

## cash_sessions

Fields

- id
- company_id
- branch_id
- cashier_id
- opening_cash
- closing_cash
- expected_cash
- cash_difference
- opened_at
- closed_at

---

## cash_transactions

Fields

- id
- company_id
- session_id
- transaction_type
- amount
- reason
- created_by
- created_at

Transaction Types

- cash_in
- cash_out

---

# 15. Favorite Products

## favorite_products

Fields

- id
- user_id
- product_id
- created_at

---

# 16. POS Devices

## pos_devices

Fields

- id
- company_id
- branch_id
- device_name
- device_type
- serial_number
- is_active

Device Types

- desktop
- tablet
- mobile
---

# 17. Promotions

## promotions

Fields

- id
- company_id
- promotion_code
- promotion_name
- description
- start_date
- end_date
- priority
- is_active
- created_at

---

## promotion_rules

Fields

- id
- promotion_id
- rule_type
- operator
- value

Examples

- minimum_amount
- minimum_quantity
- customer_group
- product
- category

---

## promotion_actions

Fields

- id
- promotion_id
- action_type
- action_value

Action Types

- percentage_discount
- fixed_discount
- free_product
- free_quantity
- price_override

---

# 18. Audit Logs

## audit_logs

Fields

- id
- company_id
- user_id
- module
- action
- old_data
- new_data
- device_name
- ip_address
- created_at

Modules

- product
- inventory
- sales
- customers
- users
- settings
- permissions
- supplier
- promotion

Actions

- create
- update
- delete
- login
- logout
- refund
- approve

---

# 19. Login History

## login_history

Fields

- id
- user_id
- login_time
- logout_time
- device_name
- ip_address
- status

Status

- success
- failed

---

# 20. Notifications

## notifications

Fields

- id
- company_id
- title
- message
- notification_type
- is_read
- created_at

Types

- low_stock
- expiry
- supplier_due
- membership_expiry
- subscription_expiry
- system

---

# 21. Approval Workflow

## approvals

Fields

- id
- company_id
- module
- reference_id
- request_by
- approved_by
- status
- note
- created_at

Status

- pending
- approved
- rejected

---

# 22. SaaS Plans

## plans

Fields

- id
- plan_name
- monthly_price
- yearly_price
- max_products
- max_cashiers
- max_branches
- max_reports
- max_promotions
- custom_logo
- remove_watermark
- is_active

Examples

- Free
- Starter
- Pro
- Business
- Enterprise

---

## subscriptions

Fields

- id
- company_id
- plan_id
- start_date
- end_date
- billing_cycle
- status

Billing Cycles

- monthly
- yearly

Status

- active
- expired
- cancelled

---

# 23. Super Admin

## super_admins

Fields

- id
- username
- email
- password_hash
- status
- created_at

---

## company_access_logs

Fields

- id
- super_admin_id
- company_id
- access_reason
- created_at

---

# 24. Backup History

## backups

Fields

- id
- company_id
- backup_type
- backup_date
- backup_size
- status

Backup Types

- cloud
- local

Status

- success
- failed

---

END OF DATABASE SCHEMA V1

