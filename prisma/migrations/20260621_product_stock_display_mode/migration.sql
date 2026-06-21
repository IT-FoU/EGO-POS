-- Product stock display mode (schema drift fix: column in Prisma schema, missing from baseline migrations).

DO $$ BEGIN
    CREATE TYPE "StockDisplayMode" AS ENUM ('base_unit_only', 'breakdown');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "products"
ADD COLUMN IF NOT EXISTS "stock_display_mode" "StockDisplayMode" NOT NULL DEFAULT 'base_unit_only';
