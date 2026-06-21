# Phase 13 PostgreSQL Migration Review

Generated: 2026-06-14

## Scope

This review package prepares the current Prisma schema for PostgreSQL migration review only.

- Migration SQL: `prisma/migration-review/phase13_current_schema.sql`
- Source schema: `prisma/schema.prisma`
- Demo mode remains enabled through `IGO_DEMO_MODE=true`
- No PostgreSQL connection was used
- No migration was applied
- No production data was modified

## Generated SQL Summary

The reviewed SQL was generated offline with:

```powershell
node_modules\.bin\prisma.cmd migrate diff --from-empty --to-schema prisma/schema.prisma --script --output prisma\migration-review\phase13_current_schema.sql
```

SQL object counts:

- Enum types: 25
- Tables: 64
- Unique indexes: 24
- Non-unique indexes: 71
- Foreign key / table alteration statements: 103
- Drop statements: 0

## Review Notes

The SQL is a full baseline migration from an empty PostgreSQL schema to the current Prisma schema. It is appropriate for a new empty database, Docker database, or clean Supabase project.

The SQL creates foundations for:

- Multi-company, branch, warehouse, users, roles, permissions
- Products, categories, brands, product units, product images
- Inventory balances, inventory lots, movements, adjustments, transfers
- Suppliers, purchasing, payables, goods receipts
- Customers, membership levels, loyalty ledger, customer payments
- POS sales, sale items, sale payments, holds, refunds, cash sessions
- Promotions, promotion targets, promotion usage
- Audit logs, login history, notifications, approvals, plans, backups

## Migration Risks

- This is not safe to run against a database that already has unmanaged tables with the same names.
- Composite unique indexes on nullable codes, such as product code, SKU, supplier code, customer code, and promotion code, should be reviewed with real data before migration.
- Some status concepts intentionally remain `String` in existing models while new enums exist for future hardening. Service code must normalize values before writes.
- `Category` still does not have a persisted active/inactive status. The current category status is UI/mock derived.
- Many relations use cascade deletes. This is good for tenant cleanup but risky if delete workflows are exposed too early.
- Reports repositories are scaffolded but still need real aggregate queries before production reporting.
- Prisma Client was generated locally for type compatibility, but no database schema has been deployed yet.

## Rollback Notes

For a clean database before production data is inserted:

1. Prefer dropping and recreating the database/schema instead of hand-reversing individual objects.
2. For Docker/local PostgreSQL, recreate the database container or drop the `igo_pos` database.
3. For Supabase, use a fresh project or drop the `public` schema only after confirming no production data exists.

For a database that already contains data:

1. Do not run a destructive rollback automatically.
2. Take a physical backup or provider snapshot first.
3. Generate a reverse diff against the previously approved schema.
4. Review every `DROP TABLE`, `DROP TYPE`, and `DROP INDEX` manually.
5. Restore from backup if data has already been written and rollback is required.

Suggested manual rollback outline for an empty failed migration:

```sql
-- Empty database only. Do not use after production data exists.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
```

## Seed Execution Plan

Use `prisma/seed-strategy.ts` as the seed order source of truth for Phase 13 implementation.

Recommended seed flow:

1. Keep `IGO_DEMO_MODE=true` while preparing the database.
2. Apply the reviewed migration to an empty local/Docker/Supabase PostgreSQL database only after approval.
3. Run `prisma generate` after migration.
4. Run foundation seed for:
   - Plan
   - User owner
   - Company Go BOX
   - Main branch
   - Default warehouse
   - Owner role and permissions
5. Seed demo reference data:
   - Membership levels: Standard, Silver, Gold, Platinum
   - Suppliers: Lao Beverage Supplier, Snack Distribution Laos, Household Lao Trade
   - Categories: Drinks, Snacks, Household, Tobacco
   - Brands: Pepsi, Go BOX, Lay's, Sunlight
   - Products and product units from mock data
6. Seed inventory:
   - InventoryBalance rows by warehouse/product
   - InventoryLot rows with lot number and expiry date
   - StockMovement rows for opening stock
7. Seed customers:
   - Customer profiles
   - LoyaltyPointLedger opening entries
   - CustomerPayment sample credit payments
8. Seed purchasing:
   - Purchase orders
   - Purchase items
   - Goods receipts and receipt items
   - Supplier payables and purchase payments
9. Seed promotions:
   - Promotion records
   - PromotionProduct targets
   - PromotionCategory targets
   - PromotionMembershipLevel targets
10. Verify:
   - Login with `owner` / `ChangeMe123!`
   - Product list, inventory, POS, customers, suppliers, promotions, and reports load
   - `/api/health/database` returns `{ ok: true }`
11. Only after verification, test `IGO_DEMO_MODE=false`.

## Phase 13 Approval Gate

Before applying this migration to any real PostgreSQL database:

- Confirm target database is empty or disposable.
- Confirm backup/snapshot strategy.
- Confirm seed content and default credentials.
- Confirm whether `Category.status` should be added before first migration.
- Confirm whether nullable code unique indexes are acceptable for the target PostgreSQL version.
