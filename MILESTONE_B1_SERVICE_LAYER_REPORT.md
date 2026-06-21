# Milestone B1 — Service Layer Report

**Date:** 21 June 2026  
**Scope:** Remove service-layer demo/mock branches for priority merchant modules  
**Out of scope:** UI localStorage decoupling (B2), offline, reports rewrite, permission rewrite

---

## Executive Summary

Milestone B1 migrated **six priority service modules** from `isDemoMode()` branching to **Prisma-only** data access with tenant scoping via `tenantFromSession(await requireSession())`. POS snapshot now loads products, customers, and promotion banners from the sandbox database instead of returning empty arrays in production mode.

**Verification:** `npm run typecheck` PASS · `npm run build` PASS (`IGO_DEMO_MODE=false`) · `npm run db:seed:demo` PASS

---

## Services Migrated to Prisma

| Service | Functions | Prisma repository | Tenant scoping |
|---------|-----------|-------------------|----------------|
| `features/products/product-service.ts` | `getProducts`, `getProductById`, `getCategories`, `getMockProductImages` | `features/products/prisma-repository.ts` | `companyId` + branch via `resolveTenantScope` |
| `features/customers/customer-service.ts` | `getCustomersSnapshot`, `getCustomers`, `getCustomerById`, `getCustomerDetail` | `features/customers/prisma-repository.ts` | `companyId` + `branchOwnedWhere` |
| `features/suppliers/supplier-service.ts` | `getSuppliersSnapshot`, `getSuppliers`, `getSupplierById`, `getSupplierDetail` | `features/suppliers/prisma-repository.ts` | `companyId` + branch scope |
| `features/promotions/promotion-service.ts` | `getPromotionsSnapshot`, `getPromotions`, `getPromotionById`, `getPromotionDetail` | `features/promotions/prisma-repository.ts` | `companyId` |
| `features/pos/pos-service.ts` | `getPosSnapshot` | `features/pos/prisma-repository.ts` | `companyId`, `branchId`, `warehouseIds` |
| `features/membership-levels/membership-level-service.ts` | `getMembershipLevels` | *(already Prisma-only — unchanged)* | `companyId` |

### POS snapshot enhancements (B1)

`getPrismaPosSnapshot()` now also loads:

| Field | Source | Notes |
|-------|--------|-------|
| `customers` | `customers` table + `membershipLevel` | Mapped via new `mapPrismaPosCustomer()` |
| `promotionBanners` | Active `promotions` (date + status filtered) | Promotion names/descriptions |
| `qrBanks` | `[]` | No Prisma schema yet (deferred to B5/B7) |
| `cashierName` | Session user name in `pos-service.ts` | Overrides repository placeholder |

---

## Demo Branches Removed

| File | Removed |
|------|---------|
| `product-service.ts` | `isDemoMode()` checks; imports of `mockCategories`, `mockProducts`, `mockProductImages` |
| `customer-service.ts` | `isDemoMode()` checks; imports of all `mock-data` customer arrays |
| `supplier-service.ts` | `isDemoMode()` checks; imports of all `mock-data` supplier arrays |
| `promotion-service.ts` | `isDemoMode()` checks; mock imports; local `simulatePromotion()` mock calculator (62 lines) |
| `pos-service.ts` | `isDemoMode()` branch returning empty snapshot; production path that stripped `customers`, `promotionBanners`, `qrBanks` to `[]` |

### New mapping helper

`features/pos/dto-mapper.ts` — `mapPrismaPosCustomer()` bridges Prisma customer rows to `PosCustomer` for POS membership lookup. Uses `qrMemberCode` for membership number search and membership-level `discountPercent` for pricing hints.

---

## Services Still Using Demo / localStorage / Mock

### Service layer (deferred — out of B1 scope)

| Service | Branch pattern | Planned phase |
|---------|----------------|---------------|
| `features/inventory/inventory-service.ts` | `isDemoMode()` → mock vs Prisma | B4 |
| `features/purchasing/purchasing-service.ts` | `isDemoMode()` → mock vs Prisma | B4 |
| `features/reports/report-service.ts` | `isDemoMode()` → mock only in demo | B6 |
| `features/dashboard/dashboard-service.ts` | `isDemoMode()` → mock aggregates | B6 |

### Client components (localStorage — B2)

| Component | Demo dependency |
|-----------|-----------------|
| `features/products/components/product-list-client.tsx` | `demoProductsRepository`, `demoCategoryRepository` |
| `features/products/components/product-form.tsx` | `demoProductsRepository`, `demoCategoryRepository` |
| `features/products/components/product-edit-client.tsx` | `demoProductsRepository` |
| `features/pos/components/pos-page-client.tsx` | `demoProductsRepository`, `demoSalesRepository`, `demoQrRepository`, etc. when `demoMode={true}` |

### Runtime demo infrastructure (unchanged)

| Item | Status |
|------|--------|
| `lib/demo-mode.ts` | Still defaults ON unless `IGO_DEMO_MODE=false` |
| `lib/demo/repositories.ts` | Still used by client components |
| `features/*/mock-data.ts` | Retained for `prisma/seed-demo.ts` only at runtime |
| `lib/auth/permissions.ts` | Demo bypass still active |
| `lib/auth/session.ts` | Fake demo session when `IGO_DEMO_MODE=true` |

### POS-specific gaps (known, deferred)

| Gap | Impact | Phase |
|-----|--------|-------|
| QR payment banks not in schema | `qrBanks: []` from service; client falls back to `demoQrRepository` localStorage | B5/B7 |
| `PosCustomer.membershipType` hardcoded `"Yearly"` | Student/monthly subscription types not modeled in DB | B2+ |
| `membershipExpiry` placeholder (`2099-12-31` active / `2020-01-01` inactive) | No `CustomerSubscription` join in POS snapshot yet | B2+ |
| Promotion detail `simulation` stub | `emptyPromotionSimulation()` from Prisma repo (not full calculator) | B6 |

---

## Tenant / Company / Branch Scoping

All migrated services preserve existing scoping:

- **Session → tenant:** `tenantFromSession(await requireSession())` on every call
- **Products:** `companyId` filter + warehouse-scoped stock balances
- **Customers:** `companyId` + `branchOwnedWhere(scope)` on list/detail queries
- **Suppliers:** Same branch-owned pattern via supplier prisma-repository
- **Promotions:** `companyId` filter; snapshot composes products/categories from tenant-scoped product repo
- **POS:** `resolveTenantScope` → `branchId`, `warehouseIds`, `branchName`; customers filtered by branch; products require stock in scoped warehouses

Sandbox seed IDs verified unchanged: `gobox-company`, `gobox-main-branch`, `gobox-default-warehouse`.

---

## Verification Results

| Command | Result | Notes |
|---------|--------|-------|
| `npm run typecheck` | **PASS** | No new type errors |
| `npm run build` | **PASS** | `IGO_DEMO_MODE=false`; Next.js 16.2.9 production build |
| `npm run db:seed:demo` | **PASS** | Idempotent; 4 products, 4 customers, 5 promotions, 4 suppliers |

---

## Risks Before B2

| Risk | Severity | Mitigation in B2 |
|------|----------|------------------|
| Product UI still writes to localStorage | **High** | Migrate `product-*-client.tsx` to server actions; reads already go through pages that call Prisma services |
| POS checkout still uses demo repos when `IGO_DEMO_MODE=true` | **High** | Remove `demoMode` localStorage paths in `pos-page-client.tsx`; always use `completeSaleAction` |
| `isDemoMode()` default ON masks Prisma path in dev | **Medium** | Document `IGO_DEMO_MODE=false` for sandbox testing; unify flag semantics in B0.1 follow-up |
| Product list server data vs client localStorage divergence | **Medium** | Users may see seeded DB on server render but stale LS data on client edits until B2 |
| QR banks empty in service layer | **Low** | Expected until B5 schema; POS client still hydrates from LS |
| POS customer membership model mismatch | **Low** | Wire `CustomerSubscription` + `qrMemberCode` search in B2/B4 |

---

## Files Changed (B1)

| File | Change |
|------|--------|
| `features/products/product-service.ts` | Prisma-only |
| `features/customers/customer-service.ts` | Prisma-only |
| `features/suppliers/supplier-service.ts` | Prisma-only |
| `features/promotions/promotion-service.ts` | Prisma-only; removed mock simulation |
| `features/pos/pos-service.ts` | Prisma-only; session cashier name |
| `features/pos/prisma-repository.ts` | Load customers + promotion banners |
| `features/pos/dto-mapper.ts` | Add `mapPrismaPosCustomer` |

---

## GO / NO-GO for Milestone B2

| Decision | Verdict |
|----------|---------|
| **Start Milestone B2 (client component decoupling)** | **GO** |

**Rationale:** Priority service-layer demo branches are removed. Prisma repositories are the single server-side source of truth for products, customers, suppliers, membership levels, promotions, and POS snapshot. Build and seed verification pass. Remaining localStorage usage is isolated to client components — exactly B2 scope.

**Conditions for B2 entry:**

1. Run dev/sandbox with `IGO_DEMO_MODE=false` and seeded DB (`npm run db:seed:demo`)
2. Login as `igo-admin` / `AdminChangeMe123!` (or manager/cashier)
3. B2 must not reintroduce `isDemoMode()` branches in services

---

*Next milestone: B2 — Client component decoupling (`product-*-client.tsx`, `pos-page-client.tsx` localStorage removal).*
