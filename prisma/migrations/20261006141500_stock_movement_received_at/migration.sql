-- Business receive date for stock movements.
-- Nullable, no default, no backfill. Existing rows stay NULL.
-- created_at remains the system insert time.

ALTER TABLE "stock_movements"
  ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3);
