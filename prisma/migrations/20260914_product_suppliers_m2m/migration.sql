-- Product ↔ Supplier many-to-many with one preferred supplier per product.
-- products.supplier_id remains the denormalized preferred supplier pointer.

CREATE TABLE IF NOT EXISTS "product_suppliers" (
  "id" TEXT PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "supplier_id" TEXT NOT NULL,
  "is_preferred" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "product_suppliers_product_id_fkey"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_suppliers_supplier_id_fkey"
    FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "product_suppliers_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "product_suppliers_product_supplier_key" UNIQUE ("product_id", "supplier_id")
);

CREATE INDEX IF NOT EXISTS "product_suppliers_company_id_idx" ON "product_suppliers" ("company_id");
CREATE INDEX IF NOT EXISTS "product_suppliers_supplier_id_idx" ON "product_suppliers" ("supplier_id");
CREATE INDEX IF NOT EXISTS "product_suppliers_product_id_idx" ON "product_suppliers" ("product_id");

-- Exactly one preferred supplier row per product (when preferred exists).
CREATE UNIQUE INDEX IF NOT EXISTS "product_suppliers_one_preferred_per_product"
  ON "product_suppliers" ("product_id")
  WHERE "is_preferred" = true;

-- Backfill preferred suppliers from products.supplier_id without duplicating.
INSERT INTO "product_suppliers" ("id", "company_id", "product_id", "supplier_id", "is_preferred", "created_at")
SELECT
  md5(p.id || ':' || p.supplier_id),
  p.company_id,
  p.id,
  p.supplier_id,
  true,
  NOW()
FROM "products" p
WHERE p.supplier_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "suppliers" s
    WHERE s.id = p.supplier_id
      AND s.company_id = p.company_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "product_suppliers" ps
    WHERE ps.product_id = p.id
      AND ps.supplier_id = p.supplier_id
  );
