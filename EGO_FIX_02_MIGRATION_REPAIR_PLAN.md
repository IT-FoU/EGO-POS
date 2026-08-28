# EGO-FIX-02 Migration Repair Plan

Date: 2026-08-28  
Target: Production Supabase `ieutdqnlfiiaawctapor`  
Chosen plan: **PLAN A — HISTORY REPAIR ONLY**, with **no `_prisma_migrations` mutation**.

## Exact migration version

`20260621_b6_schema_drift_fix`

SQL (entire migration):

```sql
ALTER TABLE "approval_rules" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "approvals" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "company_users" ALTER COLUMN "updated_at" DROP DEFAULT;
```

## Target = Production

Proven by:

* `.env.local` `DATABASE_URL` contains Production ref `ieutdqnlfiiaawctapor` (pooler host).
* Live fingerprint: GO BOX Mini Mart `0001`, owner `gobox`, Super Admin `admin@igopos.local` / `igo-admin`.
* Products/stock/sales/customers/promotions = 0.

There is no `.env` file. There is no Supabase CLI / `supabase/` directory.

## Current history state

`_prisma_migrations` has **18 rows** for **17 repository folders**.

For `20260621_b6_schema_drift_fix` there are two rows:

1. **ROLLED BACK**
   * started_at: 2026-08-24T16:11:07.869Z
   * finished_at: null
   * rolled_back_at: 2026-08-24T16:12:44.695Z
   * applied_steps_count: 0
   * logs: failed with `42P01 relation "approval_rules" does not exist`
2. **FINISHED**
   * started_at = finished_at: 2026-08-24T16:12:53.395Z
   * rolled_back_at: null
   * applied_steps_count: 0
   * logs: null
   * this matches a `prisma migrate resolve --applied` marker, not a SQL apply

All other repository migrations have a finished, non-rolled-back row.

## Actual schema state

Read-only `information_schema.columns` on Production:

| EXPECTED CHANGE | PRODUCTION STATE | RESULT |
| --- | --- | --- |
| `approval_rules.updated_at` DROP DEFAULT | `column_default` is null; table exists | MATCH |
| `approvals.updated_at` DROP DEFAULT | `column_default` is null; table exists | MATCH |
| `company_users.updated_at` DROP DEFAULT | `column_default` is null; table exists | MATCH |

Production schema for this migration is **FULLY APPLIED**.

Root cause of the failed first attempt: folder name `20260621_b6_schema_drift_fix` sorts **before** `20260621_b6_staff_permissions_approvals`, which is the migration that creates `approval_rules` / adds `approvals.updated_at` / `company_users.updated_at` **with** `DEFAULT CURRENT_TIMESTAMP`. The drift-fix therefore ran too early, failed, and was rolled back. Tables were created later with defaults; current Production defaults are already dropped, matching Prisma `@updatedAt` (no DB default).

## Localhost fallback (separate from history)

`prisma.config.ts` previously imported the module-level `databaseUrl` constant from `lib/db/database-url.ts`. That constant is captured at import time as:

`postgresql://postgres:postgres@localhost:5432/igo_pos`

Prisma CLI does **not** load `.env.local`. This repo has **no** `.env`. Therefore `prisma migrate status` without an explicit `DATABASE_URL` targets **LOCAL localhost**, hangs/fails, and must not be treated as Production state.

Repair for that path: load `.env` then `.env.local` inside `prisma.config.ts` and call `getDatabaseUrl()` after load. Verification wrapper: `scripts/prisma-migrate-status.ts` refuses non-Production.

## Intended repair command

**Do not mutate `_prisma_migrations`.**

* Do not `DELETE` the rolled-back row (Prisma keeps rollback records).
* Do not `prisma migrate resolve --applied` (a finished row already exists).
* Do not `prisma migrate deploy` (no pending schema change; would be an unrelated apply risk).
* Do not `prisma migrate reset` / `db push`.

Code/script repair only:

* `prisma.config.ts` — load `.env.local` before resolving the datasource URL.
* `scripts/prisma-migrate-status.ts` — Production-gated `prisma migrate status`.

## Rollback/recovery

If the config change is wrong: revert `prisma.config.ts`. No database rollback is required because no database mutation is planned.

If a future `migrate deploy` were run accidentally: it should see every folder as already applied via finished rows. Still do not run it in FIX-02.

## Expected post-repair migration status

* `scripts/prisma-migrate-status.ts` target = PRODUCTION
* Prisma reports database schema up to date / no pending migrations
* Rolled-back historical row remains as an audit of the 2026-08-24 failed attempt
* GO BOX and Super Admin counts unchanged

## Business-data impact

None.

## Downtime

None.
