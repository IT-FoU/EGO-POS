-- Business-account plan entitlement foundation.
-- Extends plans and subscriptions. Does not touch customer_subscriptions or subscription_plans.
-- Does not rewrite company registration timestamps or subscription start/end dates.
-- Existing accounts stay usable: expiry behavior defaults to fallback_to_free and grace stays 0.
-- POS access blocking is not enabled by this migration.

CREATE TYPE "PlanExpiryBehavior" AS ENUM ('block_access', 'fallback_to_free');
CREATE TYPE "SaaSPaymentMethod" AS ENUM ('static_qr', 'dynamic_qr', 'bank_transfer', 'card');
CREATE TYPE "SaaSPaymentReviewStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');

ALTER TABLE "plans"
  ADD COLUMN "duration_days" INTEGER,
  ADD COLUMN "expiry_behavior" "PlanExpiryBehavior" NOT NULL DEFAULT 'fallback_to_free',
  ADD COLUMN "grace_period_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "auto_renew_available" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "enabled_payment_methods" JSONB;

ALTER TABLE "plans"
  ADD CONSTRAINT "plans_duration_days_check" CHECK ("duration_days" IS NULL OR "duration_days" >= 0),
  ADD CONSTRAINT "plans_grace_period_days_check" CHECK ("grace_period_days" >= 0);

-- One-time default for Free plans that have never had a duration configured.
-- Later Super Admin edits are stored in duration_days and are not reset here.
UPDATE "plans"
SET "duration_days" = 30
WHERE "duration_days" IS NULL
  AND lower("plan_name") LIKE '%free%';

ALTER TABLE "subscriptions"
  ADD COLUMN "registered_at" TIMESTAMP(3),
  ADD COLUMN "extra_days" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "subscriptions"
  ADD CONSTRAINT "subscriptions_extra_days_check" CHECK ("extra_days" >= 0);

CREATE INDEX "subscriptions_company_id_idx" ON "subscriptions"("company_id");

-- Copy the existing company registration instant. Do not use now().
UPDATE "subscriptions" AS subscription
SET "registered_at" = company."created_at"
FROM "companies" AS company
WHERE company."id" = subscription."company_id"
  AND subscription."registered_at" IS NULL;

CREATE TABLE "saas_payment_records" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "plan_id" TEXT,
    "subscription_id" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'LAK',
    "payment_method" "SaaSPaymentMethod" NOT NULL,
    "payment_reference" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "status" "SaaSPaymentReviewStatus" NOT NULL DEFAULT 'draft',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_payment_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "saas_payment_records_company_id_created_at_idx"
  ON "saas_payment_records"("company_id", "created_at");

ALTER TABLE "saas_payment_records"
  ADD CONSTRAINT "saas_payment_records_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saas_payment_records"
  ADD CONSTRAINT "saas_payment_records_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "saas_payment_records"
  ADD CONSTRAINT "saas_payment_records_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "saas_payment_records"
  ADD CONSTRAINT "saas_payment_records_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "saas_account_extensions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "additional_days" INTEGER NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_account_extensions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "saas_account_extensions_additional_days_check" CHECK ("additional_days" <> 0)
);

CREATE INDEX "saas_account_extensions_company_id_created_at_idx"
  ON "saas_account_extensions"("company_id", "created_at");

ALTER TABLE "saas_account_extensions"
  ADD CONSTRAINT "saas_account_extensions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saas_account_extensions"
  ADD CONSTRAINT "saas_account_extensions_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "saas_account_extensions"
  ADD CONSTRAINT "saas_account_extensions_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;
