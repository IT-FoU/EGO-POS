-- Align QR payment table defaults/index names with Prisma schema.

ALTER TABLE "qr_payment_accounts" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "qr_payment_banks" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER INDEX IF EXISTS "qr_payment_accounts_company_id_branch_id_bank_id_account_number"
RENAME TO "qr_payment_accounts_company_id_branch_id_bank_id_account_nu_key";
