# EGO-UAT-10 Owner Live Catalogue UAT

Date: 2026-08-29 (Asia/Vientiane)  
Phase: OWNER LIVE CATALOGUE END-TO-END UAT  
Baseline commit: `3f61019 Reconcile reports with POS transaction lifecycle` (`main` = `origin/main`)

## Decision

**OWNER PRODUCT INPUT REQUIRED**

Read-only preparation completed. No owner-supplied Product name, SKU, barcode, cost, selling price, unit, initial quantity, or warehouse was provided in this session. No catalogue rows were invented. No Sale was attempted.

## Environment

| Item | Value |
| --- | --- |
| App | `npm run dev:uat` → `http://localhost:3000` |
| Node | v22.19.0 |
| Next.js | 16.2.12 |
| Store | GO BOX Mini Mart, store code `0001` |
| Owner login | username `gobox` (password not recorded) |
| Demo mode | `IGO_DEMO_MODE=false` |
| Database target | **PRODUCTION** (`ieutdqnlfiiaawctapor`, host `aws-0-ap-southeast-1.pooler.supabase.com`) |
| GoFLO / old PRO refs | not used |

A stale UAT process from EGO-FIX-09/09A was still bound to port 3000 after `next build` / Prisma generate. Authenticated pages then returned HTTP 500 (`econnrefused` / connection terminated). That process was stopped and UAT was restarted. After restart, owner pages loaded. This is an environment recovery, not a product-code change.

## Target confirmation (read-only)

GO BOX Mini Mart `0001` counts at UAT start:

| Entity | Count |
| --- | --- |
| Products | 0 |
| Inventory balances | 0 |
| Inventory lots | 0 |
| Stock movements | 0 |
| Sales | 0 |
| Refunds | 0 |
| Customers | 0 |
| Promotions | 0 |

Owner user `gobox` is `active`. Unexpected demo/sample catalogue: **NONE**.

## Owner actions completed

| Step | Result |
| --- | --- |
| Git baseline | `main` synchronized; only preserved backup files untracked |
| UAT server | Restarted; `http://localhost:3000` Ready |
| Database target | PRODUCTION confirmed before any write |
| Owner login `/login` → Dashboard | PASS (NextAuth credentials, session cookie) |
| Dashboard | 200 EMPTY STATE |
| Products | 200 EMPTY STATE |
| Inventory | 200 LOADS |
| POS | 200 LOADS |
| Reports landing | 200 EMPTY STATE |
| Reports sales/products/inventory/customers/purchasing | 200 LOADS |
| Create Product | **NOT RUN** — owner values missing |
| First Stock | **NOT RUN** |
| Cart / Checkout / Sale | **NOT RUN** — would also require owner Sale approval |
| Receipt / Recent Sales | **NOT RUN** |
| Dashboard/Reports vs live Sale | **NOT RUN** |
| Post-sale refund/void/exchange | **SKIPPED** |

Authenticated HTTP smoke after UAT restart: 30/30 PASS, critical network errors 0. Dashboard and Reports empty states are consistent with zero GO BOX transactions.

Physical barcode scanner: **NOT TESTED**  
Physical printer: **NOT TESTED**

## Product / stock / POS / checkout / receipt / reports

Not executed. Cursor did not invent commercial Product values.

Required owner input before resume (1–3 real GO BOX Products):

* Product name
* SKU if used
* Barcode
* Cost price
* Selling price
* Unit
* Initial stock quantity
* Warehouse (or confirm default GO BOX warehouse)
* Explicit approval to persist those Products
* Separate explicit approval before any live Sale

## Post-sale owner test

**SKIPPED** — no live Sale exists; no owner approval for refund/void/exchange.

## Physical hardware tests

Not applicable in this preparation pass.

## Issues discovered

| ID | Page / action | Expected | Actual | Severity | Layer |
| --- | --- | --- | --- | --- | --- |
| UAT10-E1 | Stale `dev:uat` after production `next build` | Authenticated pages load | HTTP 500 (`econnrefused` / connection terminated) until UAT restart | P2 (environment) | Environment |
| UAT10-G1 | Create first real Product | Owner-entered catalogue | No owner Product values supplied | Gate — not a defect | Process |

No money/stock integrity defect was observed because no live writes occurred.

New P0: 0  
New P1: 0  
New P2/P3: 1 environment (recovered by restart)

## Product code

Unchanged during this phase. Temporary read-only count helper was deleted and not committed.

Preserved untracked files left untouched:

* `PRODUCTS_DIRTY_WORK_BACKUP.patch`
* `SUPER_ADMIN_TEST_DATA_RESET_BACKUP_REPORT.md`

## Readiness

**OWNER UAT CONTINUE**

Not Controlled Pilot. Not Production-ready. One live Sale was not performed.

## Recommended next fix / phase

Resume **EGO-UAT-10** after the owner supplies 1–3 real GO BOX Product values and approvals. Do not start Promotions or Membership. Do not seed demo catalogue. Do not run `scripts/go-box-catalog-migration.ts` unless the owner explicitly approves that source file.
