# EGO POS System Readiness Map

Audit date: 2026-08-28. Status values mean: `VERIFIED SOURCE`, `VERIFIED DB`, `PARTIAL`, `UI ONLY`, `NOT TESTED`, or `BLOCKED`.

## System map

| Route/area | Primary implementation | Data source | Main actions | Status |
| --- | --- | --- | --- | --- |
| Store Access `/login` | `app/(auth)/login/page.tsx`, `lib/auth/options.ts`, `lib/auth/merchant-login.ts` | Users, company_users, roles | Credentials login, membership redirect | VERIFIED SOURCE; EGO-FIX-04 local HTTP/browser smoke PASS |
| Super Admin `/super-admin` | Route guards, `lib/admin/session.ts`, `features/igo-admin/admin-data.ts` | Super admin/platform/company tables | Login, store provisioning, data review | VERIFIED DB; one active Super Admin after EGO-FIX-01; EGO-FIX-04 local login/session smoke PASS |
| Dashboard | `features/dashboard/dashboard-service.ts` | Same `netReportLifecycle` / `getPrismaReportsSnapshot` as Reports | Read, date range, close-day | VERIFIED SOURCE; EGO-FIX-09 isolated dash↔reports 45/45; empty GO BOX shows zeros |
| Products | `features/products/**` | Products, units, categories | CRUD, archive/delete, category actions | REAL CRUD; EGO-FIX-05 isolated matrix 18/18; images/aliases still deferred |
| Inventory | `features/inventory/**` | Balances, lots, movements, warehouses | Stock-in, adjustment, count | REAL WRITE; EGO-FIX-05 first-stock catalogue lookup on Quick Stock In / Stock In |
| Quick Stock In | `quick-stock-in-form.tsx` | Inventory snapshot + catalogue | Search, preview, explicit confirm | WORKING; zero-stock products are searchable; Confirm Stock In still required |
| POS discovery/cart | `features/pos/pos-cart.ts`, `pos-page-client.tsx`, `prisma-repository.ts` | Prisma products + warehouse balances | Search, scan, add, qty, remove | VERIFIED SOURCE; EGO-FIX-06 isolated 24/24; `/pos` HTTP smoke LOADS |
| POS checkout/payment/receipt | `completeSaleAction`, `writeCompletePrismaSale`, `checkout-receipt.ts` | Sales, payments, lots, movements, derived cash-session totals | Complete sale, tender, print, Recent Sales | VERIFIED SOURCE; EGO-FIX-07 isolated 28/28; `/pos` HTTP smoke LOADS; Production write smoke not run |
| POS refund/void/exchange | `writeReturnPrismaSale`, `writeRefundPrismaSale`, `writeVoidPrismaSale`, `writeExchangePrismaSale` | Refund/RefundItem/RefundExchangeItem, payments, lots, movements, derived cash-session totals | Partial/full refund, void, exchange, reprint, Recent Sales lifecycle | VERIFIED SOURCE; EGO-FIX-08 isolated 40/40; Production post-sale writes not run |
| Customers/membership | `features/customers/**`, `features/membership-levels/**` | Customers, payments, loyalty | CRUD, payment, points/membership | PARTIAL; no lifecycle UAT |
| Promotions | `features/promotions/**` | Promotions and rules | CRUD, POS server policy | PARTIAL; needs relation scoping/analytics UAT |
| Purchasing/receiving | `features/purchasing/**` | Purchases, receipts, payables, lots | PO, receive, supplier payment | PARTIAL; accounting UAT needed |
| Suppliers/payables | `features/suppliers/**`, purchasing repository | Suppliers/payables/payments | CRUD, payment | PARTIAL |
| Reports | `getPrismaReportsSnapshot`, `netReportLifecycle` | Sales/refunds/exchanges netted against persisted lifecycle; inventory from balances | Hub KPIs, sales/products/inventory/customers/purchasing pages | VERIFIED SOURCE; EGO-FIX-09 isolated 45/45; export/schedule/catalog shells still DEMO/NOT IMPLEMENTED; Promotions/Membership report pages DEPENDENT |
| Settings | `features/settings/**` | Company/branch settings | Save/manage settings | PARTIAL; persistence/permission UAT needed |
| Feature Control | `components/igo-admin/ego-pos-center.tsx` | Static configuration | Navigation only | UI ONLY - entitlement writes disabled |
| Subscriptions | Same Super Admin surface | Subscription read model | Navigation only | UI ONLY - billing writes disabled |
| Support Center | Same Super Admin surface | Static zero-state | Navigation only | UI ONLY - ticket/upload/notification disabled |
| Integrations/Backup/System Health | Same Super Admin surface | Safe status rows | Navigation only | UI ONLY - no provider/backup/health action backend |

## Verified source-of-truth rules

| Concern | Rule | Result |
| --- | --- | --- |
| Demo mode | Production resolves demo mode false and fails unsafe production demo configuration | VERIFIED by 15 passing demo-guard checks |
| Tenant data | Prisma repositories take tenant context and common writes use tenant transaction/audit wrapper | VERIFIED SOURCE |
| Store entry | Active company membership and access flags are required | VERIFIED SOURCE |
| POS totals | Server re-fetches data, recomputes totals, validates payment, ignores unsafe client totals | VERIFIED SOURCE |
| Stock mutation | POS and receiving use atomic balance changes and movement records | VERIFIED SOURCE |
| Lot mutation | Receiving creates/updates lots; POS sale/refund/void/exchange consume and restore lots FEFO with allocation provenance | FIXED in EGO-FIX-03; isolated fixtures passed |
| Static status pages | Disabled UI is labelled as not connected/coming soon | VERIFIED SOURCE |

## Current verified database map

| Data group | Current target state |
| --- | --- |
| Business/store | GO BOX Mini Mart, store code 0001, active, one main branch and one warehouse |
| Store user | One active Owner `gobox`, POS and Back Office access enabled |
| Plans | One plan and one subscription |
| Catalogue/inventory | Zero products, units, categories, balances, lots, movements |
| Commerce | Zero sales, payments, cash sessions, customers, promotions |
| Purchasing | Zero suppliers, POs, receipts, payables |
| Audit/activity | Zero audit and store activity rows |
| Platform accounts | One Super Admin; zero setup-admin rows |

## MVP-now versus later

### Intended MVP capability, pending UAT

* Store login and tenant-aware navigation.
* Product/category CRUD with units and barcode validation.
* Explicit stock-in, adjustments/count, purchases/receipts/payables.
* POS sales, payment capture, held bills, return/refund/exchange, cash sessions.
* Customers, memberships, loyalty, promotions, dashboard, reports, settings.
* Super Admin store provisioning, with the Production Super Admin bootstrap now in place.

### Clearly deferred or read-only

* Product barcode aliases, product image management, import/export, label printing, barcode generation.
* Initial stock/lot from Create Product is preview/navigation only.
* Subscription billing, feature entitlement editing, offline backend, support tickets, uploads, notifications, integration credentials, backups/restores, advanced health checks.
* Templates other than Mini Mart.
* Inventory transfer workflow is schema-visible but not verified as an end-user implementation.

## Release decision

| Stage | Decision |
| --- | --- |
| Internal owner UAT | Allowed on local `http://localhost:3000` (`npm run dev:uat`); original audit P0 count is 0 |
| Controlled pilot | Not yet allowed |
| Real-store production | Not allowed |

Reason: a production target without catalogue, inventory, and Manager/Cashier role tests cannot safely process real Mini Mart operations. Super Admin bootstrap, Production migration targeting, POS inventory-lot reconciliation, local browser smoke, Products first-stock, POS discovery/cart, isolated checkout/payment/receipt, isolated refund/void/exchange, and isolated Reports/Dashboard lifecycle netting are in place. Promotions, membership, and live catalogue UAT are not independently verified. Owner-created live catalogue is still required before real-store use.
