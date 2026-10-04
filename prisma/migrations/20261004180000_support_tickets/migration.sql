-- Store support tickets and thread messages.
-- Adds tables only. Existing settings and loyalty data stay.

CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "category" TEXT,
  "affected_area" TEXT,
  "source_path" TEXT,
  "app_version" TEXT,
  "browser_summary" TEXT,
  "company_name" TEXT,
  "user_name" TEXT,
  "store_unread" BOOLEAN NOT NULL DEFAULT false,
  "admin_unread" BOOLEAN NOT NULL DEFAULT true,
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "support_messages" (
  "id" TEXT NOT NULL,
  "ticket_id" TEXT NOT NULL,
  "sender_user_id" TEXT,
  "sender_side" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "support_tickets"
  ADD CONSTRAINT "support_tickets_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_messages"
  ADD CONSTRAINT "support_messages_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "support_tickets_company_id_updated_at_idx" ON "support_tickets"("company_id", "updated_at");
CREATE INDEX IF NOT EXISTS "support_tickets_status_type_idx" ON "support_tickets"("status", "type");
CREATE INDEX IF NOT EXISTS "support_tickets_admin_unread_idx" ON "support_tickets"("admin_unread");
CREATE INDEX IF NOT EXISTS "support_messages_ticket_id_created_at_idx" ON "support_messages"("ticket_id", "created_at");
