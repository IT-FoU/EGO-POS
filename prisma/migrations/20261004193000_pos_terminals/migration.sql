-- Company-scoped POS terminals. Existing pos_devices rows are left unchanged.

CREATE TABLE "pos_terminals" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "terminal_code" TEXT NOT NULL,
    "terminal_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bound_device_id" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_terminals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_terminals_company_id_terminal_code_key" ON "pos_terminals"("company_id", "terminal_code");
CREATE UNIQUE INDEX "pos_terminals_bound_device_id_key" ON "pos_terminals"("bound_device_id");
CREATE INDEX "pos_terminals_company_id_branch_id_idx" ON "pos_terminals"("company_id", "branch_id");

ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_terminals" ADD CONSTRAINT "pos_terminals_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "terminal_id" TEXT;
CREATE INDEX "sales_terminal_id_idx" ON "sales"("terminal_id");
ALTER TABLE "sales" ADD CONSTRAINT "sales_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cash_sessions" ADD COLUMN "terminal_id" TEXT;
CREATE INDEX "cash_sessions_terminal_id_idx" ON "cash_sessions"("terminal_id");
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_terminal_id_fkey" FOREIGN KEY ("terminal_id") REFERENCES "pos_terminals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
