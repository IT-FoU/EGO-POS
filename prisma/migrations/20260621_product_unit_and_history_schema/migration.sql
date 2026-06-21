-- Product unit extensions, price history columns, and barcode history table (schema drift fix).

DO $$ BEGIN
    CREATE TYPE "UnitStatus" AS ENUM ('active', 'inactive');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "UnitPricingMode" AS ENUM ('manual', 'cost_plus_percent', 'cost_plus_amount');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "product_price_history" ADD COLUMN IF NOT EXISTS "unit_id" TEXT;
ALTER TABLE "product_price_history" ADD COLUMN IF NOT EXISTS "unit_name" TEXT;

ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "add_amount_lak" DECIMAL(18,2);
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "allow_manual_unit_select" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "image_url" TEXT;
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "is_default_sale_unit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "markup_percent" DECIMAL(8,3);
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "pricing_mode" "UnitPricingMode" NOT NULL DEFAULT 'manual';
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "rounding_lak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "product_units" ADD COLUMN IF NOT EXISTS "status" "UnitStatus" NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS "product_barcode_history" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "unit_name" TEXT,
    "old_barcode" TEXT,
    "new_barcode" TEXT,
    "changed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_barcode_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "product_barcode_history_company_id_product_id_idx" ON "product_barcode_history"("company_id", "product_id");

DO $$ BEGIN
    ALTER TABLE "product_barcode_history" ADD CONSTRAINT "product_barcode_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
