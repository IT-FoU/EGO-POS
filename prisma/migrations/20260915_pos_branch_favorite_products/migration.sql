-- Shared POS favorites per store branch (not per cashier/terminal).
CREATE TABLE "branch_favorite_products" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_favorite_products_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_favorite_products_branch_id_product_id_key"
  ON "branch_favorite_products"("branch_id", "product_id");

CREATE INDEX "branch_favorite_products_company_id_branch_id_idx"
  ON "branch_favorite_products"("company_id", "branch_id");

ALTER TABLE "branch_favorite_products"
  ADD CONSTRAINT "branch_favorite_products_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_favorite_products"
  ADD CONSTRAINT "branch_favorite_products_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "branch_favorite_products"
  ADD CONSTRAINT "branch_favorite_products_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
