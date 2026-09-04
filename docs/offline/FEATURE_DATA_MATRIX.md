# EGO POS Mini Mart — Feature / Data Matrix (Offline-First Phase 0)

> **Status:** Phase 0 documentation only. **No offline code, schema migration, deployment, or feature flag is introduced by this document.** It is a read-only audit of the current source used to plan Offline-first work per `offline-first-requirements.md` and `offline-first-tasks.md`.

## 1. Purpose and method

This matrix maps every **Mini Mart store** route/feature to its current data reads, data writes, backing models, API/server-action boundaries, dependencies, and the planned **offline mode** and **conflict strategy**. It is the Phase 0 baseline that later phases refactor behind shared client-side data-access interfaces.

Method: read-only static analysis of `app/`, `features/`, `lib/`, `prisma/schema.prisma`, `middleware.ts`, `next.config.ts`, and `wrangler.jsonc`. No production code was changed. Findings were cross-checked across four module clusters (POS/cash/post-sale, products/inventory/purchasing/suppliers, customers/loyalty/promotions, dashboard/reports/settings) plus shared auth/permission plumbing.

## 2. Baseline confirmation

| Item | Finding |
|---|---|
| Branch | `cursor/offline-first-phase-0-71b5` |
| PR base / compare | base `feature/offline-first-mini-mart` ← compare `cursor/offline-first-phase-0-71b5` (never `main`) |
| Base commit | `a2b0d46` (`feat: polish customer display experience`) |
| Framework | Next.js **16.2.12** App Router, React **19.2.7**, TypeScript |
| Deploy target | Cloudflare Workers via OpenNext (`@opennextjs/cloudflare` 1.20.2, `wrangler` 4.126.0, `open-next.config.ts`, `wrangler.jsonc`) |
| Persistence | PostgreSQL via Prisma **7.8.0** (`@prisma/adapter-pg`, Cloudflare Hyperdrive binding `HYPERDRIVE`) |
| POS initial data | Server-loaded snapshot: `features/pos/pos-service.ts` → `getPrismaPosSnapshot()`; rendered by `features/pos/components/pos-page-client.tsx` |
| POS checkout | **Server Action** `completeSaleAction` (`features/pos/actions.ts`) → `completePrismaSale` → `writeCompletePrismaSale` (`features/pos/prisma-repository.ts`) |
| Cash/held/post-sale writes | Client `fetch()` → `/api/pos/...` routes |
| Back-office writes | Predominantly **Server Actions** in `features/*/actions.ts` (products, inventory, purchasing, suppliers, customers, membership, promotions, settings) |
| Existing PWA manifest | **None** (only `public/_headers`) |
| Existing service worker | **None** (no `manifest`, `serviceWorker`, `workbox`, `serwist`, `next-pwa` references) |
| Existing IndexedDB / Dexie / idb | **None** |
| Existing offline queue / outbox / sync engine | **None** (the only `outbox` match is `components/igo-admin/ego-pos-center.tsx`, an excluded IGO-Admin surface) |
| Existing connectivity awareness | **None** (`navigator.onLine`, `online`/`offline` events not used anywhere) |
| Existing browser storage | `localStorage` only, via `lib/demo/storage.ts` + `lib/demo/storage-keys.ts` — used for **demo data**, Customer Display state/settings, company logo, locale, theme, receipt-print preference. Per requirements §3, this **must not** be treated as the production offline database. |
| Offline cloud models present | **None** (`TerminalDevice`, `OfflineOperation`, `OfflineSyncCursor`, `TerminalReceiptRange`, `TerminalStockAllocation`, `OfflineLoyaltyAllowance` do not exist). An unrelated `PosDevice` model exists (see §9). |

This confirms the requirements' assumption that no production offline runtime exists yet and that the current production path must be preserved and refactored behind interfaces.

## 3. Scope boundary

### 3.1 Included — Mini Mart store application

Route group `app/(dashboard)/**` plus `app/(dashboard)/pos` and the standalone `app/customer-display/page.tsx`, and their supporting `/api/pos/**`, `/api/products/**`, `/api/inventory/**`, `/api/purchasing/**`, `/api/suppliers/**`, `/api/customers/**`, `/api/membership-levels/**`, `/api/promotions/**`, `/api/reports`, `/api/settings`, `/api/approvals/**`, `/api/store/activity-logs` endpoints and the corresponding `features/*` modules.

### 3.2 Excluded — platform administration (remains online-only, never cached as an offline admin surface)

| Excluded surface | Files |
|---|---|
| Super Admin | `app/(super-admin)/**` (22 files), `app/api/super-admin/**` |
| EGO Admin | `app/(ego-admin)/**` (3 files), `app/api/ego-admin/**` |
| IGO Admin | `app/(igo-admin)/**` (7 files), `app/api/igo-admin/**` |
| Platform provisioning | `app/(platform)/**` (5 files) — business/store creation, plan/template setup |
| Plans / subscriptions / platform users / platform audit / platform settings / cross-store analytics | `SuperAdmin`, `SetupAdmin`, `Plan`, `SaaSSubscription`, `PlatformSetting`, `PlatformAuditLog*`, `Backup`, `CompanyAccessLog` models and their routes |

These are gated separately (see §10) and are **out of scope** for offline. No offline cache rule may expose them.

## 4. Legend

**Offline mode** (planning classification for each feature):

| Mode | Meaning |
|---|---|
| `full` | Works entirely offline: local read + local write committed atomically to local DB + outbox, later synced. |
| `limited` | Works offline with a safety restriction that requires a live cloud confirmation for part of the flow (e.g. loyalty redemption allowance, QR/bank verification, manager approval of a not-cached policy). |
| `read-only` | Readable offline from the cached snapshot; edits require online. |
| `online-only` | Not available offline; must not be cached as an offline surface. |

**Data-access mechanism** abbreviations: `SSR` = server component Prisma read; `SA` = Server Action; `API` = client `fetch()` to `/api/...`; `LS` = `localStorage`; `RR` = `router.refresh()` re-runs SSR.

**Runtime status vocabulary** (`OfflineFeatureStatus`, to be introduced in Phase 0/1 as a single TypeScript union — not yet in code): `online`, `syncing`, `offline_ready`, `offline_queued`, `needs_attention`, `blocked`, `not_available`.

## 5. Current data-access architecture (summary)

1. **Reads** are almost always SSR: `requireSession()` → `tenantFromSession()` → `features/*/*-service.ts` → `features/*/prisma-repository.ts` (tenant-scoped Prisma). Props are passed once into `"use client"` components; there is **no client-side cache layer**.
2. **Back-office writes** use **Server Actions** (`features/*/actions.ts`) wrapped by `withTenantTransaction()`, which writes an `AuditLog` row per mutation, then the client calls `router.refresh()` to re-SSR.
3. **POS/cash/held/post-sale writes** use client `fetch()` to `/api/pos/**` (except checkout, which is the `completeSaleAction` Server Action). Parallel REST routes exist for most back-office entities (`/api/products`, `/api/inventory/*`, etc.) but the back-office UI currently uses Server Actions, not those routes.
4. **Business rules** are authoritative on the server (`completePrismaSale`, `loyalty-service.ts`, `promotion-checkout.ts` server paths, `stock-concurrency.ts`). Some pure calculators are already reusable client-side (see §7).
5. **Tenant/branch/warehouse/terminal context** comes from the NextAuth JWT session (see §9).

## 6. Feature / Data Matrix

### 6.1 POS, checkout and Customer Display

| Route / feature | Type | Reads (how) | Writes (how) | Key models | Offline mode | Conflict strategy |
|---|---|---|---|---|---|---|
| `/pos` checkout (`app/(dashboard)/pos/page.tsx` → `PosPageClient`) | SC → client | `getPosSnapshot()`→`getPrismaPosSnapshot` (products+stock, settings, customers+membership, active promotions, membership levels, open cash session, QR banks) **SSR**; recent sales/held bills/current session via **API** after hydration | Complete sale: **SA** `completeSaleAction`→`writeCompletePrismaSale` | `Sale`, `SaleItem`, `SalePayment`, `Product`, `ProductUnit`, `InventoryBalance`, `StockMovement`, `InventoryLot`, `InventoryLotAllocation`, `Promotion`, `PromotionUsage`, `Customer`, `LoyaltyPointLedger`, `CashSession`, `CompanySetting` | `full` (cash); `limited` (QR/transfer/card → cashier-confirmed/pending verification) | Immutable sale command keyed by `operationId`; idempotent cloud accept; never duplicate/renumber; server re-validates price/tax/promotion/loyalty/stock |
| Cart/units/tax/discount/promotion preview | client | in-memory from POS snapshot | n/a (preview) | — | `full` | Shared pure calc (see §7); server recomputes authoritatively |
| Barcode search / product filter / category browse | client | POS snapshot (in-memory) | n/a | `Product` | `full` | Local IndexedDB lookup replaces in-memory once adapters land |
| Local stock guard | client | `pos-cart.ts` (`maxSellQty`, `cartExceedsStock`) | n/a | `InventoryBalance` | `full` | Enforce **terminal stock allocation** (see §11), not a stale shared number |
| Customer Display (`/customer-display` → `CustomerDisplayClient`) | SC(thin)→client | **LS** mirror `ego.pos.customerDisplay.state` (800ms poll + `storage` event) + display settings/QR intent | none (display only) | none | `full` | No cloud dependency; keep same-device LS bridge |
| Receipt reprint (POS) | client | `checkout-receipt.ts` snapshot; `/api/pos/sales/[id]/receipt`, `/reprint` **API** | reprint audit **API** | `Sale`, `AuditLog` | `full` (from local immutable receipt snapshot) | Reprint uses immutable local snapshot; never recompute past prices |

### 6.2 Cash sessions, held bills, post-sale (embedded in `/pos`)

| Feature | Reads (how) | Writes (how) | Key models | Offline mode | Conflict strategy |
|---|---|---|---|---|---|
| Cash session open/close, cash in/out, own-shift report | SSR (open session) + **API** `/api/pos/cash-sessions/current`, `/api/pos/own-shift-report` | **API** `/api/pos/cash-sessions/{open,close,cash-in,cash-out}` → `openCashSession`/`closeCashSession`/`recordCashSessionMovement` | `CashSession`, `CashTransaction`, `SalePayment`, `Refund`, `Sale` | `full` | Immutable cash-movement events; stable local session id maps to cloud session; no duplicate open/close; expected-cash via `cash-session-calculator.ts` |
| Sale precondition | server-enforced `assertOpenCashSessionForSale` | n/a | `CashSession` | `full` | Preserve: no local sale without a locally open compatible session |
| Held bills create/resume/cancel | **API** `/api/pos/held-bills` (list) | **API** `POST /api/pos/held-bills`, `/[id]/resume`, `/[id]/cancel` | `HoldBill`, `HoldBillItem` | `full` | Stable local/terminal hold id; single-resume protection (server `updateMany status:"held"`); idempotent sync |
| Recent sales list | **API** `/api/pos/sales?search=` | n/a | `Sale`, `SaleItem`, `SalePayment` | `full` (local incl. pending) | Show `synced`/`pending`/`rejected`; merge local + synced |
| Refund / full refund | **API** `/api/pos/sales/[id]/refund` (may return `pending_approval`) | immutable refund command | `Refund`, `RefundItem`, `StockMovement`, `LoyaltyPointLedger`, `CashSession` | `limited` (needs cached approval policy + original sale) | Server validates original/remaining qty; approval via cached policy; idempotent |
| Partial return / exchange | **API** `/api/pos/sales/lookup`, `/products/lookup`, `/[id]/return`, `/[id]/exchange` | immutable return/exchange command | `Refund`, `RefundItem`, `RefundExchangeItem`, `StockMovement`, `Promotion`, `LoyaltyPointLedger` | `limited` (only if original receipt + remaining qty + cached approval present) | Server authoritative on remaining qty & re-pricing; conflict record on mismatch |
| Void | **API** `/api/pos/sales/[id]/void` | immutable void command | `Sale`, `SalePayment`, `StockMovement`, `LoyaltyPointLedger`, `Promotion` | `limited` (approval policy) | Idempotent reversal; server authoritative |

### 6.3 Products, inventory, purchasing, suppliers

| Route / feature | Reads (how) | Writes (how) | Key models | Offline mode | Conflict strategy |
|---|---|---|---|---|---|
| `/products` list | SSR `getProductListPage`; **SA** `loadProductListAction` (filter/paginate) | **SA** `deleteProductAction` (archive if referenced) | `Product`, `ProductUnit`, `Category`, `InventoryBalance`, `InventoryLot`, `Brand`, `Supplier` | `read-only` → `full` (edits) after adapters | Optimistic base version; soft-delete/tombstone (`status:"deleted"`, `isActive:false`) |
| `/products/new`, `/products/[id]/edit` | SSR `getCategories`, `getProductById` | **SA** `create/update/duplicate/archive/deleteProductAction`, `upsert/deleteCategoryAction` | `Product`, `ProductUnit`, `ProductPriceHistory`, `ProductBarcodeHistory`, `Category` | `full` (with cached permission) | Base-version conflict → owner/manager decision; product/price change must not alter past sale receipt |
| `/products/categories` | SSR `getCategories` | **SA** `upsert/deleteCategoryAction` | `Category` | `full` | Base-version; hard delete guarded (children/products) → tombstone otherwise |
| Barcode lookup (product form) | **API** `GET /api/products/barcode-lookup` (only `fetch` in this cluster) | n/a | `Product` | `full` | Local barcode index; dedup |
| `/inventory` dashboard | SSR `getInventoryListPage`; **SA** `loadInventoryListAction` | none | `InventoryBalance`, `StockMovement`, `Warehouse`, `Product`, `SaleItem` | `read-only` (labelled "this terminal / last synced") | Local balances from allocation + local consumption |
| `/inventory/stock-in`, `/quick-stock-in` | SSR snapshot/catalog | **SA** `stockInAction`→`writeStockIn` | `InventoryBalance`, `InventoryLot`, `StockMovement`, `ProductUnit`, `Product`, `Supplier` | `full` | Immutable inventory event w/ reason/lot/expiry; server validates order/version |
| `/inventory/adjustment` | SSR `getInventorySnapshot` | **SA** `stockAdjustmentAction`→`createStockAdjustment` | `InventoryBalance`, `StockAdjustment`, `StockMovement` | `full` | Immutable event + expected version; conflict flagged, never silent overwrite |
| `/inventory/count` | SSR `getInventorySnapshot` | **SA** `stockCountAction`→`setAtomicStockCount` (sends `expectedSystemQuantity`) | `InventoryBalance`, `StockMovement` | `limited` (lot-tracked products currently rejected: `INVENTORY_LOT_COUNT_UNSUPPORTED`) | Optimistic expected-version; server throws `INVENTORY_CHANGED` on drift → conflict workflow |
| `/purchasing` (list/status) | SSR `getPurchasingSnapshot` | **SA** `updatePurchaseStatusAction` (`assertTransition`) | `Purchase`, `PurchaseItem`, `Supplier`, `SupplierPayable`, `Warehouse` | `full` | Immutable status transition; server validates transition |
| `/purchasing/new` | SSR snapshot | **SA** `createPurchaseOrderAction` | `Purchase`, `PurchaseItem`, `Supplier`, `Product`, `ProductUnit` | `full` | Base-version; preserve source doc ids |
| `/purchasing/receiving` | SSR snapshot | **SA** `receiveGoodsAction`→`receiveGoods` | `GoodsReceipt`, `GoodsReceiptItem`, `InventoryBalance`, `InventoryLot`, `StockMovement`, `Purchase`, `PurchaseItem`, `SupplierPayable`, `Supplier` | `full` | Immutable receipt event w/ line/lot detail; advisory-locked; qty-guarded; server atomic validate |
| `/purchasing/payables` | SSR snapshot | **SA** `createSupplierPaymentAction` | `PurchasePayment`, `SupplierPayable`, `Purchase`, `Supplier` | `full` | Immutable payment event; balance recomputed server-side |
| `/suppliers`, `/suppliers/new`, `/suppliers/[id]` | SSR `getSuppliersSnapshot`/`getSupplierDetail` | **SA** `createSupplierAction`, `updateSupplierAction` (`archiveSupplierAction` exists, not wired) | `Supplier`, `Purchase`, `GoodsReceipt`, `PurchasePayment` | `full` (create/edit); list `read-only` | Base-version field merge; soft delete `status:"inactive"` |

### 6.4 Customers, membership, loyalty, promotions

| Route / feature | Reads (how) | Writes (how) | Key models | Offline mode | Conflict strategy |
|---|---|---|---|---|---|
| `/customers` list | SSR `getCustomersSnapshot` | none (read-only list) | `Customer`, `MembershipLevel`, `LoyaltyPointLedger`, `CustomerPayment`, `Sale`, `CompanySetting` | `read-only` | — |
| `/customers/new` | SSR `levels` | **SA** `createCustomerAction` (member code via advisory lock) | `Customer`, `MembershipLevel` | `full` | Field/version conflict; local id → cloud id |
| `/customers/[id]` detail | SSR `getCustomerDetail` | **SA** `updateCustomerAction`, `createCustomerPaymentAction` (`adjustCustomerPointsAction` exists, unwired) | `Customer`, `CustomerPayment`, `Sale`, `LoyaltyPointLedger`, `MembershipLevel` | `full` (profile/payment) | Field-level merge, conflict on overlapping protected fields |
| `/membership-levels` | SSR `getMembershipLevels` | **SA** `create/update/archive/deleteMembershipLevelAction` | `MembershipLevel`, `Customer`(count), `PromotionMembershipLevel`(count) | `read-only` offline / `full` online | Base-version; archive `isActive:false`; delete→tombstone if unreferenced |
| Loyalty earning | server at checkout (`writeCompletePrismaSale`→`applyLoyaltyLedger`) | ledger event | `LoyaltyPointLedger`, `Customer` | `full` | Idempotent ledger event tied to sale/operation id (`assertNoDuplicateLedgerEntry`) |
| Loyalty redemption | server `calculateLoyaltyRedemption` (row lock) | ledger event | `LoyaltyPointLedger`, `Customer` | `limited` | Requires **server-issued offline redemption allowance** (see §11); block redemption when no allowance; never double-spend |
| `/promotions` list/new/[id]/edit | SSR `getPromotionsSnapshot`/`getPromotionDetail` | **SA** `create/update/archivePromotionAction` | `Promotion`, `PromotionProduct`, `PromotionCategory`, `PromotionMembershipLevel`, `PromotionUsage` | `read-only` offline / `full` online | Versioned snapshot **must be added** (none today); editing terminal uses own version only after effective date; not distributed until synced |
| Promotion evaluation at checkout | pure `promotion-checkout.ts` (client preview + server authoritative) | `recordPromotionUsage` (server) | `Promotion`, `PromotionUsage` | `full` | Record promotion id+version+inputs+result on sale; server never silently recomputes total |
| `/promotions/{calendar,analytics,stack-rules,integration-map}` | SSR / static | none | `Promotion` | `read-only` / `online-only` (see §12) | — |

### 6.5 Dashboard, reports, settings, QR payments, activity logs

| Route / feature | Reads (how) | Writes (how) | Key models | Offline mode | Conflict strategy |
|---|---|---|---|---|---|
| `/dashboard` | SSR `getMiniMartDashboardCriticalSnapshot` + streamed secondary; raw-SQL KPIs | none | `Sale`, `SaleItem`, `SalePayment`, `Refund*`, `CashSession`, `InventoryBalance`, `InventoryLot`, `Customer`, `SupplierPayable`, `Product`, `LoyaltyPointLedger` | `read-only` (label "this terminal / last synced") | Never claim store-wide real-time totals when other devices have queued work |
| `/reports` + sub-reports | SSR `getReportsPageData`/`getReportsSnapshot`; filters via `router.push`+`RR` (also `GET /api/reports`, unused by UI) | none | `Sale`, `SaleItem`, `Refund`, `SalePayment`, `Purchase`, `SupplierPayable`, `Customer`, `Product`, `InventoryBalance`, `InventoryLot`, `Supplier`, `Category`, `User` | `read-only` (bounded local history) | Coverage-labelled; export from local history only |
| `/settings` (company/receipt/tax/currency/loyalty) | SSR `getPrismaSettings` (also `GET/PATCH /api/settings`, unused by UI) | **SA** `updateSettingsAction` | `Company`, `CompanySetting` | `read-only` offline / `full` online (queued w/ base version) | Base-version conflict; visibly pending until synced |
| QR payment banks/accounts | SSR `getQrPaymentSettingsSnapshot`, `getPrismaPosQrBanks` | **SA** `save/archive/deleteQrPaymentBankAction`, account actions | `QrPaymentBank`, `QrPaymentAccount`, `Branch` | `read-only` offline / `full` online; display cache in **LS** | Base-version; catalogue cached to LS for Customer Display |
| Customer Display settings / company logo / receipt-print-mode | **LS** only | **LS** only (`writeCustomerDisplaySettingsToStorage`, `writeCompanyLogoUrl`, `writeReceiptPrintModePreference`) | none (browser-local) | `full` | Client-only prefs; note: `receiptPrintMode` and logo are **not persisted to Postgres today** (see §15) |
| Staff / roles / permissions / approval rules | SSR `getStaffAccessSnapshot` | **SA** `saveStaffMemberAction`, `deactivateStaffMemberAction`, `saveRolePermissionsAction`, `saveApprovalRuleAction`, `decideApprovalAction` | `CompanyUser`, `User`, `UserRole`, `Role`, `RolePermission`, `Permission`, `ApprovalRule`, `Approval` | `online-only` to modify; `read-only` cached policy snapshot offline | Cloud authoritative; no offline editing of controls governing other users/devices |
| Store activity logs | **API** `GET /api/store/activity-logs` | none | `StoreActivityLog` | `read-only` (online pagination) / bounded local | — |

## 7. Shared pure business-rule modules (reuse candidates for online/offline parity)

These already exist as pure/reusable TypeScript and should back both online and offline calculations so results do not drift (requirements §4.7):

| Module | Purpose |
|---|---|
| `features/pos/pos-cart.ts` | `cartSubtotal`, `maxSellQty`, `planPosCartAdd`, `cartExceedsStock` |
| `features/pos/sale-no.ts` | `formatPosSaleNo`, `getFollowingPosSaleNo`, `parsePosSaleNoSequence` |
| `features/pos/checkout-receipt.ts` | `receiptSnapshotFromPersistedSale` |
| `features/pos/cash-movement.ts`, `features/cash-sessions/cash-session-calculator.ts` | expected-cash math, cash-out guard |
| `features/pos/return-allocator.ts` | return amount allocation |
| `features/promotions/promotion-checkout.ts` | `isPromotionScheduleActive`, `isPromotionEligibleForLine`, `calculatePromotionDiscount`, `applyLoadedPromotions` (pure) vs `applyActivePromotions` (server tx) |
| `features/loyalty/loyalty-service.ts` | earn/redeem/tier logic — **server-only today**; redemption/earn math must be extracted into a shared pure calculator for offline preview while cloud stays authoritative (see §15) |

Server-authoritative write cores that must remain the cloud rule layer and must **not** be imported into browser bundles: `features/pos/prisma-repository.ts`, `features/pos/return-repository.ts`, `features/pos/post-sale-repository.ts`, `features/inventory/stock-concurrency.ts`, `features/*/prisma-repository.ts`.

## 8. Direct browser data-access inventory → target adapter

Every place Mini Mart UI currently reaches the network/server directly, with the adapter it must converge on (requirements §5.4).

| Location(s) | Mechanism today | Target adapter |
|---|---|---|
| `features/pos/cash-session-client.ts` (5 `fetch`) | `API` `/api/pos/cash-sessions/*` | `CashSessionRepository` |
| `features/pos/held-bills-client.ts` (4 `fetch`) | `API` `/api/pos/held-bills*` | `HeldBillRepository` |
| `features/pos/post-sale-client.ts` (11 `fetch`) | `API` `/api/pos/sales*`, `/returns*`, `/products/lookup` | `PostSaleRepository` |
| `features/pos/components/own-shift-report-drawer.tsx` | `API` `/api/pos/own-shift-report` | `ReportRepository` (own-shift) |
| `features/pos/components/pos-page-client.tsx` | **SA** `completeSaleAction`; `RR` ×3 | `PosRepository` (+ `OfflineCommandRepository.commitLocalAndQueue`) |
| `features/products/components/product-form.tsx` | `API` `/api/products/barcode-lookup` | `ProductRepository` |
| Products/inventory/purchasing/suppliers client forms | **SA** + `RR` (see §6.3) | `ProductRepository`, `InventoryRepository`, `PurchasingRepository`, `SupplierRepository` |
| Customers/membership/promotions client forms | **SA** + `RR` (see §6.4) | `CustomerRepository`, `PromotionRepository` |
| `features/settings/components/*`, `staff-control-section.tsx` | **SA** + `RR` | `SettingsRepository` (+ online-only policy writes) |
| `features/store-activity/components/store-activity-logs-client.tsx` | `API` `/api/store/activity-logs` | `ReportRepository`/read adapter |
| `features/reports/components/reports-analytics-client.tsx`, `dashboard-date-range-controls.tsx` | `router.push`+`RR` navigation | local-capable read repositories |

**Prisma/server-only imports in client bundles:** none confirmed harmful. `features/pos/post-sale-client.ts` has **dead imports** of `post-sale-repository` symbols it never calls (uses `fetch` only) — these should be removed during Phase 5/6 to avoid pulling server code into the client graph.

## 9. Authentication, tenant, branch, warehouse & terminal/PosDevice context

### 9.1 Authentication

- Provider: NextAuth credentials (`app/api/auth/[...nextauth]/route.ts`, `lib/auth/options.ts`). Session strategy is JWT; `requireSession()` (`lib/auth/session.ts`) is the server gate for every store route.
- Merchant login builds the session user from the database in `lib/auth/options.ts` (`buildSessionUserFromDatabase`, JWT/session callbacks at lines ~110, ~260, ~278); staff login path also present (`staffUser`, line ~145).
- There is **no offline unlock** today. Offline requires a device-local lock credential + cached identity (requirements §5.3) — not implemented.

### 9.2 Tenant / branch / warehouse resolution

| Concept | Source | File |
|---|---|---|
| Tenant scope object `{ companyId, userId, branchId?, warehouseId? }` | `tenantFromSession(session)` | `lib/db/write-context.ts` |
| Branch/warehouse validation & scope | `resolveTenantScope(tenant)` (owner → all branches/warehouses; non-owner → assigned branch + its warehouses; validates provided ids) | `lib/db/tenant-scope.ts` |
| Session fields | `activeCompanyId`, `activeBranchId`, `activeWarehouseId`, `activeCompanyName`, `roles`, `assignedTerminal`, `locale`, `allowPOSAccess`, `allowBackOfficeAccess` | `lib/auth/options.ts` |
| Company switch | `POST /api/auth/select-company` rewrites JWT (branch/warehouse/terminal/roles) | `lib/auth/update-active-company-session.ts` |

**Offline implication:** the local database must be namespaced per `companyId + branchId + terminalId` and every bootstrap/pull/push must re-apply the same tenant + branch scope so one store's cache is never readable by another in the same browser profile.

### 9.3 Terminal / `PosDevice` context (current) vs offline device (required)

| Aspect | Current implementation | Evidence |
|---|---|---|
| Terminal identity | A string `assignedTerminal` on `CompanyUser`, default `"POS-01"`, copied into JWT/session | `lib/auth/options.ts:110,145,260,278`; `features/access-control/prisma-repository.ts:59` (`String(row.assignedTerminal ?? "POS-01")`) |
| Terminal options | Static list `["POS-01","POS-02","POS-03","Back Office"]` in staff settings UI | `features/settings/components/staff-control-section.tsx` |
| POS policy terminal | `createPosPermissionPolicyFromDatabase(... assignedTerminal ?? "POS-01")` | `features/access-control/pos-policy-loader.ts` |
| `PosDevice` model | Exists: `{ id, companyId, branchId, deviceName, deviceType, serialNumber, isActive }`, indexed `(companyId, branchId)`, mapped `pos_devices` | `prisma/schema.prisma:1340` |
| Registration / revocation / policy cursor / lease | **Not present** — `PosDevice` has no registration handshake, revocation state, policy version, sync cursor, receipt range, or stock lease | schema review |

**Constraint:** `PosDevice` and `CompanyUser.assignedTerminal` are **insufficient** as an offline terminal identity. A registered `TerminalDevice` (non-secret `deviceId`, owner/manager activation, revocable state, policy version, sync cursor) is required per requirements §5.3/§10 (see §11 and §13). A browser profile must not be automatically trusted as a terminal.

## 10. Security boundaries: middleware, route protection & service-worker cache rules

### 10.1 Current middleware (`middleware.ts`)

- `withAuth` (NextAuth) is applied **only** to `/dashboard/:path*` (see `dashboardAuth` and the final `if (!pathname.startsWith("/dashboard")) return NextResponse.next()`). Other store routes (`/pos`, `/reports`, `/settings`, `/customers`, …) are **not** protected by middleware; they rely on the `(dashboard)` layout `requireSession()` server gate instead.
- Admin surfaces are cookie-gated in middleware: `/super-admin` and `/igo-admin` require `igo_super_admin_session` (`ADMIN_COOKIE`); login routes are allow-listed.
- Dev-only host canonicalization (`127.0.0.1:3000` → `localhost:3000`) and stripping of `username`/`password` query params on `/login`.
- `config.matcher`: `/login`, `/register`, `/auth`, `/dashboard/:path*`, `/super-admin/:path*`, `/api/super-admin/login`, `/igo-admin/:path*`, `/api/igo-admin/:path*`.

### 10.2 Offline security boundaries (design constraints for later phases)

- **Never cache authenticated server HTML** that could expose another user's/store's data. The service worker must cache only the immutable app shell + hashed static assets (`_next/static/*`, already `immutable` via `public/_headers`) + explicitly approved Mini Mart shell routes.
- **Never cache** any excluded admin surface (§3.2), any `/api/**` response containing secrets/PII, or NextAuth endpoints.
- The navigation fallback that lets an installed PWA open the POS shell offline must not bypass the `requireSession()` / offline-unlock gate: an unauthenticated/locked device shows the lock/login screen, not cached store data.
- Because middleware auth does not cover all store routes, the offline runtime must enforce the offline authorization gate (registered device + unlock + non-expired grace + policy version) in the client shell and re-verify on the server at every sync (requirements §9). Client policy is a temporary gate, never the final authority.
- Local data at rest: minimize cached sensitive fields; device-bound encrypted storage for the lock credential; **do not** cache plaintext passwords, tokens, DB URLs, Hyperdrive/Cloudflare/Supabase secrets, or `.env` values (requirements §9). Browser encryption limits must be documented, not overstated.

## 11. Terminal/device & receipt-number design constraints

### 11.1 Device / terminal (required, not implemented)

- One non-secret persistent `deviceId` generated on first use, registered with the cloud when online; requires assigned terminal or explicit owner/manager activation before offline writes are enabled.
- Revocable device registration with human-readable terminal name; server-side disable/role-change/forced-sign-out applied at next connection before further writes; UI shows last policy sync time.
- Default 7-day offline authorization grace (configurable per company); on expiry, reads remain but new financial/inventory writes are blocked until online reauthorization.
- New cloud records required (Prisma migration in a later phase): `TerminalDevice`, `OfflineSyncCursor` (see §13).

### 11.2 Receipt / document numbers (current vs required)

| Aspect | Current | Evidence |
|---|---|---|
| Sale number issuance/validation | `resolvePosSaleNo(tx, companyId, input.saleNo, prefix)` → reuse client `saleNo` if prefix matches & unused, else `getNextPosSaleNo` scans existing `sale.saleNo` for the prefix | `features/pos/prisma-repository.ts:76,92,115,367` |
| Preview number | SSR `nextSaleNo=""` (display-only); client increments via `getFollowingPosSaleNo` | `features/pos/prisma-repository.ts:217`; `features/pos/sale-no.ts` |
| Receipt number | Server sets `receiptNo: `RCPT-${saleNo}`` on create | `features/pos/prisma-repository.ts:563` |
| Held-bill number | `createHoldReference()` → `HOLD-${Date.now().toString(36)}-${random}`; DB id is a separate UUID used in API paths | `features/pos/held-bills-repository.ts:22,171` |

**Constraint:** the current "scan existing sale numbers for the next value" issuance **cannot** guarantee uniqueness across disconnected terminals. Offline requires a **server-reserved per-terminal receipt-number range** or an approved terminal-prefixed sequence (`TerminalReceiptRange`, §13). The cloud must preserve the printed offline reference on sync and never silently renumber a receipt the customer already holds; offline-printed receipts must show `Pending sync` without implying bank/payment verification.

## 12. Non-functional / placeholder store flows (exact table)

These flows exist in the UI but are placeholders, static, mock, or unwired today. Classification tells later phases whether to implement offline behavior or treat as excluded/out-of-scope. **Evidence lines are from the current source.**

| Route / component | Current behavior | Evidence (file:line) | Offline classification | Excluded or must-implement |
|---|---|---|---|---|
| Promotions → import / export / bulk | Renders `PlaceholderPanel` "UI ready, backend … pending" | `features/promotions/components/promotions-list-client.tsx:264` (+ `PlaceholderPanel` def :481) | `online-only` | Excluded from offline (no backend) |
| Promotions → minimum profit / auto-fix suggestion panels | Static `PlaceholderPanel` copy | `promotions-list-client.tsx:275,287` | `online-only` | Excluded (documentation UI) |
| Promotions list "foundation/final enforcement" note | Static mock/demo note | `promotions-list-client.tsx:254` | n/a (label) | Excluded |
| Promotion form live preview / forecast | Client mock math (`buildLivePosPreview`, forecast), not `promotion-checkout.ts` | `promotion-form.tsx:587` ("mock forecast … before backend"), `:800` ("mock promotion") | `online-only` (preview only) | Excluded from offline; real eval uses shared engine at checkout |
| Promotion detail simulation | Empty placeholder `emptyPromotionSimulation()`; example uses mock product | `promotion-detail-client.tsx:191` ("mock prod…") | `read-only` | Excluded (display) |
| `/promotions/stack-rules` | Hardcoded arrays; "Save Stack Rules" button has no handler; checkout uses `allowStacking:false` | `app/(dashboard)/promotions/stack-rules/page.tsx:52` | `online-only` | Excluded (not persisted/enforced) |
| `/promotions/analytics` | Aggregates SSR data but member/non-member split hardcoded "62%/38%"; chart panels placeholder | `app/(dashboard)/promotions/analytics/page.tsx` | `read-only` (partial) | Implement offline read only for real aggregates; exclude mock panels |
| `/promotions/integration-map` | Static documentation page | `app/(dashboard)/promotions/integration-map/page.tsx` | `online-only` | Excluded |
| Reports → Export / Print / Schedule | `ExportModal` / `ScheduleModal` are UI-only; Print maps to export modal | `features/reports/components/reports-analytics-client.tsx:221,222,234,235,236` | `read-only` (export from local history only) | Implement offline export from bounded local history; schedule excluded |
| `/reports/sales|inventory|products|customers|purchasing` sub-pages | Real SSR pages but not linked from the analytics hub (hub uses in-page modals) | audit of `app/(dashboard)/reports/**` | `read-only` | Implement offline read (bounded history) |
| Customers → Import / Export | Modal shows "CSV and Excel workflow placeholder" | `features/customers/components/customers-list-client.tsx:336` | `online-only` | Excluded (no backend) |
| Customer detail → points adjust | `adjustCustomerPointsAction` + `POST /api/customers/points-adjust` exist but **no UI wires them** | audit (`rg` found no `.tsx` caller) | `limited` | Implement offline only via loyalty allowance (§11.1); currently unwired |
| Customer detail points history "redeem" column | Hardcoded `0` | audit of `customer-detail-client.tsx` | `read-only` | Fix as part of loyalty offline work |
| Suppliers list → Pay / Deactivate | Buttons are placeholders; `archiveSupplierAction` exists but not wired | `features/suppliers/components/suppliers-list-client.tsx` (no mutation handlers); audit | `read-only` (list) | Implement supplier edit offline via `SupplierRepository`; list actions currently unwired |
| Dashboard → `CloseDayPanel` | Implemented component but **not mounted** anywhere | `features/dashboard/components/close-day-panel.tsx` (only self-reference; no `.tsx` importer) | n/a | Excluded until wired |
| `features/*/mock-data.ts` (`reports`, `customers`, `suppliers`, `promotions`) | Mock datasets present but **not imported** by live pages (all use Prisma) | `features/reports/mock-data.ts`, `features/customers/mock-data.ts`, `features/suppliers/mock-data.ts`, `features/promotions/mock-data.ts` | n/a | Excluded (dead/demo data; must not become offline source) |

## 13. Cloud schema & sync-API additions required (planned, not implemented)

Per requirements §10 (later phases, via Prisma migration + review; **no migration in Phase 0**):

- Models: `TerminalDevice` (registration/state/revocation), `OfflineSyncCursor` (per device/store), `OfflineOperation` (unique `companyId + operationId`, status, actor/device metadata, result/error code), `TerminalReceiptRange` (stable receipt reference allocation), `TerminalStockAllocation` (offline sellable lease per product/unit/lot), `OfflineLoyaltyAllowance` (member/terminal redemption cap+expiry), optional conflict/repair records.
- Sync API surface: device registration/activation + policy refresh; resumable bootstrap snapshot; cursor delta pull (versioned, tombstoned, ordered); batched idempotent command push (per-command result); sync diagnostics/status; conflict-resolution actions for Owner/Manager. All versioned, schema-validated, tenant-scoped, authorized.
- Inventory safety: server-issued terminal sellable allocations; a terminal may sell only `allocated − local unsynced consumption`. GO BOX initial rollout = single-terminal gets the branch's approved allocation; design must already prevent multi-terminal oversell.

## 14. Conflict-policy summary (from requirements §6.4, mapped to this codebase)

| Data/action | Offline behavior | Cloud resolution |
|---|---|---|
| Completed sale / cash event | Commit locally + queue immutable command; never alter payload | Idempotent accept or explicit reject; no duplicate sale |
| Price/unit/category/promotion/settings edits | Queue with base version | Apply if version matches; else conflict record → owner/manager decision |
| Inventory sale | Use terminal sellable allocation | Reject with reconciliation; never silently negative |
| Receiving/count/adjustment | Immutable event w/ expected version | Server validates; flags conflicting count/adjustment |
| Customer profile | Field-level change w/ base version | Merge non-overlapping; conflict on protected overlap |
| Loyalty earn / redeem | Earn queued; redeem needs unexpired allowance | Idempotent earn; block offline redeem w/o allowance |
| Held bill | Local terminal scope | Sync by stable id; single resume |
| Refund/return/exchange/void | Only w/ local receipt + remaining qty + cached approval | Server validates original/remaining; conflict flagged |
| Permission/role/security | Read cached snapshot only | Cloud authoritative; no offline edit |

## 15. Blockers and open questions (explicit)

### 15.1 Stock / lot
- **Terminal stock allocation does not exist.** Offline sales currently rely on the SSR snapshot's shared balance; two disconnected terminals could oversell. Requires `TerminalStockAllocation` leases (§13) and local consumption tracking; POS cart guard (`pos-cart.ts`) must enforce `allocated − local consumption`.
- **Stock count rejects lot-tracked products** today (`INVENTORY_LOT_COUNT_UNSUPPORTED` in `features/inventory/prisma-repository.ts` / `stock-concurrency.ts`). Offline count needs a lot-aware workflow or an explicit block.
- **Lot/expiry (FEFO)** consumption (`features/inventory/lot-reconciliation.ts`) must remain traceable in offline commands; adjustments/counts need `expectedSystemQuantity` (already used) preserved in the operation envelope.

### 15.2 Loyalty
- **Redemption is server-only and needs an allowance model.** `calculateLoyaltyRedemption` (`features/loyalty/loyalty-service.ts`, row-locked) cannot run safely offline; a server-issued `OfflineLoyaltyAllowance` (per member/terminal, capped, expiring) is required, and redemption must be **blocked** offline without a valid allowance (no double-spend). Earning is queueable/idempotent (`assertNoDuplicateLedgerEntry`).
- **Loyalty math is not extracted as pure TS**, so an offline preview would risk drifting from the server. Earn/redeem calculators must be extracted into shared pure functions while cloud stays authoritative.
- `adjustCustomerPointsAction` / `POST /api/customers/points-adjust` are unwired in the UI (§12); offline point adjustment is out-of-scope until wired.

### 15.3 Payment
- **QR/transfer/card cannot be cloud-verified offline.** They must be recorded as cashier-confirmed / pending verification per a store policy snapshot, and the receipt/sync status must say so; the system must never fabricate bank confirmation. Cash is fully supported offline.
- **Receipt numbering cannot guarantee cross-terminal uniqueness offline** (§11.2) — needs `TerminalReceiptRange`.

### 15.4 Approval
- **Approval policy is server-evaluated** (`features/approvals/approval-engine.ts`, `ApprovalRule`, `evaluateApprovalRequirement`). Offline refund/return/void must use a **read-only cached approval policy snapshot** and create pending commands; no new privilege or manager approval may be inferred locally. Role/permission/approval **editing stays online-only** because it governs other users/devices.

### 15.5 Architecture / other
- **Two write patterns** (Server Actions for back office vs `/api/pos` for POS) must be unified behind the repositories in §8; parallel REST routes exist for back-office entities and can back sync.
- **Promotion versioning does not exist** (in-place `Promotion` edits, `allowStacking:false`); offline requires a versioned promotion snapshot recorded on each sale.
- **Terminal is not a registered device** (§9.3/§11.1).
- **Some store prefs are browser-local only** (`receiptPrintMode`, company logo, customer-display appearance are not persisted to Postgres) — durability/tenancy decision needed.
- **Middleware auth covers only `/dashboard/*`** (§10.1) — the SW/navigation-fallback design must not weaken auth or cache authenticated HTML unsafely.

## 16. Recovery boundaries and guardrails (documented per Phase 0 task)

- No clearing of the local queue/DB while unsynced commands exist; device-data removal requires online clean sync/export + owner confirmation.
- No automatic reseeding; "empty list" never means "seed defaults" (existing code already uses explicit snapshots, not seed-on-empty).
- No destructive local-store migration: failed local migrations must preserve the old DB and surface a recovery state.
- No user-visible false-success: distinguish `synced` / `syncing` / `offline_queued` / `needs_attention` / `blocked` (never imply cloud confirmation while queued).
- Feature flag (design, default **disabled**): company + branch + terminal scoped, with read-only diagnostics available even when the write flag is off. Not implemented in Phase 0.

## 17. Read-only validation evidence (Phase 0)

Commands were run from `/workspace` on branch `cursor/offline-first-phase-0-71b5`. Exit codes captured via `$?`.

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Type check | `npm run typecheck` (`tsc --noEmit`) | **0 (PASS)** | No type errors emitted. |
| Production build (no Hyperdrive var) | `npm run build` (`next build`) with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` **unset** | **1 (FAIL)** | `unhandledRejection Error: … set the value of the 'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE' variable …`; `telemetryMessage: 'no local hyperdrive connection string'`. Pre-existing local build-env requirement, not caused by Phase 0 docs. `npm run dev` sets this var automatically via `scripts/dev-local.cjs`; `next build` does not. |
| Production build (with Hyperdrive var) | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://postgres:postgres@127.0.0.1:5432/igo_pos?schema=public" npm run build` | **0 (PASS)** | `✓ Compiled successfully in 8.1s`; `✓ Generating static pages (90/90)`; route table printed (145 route lines incl. all `(dashboard)` and excluded admin routes as `ƒ` dynamic); `ƒ Proxy (Middleware)`. |

No tests were modified and no runtime/production action was taken.

## 18. WAITING items (not validated in Phase 0)

- **Physical hardware/device QA — WAITING.** POS computer, barcode scanner, receipt printer, customer-display monitor, Android, and iPhone/PWA were **not** physically tested (Phase 0 is documentation only). Never claimed PASS. Reason: no offline runtime exists yet and no physical devices are attached to this environment.
- **Automated offline/sync tests — WAITING.** No offline runtime exists to test (Phase 1+ deliverable).
- **Live PWA install / offline relaunch — WAITING.** No manifest/service worker exists yet (Phase 2 deliverable).
- **CI regression suite — WAITING.** Existing `test:*` scripts (POS checkout, post-sale, cash, held bill, inventory, reports, Customer Display) require a live database/dev server; not run in Phase 0 because Phase 0 changes are documentation only and must not touch runtime/production. Reason recorded per instruction to mark unrun checks WAITING.
