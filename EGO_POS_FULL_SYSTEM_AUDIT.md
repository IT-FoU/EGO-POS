# EGO-PRODUCTION-AUDIT-1 - Full System Readiness Audit

Audit date: 2026-08-28

## Executive decision

**Result: PARTIAL. Readiness: OWNER UAT ONLY. Do not use this target for real-store operations yet.**

The codebase contains substantial real database-backed Mini Mart workflows, not a visual-only prototype. TypeScript and the production build pass. EGO-FIX-01 provisioned one Production Super Admin. Remaining live-data gaps are no catalogue, no stock, no sales, no customers, and an unfinished migration-history entry. In addition, POS only updates product warehouse balances; it does not allocate or decrement `inventory_lots`, so expiry/lot quantity cannot be treated as operationally correct.

The completion estimate is **55% evidence-supported**. It is a weighted audit estimate across code wiring, data readiness, security/configuration, operational accounting, deployment, and completed runtime verification; it is not a claim that 55% of the product is complete.

## Audit boundary and baseline

* Audit-only work. No product code, UX/UI, Prisma schema, database records, migrations, commits, or pushes were changed.
* Branch: `main`, one local commit ahead of `origin/main`: `8098e1a Add GO BOX catalog migration tooling`.
* No staged files and no tracked working-tree changes at audit start or before report creation.
* Preserved pre-existing untracked files: `PRODUCTS_DIRTY_WORK_BACKUP.patch` and `SUPER_ADMIN_TEST_DATA_RESET_BACKUP_REPORT.md`.
* The local head migration tool defaults to dry run, but `--apply` can write categories, products, units, balances, and stock movements to the Supabase project. It is not approved for use by this audit.

## Phase 0 - Architecture map

| Layer | Evidence | Status |
| --- | --- | --- |
| Web runtime | Next.js 16, React 19, server components/actions and API routes | VERIFIED SOURCE |
| Data runtime | PostgreSQL via Prisma 7 and `@prisma/adapter-pg`; Cloudflare worker uses Hyperdrive binding | VERIFIED SOURCE |
| Tenancy | Company, branch, warehouse, membership, role, and permission models are present | VERIFIED SOURCE |
| Audit boundary | `withTenantTransaction` wraps key writes and creates audit records | VERIFIED SOURCE |
| Deployment config | OpenNext/Cloudflare worker configuration exists | VERIFIED SOURCE; runtime deployment not tested |
| Test automation | Typecheck/build scripts exist; no lint or standard unit/integration test script exists | VERIFIED CONFIG |

## Phase 1 - Source of truth, demo, mock, and local state

Production service layers for POS, dashboard, reports, inventory, purchasing, customers, promotions, and settings use Prisma repositories. The demo-mode guard forces effective demo mode off in production and blocks `IGO_DEMO_MODE=true` at build/startup.

| Source/state | Classification | Audit result |
| --- | --- | --- |
| Operational pages and services | DB-backed | VERIFIED SOURCE |
| `lib/demo/**`, demo staff records, demo login literals | Demo-only | Gated behind effective demo mode; production guard passed |
| `features/*/mock-data.ts` files | Mock fixtures | Present in repository, not imported by primary production services reviewed |
| Product visual shell / More Actions drawers | UI-only intentionally | Read-only or disabled, clearly labelled in source |
| Super Admin Feature Control, Subscriptions, Support Center, Integrations, Backup, much of System Health | UI-only / planned safe-status | Static/read-only and disabled by design; not live entitlement, billing, support, backup, or integration systems |
| Product image upload and barcode aliases | Deferred | Image fetch currently returns empty data; aliases are local ProductForm preview state only |

## Phases 2-7 - Access, Super Admin, dashboard, products, inventory

### Store login and permissions

`/login` accepts username or email through NextAuth Credentials. Authentication checks active user state, password/PIN, active company membership, access flags, roles, and then resolves a template-aware entry route. Owner/Manager Back Office goes to `/dashboard`; POS-only/Cashier goes to `/pos`. Page-level and action-level permission checks are present in reviewed paths.

The current verified database contains one active user, `gobox`, with an active Owner membership for GO BOX Mini Mart, store code `0001`, with POS and Back Office access enabled. Passwords were not read or tested in this audit. The actual Store Login journey was not browser-tested because a controlled local server could not bind port 3000.

### Super Admin

Every reviewed `/super-admin/*` page calls `requireSuperAdminPortalAccess`; the middleware redirect is only an early cookie check and server route guards revalidate the database session. Store owners are redirected away from Super Admin routes by the portal guard.

EGO-FIX-01: the configured Production target now has exactly one active Super Admin record in `super_admins` (`admin@igopos.local`, username `igo-admin`, role `super_admin`). Bootstrap is `scripts/bootstrap-super-admin.ts` (idempotent, refuses demo defaults, does not create Setup Admin or store data). Demo fallback remains disabled. `setup_admins` remains 0.

### Dashboard and reports

Dashboard and reports read real tenant-scoped data. Dashboard requires `dashboard.view` and deliberately returns an empty snapshot with `dataStatus.hasError` when a dependent query fails; it does not substitute mock KPI values. This is safer than fabricating totals, but a visible error/observability UAT is required so an outage is not mistaken for a genuinely empty store.

### Products

Product/category CRUD, unit persistence, duplicate-barcode checks, product archive/delete safeguards, and read-only product tools are source-wired. Product Form preserves product-level compatibility values derived from units. Initial stock/lot and barcode aliases are preview/navigation-only, not writes.

Important limitation: the free-text Supplier Name and Brand Name fields in ProductForm are intentionally not sent as foreign-key IDs. They remain visible UX inputs but are not persistently linked to Supplier/Brand records.

### Inventory

Quick Stock In is a real explicit-confirmation write path. It validates product, warehouse, unit, quantity, expiry/lot when required, then uses a tenant transaction to update balance, create/update lot, create movement, and optionally update cost. Query-barcode preload never auto-selects or writes.

Important limitation: the inventory snapshot and Quick Stock In search are built from `inventory_balances`. A newly created product with no balance does not appear in that search, so the Create Product-to-Quick Stock In handoff cannot receive the first stock for that product without a deliberate repository/UI extension or another receiving path.

## Phases 8-16 - Core operations

| Area | Actual behaviour | Readiness |
| --- | --- | --- |
| POS checkout | Server recomputes totals/promotions/tax/change, validates tender, requires open cash session, creates sale/items/payments, and atomically decrements warehouse balance | Source-backed; UAT required |
| Held bills | Persistent hold-bill server foundation and APIs exist | Source-backed; not runtime-tested |
| Void/refund/exchange | Server repositories create lifecycle records, balance movements, and return/exchange handling | Source-backed; not runtime-tested |
| Cash sessions | Open/close and cash transaction/reconciliation services exist | Source-backed; not runtime-tested |
| Product unit conversion | Stock-in and POS calculate base quantities from product-unit conversion | Source-backed |
| Lot/expiry | Receiving creates/updates lots and requires lot/expiry for expiry-tracked product | NOT production-ready: POS/returns update balances and movements but reviewed POS paths do not update lot quantities or allocate FEFO |
| Purchasing | PO creation, receiving, supplier payable creation, and supplier payment writes are real | Source-backed; accounting UAT required |
| Suppliers | Real CRUD/archive and payable-related reads/writes | Source-backed |
| Customers/loyalty | CRUD, membership, points ledger, customer payments, and lifecycle reversal code exist | Source-backed; money/points UAT required |
| Promotions | CRUD and server-side POS policy/calculation exist | Source-backed; relation scoping and analytics UAT required |
| Reports | Tenant-scoped sales lifecycle/netting and inventory/report snapshot logic exist | Source-backed; parity UAT required |
| Settings | Real settings repository/actions exist | Source-backed; permissions and persistence UAT required |

## Phase 17 - Data and demo audit

Read-only aggregate queries against the configured Supabase target show:

| Entity | Count |
| --- | ---: |
| Active companies / branches / warehouses | 1 / 1 / 1 |
| Users / active company memberships | 1 / 1 |
| Products / units / categories | 0 / 0 / 0 |
| Inventory balances / lots / movements | 0 / 0 / 0 |
| Suppliers / purchases / receipts / payables | 0 / 0 / 0 / 0 |
| Customers / promotions / sales / sale items | 0 / 0 / 0 / 0 |
| Cash sessions / audit logs / store activity | 0 / 0 / 0 |
| Plans / subscriptions | 1 / 1 |
| Super Admins / setup admins | 1 / 0 |

The one business is `GO BOX Mini Mart`, code `0001`, active Mini Mart template, with one active Owner user (`gobox`) and no visible QA/demo/test/seed business, product, customer, sales, or promotions. The old visible test-data issue is therefore not present in this target. The absence of catalogue and opening inventory means this target is not ready for a real store transaction.

## Phase 18 - Configuration, migrations, deployment

* `.env.local` points at a Supabase/PostgreSQL target that matches the hardcoded target reference used by the local catalog migration tool. It is not a local database.
* `.env.local` uses `NEXTAUTH_URL=http://localhost:3000`, appropriate for local testing but not a deployed production URL.
* `prisma validate` passed.
* `prisma migrate status` did **not** inspect the Supabase target: Prisma config falls back to `postgresql://postgres:postgres@localhost:5432/igo_pos` when the CLI does not load `.env.local`, then fails with a schema-engine error.
* The target’s `_prisma_migrations` table reports 17 completed migrations and one unfinished historical `20260621_b6_schema_drift_fix` row. This must be reviewed by a migration owner before any deploy/migrate command.
* `scripts/production-database-cleanliness-check.ts` failed on a Prisma invocation with no detailed cause. Its generated-client/runtime path needs investigation; its expected GO BOX/BETA WATER fixture must not be treated as evidence of the live target.
* Cloudflare Worker/Hyperdrive configuration exists, but no deployed smoke or rollback test was performed.

## Phase 19 - Validation and browser smoke

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | PASS |
| `IGO_DEMO_MODE=false; npm.cmd run build` | PASS |
| `prisma validate` | PASS |
| `prisma migrate status` | FAIL: targets localhost fallback, not configured Supabase |
| Demo production guard harness | PARTIAL: 15/16 PASS; one stale source-text assertion for already-closed `/register` |
| Production database cleanliness harness | FAIL: Prisma invocation failure; no DB write occurred |
| Browser smoke / authenticated journeys | NOT TESTED: controlled local dev server failed `listen EACCES` at `127.0.0.1:3000`; no external browser substituted |
| Lint | NOT CONFIGURED |
| Standard unit/integration test suite | NOT CONFIGURED |

## Phase 20 - Final readiness matrix

| Domain | Code capability | Live data/config | Required before pilot |
| --- | --- | --- | --- |
| Store login/roles | Mostly real | One Owner only; password/browser UAT not completed | Create controlled test accounts and execute role matrix |
| Super Admin/provisioning | Real provisioning code | One active Super Admin after EGO-FIX-01 | Browser/Worker session UAT; Create Store remains available to that account |
| Products/catalogue | Real CRUD, units | Empty | Create approved catalogue and test duplicate/unit constraints |
| Inventory receiving | Real explicit write | Empty; first-stock handoff incomplete | Fix/approve first-stock discovery and run controlled receiving UAT |
| POS/cash/returns | Strong server wiring | No test inventory/sales | Run cash, QR, return, refund, void, and shift reconciliation UAT |
| Lot/expiry | Receiving records lots | POS does not reconcile lot quantities | Implement/approve lot allocation and FEFO policy before expiry-tracked use |
| Purchasing/payables | Real write paths | Empty | Partial receipt/payment/overpayment and reconciliation UAT |
| Customers/loyalty/promotions | Real write paths | Empty | Controlled UAT including reversals and cross-tenant tests |
| Reports/dashboard | Real query paths | Empty | Reconcile reports with transaction lifecycle tests |
| Super Admin status pages | Safe read-only status pages | Mostly no backend | Keep clearly labelled; do not market as live control plane |
| Deployment/migrations | Worker config exists | Environment/migration inspection unreliable | Fix CLI target handling, resolve migration history, deploy canary/rollback |

## Production blockers

See `EGO_POS_PRODUCTION_BLOCKERS.md` for owners, risk, verification, and commit recommendations.

## Final conclusion

EGO POS is a credible database-backed Mini Mart application with a newly rebuilt UX, but it is **not production-ready**. The earliest sensible release stage is a controlled owner UAT after the remaining P0/P1 blockers are closed, using non-production test data and a written cash/stock/return reconciliation script. A real store should not be onboarded until migration history, lot integrity, first-stock receiving, end-to-end browser testing, and data/backup controls are confirmed. Super Admin bootstrap (EGO-FIX-01) is in place.
