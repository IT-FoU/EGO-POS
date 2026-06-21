-- Phase 17 Step 6: Branch isolation ownership columns.

ALTER TABLE "products" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "categories" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "customers" ADD COLUMN "branch_id" TEXT;

WITH default_branches AS (
  SELECT DISTINCT ON ("company_id") "company_id", "id" AS "branch_id"
  FROM "branches"
  ORDER BY "company_id", "is_main_branch" DESC, "created_at" ASC
)
UPDATE "products" p
SET "branch_id" = d."branch_id"
FROM default_branches d
WHERE p."company_id" = d."company_id" AND p."branch_id" IS NULL;

WITH default_branches AS (
  SELECT DISTINCT ON ("company_id") "company_id", "id" AS "branch_id"
  FROM "branches"
  ORDER BY "company_id", "is_main_branch" DESC, "created_at" ASC
)
UPDATE "categories" c
SET "branch_id" = d."branch_id"
FROM default_branches d
WHERE c."company_id" = d."company_id" AND c."branch_id" IS NULL;

WITH default_branches AS (
  SELECT DISTINCT ON ("company_id") "company_id", "id" AS "branch_id"
  FROM "branches"
  ORDER BY "company_id", "is_main_branch" DESC, "created_at" ASC
)
UPDATE "suppliers" s
SET "branch_id" = d."branch_id"
FROM default_branches d
WHERE s."company_id" = d."company_id" AND s."branch_id" IS NULL;

WITH default_branches AS (
  SELECT DISTINCT ON ("company_id") "company_id", "id" AS "branch_id"
  FROM "branches"
  ORDER BY "company_id", "is_main_branch" DESC, "created_at" ASC
)
UPDATE "customers" c
SET "branch_id" = d."branch_id"
FROM default_branches d
WHERE c."company_id" = d."company_id" AND c."branch_id" IS NULL;

ALTER TABLE "products" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "branch_id" SET NOT NULL;

ALTER TABLE "products"
  ADD CONSTRAINT "products_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "categories"
  ADD CONSTRAINT "categories_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "products_company_id_branch_id_idx" ON "products"("company_id", "branch_id");
CREATE INDEX "categories_company_id_branch_id_idx" ON "categories"("company_id", "branch_id");
CREATE INDEX "suppliers_company_id_branch_id_idx" ON "suppliers"("company_id", "branch_id");
CREATE INDEX "customers_company_id_branch_id_idx" ON "customers"("company_id", "branch_id");
