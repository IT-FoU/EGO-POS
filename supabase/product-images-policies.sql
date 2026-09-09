-- Intended Storage policies for bucket product-images.
-- NOT applied by this phase. Uploads are server-side with the service role.
-- Owner/ops may apply these later for defense in depth.

-- Bucket should be PRIVATE.
-- Public listing must stay disabled.
-- Object paths: products/{companyId}/{productId}/...

-- Example (do not run automatically):
-- insert into storage.buckets (id, name, public)
-- values ('product-images', 'product-images', false)
-- on conflict (id) do nothing;

-- No anon/authenticated insert/update/delete policies.
-- Reads for POS/admin use signed URLs created by the server after tenant checks.
