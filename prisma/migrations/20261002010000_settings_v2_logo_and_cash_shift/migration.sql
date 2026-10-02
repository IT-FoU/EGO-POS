-- Settings V2 step 2.
-- Business logo is a storage object path, never an image payload.
-- Cash shift requirement moves to an explicit company boolean.
-- Missing legacy JSON key means REQUIRED (true). Explicit false stays false.

ALTER TABLE "company_settings"
  ADD COLUMN "logo_object_path" TEXT,
  ADD COLUMN "require_cash_shift_before_sale" BOOLEAN;

UPDATE "company_settings"
SET "require_cash_shift_before_sale" = CASE
  WHEN "unit_pricing_defaults" IS NULL THEN true
  WHEN ("unit_pricing_defaults"->>'__requireCashShiftBeforeSale') IS NULL THEN true
  WHEN lower("unit_pricing_defaults"->>'__requireCashShiftBeforeSale') IN ('false', '0') THEN false
  ELSE true
END
WHERE "require_cash_shift_before_sale" IS NULL;

ALTER TABLE "company_settings"
  ALTER COLUMN "require_cash_shift_before_sale" SET DEFAULT true;

ALTER TABLE "company_settings"
  ALTER COLUMN "require_cash_shift_before_sale" SET NOT NULL;
