-- Temporary large XLSX upload jobs.
-- Does not store product rows or images.
-- Owner approval is required before this migration is applied.

CREATE TABLE IF NOT EXISTS "product_import_uploads" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "object_path" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "verified_at" TIMESTAMP(3),
  CONSTRAINT "product_import_uploads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_import_uploads_company_id_user_id_idempotency_key_key"
  ON "product_import_uploads" ("company_id", "user_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "product_import_uploads_status_expires_at_idx"
  ON "product_import_uploads" ("status", "expires_at");
