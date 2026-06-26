-- LP-4: store code and business template on companies
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "store_code" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "business_template_key" TEXT;

UPDATE "companies"
SET "store_code" = COALESCE("store_code", 'gobox'),
    "business_template_key" = COALESCE("business_template_key", 'mini_mart')
WHERE "store_code" IS NULL OR "business_template_key" IS NULL;

UPDATE "companies"
SET "store_code" = LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING("id", 1, 6)
WHERE "store_code" IS NULL OR "store_code" = '';

ALTER TABLE "companies" ALTER COLUMN "store_code" SET NOT NULL;
ALTER TABLE "companies" ALTER COLUMN "business_template_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "companies_store_code_key" ON "companies"("store_code");
