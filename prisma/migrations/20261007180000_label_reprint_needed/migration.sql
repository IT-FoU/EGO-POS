-- Persistent shelf-label reprint state.
-- Existing rows stay false / NULL. No historical price is treated as a reprint.
-- PostgreSQL stores a constant boolean default in the catalog, so the boolean add does not rewrite the table.

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "label_reprint_needed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "label_printed_at" TIMESTAMP(3);

ALTER TABLE "product_units"
  ADD COLUMN IF NOT EXISTS "label_reprint_needed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "product_units"
  ADD COLUMN IF NOT EXISTS "label_printed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "products_label_reprint_needed_idx"
  ON "products" ("label_reprint_needed");

CREATE INDEX IF NOT EXISTS "product_units_label_reprint_needed_idx"
  ON "product_units" ("label_reprint_needed");
