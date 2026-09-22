-- R9A Attendance Foundation.
-- Separate from cash_sessions. No Day Off / OT / payroll / backfill.

CREATE TABLE "staff_work_schedules" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "weekday" SMALLINT NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_work_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_work_schedules_weekday_check" CHECK ("weekday" >= 0 AND "weekday" <= 6),
    CONSTRAINT "staff_work_schedules_start_minute_check" CHECK ("start_minute" >= 0 AND "start_minute" < 1440),
    CONSTRAINT "staff_work_schedules_end_minute_check" CHECK ("end_minute" > "start_minute" AND "end_minute" <= 1440)
);

CREATE UNIQUE INDEX "staff_work_schedules_company_weekday_default_key"
  ON "staff_work_schedules"("company_id", "weekday")
  WHERE "user_id" IS NULL;

CREATE UNIQUE INDEX "staff_work_schedules_company_user_weekday_key"
  ON "staff_work_schedules"("company_id", "user_id", "weekday")
  WHERE "user_id" IS NOT NULL;

CREATE INDEX "staff_work_schedules_company_id_user_id_idx"
  ON "staff_work_schedules"("company_id", "user_id");

ALTER TABLE "staff_work_schedules"
  ADD CONSTRAINT "staff_work_schedules_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_work_schedules"
  ADD CONSTRAINT "staff_work_schedules_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "staff_attendance_sessions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "business_date" DATE NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "end_source" TEXT,
    "cash_session_id" TEXT,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "regular_minutes" INTEGER,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_attendance_sessions_status_check" CHECK ("status" IN ('open', 'closed')),
    CONSTRAINT "staff_attendance_sessions_end_source_check" CHECK ("end_source" IS NULL OR "end_source" IN ('manual')),
    CONSTRAINT "staff_attendance_sessions_open_closed_check" CHECK (
      ("status" = 'open' AND "ended_at" IS NULL AND "end_source" IS NULL)
      OR
      ("status" = 'closed' AND "ended_at" IS NOT NULL AND "end_source" IS NOT NULL)
    ),
    CONSTRAINT "staff_attendance_sessions_late_minutes_check" CHECK ("late_minutes" >= 0),
    CONSTRAINT "staff_attendance_sessions_regular_minutes_check" CHECK ("regular_minutes" IS NULL OR "regular_minutes" >= 0)
);

CREATE UNIQUE INDEX "staff_attendance_sessions_one_open_per_user_key"
  ON "staff_attendance_sessions"("company_id", "user_id")
  WHERE "status" = 'open';

CREATE INDEX "staff_attendance_sessions_company_id_business_date_idx"
  ON "staff_attendance_sessions"("company_id", "business_date");

CREATE INDEX "staff_attendance_sessions_company_id_user_id_business_date_idx"
  ON "staff_attendance_sessions"("company_id", "user_id", "business_date");

CREATE INDEX "staff_attendance_sessions_company_id_branch_id_business_date_idx"
  ON "staff_attendance_sessions"("company_id", "branch_id", "business_date");

CREATE INDEX "staff_attendance_sessions_cash_session_id_idx"
  ON "staff_attendance_sessions"("cash_session_id");

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_attendance_sessions"
  ADD CONSTRAINT "staff_attendance_sessions_cash_session_id_fkey"
  FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
