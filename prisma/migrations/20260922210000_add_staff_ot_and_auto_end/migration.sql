-- R9C Staff OT + Auto End.
-- Additive only. No payroll / OT pay / Resume Attendance / backfill of closed rows.
-- Does not alter cash_sessions or sale accounting.

CREATE TABLE "staff_ot_weekly_policies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "weekday" SMALLINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_ot_weekly_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_ot_weekly_policies_weekday_check" CHECK ("weekday" >= 0 AND "weekday" <= 6),
    CONSTRAINT "staff_ot_weekly_policies_minutes_check" CHECK (
      "start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440
    )
);

CREATE UNIQUE INDEX "staff_ot_weekly_policies_company_default_weekday_key"
  ON "staff_ot_weekly_policies"("company_id", "weekday")
  WHERE "user_id" IS NULL;

CREATE UNIQUE INDEX "staff_ot_weekly_policies_company_user_weekday_key"
  ON "staff_ot_weekly_policies"("company_id", "user_id", "weekday")
  WHERE "user_id" IS NOT NULL;

CREATE INDEX "staff_ot_weekly_policies_company_id_user_id_idx"
  ON "staff_ot_weekly_policies"("company_id", "user_id");

ALTER TABLE "staff_ot_weekly_policies"
  ADD CONSTRAINT "staff_ot_weekly_policies_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_ot_weekly_policies"
  ADD CONSTRAINT "staff_ot_weekly_policies_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_ot_approvals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "approved_by" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,
    "cancelled_by" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "note" TEXT,
    "template_weekday" SMALLINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_ot_approvals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_ot_approvals_status_check" CHECK ("status" IN ('approved', 'cancelled')),
    CONSTRAINT "staff_ot_approvals_minutes_check" CHECK (
      "start_minute" >= 0 AND "start_minute" < "end_minute" AND "end_minute" <= 1440
    ),
    CONSTRAINT "staff_ot_approvals_template_weekday_check" CHECK (
      "template_weekday" IS NULL OR ("template_weekday" >= 0 AND "template_weekday" <= 6)
    ),
    CONSTRAINT "staff_ot_approvals_cancel_check" CHECK (
      ("status" = 'approved' AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL)
      OR
      ("status" = 'cancelled' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "staff_ot_approvals_one_approved_per_date_key"
  ON "staff_ot_approvals"("company_id", "user_id", "business_date")
  WHERE "status" = 'approved';

CREATE INDEX "staff_ot_approvals_company_id_business_date_status_idx"
  ON "staff_ot_approvals"("company_id", "business_date", "status");

CREATE INDEX "staff_ot_approvals_company_id_user_id_business_date_idx"
  ON "staff_ot_approvals"("company_id", "user_id", "business_date");

CREATE INDEX "staff_ot_approvals_company_id_branch_id_status_idx"
  ON "staff_ot_approvals"("company_id", "branch_id", "status");

ALTER TABLE "staff_ot_approvals"
  ADD CONSTRAINT "staff_ot_approvals_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_ot_approvals"
  ADD CONSTRAINT "staff_ot_approvals_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_ot_approvals"
  ADD CONSTRAINT "staff_ot_approvals_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_attendance_sessions"
  ADD COLUMN "ot_minutes" INTEGER,
  ADD COLUMN "auto_end_at" TIMESTAMP(3),
  ADD COLUMN "ot_approval_id" TEXT;

ALTER TABLE "staff_attendance_sessions"
  DROP CONSTRAINT IF EXISTS "staff_attendance_sessions_end_source_check";

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_end_source_check"
  CHECK ("end_source" IS NULL OR "end_source" IN ('manual', 'auto_schedule', 'auto_ot'));

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_ot_minutes_check"
  CHECK ("ot_minutes" IS NULL OR "ot_minutes" >= 0);

CREATE INDEX "staff_attendance_sessions_ot_approval_id_idx"
  ON "staff_attendance_sessions"("ot_approval_id");

CREATE INDEX "staff_attendance_sessions_open_auto_end_at_idx"
  ON "staff_attendance_sessions"("auto_end_at")
  WHERE "status" = 'open' AND "auto_end_at" IS NOT NULL;

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_ot_approval_id_fkey"
  FOREIGN KEY ("ot_approval_id") REFERENCES "staff_ot_approvals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
