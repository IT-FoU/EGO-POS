-- R9B Staff Day Off.
-- Additive only. No OT / payroll / Cron / historical backfill.
-- Does not alter cash_sessions or sale accounting.

CREATE TABLE "staff_weekly_day_offs" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_weekly_day_offs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_weekly_day_offs_weekday_check" CHECK ("weekday" >= 0 AND "weekday" <= 6)
);

CREATE UNIQUE INDEX "staff_weekly_day_offs_company_user_weekday_key"
  ON "staff_weekly_day_offs"("company_id", "user_id", "weekday");

CREATE INDEX "staff_weekly_day_offs_company_id_user_id_idx"
  ON "staff_weekly_day_offs"("company_id", "user_id");

ALTER TABLE "staff_weekly_day_offs"
  ADD CONSTRAINT "staff_weekly_day_offs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_weekly_day_offs"
  ADD CONSTRAINT "staff_weekly_day_offs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_day_off_quota_policies" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "monthly_quota_days" INTEGER NOT NULL,
    "updated_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_day_off_quota_policies_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_day_off_quota_policies_days_check" CHECK ("monthly_quota_days" >= 0)
);

CREATE UNIQUE INDEX "staff_day_off_quota_policies_company_default_key"
  ON "staff_day_off_quota_policies"("company_id")
  WHERE "user_id" IS NULL;

CREATE UNIQUE INDEX "staff_day_off_quota_policies_company_user_key"
  ON "staff_day_off_quota_policies"("company_id", "user_id")
  WHERE "user_id" IS NOT NULL;

CREATE INDEX "staff_day_off_quota_policies_company_id_user_id_idx"
  ON "staff_day_off_quota_policies"("company_id", "user_id");

ALTER TABLE "staff_day_off_quota_policies"
  ADD CONSTRAINT "staff_day_off_quota_policies_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_day_off_quota_policies"
  ADD CONSTRAINT "staff_day_off_quota_policies_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_day_off_months" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month_key" TEXT NOT NULL,
    "quota_days" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_day_off_months_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_day_off_months_quota_days_check" CHECK ("quota_days" >= 0),
    CONSTRAINT "staff_day_off_months_month_key_check" CHECK ("month_key" ~ '^\d{4}-\d{2}$')
);

CREATE UNIQUE INDEX "staff_day_off_months_company_user_month_key"
  ON "staff_day_off_months"("company_id", "user_id", "month_key");

CREATE INDEX "staff_day_off_months_company_id_month_key_idx"
  ON "staff_day_off_months"("company_id", "month_key");

ALTER TABLE "staff_day_off_months"
  ADD CONSTRAINT "staff_day_off_months_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_day_off_months"
  ADD CONSTRAINT "staff_day_off_months_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_day_off_requests" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "request_date" DATE NOT NULL,
    "month_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "decision_note" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by" TEXT NOT NULL,
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "quota_consumed" BOOLEAN NOT NULL DEFAULT false,
    "quota_returned" BOOLEAN NOT NULL DEFAULT false,
    "worked_marked_at" TIMESTAMP(3),
    "primary_attendance_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_day_off_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_day_off_requests_kind_check" CHECK ("kind" IN ('quota', 'special')),
    CONSTRAINT "staff_day_off_requests_source_check" CHECK ("source" IN ('employee', 'grant')),
    CONSTRAINT "staff_day_off_requests_status_check" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
    CONSTRAINT "staff_day_off_requests_month_key_check" CHECK ("month_key" ~ '^\d{4}-\d{2}$'),
    CONSTRAINT "staff_day_off_requests_decision_check" CHECK (
      ("status" = 'pending' AND "decided_at" IS NULL AND "decided_by" IS NULL)
      OR
      ("status" IN ('approved', 'rejected', 'cancelled') AND "decided_at" IS NOT NULL AND "decided_by" IS NOT NULL)
    ),
    CONSTRAINT "staff_day_off_requests_quota_flags_check" CHECK (
      ("quota_returned" = false)
      OR
      ("quota_returned" = true AND "quota_consumed" = true)
    )
);

CREATE UNIQUE INDEX "staff_day_off_requests_one_pending_per_date_key"
  ON "staff_day_off_requests"("company_id", "user_id", "request_date")
  WHERE "status" = 'pending';

CREATE UNIQUE INDEX "staff_day_off_requests_one_approved_per_date_key"
  ON "staff_day_off_requests"("company_id", "user_id", "request_date")
  WHERE "status" = 'approved';

CREATE INDEX "staff_day_off_requests_company_id_status_idx"
  ON "staff_day_off_requests"("company_id", "status");

CREATE INDEX "staff_day_off_requests_company_id_branch_id_status_idx"
  ON "staff_day_off_requests"("company_id", "branch_id", "status");

CREATE INDEX "staff_day_off_requests_company_id_user_id_month_key_idx"
  ON "staff_day_off_requests"("company_id", "user_id", "month_key");

CREATE INDEX "staff_day_off_requests_company_id_request_date_idx"
  ON "staff_day_off_requests"("company_id", "request_date");

ALTER TABLE "staff_day_off_requests"
  ADD CONSTRAINT "staff_day_off_requests_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_day_off_requests"
  ADD CONSTRAINT "staff_day_off_requests_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_day_off_requests"
  ADD CONSTRAINT "staff_day_off_requests_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_attendance_sessions"
  ADD COLUMN "day_off_kind" TEXT,
  ADD COLUMN "day_off_request_id" TEXT;

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_day_off_kind_check"
  CHECK ("day_off_kind" IS NULL OR "day_off_kind" IN ('weekly', 'quota', 'special'));

CREATE INDEX "staff_attendance_sessions_day_off_request_id_idx"
  ON "staff_attendance_sessions"("day_off_request_id");

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_day_off_request_id_fkey"
  FOREIGN KEY ("day_off_request_id") REFERENCES "staff_day_off_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
