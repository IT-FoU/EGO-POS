-- No DDL required.
-- Require Cash Shift Before Sale is stored in company_settings.unit_pricing_defaults JSON
-- under reserved key "__requireCashShiftBeforeSale" (default ON when missing).
-- QA app role cannot ALTER company_settings / CREATE tables in public schema.
SELECT 1;
