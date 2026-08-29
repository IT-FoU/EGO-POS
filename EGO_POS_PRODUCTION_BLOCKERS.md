# EGO POS Production Blockers

Audit date: 2026-08-28. Status is based on source review, read-only database evidence, and safe validation only. No fixes were applied.

## P0 - Must close before controlled pilot or real-store use

| ID | Blocker | Evidence | Owner/action | Verification | Recommended scope |
| --- | --- | --- | --- | --- | --- |
| P0-1 | FIXED — POS sale/refund/void/exchange now reconcile `inventory_lots` with warehouse balances and stock movements | Before: receiving created/updated lots; POS checkout and return paths updated `inventory_balances` and `stock_movements` only. After EGO-FIX-03: centralized FEFO consume/restore in `features/inventory/lot-reconciliation.ts`, allocation provenance in `inventory_lot_allocations`, wired into checkout/refund/void/exchange inside the existing tenant transaction. Isolated fixture suite 17/17 passed. GO BOX business rows remain zero. | Keep FEFO (expiry asc, then received/created). Do not seed Production catalogue for this fix. | Isolated rollback fixtures: single/multi-lot sale, insufficient stock, partial/full refund, void, exchange, pack conversion, warehouse isolation, idempotency, rollback, receiving-then-sale | Complete for inventory-lot integrity |
| P0-2 | FIXED — Super Admin bootstrap now exists on the configured Production target | Before: `super_admins=0`. After EGO-FIX-01: exactly one active `SuperAdmin` (`admin@igopos.local` / username `igo-admin`). Password is bcrypt-hashed, not a repository default, and stored only in the local owner secrets file. `prisma/seed.ts` and `prisma/seed-demo.ts` now refuse this Production ref. Login UI was not changed. | Keep the owner-local credential; do not commit it. Worker/browser login remains environment-dependent. | bcrypt compare against the live hash passed; Store Owner `gobox` is a separate `User` row and is not a Super Admin. | Complete for identity/authentication |
| P0-3 | FIXED — Production migration target and history are explainable | EGO-FIX-02: `prisma.config.ts` now loads `.env.local` so `prisma migrate status` targets Production, not localhost. History has a rolled-back failed apply of `20260621_b6_schema_drift_fix` (tables did not exist yet) plus a later finished marker. Live schema already has no `updated_at` defaults on `approval_rules` / `approvals` / `company_users`. Prisma reports schema up to date after EGO-FIX-03 added `20260828_inventory_lot_allocations`. | Use `npm run prisma:migrate:status` for Production-gated status. Do not `migrate deploy` / reset. | `migration-verification-target=PRODUCTION`; `Database schema is up to date!` | Targeting + history interpretation complete |
| P0-4 | FIXED — Controlled local browser/UAT smoke now runs on `http://localhost:3000` | Before: hung EGO POS `next dev` on port 3000 caused bind/timeout/`EACCES` symptoms; no authenticated journey. After EGO-FIX-04: stale process stopped, port 3000 binds, `npm run dev:uat` documented, HTTP cookie smoke 25/25 PASS, Edge dump-dom of `/login` rendered. Worker hostname DNS still fails on this PC (separate deployment finding). | Use `http://localhost:3000`, not `127.0.0.1`. Do not seed Manager/Cashier for smoke. | `npm run dev:uat` then `npm run test:browser-smoke`; Owner and Super Admin login pages and core nav load | Environment P0 closed; original audit P0 count is 0. Readiness remains OWNER UAT ONLY |

ORIGINAL PRODUCTION AUDIT P0 COUNT = 0

This does not mean Production-ready. Readiness remains OWNER UAT ONLY until module functional testing is completed.

EGO-FIX-05 Products status:

* Product CRUD: FIXED / isolated 18/18
* Search (name/SKU/barcode): FIXED
* Barcode lookup: FIXED (string identifier, leading zeros preserved)
* First stock: FIXED (catalogue lookup + existing Confirm Stock In)
* Product → Inventory: FIXED
* Product → POS lookup: FIXED after first stock (POS still requires a balance to sell)

EGO-FIX-06 POS discovery/cart status:

* POS Product source: Prisma (`getPrismaPosSnapshot` / `listSellablePosProducts`), warehouse-scoped balances
* Name/SKU/barcode search and keyboard-wedge scan: FIXED
* Product card → cart, repeat scan qty, increase/decrease/remove: FIXED
* Stock cap / zero-stock refuse / pack conversion / tenant+warehouse isolation: FIXED
* Isolated matrix: 24/24 (`npm run test:pos-discovery`)
* Checkout, payment, receipt, refund/void, cash session: NOT in this phase (see EGO-FIX-07 below)

EGO-FIX-07 checkout/payment/receipt status:

* Server-authoritative checkout: `completeSaleAction` → `writeCompletePrismaSale`
* Cash/QR/card/transfer/mixed tender, change, reused saleNo rejection: FIXED
* Atomic sale + items + payments + stock + FEFO lots + movements: FIXED
* Receipt from persisted Sale; Recent Sales single entry: FIXED
* Isolated matrix: 28/28 (`npm run test:pos-checkout`); GO BOX sales remain zero
* Browser `/pos` HTTP smoke LOADS; Production checkout write not exercised
* Refund/void/exchange: NOT in this phase

EGO-FIX-08 refund/void/exchange status:

* Partial/full refund remaining qty from persisted SaleItem minus RefundItem: FIXED
* Server-authoritative refund amount from original paid allocation: FIXED
* Void completed sale exactly once; refunded/partial/exchanged blocked: FIXED
* Exchange equal / customer-pays / store-refunds difference: FIXED
* Inventory + lot restore once; replacement FEFO consume; cash vs non-cash session: FIXED
* Atomic rollback, double-submit, tenant/warehouse/permission: FIXED
* Isolated matrix: 40/40 (`npm run test:pos-postsale`); GO BOX sales/refunds remain zero
* Browser `/pos` HTTP smoke LOADS; Production post-sale writes not exercised
* Reports: NOT in this phase

EGO-FIX-09 Reports/Dashboard status:

* Canonical netting: `netReportLifecycle` in `features/reports/prisma-repository.ts`
* Gross / refunds / net / void / exchange / payments / COGS / profit: FIXED (isolated)
* Dashboard reuses the same snapshot; revenue/profit/txn reconcile: FIXED
* Date boundaries: Asia/Vientiane business calendar
* Isolated matrix: 45/45 (`npm run test:reports`); GO BOX sales remain zero
* Catalog export/schedule/named-report shells: still DEMO/NOT IMPLEMENTED
* Promotions/Membership modules: DEPENDENT, not claimed ready
* Next: Owner live-catalogue UAT, or Promotions/Membership

## P1 - Close before broad pilot

| ID | Risk | Evidence | Recommended next step | Verification |
| --- | --- | --- | --- | --- |
| P1-1 | FIXED — Create Product → Quick Stock In can receive first stock without a prior balance row | Before: Quick Stock In/Stock In searched `inventory_balances` only, so a new product was undiscoverable. After EGO-FIX-05: receiving pages merge active catalogue products with quantity 0; `createStockIn` still upserts `inventory_balances` via `applyAtomicStockDelta`, optional lots, and `stock_movements`. Isolated rollback suite 18/18. GO BOX business rows remain zero. | Keep Confirm Stock In as the only write. Do not create stock on product save. | `npm run test:products-first-stock`; new product appears in Quick Stock In search; first receive creates balance/movement and POS sell lookup | Complete for first-stock discoverability |
| P1-2 | Product supplier/brand text is not persistently linked | ProductForm avoids sending free text as supplier/brand foreign keys | Decide whether to use selectable existing records, create records in a controlled flow, or store sanctioned text fields | Create/edit product then verify linked supplier/brand/report filtering |
| P1-3 | Financial/stock workflows lack current live reconciliation UAT | Live target has zero catalogue, sales, cash, receipts, refunds, and reports | Execute a controlled test matrix for sale, multi-tender, QR, void, refund, exchange, cash close, receipt, PO, partial receipt, and supplier payment | Ledger/balance/report parity signed by owner |
| P1-4 | Permission enforcement has inconsistent defense-in-depth | Inventory actions use store-action + permission checks; products/purchasing/suppliers reviewed use legacy permission check only | Audit all write routes/actions against the intended role-action matrix | Owner/manager/cashier allow/deny matrix, including cross-company attempts |
| P1-5 | Promotion relation inputs need tenant-scope validation audit | Promotion relation rows are recreated from submitted product/category/membership IDs without visible source checks in reviewed snippet | Validate all relation IDs belong to the requesting company before writes | Cross-company negative test with existing foreign IDs |
| P1-6 | Dashboard error fallback can resemble a valid empty business | Dashboard returns zero snapshot with `dataStatus.hasError` after query failure | Confirm the client presents an unambiguous unavailable/error state and alert/log path | Simulated read failure in non-production environment |
| P1-7 | Production Worker hostname was stale (`ego-pos-beta.note-z.workers.dev` NXDOMAIN) | EGO-FIX-10: account workers.dev subdomain is `i-goto`. Target Worker `egopos` at `https://egopos.i-goto.workers.dev`. Legacy `ego-pos-beta` retained as rollback. | Keep `NEXTAUTH_URL` as the Production origin on the Worker. Do not delete `ego-pos-beta` in this phase. | HTTPS login/session smoke on `egopos.i-goto.workers.dev` | In progress in EGO-FIX-10 |
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

1. Freeze new feature work. Original production-audit P0 items are closed. EGO-FIX-05 closed P1-1 first-stock receiving. EGO-FIX-06 closed POS discovery/barcode/cart wiring. EGO-FIX-07 closed isolated checkout/payment/receipt integrity. EGO-FIX-08 closed isolated refund/void/exchange integrity. EGO-FIX-09 closed isolated Reports/Dashboard lifecycle netting. Remaining P1 includes live catalogue UAT, promotions/membership, and deployment DNS.
2. P0-1 lot allocation is fixed. Enable expiry-tracked products only after a live catalogue exists.
3. Next module: Owner live-catalogue checkout UAT, or Promotions/Membership. Do not create Production sales from this phase.
4. Run a written finance/stock/returns test matrix in a disposable test company and confirm role isolation.
5. Repair CI/read-only audit harnesses and establish deployed canary/rollback evidence.
6. Only then consider a limited controlled pilot. Billing, support, backups, integrations, aliases, and imports remain deferred.

## Explicit non-blockers by design

The disabled Super Admin plan/support/integration controls and read-only Product tools are not regressions. They are intentionally marked not connected/coming soon. They become blockers only if they are marketed as operational capabilities or if a pilot requires those functions.
