# Milestone B4 — POS Snapshot Completion Report

**Date:** 21 June 2026  
**Scope:** Complete POS checkout context from Prisma/PostgreSQL; remove demo/mock business-data reads from POS  
**Out of scope:** Offline mode, permissions rewrite, approval flows, inventory/purchasing service rewrites, report calculations

---

## Executive Summary

Milestone B4 completed the **POS server snapshot** so checkout loads products, customers, membership tiers, promotions, tax/loyalty settings, receipt settings, QR payment banks, branch/warehouse context, and cashier cash-session state from **tenant-scoped Prisma queries**. POS checkout already persisted via `completeSaleAction` → `completePrismaSale` (B2); B4 ensures the **read path** matches.

Customer display continues to use **localStorage IPC only** (`customerDisplayState`) for secondary-screen sync — not business source of truth.

**Verification:** `npm run typecheck` PASS · `npm run build` PASS · `npm run db:seed:demo` PASS (after schema drift migrations applied)

---

## Schema Drift Fix (B4 Verification Blocker)

**Root cause:** `prisma/schema.prisma` included product/unit fields added after the June 2026 baseline migrations, but no migrations were committed for them. Sandbox Supabase DB was behind schema.

**Migrations created and applied:**

| Migration | Purpose |
|-----------|---------|
| `20260621_b4_pos_qr_payment_banks` | `company_settings.qr_payment_banks` JSONB (B4 POS) |
| `20260621_product_stock_display_mode` | `StockDisplayMode` enum + `products.stock_display_mode` |
| `20260621_product_unit_and_history_schema` | `UnitStatus` / `UnitPricingMode` enums, `product_units` extension columns, `product_price_history` unit fields, `product_barcode_history` table |

**Drift detection:** `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma` returns empty migration after fix.

**Seed safety net:** `ensureSandboxSchemaCompat()` in `prisma/seed-demo.ts` idempotently applies `qr_payment_banks` and `stock_display_mode` if a sandbox DB lags migrations (does not replace `prisma migrate deploy`).

**Apply on any environment:**

```bash
# Load DATABASE_URL from .env.local first, then:
npx prisma migrate deploy
npm run db:seed:demo
```

---

## POS Data Sources Migrated

| Data | Before (B3) | After (B4) | Prisma source |
|------|---------------|------------|---------------|
| Products + stock | Prisma | Prisma | `product` + `inventoryBalance` (warehouse-scoped) |
| Categories | Derived from products | Unchanged | `category` via product include |
| Customers | Prisma (partial DTO) | Prisma + membership/subscription | `customer` + `membershipLevel` + `subscriptions` |
| Membership levels | Embedded in customer only | Snapshot list + customer DTO | `membershipLevel` |
| Active promotions (banners) | Prisma | Prisma | `promotion` (active date window) |
| Promotion rules at checkout | Prisma (server) | Unchanged | `applyActivePromotions()` in `completePrismaSale` |
| Payment methods | UI constants | Unchanged | cash / qr / transfer / card / mixed |
| QR payment banks | **Empty array `[]`** | **CompanySetting JSON** | `company_settings.qr_payment_banks` |
| Tax settings | Partial via tax helper | Full snapshot | `companySetting` via `getPrismaTaxAndLoyaltySettings` |
| Loyalty settings | Hardcoded earn rate in UI | Snapshot props | `companySetting` loyalty fields |
| Receipt settings | Hardcoded in receipt preview | Snapshot props | `receiptHeader`, `receiptFooter`, `receiptPrefix`, flags |
| Company name | Hardcoded "EGO POS" on receipt | From `company.name` | `company` |
| Branch / warehouse | Prisma | Prisma | `resolveTenantScope()` |
| Cashier name | Session | Session | `requireSession().user.name` |
| Cash session | Not loaded | Open session context | `cashSession` (open row for cashier) |

### Data flow

```
app/(dashboard)/pos/page.tsx
  → getPosSnapshot() / pos-service.ts
  → getPrismaPosSnapshot(tenant)
  → PostgreSQL (tenant-scoped)
  → PosPageClient props

Checkout:
PosPageClient → completeSaleAction → completePrismaSale → PostgreSQL
```

---

## Files Changed (B4)

| File | Change |
|------|--------|
| `features/pos/prisma-repository.ts` | Extended snapshot: company, settings, QR banks, receipt/loyalty settings, membership levels, cash session |
| `features/pos/pos-service.ts` | *(unchanged)* Prisma-only; enriches `cashierName` from session |
| `features/pos/dto-mapper.ts` | Customer DTO uses real membership level, subscription expiry, discount % |
| `features/pos/qr-banks.ts` | **New** — parse/validate QR bank JSON |
| `features/pos/types.ts` | Added `PosReceiptSettings`, `PosLoyaltySettings`, `PosCashSessionContext`, `PosMembershipLevel` |
| `app/(dashboard)/pos/page.tsx` | Passes full snapshot props to client |
| `features/pos/components/pos-page-client.tsx` | Receipt preview + loyalty earn from DB settings; props for snapshot |
| `prisma/schema.prisma` | `CompanySetting.qrPaymentBanks Json?` |
| `prisma/migrations/20260621_b4_pos_qr_payment_banks/migration.sql` | **New** — adds `qr_payment_banks` column |
| `prisma/migrations/20260621_product_stock_display_mode/migration.sql` | **New** — `StockDisplayMode` + `products.stock_display_mode` |
| `prisma/migrations/20260621_product_unit_and_history_schema/migration.sql` | **New** — product unit columns + barcode history table |
| `prisma/seed-demo.ts` | Seeds `mockQrBanks`; `ensureSandboxSchemaCompat()` bootstrap |

---

## QR Bank Status

| Item | Status |
|------|--------|
| Dedicated `QrPaymentBank` / `QrAccount` Prisma models | **Not implemented** — deferred to B5 |
| Runtime storage | **`company_settings.qr_payment_banks` JSONB** (interim per foundation plan) |
| POS load path | `parseQrPaymentBanks(settings.qrPaymentBanks)` in `getPrismaPosSnapshot()` |
| Seed data | `mockQrBanks` (BCEL, JDB, LDB) written on `db:seed:demo` |
| Settings UI persistence | **Still localStorage** via `settings-form.tsx` / `demoQrRepository` — B5 |
| QR image URLs | Optional field in JSON; seed uses bank metadata only |

**Schema gap (B5):** Normalize QR banks into relational tables; wire settings form save/load to Prisma; support per-account QR images and receipt print flags.

---

## Remaining POS localStorage Usage

| Location | Key / purpose | Source of truth? | Phase |
|----------|---------------|------------------|-------|
| `pos-page-client.tsx` | `DemoStorageKeys.customerDisplayState` | **No** — IPC to customer display | Keep (display sync) |
| `customer-display-client.tsx` | Reads `customerDisplayState` | **No** — display mirror | Keep (display sync) |
| `customer-display-settings.ts` | `customerDisplaySettings` | Display template prefs | B7 / optional DB |
| `pos-page-client.tsx` | `demoPendingApprovalRepository` | Dev-debug panel only (`demoMode && devDebug`) | Out of scope |
| `pos-page-client.tsx` | `demoAuditLogRepository` | Dev-debug panel only | Out of scope |
| `customer-display-client.tsx` | `?demo=checkout` mock state | Dev preview only | Acceptable |

**Removed from POS checkout business path (prior milestones):** `demoProductsRepository`, `demoSalesRepository`, `demoReceiptsRepository`, `demoQrRepository` for catalog/checkout.

---

## Tenant / Branch Isolation (POS)

- `resolveTenantScope(tenant)` → `companyId`, `branchId`, `warehouseIds`
- Products: active products with inventory in scoped warehouses
- Customers: `companyId` + `branchOwnedWhere`
- Promotions / membership levels: `companyId`
- Cash session: `companyId` + `branchId` + `cashierId` (current user)
- Sale write: `assertBranchInScope` + `assertWarehouseInScope` (unchanged)

---

## Verification Results

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | **PASS** | |
| `npm run build` | **PASS** | |
| `npm run db:seed:demo` | **PASS** | After `prisma migrate deploy` on Supabase sandbox |
| `prisma migrate diff` (DB → schema) | **PASS** | Empty migration — no remaining drift |

**B4 verification:** **PASS**

---

## Risks Before B5

| Risk | Severity | Mitigation |
|------|----------|------------|
| QR banks in JSON, not normalized tables | **High** | B5: `QrPaymentBank` model + settings UI Prisma persistence |
| Settings form still uses `demoQrRepository` | **High** | B5 settings migration |
| Cash session loaded but POS shift UI still local React state | **Medium** | B6/B7: wire `CashSession` open/close to POS staff controls |
| Customer student fields (`schoolName`, etc.) not in Prisma `Customer` | **Low** | B5/B6 schema extension if student pricing required |
| `cashSession` prop passed but shift panel not yet bound to DB session | **Low** | Future POS shift milestone |
| Customer display still localStorage IPC (not BroadcastChannel/SSE) | **Low** | B7 optional improvement |

---

## Milestone B5 Gate Decision

### **GO for Milestone B5 — Schema Gaps (QR / Settings / Staff)**

**Rationale:**

1. POS snapshot read path is **Prisma-complete** for checkout context (products, customers, promotions, tax, loyalty, receipt text, QR banks via JSON, branch/warehouse).
2. Checkout write path remains **database-backed** (`completePrismaSale`).
3. **B4 verification PASS:** typecheck, build, seed, and schema diff all pass on sandbox DB.
4. Remaining POS gaps are explicitly **schema/settings** work (normalized QR tables, settings form persistence) — the defined B5 scope.
5. Customer display localStorage is **IPC-only**, not business data — acceptable per milestone constraints.

**Conditions before pilot POS QA:**

1. Run `npx prisma migrate deploy` on target DB (7 migrations through `20260621_product_unit_and_history_schema`).
2. Run `npm run db:seed:demo`.
3. Log in as `cashier` / `Cashier123!` with `IGO_DEMO_MODE=false`.
4. Verify POS shows seeded products, customers, and QR bank dropdown (BCEL/JDB/LDB).
5. Complete a sale and confirm stock decrement + dashboard refresh.

---

*Next milestone: **B5 — Schema gaps** (normalized QR payment banks, settings form → Prisma, staff branch persistence).*
