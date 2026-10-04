-- Loyalty V2 redemption policy and ledger actor.
-- Adds columns only. Existing balances, ledger rows, and earning rules stay.

ALTER TABLE "company_settings"
  ADD COLUMN IF NOT EXISTS "loyalty_max_redeem_points" INTEGER,
  ADD COLUMN IF NOT EXISTS "loyalty_allow_partial" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "loyalty_allow_redeem_with_discount" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "loyalty_expiry_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "loyalty_expiry_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "loyalty_expiry_unit" TEXT NOT NULL DEFAULT 'days';

ALTER TABLE "loyalty_point_ledger"
  ADD COLUMN IF NOT EXISTS "created_by" TEXT;
