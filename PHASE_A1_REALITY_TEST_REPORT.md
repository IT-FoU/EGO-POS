# Phase A1 Reality Test Report

**Date:** 2026-06-21  
**Scope:** Verify rebuilt database-backed architecture through UI-equivalent flows (no new features)  
**Status:** Complete — **GO** for continued milestone work

---

## Executive Summary

| Module | Result | Notes |
| --- | --- | --- |
| **Login** | **PASS** | DB credentials, NextAuth HTTP login, session, logout, role checks |
| **Products** | **PASS** | CRUD, search/list, image, category; one bug fixed during test |
| **Customers** | **PASS** | CRUD, membership, loyalty via sale |
| **Promotions** | **PASS** | Create, update, activate, deactivate |
| **Settings** | **PASS** | Company/receipt, localization, QR banks |
| **POS** | **PASS** | Sale, customer, promotion, loyalty, inventory, receipt data |

**Overall:** **PASS** (6/6 modules)

---

## Critical Environment Finding

`.env.local` currently has `IGO_DEMO_MODE="true"`. While demo mode is enabled:

- All production writes through `withTenantTransaction()` are blocked (`DemoModeWriteError`).
- NextAuth falls back to demo credential users instead of full DB authorization paths for some flows.

**For manual UI testing with real PostgreSQL persistence, set:**

```env
IGO_DEMO_MODE=false
```

Automated tests in this phase forced `IGO_DEMO_MODE=false` at runtime.

---

## Test Methodology

| Layer | Script | What it validates |
| --- | --- | --- |
| **Backend / server-action path** | `npx tsx scripts/phase-a1-reality-test.ts` | Same Prisma repositories and permission checks used by UI server actions |
| **HTTP UI auth** | `npx tsx scripts/phase-a1-ui-auth-test.ts` | NextAuth CSRF, credentials callback, session API, signout (requires `next start` on port 3001) |

Full click-through browser automation was not available in this environment (prior Turbopack/OneDrive path issues). HTTP-level NextAuth tests confirm the login UI contract works against a running production build.

---

## Module Results

### 1. Login — **PASS**

| Check | Result | Evidence |
| --- | --- | --- |
| `igo-admin` credentials | PASS | bcrypt hash verified against DB |
| `manager` credentials | PASS | bcrypt hash verified against DB |
| `cashier` credentials | PASS | bcrypt hash verified against DB |
| Session persistence | PASS | `/api/auth/session` returns `username=igo-admin` across reloads |
| Logout flow | PASS | `/api/auth/signout` clears session |
| Role restrictions | PASS | `assertPermission(cashier, settings.manage)` denied; manager `products.create` allowed; cashier JWT roles = `Cashier` |

**Note:** Cashier can load `/settings` page HTML when authenticated (no page-level permission gate). Write actions remain protected via `requireWritePermission(settings.manage)` on server actions.

---

### 2. Products — **PASS**

| Check | Result | Evidence |
| --- | --- | --- |
| Create | PASS | Product created in PostgreSQL |
| Update | PASS | `nameEn` and `sellingPriceLak` persisted after reload |
| Delete | PASS | Soft-deleted (`status=deleted`) when sale/inventory references exist |
| Search/list | PASS | `getPrismaProducts()` includes created product after fix |
| Image save | PASS | `imageUrl` persisted |
| Category save | PASS | Category created via `upsertPrismaCategory` |
| Persistence after refresh | PASS | Direct DB reload confirms values |

#### Failure Found & Fixed

**Symptom:** Owner product list excluded in-stock products (only zero-balance products appeared).

**Root cause:** `getPrismaProducts` / `getPrismaProductById` used `OR: [{}, { balances: { none: {} } }]` for owners. Prisma treats `{}` inside `OR` as non-matching, so products with inventory balances were filtered out.

**Fix:** `productInventoryScopeWhere()` in `features/products/prisma-repository.ts` — owners get no inventory filter; non-owners keep warehouse-scoped `OR`.

---

### 3. Customers — **PASS**

| Check | Result | Evidence |
| --- | --- | --- |
| Create | PASS | Customer row created |
| Update | PASS | `fullName` persisted |
| Delete/archive | PASS | `status=inactive` after archive |
| Membership | PASS | `membershipLevelId` assigned |
| Loyalty points | PASS | `pointsBalance=1` after POS sale (loyalty enabled in settings) |
| Persistence after refresh | PASS | DB reload confirms |

---

### 4. Promotions — **PASS**

| Check | Result | Evidence |
| --- | --- | --- |
| Create | PASS | Promotion row with product scope |
| Update | PASS | `promotionName` persisted |
| Activate | PASS | `status=active`, `isActive=true` |
| Deactivate | PASS | `status=inactive` |
| Persistence after refresh | PASS | DB reload confirms |

---

### 5. Settings — **PASS**

| Check | Result | Evidence |
| --- | --- | --- |
| Company / receipt settings | PASS | `receiptPrefix`, `receiptHeader`, `receiptFooter` persisted |
| Localization | PASS | Company `defaultLocale=lo` |
| QR banks load | PASS | Snapshot returns seeded + test banks |
| QR bank save | PASS | New bank visible after reload |
| Persistence after refresh | PASS | `getPrismaSettings()` / `getQrPaymentSettingsSnapshot()` |

---

### 6. POS — **PASS**

| Check | Result | Evidence |
| --- | --- | --- |
| Create sale | PASS | `completePrismaSale` returns sale id |
| Customer assignment | PASS | `sale.customerId` set |
| Promotion application | PASS | `promotionDiscount=1600` (10% on 16,000 LAK) |
| Loyalty earning | PASS | Customer `pointsBalance` increased |
| Inventory deduction | PASS | Warehouse balance 20 → 19 |
| Receipt generation | PASS | `saleNo` and `totalAmount=14400` available on sale record |

#### Failure Found & Fixed

**Symptom:** POS sale transaction timed out (`P2028`, 5000 ms) against remote Supabase.

**Root cause:** Default Prisma interactive transaction timeout too low for remote DB latency + POS sale workload.

**Fix:** `withTenantTransaction()` now uses `{ timeout: 30000 }` in `lib/db/write-context.ts`.

---

## Fixes Applied During Reality Test

| File | Change |
| --- | --- |
| `features/products/prisma-repository.ts` | Owner inventory scope filter bug |
| `lib/db/write-context.ts` | 30s transaction timeout for production writes |
| `scripts/phase-a1-reality-test.ts` | Correct repository imports, DTO shapes, assertions |
| `scripts/phase-a1-ui-auth-test.ts` | HTTP NextAuth smoke test (new) |

No new product features were added.

---

## How to Reproduce

```bash
# 1. Ensure database is seeded
IGO_DEMO_MODE=false npm run db:seed:demo

# 2. Backend + repository reality test
npx tsx scripts/phase-a1-reality-test.ts

# 3. UI auth smoke test (separate terminal)
IGO_DEMO_MODE=false npx next start --hostname 127.0.0.1 --port 3001
npx tsx scripts/phase-a1-ui-auth-test.ts
```

**Sandbox credentials:** `igo-admin` / `AdminChangeMe123!`, `manager` / `Manager123!`, `cashier` / `Cashier123!`

---

## Known Gaps (Non-Blocking)

| Gap | Impact |
| --- | --- |
| Default `IGO_DEMO_MODE=true` in `.env.local` | Manual UI writes appear to “not persist” until env is changed |
| No full browser click-through | Form UX, toasts, and client-side validation not manually exercised |
| Settings page lacks read-level permission gate | Cashier can view settings UI; writes still blocked server-side |
| B6 staff-control UI | Not in A1 checklist; backend permission matrix verified via `assertPermission` |

---

## GO / NO-GO

| Gate | Decision |
| --- | --- |
| Phase A1 Reality Test | **GO** |
| Proceed to next milestone work | **GO** (B6 already landed in codebase; this test confirms DB-backed flows work) |

**Recommendation:** Set `IGO_DEMO_MODE=false` in local/staging environments used for integration testing so UI and automated tests share the same write path.
