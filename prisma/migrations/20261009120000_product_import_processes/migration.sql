-- Metadata-only processing jobs for temporary XLSX uploads.
-- Does not store product rows, inventory, or images.
-- Leaves the upload table unchanged.

CREATE TABLE IF NOT EXISTS "product_import_processes" (
  "id" TEXT NOT NULL,
  "upload_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "phase" TEXT NOT NULL,
  "progress_percent" INTEGER NOT NULL DEFAULT 0,
  "sheet_count" INTEGER,
  "row_count" INTEGER,
  "entry_count" INTEGER,
  "oversized_images" INTEGER,
  "uncompressed_bytes" BIGINT,
  "peak_memory_bytes" BIGINT,
  "duration_ms" INTEGER,
  "error_code" TEXT,
  "sheet_names" TEXT,
  "queued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "heartbeat_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  CONSTRAINT "product_import_processes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_import_processes_status_check" CHECK ("status" IN ('queued', 'running', 'ready', 'failed', 'cancelled', 'expired')),
  CONSTRAINT "product_import_processes_attempt_check" CHECK ("attempt" BETWEEN 1 AND 3),
  CONSTRAINT "product_import_processes_progress_check" CHECK ("progress_percent" BETWEEN 0 AND 100),
  CONSTRAINT "product_import_processes_error_code_check" CHECK ("error_code" IS NULL OR char_length("error_code") <= 40),
  CONSTRAINT "product_import_processes_sheet_names_check" CHECK ("sheet_names" IS NULL OR char_length("sheet_names") <= 4000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_import_processes_upload_id_key"
  ON "product_import_processes" ("upload_id");

CREATE INDEX IF NOT EXISTS "product_import_processes_company_id_user_id_idx"
  ON "product_import_processes" ("company_id", "user_id");

CREATE INDEX IF NOT EXISTS "product_import_processes_status_heartbeat_at_idx"
  ON "product_import_processes" ("status", "heartbeat_at");
