-- Loyalty V2 earning rules. Legacy scalar columns stay.
-- Existing companies receive one SPEND_AMOUNT rule equal to spend X LAK → 1 point.
-- Customer balances and the point ledger are not modified.

CREATE TYPE "LoyaltyEarningRuleType" AS ENUM ('SPEND_AMOUNT', 'ITEM_QUANTITY', 'MINIMUM_BASKET', 'PRODUCT_BONUS', 'CATEGORY_BONUS');

CREATE TYPE "LoyaltyEarningRuleStatus" AS ENUM ('active', 'archived');

CREATE TABLE "loyalty_earning_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rule_type" "LoyaltyEarningRuleType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "LoyaltyEarningRuleStatus" NOT NULL DEFAULT 'active',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loyalty_earning_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loyalty_earning_rules_company_id_status_sort_order_idx" ON "loyalty_earning_rules"("company_id", "status", "sort_order");

ALTER TABLE "loyalty_earning_rules" ADD CONSTRAINT "loyalty_earning_rules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "loyalty_earning_rules" (
    "id",
    "company_id",
    "name",
    "rule_type",
    "enabled",
    "status",
    "sort_order",
    "config",
    "created_at",
    "updated_at"
)
SELECT
    'ler_' || "company_id",
    "company_id",
    'Base spend',
    'SPEND_AMOUNT',
    true,
    'active',
    0,
    jsonb_build_object(
        'spendLak', GREATEST(COALESCE("loyalty_spend_per_point_lak", 10000), 1),
        'points', 1,
        'legacy', true
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "company_settings"
WHERE NOT EXISTS (
    SELECT 1 FROM "loyalty_earning_rules" AS existing
    WHERE existing."company_id" = "company_settings"."company_id"
);
