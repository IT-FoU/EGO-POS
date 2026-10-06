-- Current recount status for one warehouse + product balance.
-- NOT NULL default false. Existing rows stay false.
-- PostgreSQL stores a constant boolean default in the catalog, so this add does not rewrite the table.

ALTER TABLE "inventory_balances"
  ADD COLUMN IF NOT EXISTS "recount_needed" BOOLEAN NOT NULL DEFAULT false;
