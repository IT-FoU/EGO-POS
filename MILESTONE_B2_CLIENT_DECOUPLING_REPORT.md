# Milestone B2 — Client Decoupling Report

**Date:** 21 June 2026  
**Scope:** Remove localStorage/demo-repository usage from priority client UIs (products, POS, customers, promotions)  
**Out of scope:** Offline mode, reports rewrite, permissions rewrite, approval system rewrite, global demo mode removal

---

## Executive Summary

Milestone B2 decoupled **priority merchant client components** from `localStorage` and `lib/demo/repositories` for business data. Product, customer, and promotion UIs now read server-provided snapshots and persist through **server actions → Prisma repositories → PostgreSQL**. POS checkout always uses `completeSaleAction` (no demo sales/stock path).

**Verification:** `npm run typecheck` PASS · `npm run build` PASS (`IGO_DEMO_MODE=false`) · `npm run db:seed:demo` PASS

---

## Components Migrated

| Component | Before | After |
|-----------|--------|-------|
| `features/products/components/product-list-client.tsx` | Loaded/saved via `demoProductsRepository` | Props from `getProducts()`; delete via `deleteProductAction`; bulk price via existing action |
| `features/products/components/product-form.tsx` | Create/edit/archive/delete via demo repos | `createProductAction`, `updateProductAction`, `archiveProductAction`, `deleteProductAction`, `upsertCategoryAction`, `deleteCategoryAction` |
| `app/(dashboard)/products/page.tsx` | Passed empty `products={[]}` | Loads `getProducts()` + `getCategories()` |
| `app/(dashboard)/products/[productId]/edit/page.tsx` | `ProductEditClient` + localStorage lookup | Server `getProductById()` → `ProductForm` directly |
| `features/products/components/product-edit-client.tsx` | Demo product lookup | **Removed** (obsolete) |
| `features/pos/components/pos-page-client.tsx` | Demo checkout path (`completeDemoSale`), demo product/QR/sales repos | Always `completeSaleAction`; products from server snapshot; `router.refresh()` after sale |
| `features/customers/components/customers-list-client.tsx` | Locale from `DemoStorageKeys.locale` | Locale from `document.documentElement.dataset.locale` |
| `features/customers/components/customer-form.tsx` | *(already Prisma actions)* | No change required |
| `features/customers/components/customer-detail-client.tsx` | *(already Prisma actions)* | No change required |
| `features/promotions/components/promotion-form.tsx` | Demo-only save messages (no persistence) | `createPromotionAction` / `updatePromotionAction` |
| `features/promotions/components/promotions-list-client.tsx` | Demo-only confirm/duplicate | `createPromotionAction`, `updatePromotionAction`, `archivePromotionAction` |

### Data flow (target pattern)

```
Server Page → *-service.ts → prisma-repository.ts → PostgreSQL
       ↓
Client Component (props)
       ↓
Server Action (mutations) → prisma-repository.ts → PostgreSQL
       ↓
router.refresh() → re-fetch server snapshot
```

---

## Demo Branches / localStorage Removed (B2 scope)

| Area | Removed |
|------|---------|
| Product list | `demoProductsRepository`, `demoCategoryRepository` reads/writes; "Clear Products" demo button |
| Product form | All `demoProductsRepository` / `demoCategoryRepository` persistence |
| POS | `completeDemoSale`, `demoProductsRepository`, `demoSalesRepository`, `demoReceiptsRepository`, `demoQrRepository`, `demoSettingsRepository` |
| POS | `demoMode` branching for product reload and checkout (prop retained only for dev-debug permission panel) |
| Customers list | `readStringFromStorage(DemoStorageKeys.locale)` |
| Promotion form | Demo-only save simulation |
| Promotion list | Demo-only duplicate/confirm handlers |

---

## Remaining localStorage Usage

| Location | Purpose | Phase |
|----------|---------|-------|
| `features/pos/components/pos-page-client.tsx` | `writeJsonToStorage(customerDisplayState)` — secondary customer display sync | B4 (BroadcastChannel/SSE) |
| `features/pos/components/customer-display-client.tsx` | Reads customer display state from localStorage | B4 |
| `features/pos/customer-display-settings.ts` | Customer display settings in localStorage | B4/B7 |
| `features/inventory/components/inventory-page-client.tsx` | Locale from demo storage | B4+ |
| `features/purchasing/components/*-page-client.tsx` | Locale from demo storage | B4+ |
| `features/reports/components/reports-analytics-client.tsx` | Locale + mock report data path | B3 (reports rewrite) |
| `features/settings/components/settings-form.tsx` | Logo, QR banks, staff via demo repos | B5/B7 |
| `features/platform/onboarding-context.ts` | Onboarding draft in localStorage | B7 |
| `components/i18n/localization-repair-runtime.tsx` | Locale fallback reads demo storage | B7 |

---

## Remaining Demo Dependencies

| Location | Dependency | Notes |
|----------|------------|-------|
| `features/pos/components/pos-page-client.tsx` | `demoPendingApprovalRepository`, `demoAuditLogRepository` | **Dev-debug panel only** (`demoMode && devDebug`); approval system not rewritten per scope |
| `features/settings/components/settings-form.tsx` | `demoSettingsRepository`, `demoQrRepository`, `demoStaffRepository` | Out of B2 scope |
| `lib/demo-mode.ts` | Global demo flag | Unchanged per scope |
| `lib/demo/repositories.ts` | Still exists | No longer used by product/customer/promotion priority UIs |
| `features/*/mock-data.ts` | Seed input only | Used by `prisma/seed-demo.ts`, not runtime UI in migrated modules |
| Service layer | `inventory-service`, `purchasing-service`, `reports/report-service`, `dashboard-service` | Still branch on `isDemoMode()` — B3/B4 |

---

## Tenant / Branch / Warehouse Scoping

Preserved through existing server paths (unchanged in B2):

- All reads: `tenantFromSession(await requireSession())` in services
- Product writes: `branchOwnedWhere` + branch references in `prisma-repository`
- Customer writes: branch-scoped customer repository
- Promotion writes: `companyId` scoped
- POS sale: `completePrismaSale` validates `branchId` + `warehouseId` in tenant scope

---

## Verification Results

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** (`IGO_DEMO_MODE=false`) |
| `npm run db:seed:demo` | **PASS** (idempotent sandbox seed) |

### Grep audit (priority feature folders)

No matches for `demoProductsRepository`, `demoCategoryRepository`, `demoSalesRepository`, `demoQrRepository`, or `mock-data` imports under:

- `features/products/**`
- `features/customers/**`
- `features/promotions/**`

POS retains **dev-debug-only** demo repo imports (approval audit panel).

---

## Risks Before B3

| Risk | Severity | Mitigation |
|------|----------|------------|
| Reports hub still 100% mock (`report-service.ts`) | **Critical** | B3: wire `reports-analytics-client` to Prisma aggregates |
| Dashboard still mock aggregates | **High** | B3: share report queries with dashboard |
| POS customer display still localStorage IPC | **Medium** | B4: BroadcastChannel or SSE |
| QR banks empty in POS service (no schema) | **Medium** | B5: schema + settings persistence |
| Settings form still demo repos | **Medium** | B5/B7 |
| Promotion update does not remap category/product relations | **Low** | Extend `updatePrismaPromotion` in later milestone |
| Product import/export modals still UI placeholders | **Low** | Future worker/API milestone |
| `IGO_DEMO_MODE` default ON may confuse local testing | **Low** | Document `IGO_DEMO_MODE=false` + seeded DB |

---

## Files Changed (B2)

| File | Change |
|------|--------|
| `app/(dashboard)/products/page.tsx` | Load products from service |
| `app/(dashboard)/products/[productId]/edit/page.tsx` | Server-side product load |
| `features/products/components/product-list-client.tsx` | Prisma-backed list + deletes |
| `features/products/components/product-form.tsx` | Server actions for CRUD/categories |
| `features/products/components/product-edit-client.tsx` | Deleted |
| `features/pos/components/pos-page-client.tsx` | Prisma-only checkout |
| `features/customers/components/customers-list-client.tsx` | Remove locale localStorage |
| `features/promotions/components/promotion-form.tsx` | Server actions for save |
| `features/promotions/components/promotions-list-client.tsx` | Server actions for lifecycle |

---

## GO / NO-GO for Milestone B3

| Decision | Verdict |
|----------|---------|
| **Start Milestone B3 (Reports & dashboard truth)** | **GO** |

**Rationale:** Priority client components for products, customers, promotions, and POS business data no longer depend on demo repositories or localStorage for reads/writes. Server actions and services are the mutation path. Build and seed verification pass.

**Conditions for B3 entry:**

1. Run sandbox with `IGO_DEMO_MODE=false` and `npm run db:seed:demo`
2. B3 must migrate `report-service.ts` and `reports-analytics-client.tsx` — do not reintroduce client-side mock imports
3. POS customer-display localStorage is acceptable until B4; not a blocker for report work

**Plan exit-criteria note:** Full plan B2 target of *zero* `@/lib/demo/repositories` in all `features/**/components` is **not yet met** due to POS dev-debug approval storage and `settings-form.tsx` — outside this milestone's scoped modules.

---

*Next milestone: B3 — Reports & dashboard truth (`report-service.ts`, `reports-analytics-client.tsx`, `dashboard-service.ts`).*
