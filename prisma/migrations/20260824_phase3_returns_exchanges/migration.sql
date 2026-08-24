-- AlterEnum
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'partial_refunded';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'exchanged';
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'adjusted';

-- CreateEnum
CREATE TYPE "RefundKind" AS ENUM ('refund', 'exchange');

-- CreateEnum
CREATE TYPE "ReturnItemCondition" AS ENUM ('sellable', 'damaged', 'expired', 'opened_used');

-- AlterTable
ALTER TABLE "refunds"
  ADD COLUMN IF NOT EXISTS "branch_id" TEXT,
  ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT,
  ADD COLUMN IF NOT EXISTS "cash_session_id" TEXT,
  ADD COLUMN IF NOT EXISTS "kind" "RefundKind" NOT NULL DEFAULT 'refund',
  ADD COLUMN IF NOT EXISTS "refund_method" "PaymentMethod" NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS "difference_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "payment_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refund_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "exchange_receipt_no" TEXT;

UPDATE "refunds"
SET "refund_amount" = "total_amount"
WHERE "refund_amount" = 0 AND "total_amount" > 0;

CREATE INDEX IF NOT EXISTS "refunds_sale_id_idx" ON "refunds"("sale_id");
CREATE INDEX IF NOT EXISTS "refunds_company_id_created_at_idx" ON "refunds"("company_id", "created_at");
CREATE INDEX IF NOT EXISTS "refunds_company_id_cash_session_id_idx" ON "refunds"("company_id", "cash_session_id");

-- AlterTable
ALTER TABLE "refund_items"
  ADD COLUMN IF NOT EXISTS "sale_item_id" TEXT,
  ADD COLUMN IF NOT EXISTS "unit_id" TEXT,
  ADD COLUMN IF NOT EXISTS "condition" "ReturnItemCondition" NOT NULL DEFAULT 'sellable',
  ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE INDEX IF NOT EXISTS "refund_items_refund_id_idx" ON "refund_items"("refund_id");
CREATE INDEX IF NOT EXISTS "refund_items_sale_item_id_idx" ON "refund_items"("sale_item_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "refund_exchange_items" (
    "id" TEXT NOT NULL,
    "refund_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "cost_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "selling_price" DECIMAL(18,2) NOT NULL,
    "discount_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "promotion_id" TEXT,
    "promotion_discount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "refund_exchange_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "refund_exchange_items_refund_id_idx" ON "refund_exchange_items"("refund_id");
CREATE INDEX IF NOT EXISTS "refund_exchange_items_product_id_idx" ON "refund_exchange_items"("product_id");

ALTER TABLE "refund_exchange_items"
  DROP CONSTRAINT IF EXISTS "refund_exchange_items_refund_id_fkey";

ALTER TABLE "refund_exchange_items"
  ADD CONSTRAINT "refund_exchange_items_refund_id_fkey"
  FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
