# EGO POS Production Blockers

Audit date: 2026-08-28. Status is based on source review, read-only database evidence, and safe validation only. No fixes were applied.

## P0 - Must close before controlled pilot or real-store use

| ID | Blocker | Evidence | Owner/action | Verification | Recommended scope |
| --- | --- | --- | --- | --- | --- |
| P0-1 | FIXED — POS sale/refund/void/exchange now reconcile `inventory_lots` with warehouse balances and stock movements | Before: receiving created/updated lots; POS checkout and return paths updated `inventory_balances` and `stock_movements` only. After EGO-FIX-03: centralized FEFO consume/restore in `features/inventory/lot-reconciliation.ts`, allocation provenance in `inventory_lot_allocations`, wired into checkout/refund/void/exchange inside the existing tenant transaction. Isolated fixture suite 17/17 passed. GO BOX business rows remain zero. | Keep FEFO (expiry asc, then received/created). Do not seed Production catalogue for this fix. | Isolated rollback fixtures: single/multi-lot sale, insufficient stock, partial/full refund, void, exchange, pack conversion, warehouse isolation, idempotency, rollback, receiving-then-sale | Complete for inventory-lot integrity; remaining P0 is browser smoke environment |
| P0-2 | FIXED — Super Admin bootstrap now exists on the configured Production target | Before: `super_admins=0`. After EGO-FIX-01: exactly one active `SuperAdmin` (`admin@igopos.local` / username `igo-admin`). Password is bcrypt-hashed, not a repository default, and stored only in the local owner secrets file. `prisma/seed.ts` and `prisma/seed-demo.ts` now refuse this Production ref. Login UI was not changed. | Keep the owner-local credential; do not commit it. Worker/browser login remains environment-dependent. | bcrypt compare against the live hash passed; Store Owner `gobox` is a separate `User` row and is not a Super Admin. | Complete for identity/authentication; remaining P0 is browser environment |
| P0-3 | FIXED — Production migration target and history are explainable | EGO-FIX-02: `prisma.config.ts` now loads `.env.local` so `prisma migrate status` targets Production, not localhost. History has a rolled-back failed apply of `20260621_b6_schema_drift_fix` (tables did not exist yet) plus a later finished marker. Live schema already has no `updated_at` defaults on `approval_rules` / `approvals` / `company_users`. Prisma reports schema up to date after EGO-FIX-03 added `20260828_inventory_lot_allocations`. | Use `npm run prisma:migrate:status` for Production-gated status. Do not `migrate deploy` / reset. | `migration-verification-target=PRODUCTION`; `Database schema is up to date!` | Targeting + history interpretation complete; remaining P0 is browser environment |
| P0-4 | Required browser UAT cannot run in the controlled local environment | Local dev process fails `listen EACCES` on `127.0.0.1:3000`; no authenticated end-to-end journey was executed | Resolve local browser/server policy or use an approved UAT host; execute role-based checklist | Owner, manager, cashier, and Super Admin journeys with console/network error review | Environment/UAT task; no product code change assumed |

## P1 - Close before broad pilot

| ID | Risk | Evidence | Recommended next step | Verification |
| --- | --- | --- | --- | --- |
| P1-1 | First stock cannot be received via Create Product-to-Quick Stock In handoff | Quick Stock In only renders products from `inventory_balances`; a new product has no balance | Add a safe product lookup/preselect path independent of existing balance, still requiring explicit Confirm Stock In | New product -> Quick Stock In -> explicit receive -> first balance/lot/movement |
| P1-2 | Product supplier/brand text is not persistently linked | ProductForm avoids sending free text as supplier/brand foreign keys | Decide whether to use selectable existing records, create records in a controlled flow, or store sanctioned text fields | Create/edit product then verify linked supplier/brand/report filtering |
| P1-3 | Financial/stock workflows lack current live reconciliation UAT | Live target has zero catalogue, sales, cash, receipts, refunds, and reports | Execute a controlled test matrix for sale, multi-tender, QR, void, refund, exchange, cash close, receipt, PO, partial receipt, and supplier payment | Ledger/balance/report parity signed by owner |
| P1-4 | Permission enforcement has inconsistent defense-in-depth | Inventory actions use store-action + permission checks; products/purchasing/suppliers reviewed use legacy permission check only | Audit all write routes/actions against the intended role-action matrix | Owner/manager/cashier allow/deny matrix, including cross-company attempts |
| P1-5 | Promotion relation inputs need tenant-scope validation audit | Promotion relation rows are recreated from submitted product/category/membership IDs without visible source checks in reviewed snippet | Validate all relation IDs belong to the requesting company before writes | Cross-company negative test with existing foreign IDs |
| P1-6 | Dashboard error fallback can resemble a valid empty business | Dashboard returns zero snapshot with `dataStatus.hasError` after query failure | Confirm the client presents an unambiguous unavailable/error state and alert/log path | Simulated read failure in non-production environment |
| P1-7 | Production configuration is incomplete for public deployment | Local `NEXTAUTH_URL` is localhost; worker config exists but production secret/public-origin injection was not verified | Build documented environment contract and deployment checklist | Canary login/session/cookie/redirect test over HTTPS |
| P1-8 | Release test harness is unsafe/incomplete | No lint or standard test suite; several scripts mutate data; cleanliness check fails; demo guard harness has one stale assertion | Split mutation tests from read-only checks and repair the stale/failing harnesses | CI runs only isolated test DB and reports reliable results |
| P1-9 | Local unpushed catalog migration tool is write-capable | `8098e1a` defaults dry-run but `--apply` writes to the configured production target | Separate code review, backup/rollback plan, and canary policy before pushing/running | Reviewed dry-run output, explicit approval, post-apply reconciliation |

## P2 - Plan deliberately; do not misrepresent as enabled

| ID | Deferred capability | Current state |
| --- | --- | --- |
| P2-1 | Billing, plan edits, feature entitlements, offline add-on | Super Admin safe-status/read-only only |
| P2-2 | Support tickets, attachments, notifications | Support Center skeleton/read-only only |
| P2-3 | Integrations, backup/restore, health execution | Disabled/not connected status surfaces |
| P2-4 | Product image storage, barcode aliases, import/export, label printing | Preview/read-only only |
| P2-5 | Non-Mini-Mart templates | Visible but disabled/coming soon |

## Recommended remediation order

1. Freeze new feature work and resolve P0-4 with an owner-approved UAT environment. P0-1 lot reconciliation, P0-2 Super Admin identity, and P0-3 migration target/history are fixed.
2. P0-1 lot allocation is fixed. Enable expiry-tracked products only after browser/UAT smoke (P0-4) and a live catalogue exist.
3. Resolve P1-1 first-stock receiving; this is the smallest operational bridge to a usable catalogue/inventory loop.
4. Run a written finance/stock/returns test matrix in a disposable test company and confirm role isolation.
5. Repair CI/read-only audit harnesses and establish deployed canary/rollback evidence.
6. Only then consider a limited controlled pilot. Billing, support, backups, integrations, aliases, and imports remain deferred.

## Explicit non-blockers by design

The disabled Super Admin plan/support/integration controls and read-only Product tools are not regressions. They are intentionally marked not connected/coming soon. They become blockers only if they are marketed as operational capabilities or if a pilot requires those functions.
