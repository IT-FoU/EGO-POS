-- Phase 17 Step 4: Database constraints hardening.
-- Safe for existing Supabase data verified by precheck before deploy.

ALTER TABLE "products"
  ADD CONSTRAINT "products_non_negative_prices_check"
  CHECK ("cost_price_lak" >= 0 AND "selling_price_lak" >= 0 AND "min_stock" >= 0);

ALTER TABLE "product_units"
  ADD CONSTRAINT "product_units_positive_conversion_check"
  CHECK ("conversion_qty" > 0),
  ADD CONSTRAINT "product_units_non_negative_prices_check"
  CHECK (("cost_price_lak" IS NULL OR "cost_price_lak" >= 0) AND "selling_price_lak" >= 0);

CREATE UNIQUE INDEX "product_units_one_base_unit_per_product_idx"
  ON "product_units" ("product_id")
  WHERE "is_base_unit" = true;

ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inventory_balances_non_negative_quantity_check"
  CHECK ("quantity" >= 0);

ALTER TABLE "inventory_lots"
  ADD CONSTRAINT "inventory_lots_non_negative_quantity_check"
  CHECK ("quantity" >= 0);

ALTER TABLE "stock_transfer_items"
  ADD CONSTRAINT "stock_transfer_items_positive_quantity_check"
  CHECK ("quantity" > 0);

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_non_negative_amounts_check"
  CHECK (
    "exchange_rate" > 0
    AND "subtotal" >= 0
    AND "discount_amount" >= 0
    AND "tax_amount" >= 0
    AND "total_amount" >= 0
    AND "paid_amount" >= 0
    AND "balance_amount" >= 0
  );

ALTER TABLE "purchase_items"
  ADD CONSTRAINT "purchase_items_valid_quantities_costs_check"
  CHECK (
    "quantity" > 0
    AND "received_quantity" >= 0
    AND "received_quantity" <= "quantity"
    AND "unit_cost" >= 0
    AND "total_cost" >= 0
  );

ALTER TABLE "purchase_payments"
  ADD CONSTRAINT "purchase_payments_positive_amount_check"
  CHECK ("amount" > 0);

ALTER TABLE "supplier_payables"
  ADD CONSTRAINT "supplier_payables_non_negative_amounts_check"
  CHECK ("total_amount" >= 0 AND "paid_amount" >= 0 AND "balance_amount" >= 0);

ALTER TABLE "goods_receipt_items"
  ADD CONSTRAINT "goods_receipt_items_positive_quantity_check"
  CHECK ("quantity" > 0);

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_non_negative_balances_check"
  CHECK (
    "points_balance" >= 0
    AND "total_spent" >= 0
    AND "credit_limit" >= 0
    AND "opening_balance" >= 0
    AND "outstanding_balance" >= 0
  );

ALTER TABLE "customer_payments"
  ADD CONSTRAINT "customer_payments_positive_amount_check"
  CHECK ("amount_lak" > 0);

ALTER TABLE "membership_levels"
  ADD CONSTRAINT "membership_levels_non_negative_values_check"
  CHECK ("min_spend_lak" >= 0 AND "discount_percent" >= 0);

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_non_negative_amounts_check"
  CHECK (
    "subtotal" >= 0
    AND "discount_amount" >= 0
    AND "tax_amount" >= 0
    AND "total_amount" >= 0
    AND "tax_rate" >= 0
    AND "discount_percent" >= 0
    AND "change_amount" >= 0
  );

ALTER TABLE "sale_items"
  ADD CONSTRAINT "sale_items_valid_amounts_check"
  CHECK (
    "quantity" > 0
    AND "cost_price" >= 0
    AND "selling_price" >= 0
    AND "discount_amount" >= 0
    AND "promotion_discount" >= 0
    AND "total_amount" >= 0
  );

ALTER TABLE "sale_payments"
  ADD CONSTRAINT "sale_payments_valid_amounts_check"
  CHECK ("amount" > 0 AND "change_amount" >= 0);

ALTER TABLE "hold_bill_items"
  ADD CONSTRAINT "hold_bill_items_valid_amounts_check"
  CHECK ("quantity" > 0 AND "selling_price" >= 0);

ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_non_negative_total_check"
  CHECK ("total_amount" >= 0);

ALTER TABLE "refund_items"
  ADD CONSTRAINT "refund_items_valid_amounts_check"
  CHECK ("quantity" > 0 AND "amount" >= 0);

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_non_negative_cash_check"
  CHECK (
    "opening_cash" >= 0
    AND ("closing_cash" IS NULL OR "closing_cash" >= 0)
    AND ("expected_cash" IS NULL OR "expected_cash" >= 0)
  );

ALTER TABLE "cash_transactions"
  ADD CONSTRAINT "cash_transactions_non_negative_amount_check"
  CHECK ("amount" >= 0);

ALTER TABLE "promotions"
  ADD CONSTRAINT "promotions_valid_discount_values_check"
  CHECK (
    "priority" >= 0
    AND ("discount_percent" IS NULL OR "discount_percent" >= 0)
    AND ("discount_amount_lak" IS NULL OR "discount_amount_lak" >= 0)
    AND ("buy_quantity" IS NULL OR "buy_quantity" > 0)
    AND ("get_quantity" IS NULL OR "get_quantity" > 0)
    AND ("combo_price_lak" IS NULL OR "combo_price_lak" >= 0)
    AND "usage_count" >= 0
    AND "total_discount_lak" >= 0
  );

ALTER TABLE "promotion_usages"
  ADD CONSTRAINT "promotion_usages_non_negative_discount_check"
  CHECK ("discount_amount_lak" >= 0);

ALTER TABLE "company_settings"
  ADD CONSTRAINT "company_settings_valid_numeric_values_check"
  CHECK (
    "vat_rate" >= 0
    AND "decimal_places" >= 0
    AND "loyalty_spend_per_point_lak" > 0
    AND "loyalty_point_value_lak" >= 0
    AND "loyalty_min_redeem_points" >= 0
  );

ALTER TABLE "product_price_history"
  ADD CONSTRAINT "product_price_history_non_negative_prices_check"
  CHECK ("old_price" >= 0 AND "new_price" >= 0);

ALTER TABLE "bulk_price_jobs"
  ADD CONSTRAINT "bulk_price_jobs_non_negative_total_products_check"
  CHECK ("total_products" >= 0);
