-- EGO POS audit architecture.
-- Retention policy:
-- - platform_audit_logs: keep 24 months active, then archive for long-term retention.
-- - store_activity_logs: keep 12-24 months active, then archive for 3-5 years.
-- Archive movement should be performed by a controlled job/service, never by UI delete.

ALTER TABLE "super_admins"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'super_admin';

CREATE TABLE IF NOT EXISTS "platform_audit_logs" (
  "id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "request_id" TEXT,
  "actor_type" TEXT NOT NULL DEFAULT 'human',
  "actor_id" TEXT,
  "actor_name" TEXT NOT NULL,
  "actor_email" TEXT,
  "actor_role" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'success',
  "severity" TEXT NOT NULL DEFAULT 'info',
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "target_name" TEXT,
  "business_id" TEXT,
  "before_value" JSONB,
  "after_value" JSONB,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB,
  CONSTRAINT "platform_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "platform_audit_log_archive" (
  LIKE "platform_audit_logs" INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS "store_activity_logs" (
  "id" TEXT NOT NULL,
  "business_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "synced_at" TIMESTAMP(3),
  "actor_id" TEXT,
  "actor_name" TEXT NOT NULL,
  "actor_role" TEXT NOT NULL,
  "terminal_id" TEXT,
  "terminal_name" TEXT,
  "device_name" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'success',
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "target_name" TEXT,
  "amount" DECIMAL(12,2),
  "currency" TEXT NOT NULL DEFAULT 'LAK',
  "before_value" JSONB,
  "after_value" JSONB,
  "metadata" JSONB,
  CONSTRAINT "store_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "store_activity_log_archive" (
  LIKE "store_activity_logs" INCLUDING ALL
);

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" TEXT,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "super_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "platform_audit_logs"
  ADD CONSTRAINT "platform_audit_logs_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "store_activity_logs"
  ADD CONSTRAINT "store_activity_logs_business_id_fkey"
  FOREIGN KEY ("business_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "store_activity_logs"
  ADD CONSTRAINT "store_activity_logs_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "store_activity_logs"
  ADD CONSTRAINT "store_activity_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_platform_audit_actor" ON "platform_audit_logs"("actor_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_platform_audit_target" ON "platform_audit_logs"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "idx_platform_audit_business" ON "platform_audit_logs"("business_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_platform_audit_request" ON "platform_audit_logs"("request_id");
CREATE INDEX IF NOT EXISTS "idx_platform_audit_status" ON "platform_audit_logs"("status") WHERE "status" <> 'success';
CREATE INDEX IF NOT EXISTS "idx_platform_audit_severity" ON "platform_audit_logs"("severity", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_store_activity_business" ON "store_activity_logs"("business_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_activity_branch" ON "store_activity_logs"("branch_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_activity_actor" ON "store_activity_logs"("actor_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_activity_terminal" ON "store_activity_logs"("terminal_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_activity_action" ON "store_activity_logs"("action", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_store_activity_status" ON "store_activity_logs"("status") WHERE "status" <> 'success';
