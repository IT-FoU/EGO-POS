-- B6: Staff membership fields, role templates, approval rules, extended approvals.

CREATE TYPE "RoleTemplate" AS ENUM ('owner', 'manager', 'cashier', 'custom');

ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'expired';

ALTER TABLE "company_users"
ADD COLUMN IF NOT EXISTS "branch_id" TEXT,
ADD COLUMN IF NOT EXISTS "assigned_terminal" TEXT,
ADD COLUMN IF NOT EXISTS "allow_pos_access" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "allow_back_office_access" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "require_password_change" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "roles"
ADD COLUMN IF NOT EXISTS "template_key" "RoleTemplate";

UPDATE "roles"
SET "template_key" = CASE
  WHEN lower("name") = 'owner' THEN 'owner'::"RoleTemplate"
  WHEN lower("name") = 'manager' THEN 'manager'::"RoleTemplate"
  WHEN lower("name") IN ('cashier', 'staff/cashier', 'staff') THEN 'cashier'::"RoleTemplate"
  ELSE 'custom'::"RoleTemplate"
END
WHERE "template_key" IS NULL;

CREATE TABLE IF NOT EXISTS "approval_rules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "rule_key" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "approver_role" TEXT NOT NULL DEFAULT 'owner',
    "threshold_lak" DECIMAL(18,2),
    "threshold_percent" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "approval_rules_company_id_rule_key_key"
ON "approval_rules"("company_id", "rule_key");

CREATE INDEX IF NOT EXISTS "approval_rules_company_id_is_enabled_idx"
ON "approval_rules"("company_id", "is_enabled");

DO $$ BEGIN
    ALTER TABLE "approval_rules"
    ADD CONSTRAINT "approval_rules_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "company_users"
    ADD CONSTRAINT "company_users_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "company_users_company_id_branch_id_idx"
ON "company_users"("company_id", "branch_id");

ALTER TABLE "approvals"
ADD COLUMN IF NOT EXISTS "branch_id" TEXT,
ADD COLUMN IF NOT EXISTS "action" TEXT,
ADD COLUMN IF NOT EXISTS "request_type" TEXT,
ADD COLUMN IF NOT EXISTS "requested_by_role" TEXT,
ADD COLUMN IF NOT EXISTS "old_value" JSONB,
ADD COLUMN IF NOT EXISTS "new_value" JSONB,
ADD COLUMN IF NOT EXISTS "amount" DECIMAL(18,2),
ADD COLUMN IF NOT EXISTS "reason" TEXT,
ADD COLUMN IF NOT EXISTS "decision_note" TEXT,
ADD COLUMN IF NOT EXISTS "related_entity_type" TEXT,
ADD COLUMN IF NOT EXISTS "related_entity_id" TEXT,
ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "approvals_company_id_branch_id_status_idx"
ON "approvals"("company_id", "branch_id", "status");
