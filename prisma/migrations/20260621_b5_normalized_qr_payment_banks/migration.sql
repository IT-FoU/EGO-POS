-- B5: Normalized QR payment banks and accounts; migrate legacy JSON; drop interim column.

CREATE TABLE IF NOT EXISTS "qr_payment_banks" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "short_code" TEXT,
    "logo_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_payment_banks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "qr_payment_accounts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "bank_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "display_label" TEXT,
    "qr_image_url" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "print_on_receipt" BOOLEAN NOT NULL DEFAULT true,
    "show_on_customer_display" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_payment_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "qr_payment_banks_company_id_bank_name_key"
ON "qr_payment_banks"("company_id", "bank_name");

CREATE INDEX IF NOT EXISTS "qr_payment_banks_company_id_is_active_idx"
ON "qr_payment_banks"("company_id", "is_active");

CREATE UNIQUE INDEX IF NOT EXISTS "qr_payment_accounts_company_id_branch_id_bank_id_account_number_key"
ON "qr_payment_accounts"("company_id", "branch_id", "bank_id", "account_number");

CREATE INDEX IF NOT EXISTS "qr_payment_accounts_company_id_branch_id_is_active_idx"
ON "qr_payment_accounts"("company_id", "branch_id", "is_active");

DO $$ BEGIN
    ALTER TABLE "qr_payment_banks"
    ADD CONSTRAINT "qr_payment_banks_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "qr_payment_accounts"
    ADD CONSTRAINT "qr_payment_accounts_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "qr_payment_accounts"
    ADD CONSTRAINT "qr_payment_accounts_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "qr_payment_accounts"
    ADD CONSTRAINT "qr_payment_accounts_bank_id_fkey"
    FOREIGN KEY ("bank_id") REFERENCES "qr_payment_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Migrate legacy company_settings.qr_payment_banks JSON (flat bank+account rows).
INSERT INTO "qr_payment_banks" ("id", "company_id", "bank_name", "short_code", "sort_order", "is_active", "created_at", "updated_at")
SELECT
    COALESCE(NULLIF(elem->>'id', ''), 'bank-' || substr(md5(cs."company_id" || (elem->>'bankName')), 1, 12)),
    cs."company_id",
    elem->>'bankName',
    UPPER(LEFT(elem->>'bankName', 6)),
    (ROW_NUMBER() OVER (PARTITION BY cs."company_id" ORDER BY elem->>'bankName'))::INTEGER,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "company_settings" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."qr_payment_banks") AS elem
WHERE cs."qr_payment_banks" IS NOT NULL
  AND jsonb_typeof(cs."qr_payment_banks") = 'array'
ON CONFLICT ("company_id", "bank_name") DO NOTHING;

INSERT INTO "qr_payment_accounts" (
    "id",
    "company_id",
    "branch_id",
    "bank_id",
    "account_name",
    "account_number",
    "display_label",
    "qr_image_url",
    "is_default",
    "print_on_receipt",
    "show_on_customer_display",
    "is_active",
    "created_at",
    "updated_at"
)
SELECT
    COALESCE(NULLIF(elem->>'id', ''), 'qr-account-' || substr(md5(cs."company_id" || (elem->>'bankName') || (elem->>'accountNumber')), 1, 12)),
    cs."company_id",
    main_branch."id",
    bank."id",
    COALESCE(NULLIF(elem->>'accountName', ''), elem->>'bankName'),
    elem->>'accountNumber',
    COALESCE(NULLIF(elem->>'accountName', ''), elem->>'bankName'),
    NULLIF(elem->>'qrImageUrl', ''),
    ROW_NUMBER() OVER (PARTITION BY cs."company_id", main_branch."id" ORDER BY elem->>'bankName') = 1,
    true,
    true,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "company_settings" cs
CROSS JOIN LATERAL jsonb_array_elements(cs."qr_payment_banks") AS elem
JOIN LATERAL (
    SELECT b."id"
    FROM "branches" b
    WHERE b."company_id" = cs."company_id"
    ORDER BY b."is_main_branch" DESC, b."created_at" ASC
    LIMIT 1
) AS main_branch ON true
JOIN "qr_payment_banks" bank
  ON bank."company_id" = cs."company_id"
 AND bank."bank_name" = elem->>'bankName'
WHERE cs."qr_payment_banks" IS NOT NULL
  AND jsonb_typeof(cs."qr_payment_banks") = 'array'
  AND elem->>'bankName' IS NOT NULL
  AND elem->>'accountNumber' IS NOT NULL
ON CONFLICT ("company_id", "branch_id", "bank_id", "account_number") DO NOTHING;

ALTER TABLE "company_settings" DROP COLUMN IF EXISTS "qr_payment_banks";
