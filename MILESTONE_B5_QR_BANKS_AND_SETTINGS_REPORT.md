# Milestone B5 — Normalized QR Banks and Settings Form Persistence Report

**Date:** 21 June 2026  
**Scope:** Replace interim `company_settings.qr_payment_banks` JSON with normalized Prisma tables; persist QR bank/account management from Settings UI to PostgreSQL; load POS QR banks from normalized tables  
**Out of scope:** Offline sync, POS checkout logic changes, permissions/staff rewrite, customer display business persistence

---

## Executive Summary

Milestone B5 introduced **normalized `qr_payment_banks` and `qr_payment_accounts` tables** (company-scoped banks, branch-scoped accounts), migrated legacy JSON from B4, and wired **Settings → server actions → Prisma** for QR management. POS snapshot now loads active branch QR accounts via `getPrismaPosQrBanks()` instead of parsing `company_settings` JSON.

Hardcoded BCEL/JDB/LDB/ACLEDA defaults and `demoQrRepository` localStorage usage were removed from the QR management section. Demo seed upserts QR data idempotently through Prisma.

**Verification:** `npm run typecheck` PASS · `npm run build` PASS · `npm run db:seed:demo` PASS · `prisma migrate diff` empty PASS

---

## What Changed

### 1. Normalized schema

| Model | Scope | Key fields |
|-------|-------|------------|
| `QrPaymentBank` | Company | `bankName`, `shortCode`, `logoUrl`, `sortOrder`, `isActive` |
| `QrPaymentAccount` | Company + Branch + Bank | `accountName`, `accountNumber`, `displayLabel`, `qrImageUrl`, `isDefault`, `printOnReceipt`, `showOnCustomerDisplay`, `isActive` |

- Removed `CompanySetting.qrPaymentBanks` JSON column (interim B4 storage).
- One default QR account per branch enforced in `setDefaultQrPaymentAccount` / `saveQrPaymentAccount`.
- Bank delete blocked when accounts exist; archive deactivates bank + linked accounts.

### 2. Data migration

Migration `20260621_b5_normalized_qr_payment_banks`:

- Creates normalized tables, indexes, FKs.
- Migrates legacy `company_settings.qr_payment_banks` JSON into banks + accounts (main branch per company).
- Drops `qr_payment_banks` column from `company_settings`.

Follow-up `20260621_b5_qr_schema_drift_fix` aligns `updated_at` defaults and unique-index naming with Prisma schema.

### 3. QR payments module (`features/qr-payments/`)

| File | Role |
|------|------|
| `types.ts` | DTOs, save inputs, `mapQrPaymentAccountToPosBank()` |
| `prisma-repository.ts` | Snapshot, POS loader, CRUD, archive/delete/default rules |
| `actions.ts` | Server actions with `revalidatePath("/settings")` and `revalidatePath("/pos")` |

### 4. Settings UI persistence

- `app/(dashboard)/settings/page.tsx` loads `getQrPaymentSettingsSnapshot()` and passes `initialQrBanks`, `initialQrAccounts`, `qrBranches` to `SettingsForm`.
- `QrPaymentBankManagementSection` uses server actions for add/edit/archive/delete/set-default.
- Branch selector uses real `branchId` (no free-text branch names).
- No hardcoded bank catalog; empty state when DB has no banks.

### 5. POS snapshot

- `getPrismaPosSnapshot()` calls `getPrismaPosQrBanks(tenant, scope.branchId)` for active branch accounts with active banks.
- Checkout logic unchanged.

### 6. Demo seed

- `seedQrPayments()` upserts banks by `(companyId, bankName)` and accounts by composite key or stable demo IDs (`qr-bcel`, `qr-jdb`, `qr-ldb`).
- Idempotent across migration-seeded rows and re-runs.
- `ensureSandboxSchemaCompat()` no longer bootstraps `qr_payment_banks` JSON column.

---

## Files Changed

| Area | Files |
|------|-------|
| Schema | `prisma/schema.prisma` |
| Migrations | `prisma/migrations/20260621_b5_normalized_qr_payment_banks/migration.sql`, `prisma/migrations/20260621_b5_qr_schema_drift_fix/migration.sql` |
| Seed | `prisma/seed-demo.ts` |
| QR module | `features/qr-payments/types.ts`, `prisma-repository.ts`, `actions.ts` (**new**) |
| Settings | `app/(dashboard)/settings/page.tsx`, `features/settings/components/settings-form.tsx` |
| POS | `features/pos/prisma-repository.ts` |
| Legacy (unused at runtime) | `features/pos/qr-banks.ts` (parser retained; no callers) |

---

## Verification Results

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | **PASS** | |
| `npm run build` | **PASS** | First attempt hit OneDrive `EBUSY` on `.next`; clean rebuild succeeded |
| `npm run db:seed:demo` | **PASS** | After idempotent `seedQrPayments()` fix |
| `npx prisma migrate deploy` | **PASS** | B5 + drift-fix migrations applied |
| `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` | **PASS** | Empty migration |

---

## Remaining Issues

| Issue | Severity | Target |
|-------|----------|--------|
| Company logo upload still uses `demoSettingsRepository` localStorage | Medium | B6+ settings persistence |
| Customer display template/media still localStorage IPC | Low | By design until display CMS milestone |
| Staff/permissions section still demo matrix + `demoStaffRepository` | High | Permissions milestone |
| `features/pos/qr-banks.ts` dead code | Low | Remove in cleanup pass |
| `demoQrRepository` in `lib/demo/repositories.ts` unused by Settings/POS | Low | Remove when no demo paths reference it |
| QR accounts seeded/migrated as `isActive: true` without `qrImageUrl` | Low | UI requires image to activate via settings; POS shows accounts without image placeholder |
| Main settings form (tax, loyalty, receipt) already persisted via `updateSettingsAction` — unchanged in B5 | — | Already Prisma-backed |

---

## GO / NO-GO for Next Milestone (B6)

### **GO**

B5 acceptance criteria are met:

1. Normalized QR bank/account tables exist with tenant scoping.
2. Legacy JSON migrated and column dropped.
3. Settings QR UI reads/writes PostgreSQL via server actions.
4. POS snapshot loads QR from normalized tables.
5. Seed is idempotent; schema drift resolved.
6. POS checkout and offline sync were not modified.

**Recommended B6 focus:** Report hub filter re-query, modal placeholder removal, cash-session POS UI wiring, and continued settings persistence (logo, staff) per foundation plan.

---

## Apply on Any Environment

```bash
# Load DATABASE_URL from .env.local first, then:
npx prisma generate
npx prisma migrate deploy
IGO_DEMO_MODE=false npm run db:seed:demo
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
