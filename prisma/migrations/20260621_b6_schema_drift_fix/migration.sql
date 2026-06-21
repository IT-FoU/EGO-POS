-- Align B6 table defaults with Prisma schema.

ALTER TABLE "approval_rules" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "approvals" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "company_users" ALTER COLUMN "updated_at" DROP DEFAULT;
