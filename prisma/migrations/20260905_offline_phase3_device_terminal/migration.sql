-- Offline-first (Mini Mart) Phase 3: device/terminal & authorization foundation.
-- Forward-only. Creates new tables only; no existing business table is altered.
-- REVIEW-ONLY: do not apply to production without the normal migration review
-- and explicit owner approval. Local development uses `prisma db push`.

-- Registered offline-capable terminal devices (non-secret device_id).
CREATE TABLE "terminal_devices" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT,
    "device_id" TEXT NOT NULL,
    "terminal_id" TEXT NOT NULL,
    "device_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "policy_version" INTEGER NOT NULL DEFAULT 0,
    "offline_grace_days" INTEGER NOT NULL DEFAULT 7,
    "lock_credential_hash" TEXT,
    "lock_credential_salt" TEXT,
    "activated_by_user_id" TEXT,
    "activated_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_policy_sync_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terminal_devices_company_id_device_id_key"
  ON "terminal_devices"("company_id", "device_id");
CREATE INDEX "terminal_devices_company_id_branch_id_idx"
  ON "terminal_devices"("company_id", "branch_id");
CREATE INDEX "terminal_devices_company_id_status_idx"
  ON "terminal_devices"("company_id", "status");

-- Per-device bootstrap + delta sync cursors.
CREATE TABLE "offline_sync_cursors" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "terminal_device_id" TEXT NOT NULL,
    "bootstrap_cursor" TEXT,
    "sync_cursor" TEXT,
    "last_push_at" TIMESTAMP(3),
    "last_pull_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_sync_cursors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_sync_cursors_company_id_device_id_key"
  ON "offline_sync_cursors"("company_id", "device_id");
CREATE INDEX "offline_sync_cursors_company_id_terminal_device_id_idx"
  ON "offline_sync_cursors"("company_id", "terminal_device_id");

-- Server-reserved per-terminal receipt-number ranges.
CREATE TABLE "terminal_receipt_ranges" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "terminal_device_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "range_start" INTEGER NOT NULL,
    "range_end" INTEGER NOT NULL,
    "next_value" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_receipt_ranges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "terminal_receipt_ranges_company_id_terminal_device_id_prefix_range_start_key"
  ON "terminal_receipt_ranges"("company_id", "terminal_device_id", "prefix", "range_start");
CREATE INDEX "terminal_receipt_ranges_company_id_branch_id_idx"
  ON "terminal_receipt_ranges"("company_id", "branch_id");

-- Server-issued terminal sellable stock allocations/leases.
CREATE TABLE "terminal_stock_allocations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "terminal_device_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "unit_id" TEXT,
    "lot_id" TEXT,
    "allocated_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "consumed_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "base_version" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminal_stock_allocations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "terminal_stock_allocations_company_id_terminal_device_id_product_id_idx"
  ON "terminal_stock_allocations"("company_id", "terminal_device_id", "product_id");
CREATE INDEX "terminal_stock_allocations_company_id_warehouse_id_product_id_idx"
  ON "terminal_stock_allocations"("company_id", "warehouse_id", "product_id");

-- Server-issued per-member/terminal loyalty redemption allowances.
CREATE TABLE "offline_loyalty_allowances" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "terminal_device_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "max_points" INTEGER NOT NULL DEFAULT 0,
    "used_points" INTEGER NOT NULL DEFAULT 0,
    "max_amount_lak" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "used_amount_lak" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offline_loyalty_allowances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offline_loyalty_allowances_company_id_terminal_device_id_customer_id_key"
  ON "offline_loyalty_allowances"("company_id", "terminal_device_id", "customer_id");
CREATE INDEX "offline_loyalty_allowances_company_id_terminal_device_id_idx"
  ON "offline_loyalty_allowances"("company_id", "terminal_device_id");
