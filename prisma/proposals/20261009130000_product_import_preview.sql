-- PROPOSAL ONLY. Do not apply until the Owner approves preview storage.
-- STEP 1C.3 can page a workbook inside the existing QA container.
-- Returning that page to the POS Worker needs one of these approved choices:
-- 1. A service binding from egopos-qa to egopos-qa-import, with on-demand pages and no new table.
-- 2. The table below, written by the container worker, so repeated page views do not rescan the file.
-- This file is outside prisma/migrations so it will not run automatically.

CREATE TABLE IF NOT EXISTS "product_import_preview_pages" (
  "id" TEXT NOT NULL,
  "process_id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "sheet_name" TEXT NOT NULL,
  "view_name" TEXT NOT NULL,
  "page_size" INTEGER NOT NULL,
  "page_index" INTEGER NOT NULL,
  "payload" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_import_preview_pages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_import_preview_pages_view_check" CHECK ("view_name" IN ('excel', 'mapped')),
  CONSTRAINT "product_import_preview_pages_size_check" CHECK ("page_size" IN (20, 50, 100)),
  CONSTRAINT "product_import_preview_pages_payload_check" CHECK (char_length("payload") <= 180000)
);

CREATE UNIQUE INDEX IF NOT EXISTS "product_import_preview_pages_key"
  ON "product_import_preview_pages" ("process_id", "sheet_name", "view_name", "page_size", "page_index");
