-- R10-A/F: Product reorder settings + reorder history snapshots (additive).
-- Reuses products.min_stock as Reorder Level (canonical).
-- Defaults keep existing products working: target_stock=0, reorder_qty_mode=AUTO.

CREATE TYPE "ReorderQtyMode" AS ENUM ('AUTO', 'MANUAL');

ALTER TABLE "products" ADD COLUMN "target_stock" DECIMAL(18,3) NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "reorder_qty_mode" "ReorderQtyMode" NOT NULL DEFAULT 'AUTO';

CREATE TABLE "reorder_history_snapshots" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "purchase_no" TEXT,
    "supplier_id" TEXT,
    "supplier_name" TEXT,
    "purchase_unit_id" TEXT,
    "purchase_unit_name" TEXT,
    "reorder_level" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "target_stock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "available_at_order" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "open_po_remaining_at_order" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "suggested_qty_base" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "ordered_qty_purchase" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "ordered_qty_base" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reorder_qty_mode" "ReorderQtyMode" NOT NULL DEFAULT 'AUTO',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reorder_history_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reorder_history_snapshots_company_id_created_at_idx"
  ON "reorder_history_snapshots"("company_id", "created_at");

CREATE INDEX "reorder_history_snapshots_company_id_product_id_idx"
  ON "reorder_history_snapshots"("company_id", "product_id");

CREATE INDEX "reorder_history_snapshots_company_id_purchase_id_idx"
  ON "reorder_history_snapshots"("company_id", "purchase_id");

ALTER TABLE "reorder_history_snapshots"
  ADD CONSTRAINT "reorder_history_snapshots_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reorder_history_snapshots"
  ADD CONSTRAINT "reorder_history_snapshots_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reorder_history_snapshots"
  ADD CONSTRAINT "reorder_history_snapshots_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
