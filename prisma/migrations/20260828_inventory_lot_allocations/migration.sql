-- Forward-only provenance for POS lot consume/restore.
-- No existing business tables are altered destructively.

CREATE TABLE "inventory_lot_allocations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "inventory_lot_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "sale_item_id" TEXT,
    "refund_exchange_item_id" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "restored_quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_lot_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inventory_lot_allocations_source_type_source_id_idx"
  ON "inventory_lot_allocations"("source_type", "source_id");
CREATE INDEX "inventory_lot_allocations_sale_item_id_idx"
  ON "inventory_lot_allocations"("sale_item_id");
CREATE INDEX "inventory_lot_allocations_refund_exchange_item_id_idx"
  ON "inventory_lot_allocations"("refund_exchange_item_id");
CREATE INDEX "inventory_lot_allocations_inventory_lot_id_idx"
  ON "inventory_lot_allocations"("inventory_lot_id");
CREATE INDEX "inventory_lot_allocations_company_id_warehouse_id_product_id_idx"
  ON "inventory_lot_allocations"("company_id", "warehouse_id", "product_id");

ALTER TABLE "inventory_lot_allocations"
  ADD CONSTRAINT "inventory_lot_allocations_inventory_lot_id_fkey"
  FOREIGN KEY ("inventory_lot_id") REFERENCES "inventory_lots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_lot_allocations"
  ADD CONSTRAINT "inventory_lot_allocations_sale_item_id_fkey"
  FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_lot_allocations"
  ADD CONSTRAINT "inventory_lot_allocations_refund_exchange_item_id_fkey"
  FOREIGN KEY ("refund_exchange_item_id") REFERENCES "refund_exchange_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_lot_allocations"
  ADD CONSTRAINT "inventory_lot_allocations_restored_qty_chk"
  CHECK ("restored_quantity" >= 0 AND "restored_quantity" <= "quantity");

ALTER TABLE "inventory_lot_allocations"
  ADD CONSTRAINT "inventory_lot_allocations_source_chk"
  CHECK (
    (
      "source_type" = 'sale_item'
      AND "sale_item_id" IS NOT NULL
      AND "refund_exchange_item_id" IS NULL
    )
    OR
    (
      "source_type" = 'refund_exchange_item'
      AND "refund_exchange_item_id" IS NOT NULL
      AND "sale_item_id" IS NULL
    )
  );
