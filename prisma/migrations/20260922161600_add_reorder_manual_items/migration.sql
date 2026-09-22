-- R8 Manual Add persistence for Need Reorder (warehouse-scoped).
-- Does NOT change products.min_stock, inventory, reservations, or PO drafts.

CREATE TABLE "reorder_manual_items" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "added_by" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reorder_manual_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reorder_manual_items_company_id_warehouse_id_product_id_key"
  ON "reorder_manual_items"("company_id", "warehouse_id", "product_id");

CREATE INDEX "reorder_manual_items_company_id_warehouse_id_idx"
  ON "reorder_manual_items"("company_id", "warehouse_id");

CREATE INDEX "reorder_manual_items_product_id_idx"
  ON "reorder_manual_items"("product_id");

ALTER TABLE "reorder_manual_items"
  ADD CONSTRAINT "reorder_manual_items_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reorder_manual_items"
  ADD CONSTRAINT "reorder_manual_items_warehouse_id_fkey"
  FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reorder_manual_items"
  ADD CONSTRAINT "reorder_manual_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
