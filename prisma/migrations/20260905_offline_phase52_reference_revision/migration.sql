-- Offline-first (Mini Mart) Phase 5.2: concurrent-safe reference versioning.
-- Forward-only. Adds a warehouse scope column to the change feed and an atomic
-- per-scope revision counter. REVIEW-ONLY: do not apply to production without
-- the normal migration review and explicit owner approval. Local dev uses
-- `prisma db push`.

-- Warehouse scope on the delta feed so warehouse-specific reference changes
-- (e.g. stock levels) only reach terminals in that warehouse.
ALTER TABLE "offline_server_changes" ADD COLUMN "warehouse_id" TEXT;

CREATE INDEX "offline_server_changes_company_id_warehouse_id_idx"
  ON "offline_server_changes"("company_id", "warehouse_id");

-- Atomic per-scope revision counter. Version allocation is a single
-- INSERT ... ON CONFLICT (scope_key) DO UPDATE SET version = version + 1
-- RETURNING version statement, so concurrent writers can never share a version.
CREATE TABLE "offline_reference_revisions" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_reference_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_reference_revisions_scope_key_key"
  ON "offline_reference_revisions"("scope_key");
CREATE INDEX "offline_reference_revisions_company_id_idx"
  ON "offline_reference_revisions"("company_id");
