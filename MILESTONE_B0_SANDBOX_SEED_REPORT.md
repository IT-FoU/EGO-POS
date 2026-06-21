# Milestone B0 — Sandbox Seed Report

**Date:** 21 June 2026  
**Scope:** Supabase/PostgreSQL sandbox foundation seed only  
**Out of scope:** Demo mode removal, POS logic, reports, offline (unchanged)

---

## Executive Summary

Milestone B0 prepared a **repeatable Go BOX sandbox seed** in Supabase PostgreSQL via `prisma/seed-demo.ts`. The seed now creates tenant foundation, roles/permissions, company settings, catalog, inventory, and sample business data aligned with session IDs (`gobox-company`, `gobox-main-branch`, `gobox-default-warehouse`).

**Verification:** `npm run typecheck` PASS · `npm run build` PASS · `npm run db:seed:demo` PASS (twice, idempotent)

---

## What Seed Data Exists (After B0)

| Domain | Count | IDs / Notes |
|--------|------:|-------------|
| **Company (tenant)** | 1 | `gobox-company` — Go BOX |
| **Branch** | 1 | `gobox-main-branch` — main branch |
| **Warehouses** | 4 | `gobox-default-warehouse` + 3 mock warehouses (`wh-main`, `wh-backroom`, `wh-cold`) |
| **Owner user** | 1 | `igo-admin` / `AdminChangeMe123!` (id: `gobox-owner` on first create) |
| **Manager user** | 1 | `manager` / `Manager123!` |
| **Cashier user** | 1 | `cashier` / `Cashier123!` |
| **Super Admin** | 1 | `igo-admin` / `AdminChangeMe123!` (platform table) |
| **Roles** | 3 | Owner, Manager, Cashier |
| **Permissions** | 42 | Full write + read set for sandbox API use |
| **Role permissions** | Owner: all · Manager: 28 · Cashier: 4 | |
| **Company settings** | 1 | Tax, currency, loyalty, receipt profile |
| **Categories** | 4 | Drinks, Snacks, Household, Tobacco |
| **Products (with barcodes)** | 4 | Pepsi Can, Water Bottle, Lays, Dish Soap |
| **Product units** | Multiple | Base + carton/pack units with barcodes where defined |
| **Membership levels** | 4 | Standard, Silver, Gold, Platinum |
| **Customers** | 4 | With `qrMemberCode`, points, membership links |
| **Suppliers** | 4 | With credit/outstanding balances |
| **Inventory balances** | Per mock items | Mapped to warehouses (`wh-main` → `gobox-default-warehouse`) |
| **Inventory lots** | Per SKU/warehouse | Idempotent lot IDs |
| **Promotions** | 5 | Linked to categories/products/membership levels |
| **Purchasing history** | POs, receipts, payments | Sample supplier transactions |
| **Plan** | 1 | Free plan with sandbox limits |

### QR / Payment Banks

| Item | Status |
|------|--------|
| QR payment banks (BCEL, JDB, LDB) | **Not in Prisma schema yet** — stored in seed audit log metadata (`pendingQrPaymentBanks`) for B5 |
| Runtime QR source today | Still `localStorage` via `demoQrRepository` (unchanged) |

---

## What Was Added / Fixed in `seed-demo.ts`

| Change | Reason |
|--------|--------|
| Sandbox safety guard (`assertSandboxSeedTarget`) | Refuse unknown DB hosts unless `SEED_ALLOW_ANY_DATABASE=true` |
| Load `.env` + `.env.local` in seed script | Ensure `DATABASE_URL` available when running via `tsx` |
| Fixed `superAdmin.upsert` (`username` not wrong `id`) | Prevent super admin seed bug |
| Added `gobox-default-warehouse` | Align with auth session / demo hardcoded warehouse ID |
| Added `branchId` on categories, products, suppliers, customers | Required after branch isolation migration |
| Added `seedCompanySettings()` | Tax, currency, loyalty, receipt defaults in `company_settings` |
| Added full permission seed + role assignments | Enable non-owner API writes when demo mode off |
| Added `qrMemberCode` on customers | Membership QR lookup foundation |
| Mapped `wh-main` inventory → `gobox-default-warehouse` | Primary store stock at default warehouse |
| Idempotent inventory lots + purchase payments | Safe re-run of seed |
| QR banks in audit metadata only | Document pending B5 schema work |
| Owner display name → EGO Store Owner | Brand alignment |
| Plan upsert with full limit fields | Match foundation seed |

---

## What Was NOT Changed

| Area | Status |
|------|--------|
| Demo mode (`IGO_DEMO_MODE`, `isDemoMode()`) | Unchanged — still active |
| `lib/demo/*` localStorage repositories | Unchanged |
| Mock data files (`features/*/mock-data.ts`) | Unchanged — still seed input only |
| POS business logic / checkout | Unchanged |
| Reports (mock hub) | Unchanged |
| Offline architecture | Unchanged |
| Prisma schema | Unchanged (no new tables) |
| `prisma/seed.ts` foundation seed | Unchanged |

---

## Verification Results

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm run build` (`IGO_DEMO_MODE=false`) | **PASS** |
| `npm run db:seed:demo` (1st run) | **PASS** — Supabase sandbox populated |
| `npm run db:seed:demo` (2nd run) | **PASS** — idempotent, no duplicate errors |

### Seed command (sandbox/dev only)

```bash
npm run db:seed:demo
```

**Safety:** Seed loads `.env.local` and only allows local or Supabase hosts by default. Override with `SEED_ALLOW_ANY_DATABASE=true` only when intentional.

### Sandbox login credentials

| Role | Username | Password |
|------|----------|----------|
| Owner | `igo-admin` | `AdminChangeMe123!` |
| Manager | `manager` | `Manager123!` |
| Cashier | `cashier` | `Cashier123!` |
| Super Admin | `igo-admin` | `AdminChangeMe123!` |

---

## Alignment with B0 Plan Requirements

| Requirement | B0 Status |
|-------------|-----------|
| Tenant / company | ✅ `gobox-company` |
| Branch | ✅ `gobox-main-branch` |
| Warehouse | ✅ `gobox-default-warehouse` + extras |
| Owner / Manager / Cashier | ✅ Seeded with roles |
| Roles and permissions | ✅ 42 permissions, role mappings |
| Sample categories | ✅ 4 |
| Sample products with barcodes | ✅ 4 |
| Sample customers | ✅ 4 with QR member codes |
| Sample membership levels | ✅ 4 |
| Sample suppliers | ✅ 4 |
| QR/payment banks | ⚠️ Audit metadata only — schema gap (B5) |
| Tax/currency/settings | ✅ `company_settings` row |

---

## Risks Before B1 (Service Layer Unification)

| ID | Risk | Severity | Mitigation in B1 |
|----|------|----------|------------------|
| R1 | **App still reads localStorage** — Supabase data invisible to UI | Critical | Route products/POS/settings clients to Prisma |
| R2 | **Owner username `igo-admin` shared with Super Admin** | Medium | Separate merchant owner username in B1 auth cleanup |
| R3 | **Demo session uses hardcoded tenant IDs** — must match seed | Medium | Already aligned; document in env checklist |
| R4 | **QR banks not in DB** | High | B5 schema + settings repository |
| R5 | **Small sample catalog (4 SKUs)** — not Go BOX 5000+ scale | Low | Expand seed or import pipeline in later phase |
| R6 | **`isDemoMode()` still defaults ON** | Critical | B1 runtime mode unification |
| R7 | **Inventory service still reads mock in demo** | High | B1 remove service branches |
| R8 | **Re-seed on shared Supabase affects all developers** | Medium | Use dedicated sandbox project per team |

---

## Files Changed

| File | Action |
|------|--------|
| `prisma/seed-demo.ts` | Updated (B0 sandbox seed completion) |

**No other source files modified.**

---

## GO / NO-GO — Start Milestone B1

# GO

| Criterion | Status |
|-----------|--------|
| Supabase sandbox populated with Go BOX foundation data | ✅ |
| Tenant / branch / warehouse IDs aligned with auth | ✅ |
| Users, roles, permissions seeded | ✅ |
| Sample catalog, customers, suppliers, inventory seeded | ✅ |
| Company settings (tax/currency/loyalty) seeded | ✅ |
| Seed is repeatable (idempotent) | ✅ |
| Build + typecheck pass | ✅ |
| Demo layer intentionally preserved for B1 cutover | ✅ |

**Proceed to Milestone B1:** Remove `isDemoMode()` service branches and begin routing UI/modules to Prisma repositories against this sandbox.

**Known deferrals entering B1:**
- QR payment banks → B5 schema
- Reports mock hub → B3
- Demo localStorage removal → B2/B6
- Full Go BOX SKU import → later import phase

---

*Milestone B0 — Sandbox Seed complete. No demo mode, POS, reports, or offline changes were made.*
