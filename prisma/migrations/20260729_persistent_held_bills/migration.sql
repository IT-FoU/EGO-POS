-- Persistent POS held bills. This migration is additive only: it extends the
-- existing draft tables without changing sale, payment, or inventory tables.
ALTER TABLE "hold_bills"
  ADD COLUMN IF NOT EXISTS "branch_id" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cash_session_id" TEXT,
  ADD COLUMN IF NOT EXISTS "member_id" TEXT,
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'LAK',
  ADD COLUMN IF NOT EXISTS "exchange_rate" DECIMAL(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "grand_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'held',
  ADD COLUMN IF NOT EXISTS "cart_snapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "resumed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resumed_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cancelled_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cancel_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "hold_bill_items"
  ADD COLUMN IF NOT EXISTS "product_unit_id" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tax_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cart_metadata" JSONB;

CREATE INDEX IF NOT EXISTS "hold_bills_company_branch_status_created_at_idx"
  ON "hold_bills" ("company_id", "branch_id", "status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "hold_bill_items_hold_bill_id_idx"
  ON "hold_bill_items" ("hold_bill_id");

CREATE INDEX IF NOT EXISTS "hold_bill_items_product_id_idx"
  ON "hold_bill_items" ("product_id");
