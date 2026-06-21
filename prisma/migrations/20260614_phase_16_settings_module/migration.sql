-- Phase 16 Settings Module: additive company-scoped settings table.
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "profile_phone" TEXT,
    "profile_email" TEXT,
    "profile_address" TEXT,
    "tax_number" TEXT,
    "receipt_header" TEXT,
    "receipt_footer" TEXT,
    "receipt_prefix" TEXT NOT NULL DEFAULT 'INV',
    "show_logo_on_receipt" BOOLEAN NOT NULL DEFAULT true,
    "show_tax_on_receipt" BOOLEAN NOT NULL DEFAULT true,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT false,
    "vat_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "base_currency" "CurrencyCode" NOT NULL DEFAULT 'LAK',
    "currency_display" TEXT NOT NULL DEFAULT 'LAK',
    "decimal_places" INTEGER NOT NULL DEFAULT 0,
    "rounding_method" TEXT NOT NULL DEFAULT 'nearest',
    "loyalty_enabled" BOOLEAN NOT NULL DEFAULT true,
    "loyalty_spend_per_point_lak" DECIMAL(18,2) NOT NULL DEFAULT 10000,
    "loyalty_point_value_lak" DECIMAL(18,2) NOT NULL DEFAULT 1000,
    "loyalty_min_redeem_points" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_settings_company_id_key" ON "company_settings"("company_id");

ALTER TABLE "company_settings"
ADD CONSTRAINT "company_settings_company_id_fkey"
FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
