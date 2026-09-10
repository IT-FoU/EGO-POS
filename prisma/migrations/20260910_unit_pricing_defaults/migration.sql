-- Additive company-level product unit pricing defaults. Existing product/unit prices are unchanged.
ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "unit_pricing_defaults" JSONB;
