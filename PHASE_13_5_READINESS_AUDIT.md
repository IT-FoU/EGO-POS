# Phase 13.5 Production Readiness Audit

Date: 2026-06-14

## Executive Recommendation

**Recommendation: NO-GO for full PostgreSQL production integration.**

The project is ready for an empty local/Docker/Supabase PostgreSQL migration rehearsal, but not ready to switch the app to real database mode for production workflows.

Reason: the app still has mock-first services, read-only Prisma repositories, no module CRUD endpoints or server actions, incomplete seed implementation, and placeholder report aggregates. `IGO_DEMO_MODE=true` should remain enabled until the blockers below are resolved.

## Verification Results

Passed:

```text
node_modules\.bin\prisma.cmd validate --schema prisma/schema.prisma
npm.cmd run typecheck
npm.cmd run build
```

Build completed successfully and generated 47 static/dynamic app pages.

## 1. Remaining Mock Services

The following mock data files remain active when `IGO_DEMO_MODE=true`:

- `features/products/mock-data.ts`
- `features/inventory/mock-data.ts`
- `features/purchasing/mock-data.ts`
- `features/pos/mock-data.ts`
- `features/customers/mock-data.ts`
- `features/suppliers/mock-data.ts`
- `features/promotions/mock-data.ts`
- `features/reports/mock-data.ts`

The following service files still intentionally branch to mock data by default:

- `features/products/product-service.ts`
- `features/inventory/inventory-service.ts`
- `features/purchasing/purchasing-service.ts`
- `features/pos/pos-service.ts`
- `features/customers/customer-service.ts`
- `features/suppliers/supplier-service.ts`
- `features/promotions/promotion-service.ts`
- `features/reports/report-service.ts`

Current behavior is correct for demo mode, but these services are not production-write ready.

## 2. Missing CRUD Operations

Products:

- Missing create/update/archive/delete persistence.
- Missing category create/update/archive/delete persistence.
- Missing product image upload persistence.
- Missing brand/supplier lookup and creation workflows.

Inventory:

- Missing stock-in persistence.
- Missing stock adjustment persistence.
- Missing stock count persistence.
- Missing stock transfer persistence.
- Missing inventory lot creation/update logic.
- Missing audit-log writes for stock movements.

Purchasing:

- Missing purchase order create/update/cancel persistence.
- Missing purchase item persistence with unit, lot number, and expiry date.
- Missing goods receipt and partial-receive persistence.
- Missing payable/payment persistence.

POS:

- Missing sale transaction persistence.
- Missing sale item persistence.
- Missing mixed payment persistence into multiple `SalePayment` rows.
- Missing hold/resume persistence.
- Missing receipt number generation.
- Missing stock decrement and stock movement creation.
- Missing promotion usage and loyalty ledger writes.

Customers:

- Missing customer create/update/archive persistence.
- Missing customer payment persistence.
- Missing loyalty point ledger writes.
- Missing credit limit enforcement.

Suppliers:

- Missing supplier create/update/archive persistence.
- Missing supplier payment persistence.
- Missing supplier performance recalculation.

Promotions:

- Missing promotion create/update/archive persistence.
- Missing promotion target persistence for products, categories, and membership levels.
- Missing usage statistics updates.

Reports:

- Missing persisted report query layer and aggregate calculations.

## 3. Missing Prisma Repository Implementations

Existing Prisma repositories are read-oriented scaffolds:

- `features/products/prisma-repository.ts`
- `features/inventory/prisma-repository.ts`
- `features/purchasing/prisma-repository.ts`
- `features/pos/prisma-repository.ts`
- `features/customers/prisma-repository.ts`
- `features/suppliers/prisma-repository.ts`
- `features/promotions/prisma-repository.ts`
- `features/reports/prisma-repository.ts`

Missing repository work:

- Create/update/delete functions for every major module.
- Transactional writes using `prisma.$transaction`.
- Company/branch/warehouse scoping on every query.
- Auth/session-aware filtering.
- Audit log writes for sensitive operations.
- Optimistic conflict handling for inventory and POS stock changes.
- Strong Prisma Client typing; current repositories still use `prisma as any`.
- Product image persistence currently returns an empty array in `getPrismaProductImages`.
- POS repository currently uses placeholder branch/cashier names and `taxRatePercent: 0`.
- Reports repository currently returns empty arrays for trends and product rows.

## 4. Missing API Endpoints

Only these API routes exist:

- `app/api/auth/[...nextauth]/route.ts`
- `app/api/health/database/route.ts`

Missing module endpoints or server actions:

- Products CRUD
- Categories CRUD
- Product images/upload
- Inventory stock-in
- Inventory adjustment
- Inventory count
- Warehouse/stock movement history
- Purchasing purchase order create/update/cancel
- Goods receiving
- Supplier payables/payments
- POS sale complete
- POS hold/resume
- Customers CRUD
- Customer payments
- Suppliers CRUD
- Promotions CRUD
- Promotion simulation against real cart data
- Reports data endpoints or server-side aggregate loaders

Recommendation: use server actions or route handlers consistently, but do not mix both patterns casually.

## 5. Missing DTO Mappings

Existing DTO mappers cover read/display mapping:

- Product, category, product unit
- Inventory balance, stock movement, warehouse
- Purchasing supplier, purchase order, payables
- POS product and payment-mode decomposition
- Customer, membership, purchase, payment
- Supplier, supplier purchase, receiving, payment
- Promotion read model
- Basic report analytics shell

Missing DTO/input mapping:

- Create/update input DTOs for all forms.
- Validation schemas for numeric values, dates, enum values, and IDs.
- Decimal-safe write conversion.
- Date/time zone normalization.
- Form-to-Prisma relation mapping for product image, brand, supplier, membership level, promotion targets.
- Error DTOs for validation and conflict responses.
- Audit DTOs for old/new record snapshots.

Known mismatch areas:

- UI category status is still not persisted in Prisma.
- Inventory mock movement types `stock_in` and `count` are mapped to Prisma-adjacent meanings, not exact enum values.
- Supplier/customer payment UI uses `bank`; Prisma uses `transfer`.
- Promotion UI uses target arrays; Prisma uses join tables.

## 6. Missing Report Aggregate Queries

Current report Prisma repository is not production-grade.

Missing aggregates:

- Sales daily/weekly/monthly/yearly revenue.
- Profit by period.
- Tax by period.
- Top and low selling products.
- Product revenue and profit.
- Current stock, low stock, dead stock, expiring stock from real inventory.
- Top customers, loyalty points, customer spending.
- Purchases by supplier.
- Outstanding payables.
- Purchase trends.
- Revenue and sales trend chart data.
- Product category breakdown.

Current `features/reports/prisma-repository.ts` only calculates total revenue from fetched sales and returns empty trend/product arrays.

## 7. Missing Seed Implementations

Current executable seed:

- `prisma/seed.ts` only seeds Phase 0 foundation data:
  - Plan
  - Owner user
  - Company
  - Branch
  - Warehouse
  - CompanyUser
  - Role
  - Permissions
  - UserRole
  - AuditLog

Seed strategy exists but is not executable:

- `prisma/seed-strategy.ts`

Missing real seed data:

- Membership levels
- Suppliers
- Categories
- Brands
- Products
- Product units
- Product images
- Inventory balances
- Inventory lots
- Stock movements
- Customers
- Loyalty point ledger
- Customer payments
- Purchase orders
- Purchase items
- Goods receipts
- Supplier payables
- Promotions
- Promotion product/category/membership targets

## 8. Remaining Blockers Before PostgreSQL Integration

Blockers for `IGO_DEMO_MODE=false`:

1. Apply reviewed migration only to an empty database after explicit approval.
2. Implement full seed script for Go BOX demo data.
3. Replace `prisma as any` with generated Prisma Client typed delegates after migration/generate.
4. Add repository write functions and transactional boundaries.
5. Add server actions or API routes for all create/update/delete workflows.
6. Add validation for all form inputs.
7. Add tenant scoping using active company/branch/warehouse from session.
8. Add audit log writes to all sensitive module mutations.
9. Implement POS stock decrement, stock movement, payment, promotion usage, and loyalty writes atomically.
10. Implement real report aggregate queries.
11. Decide whether `Category.status` belongs in Prisma before first production migration.
12. Verify `/api/health/database`, owner login, and every app route with `IGO_DEMO_MODE=false`.

## Go/No-Go Matrix

| Area | Status |
| --- | --- |
| Mock demo mode | Go |
| Prisma schema validity | Go |
| TypeScript/build health | Go |
| Empty database migration rehearsal | Go with approval |
| Seeded real demo database | No-Go |
| Real CRUD workflows | No-Go |
| Production POS writes | No-Go |
| Production reports | No-Go |
| Full PostgreSQL integration | No-Go |

## Final Recommendation

Proceed next with a controlled Phase 14 focused on:

1. Creating an empty local/Docker PostgreSQL database.
2. Applying the reviewed migration.
3. Implementing the full Go BOX demo seed.
4. Verifying login and read-only Prisma mode.
5. Only then adding write endpoints/actions module by module.

Do not switch production behavior to `IGO_DEMO_MODE=false` yet.
