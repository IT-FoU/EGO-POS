-- Hold Bill stock reservation (availability protection only).
-- Does NOT change inventory_balances.quantity / On Hand.
-- Available = On Hand - SUM(ACTIVE base_quantity).
-- Auto-expiry intentionally omitted.

CREATE TYPE "StockReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

CREATE TABLE "stock_reservations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "hold_bill_id" TEXT NOT NULL,
    "hold_bill_item_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_unit_id" TEXT,
    "base_quantity" DECIMAL(18,3) NOT NULL,
    "status" "StockReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_reservations_hold_bill_item_id_key"
  ON "stock_reservations"("hold_bill_item_id");

CREATE INDEX "stock_reservations_company_id_warehouse_id_product_id_status_idx"
  ON "stock_reservations"("company_id", "warehouse_id", "product_id", "status");

CREATE INDEX "stock_reservations_hold_bill_id_status_idx"
  ON "stock_reservations"("hold_bill_id", "status");

CREATE INDEX "stock_reservations_branch_id_status_idx"
  ON "stock_reservations"("branch_id", "status");

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_hold_bill_id_fkey"
  FOREIGN KEY ("hold_bill_id") REFERENCES "hold_bills"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_hold_bill_item_id_fkey"
  FOREIGN KEY ("hold_bill_item_id") REFERENCES "hold_bill_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
