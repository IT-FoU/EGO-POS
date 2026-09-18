-- Audit-only denomination breakdown for Cash Shift Count.
-- Authoritative cash totals remain opening_cash / closing_cash / expected_cash / cash_difference.
ALTER TABLE "cash_sessions"
ADD COLUMN "count_breakdown" JSONB;
