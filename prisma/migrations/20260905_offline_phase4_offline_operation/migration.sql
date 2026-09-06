-- Offline-first (Mini Mart) Phase 4: cloud sync protocol persistence.
-- Forward-only. Creates new tables only; no existing business table is altered.
-- REVIEW-ONLY: do not apply to production without the normal migration review
-- and explicit owner approval. Local development uses `prisma db push`.

-- Immutable processed-operation ledger. Idempotency is enforced by the unique
-- (company_id, operation_id) constraint: a repeated push returns the stored
-- result and never re-executes.
CREATE TABLE "offline_operations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "operation_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "terminal_device_id" TEXT,
    "actor_user_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "payload_hash" TEXT,
    "status" TEXT NOT NULL,
    "result_code" TEXT NOT NULL,
    "result_detail" TEXT,
    "result" JSONB,
    "audit_log_id" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "offline_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_operations_company_id_operation_id_key"
  ON "offline_operations"("company_id", "operation_id");
CREATE INDEX "offline_operations_company_id_device_id_idx"
  ON "offline_operations"("company_id", "device_id");
CREATE INDEX "offline_operations_company_id_status_idx"
  ON "offline_operations"("company_id", "status");

-- Ordered server-change feed for cursor-based delta pull (with tombstones).
CREATE TABLE "offline_server_changes" (
    "seq" SERIAL NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offline_server_changes_pkey" PRIMARY KEY ("seq")
);

CREATE INDEX "offline_server_changes_company_id_seq_idx"
  ON "offline_server_changes"("company_id", "seq");
CREATE INDEX "offline_server_changes_company_id_entity_type_entity_id_idx"
  ON "offline_server_changes"("company_id", "entity_type", "entity_id");
