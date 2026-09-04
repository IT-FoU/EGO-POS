# EGO POS Mini Mart — Feature / Data Matrix (Offline-First Phase 0)

> **Status:** Phase 0 documentation only. **No offline code, schema migration, deployment, or feature flag is introduced by this document.** It is a read-only audit of the current source used to plan Offline-first work per `offline-first-requirements.md` and `offline-first-tasks.md`.

## 1. Purpose and method

This matrix maps every **Mini Mart store** route/feature to its current data reads, data writes, backing models, API/server-action boundaries, dependencies, and the planned **offline mode** and **conflict strategy**. It is the Phase 0 baseline that later phases refactor behind shared client-side data-access interfaces.

Method: read-only static analysis of `app/`, `features/`, `lib/`, `prisma/schema.prisma`, `middleware.ts`, `next.config.ts`, and `wrangler.jsonc`. No production code was changed. Findings were cross-checked across four module clusters (POS/cash/post-sale, products/inventory/purchasing/suppliers, customers/loyalty/promotions, dashboard/reports/settings) plus shared auth/permission plumbing.

## 2. Baseline confirmation

| Item | Finding |
|---|---|
| Branch | `cursor/offline-first-phase-0-71b5` (off `main`) |
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

These are gated separately (see §8) and are **out of scope** for offline. No offline cache rule may expose them.

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
| Local stock guard | client | `pos-cart.ts` (`maxSellQty`, `cartExceedsStock`) | n/a | `InventoryBalance` | `full` | Enforce **terminal stock allocation** (see §10), not a stale shared number |
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
| `/customers/[id]` detail | SSR `getCustomerDetail` | **SA** `updateCustomerAction`, `createCustomerPaymentAction` (`adjustCustomerPointsAction` exists, unwired) | `Customer`, `CustomerPayment`, `Sale`, `LoyaltyPointLedger`, `MembershipLevel` | `full` (profile/payment); | Field-level merge, conflict on overlapping protected fields |
| `/membership-levels` | SSR `getMembershipLevels` | **SA** `create/update/archive/deleteMembershipLevelAction` | `MembershipLevel`, `Customer`(count), `PromotionMembershipLevel`(count) | `read-only` offline / `full` online | Base-version; archive `isActive:false`; delete→tombstone if unreferenced |
| Loyalty earning | server at checkout (`writeCompletePrismaSale`→`applyLoyaltyLedger`) | ledger event | `LoyaltyPointLedger`, `Customer` | `full` | Idempotent ledger event tied to sale/operation id (`assertNoDuplicateLedgerEntry`) |
| Loyalty redemption | server `calculateLoyaltyRedemption` (row lock) | ledger event | `LoyaltyPointLedger`, `Customer` | `limited` | Requires **server-issued offline redemption allowance** (see §10); block redemption when no allowance; never double-spend |
| `/promotions` list/new/[id]/edit | SSR `getPromotionsSnapshot`/`getPromotionDetail` | **SA** `create/update/archivePromotionAction` | `Promotion`, `PromotionProduct`, `PromotionCategory`, `PromotionMembershipLevel`, `PromotionUsage` | `read-only` offline / `full` online | Versioned snapshot **must be added** (none today); editing terminal uses own version only after effective date; not distributed until synced |
| Promotion evaluation at checkout | pure `promotion-checkout.ts` (client preview + server authoritative) | `recordPromotionUsage` (server) | `Promotion`, `PromotionUsage` | `full` | Record promotion id+version+inputs+result on sale; server never silently recomputes total |
| `/promotions/{calendar,analytics,stack-rules,integration-map}` | SSR / static | none | `Promotion` | `read-only` / `online-only` (analytics/static) | — |

### 6.5 Dashboard, reports, settings, QR payments, activity logs

| Route / feature | Reads (how) | Writes (how) | Key models | Offline mode | Conflict strategy |
|---|---|---|---|---|---|
| `/dashboard` | SSR `getMiniMartDashboardCriticalSnapshot` + streamed secondary; raw-SQL KPIs | none | `Sale`, `SaleItem`, `SalePayment`, `Refund*`, `CashSession`, `InventoryBalance`, `InventoryLot`, `Customer`, `SupplierPayable`, `Product`, `LoyaltyPointLedger` | `read-only` (label "this terminal / last synced") | Never claim store-wide real-time totals when other devices have queued work |
| `/reports` + sub-reports | SSR `getReportsPageData`/`getReportsSnapshot`; filters via `router.push`+`RR` (also `GET /api/reports`, unused by UI) | none | `Sale`, `SaleItem`, `Refund`, `SalePayment`, `Purchase`, `SupplierPayable`, `Customer`, `Product`, `InventoryBalance`, `InventoryLot`, `Supplier`, `Category`, `User` | `read-only` (bounded local history) | Coverage-labelled; export from local history only |
| `/settings` (company/receipt/tax/currency/loyalty) | SSR `getPrismaSettings` (also `GET/PATCH /api/settings`, unused by UI) | **SA** `updateSettingsAction` | `Company`, `CompanySetting` | `read-only` offline / `full` online (queued w/ base version) | Base-version conflict; visibly pending until synced |
| QR payment banks/accounts | SSR `getQrPaymentSettingsSnapshot`, `getPrismaPosQrBanks` | **SA** `save/archive/deleteQrPaymentBankAction`, account actions | `QrPaymentBank`, `QrPaymentAccount`, `Branch` | `read-only` offline / `full` online; display cache in **LS** | Base-version; catalogue cached to LS for Customer Display |
| Customer Display settings / company logo / receipt-print-mode | **LS** only | **LS** only (`writeCustomerDisplaySettingsToStorage`, `writeCompanyLogoUrl`, `writeReceiptPrintModePreference`) | none (browser-local) | `full` | Client-only prefs; note: `receiptPrintMode` and logo are **not persisted to Postgres today** (gap) |
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
| `features/loyalty/loyalty-service.ts` | earn/redeem/tier logic — **server-only today**; redemption/earn math must be extracted into a shared pure calculator for offline preview while cloud stays authoritative |

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

## 9. Existing identity, terminal and tenant context

| Concept | Source today | Offline implication |
|---|---|---|
| Tenant scope | JWT session → `tenantFromSession()` (`companyId`, `userId`, `branchId?`, `warehouseId?`); `resolveTenantScope()` validates branch/warehouse | Local DB namespace per `companyId+branchId+terminalId`; enforce isolation |
| Terminal identity | `CompanyUser.assignedTerminal` (default `"POS-01"`) copied into JWT; `TERMINAL_OPTIONS` static list; POS policy `createPosPermissionPolicyFromDatabase` | **Not** a registered device. New `deviceId` + terminal registration/revocation required (requirements §5.3, §10) |
| `PosDevice` model | Exists (`id, companyId, branchId, deviceName, deviceType, serialNumber, isActive`) but is **not** a registered offline terminal with policy/cursor/lease | May be extended or superseded by `TerminalDevice`; do not assume it covers offline needs |
| Permissions | Two layers: static `STORE_PERMISSION_MATRIX` (UI/API store actions) + DB `Permission.key` rows (`assertPermission`) | Cache read-only policy snapshot + version + last security-sync timestamp; enforce grace expiry |
| Approvals | `ApprovalRule` + `approval-engine.ts` (server) | Cache approval policy read-only; offline actions create pending commands using cached policy |
| Auth enforcement | `middleware.ts` applies `withAuth` only to `/dashboard/*`; other store routes rely on layout `requireSession()`; admin cookie gates `/super-admin`, `/igo-admin` | Service worker/nav-fallback must not bypass auth or cache authenticated HTML unsafely |

## 10. Cloud schema & sync-API additions required (planned, not implemented)

Per requirements §10 (later phases, via Prisma migration + review; **no migration in Phase 0**):

- Models: `TerminalDevice` (registration/state/revocation), `OfflineSyncCursor` (per device/store), `OfflineOperation` (unique `companyId + operationId`, status, actor/device metadata, result/error code), `TerminalReceiptRange` (stable receipt reference allocation), `TerminalStockAllocation` (offline sellable lease per product/unit/lot), `OfflineLoyaltyAllowance` (member/terminal redemption cap+expiry), optional conflict/repair records.
- Sync API surface: device registration/activation + policy refresh; resumable bootstrap snapshot; cursor delta pull (versioned, tombstoned, ordered); batched idempotent command push (per-command result); sync diagnostics/status; conflict-resolution actions for Owner/Manager. All versioned, schema-validated, tenant-scoped, authorized.
- Inventory safety: server-issued terminal sellable allocations; a terminal may sell only `allocated − local unsynced consumption`. GO BOX initial rollout = single-terminal gets the branch's approved allocation; design must already prevent multi-terminal oversell.
- Receipt identity: server-reserved receipt-number range / terminal-prefixed sequence, preserved on sync; receipt shows `Pending sync` when printed offline.

## 11. Conflict-policy summary (from requirements §6.4, mapped to this codebase)

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

## 12. Recovery boundaries and guardrails (documented per Phase 0 task)

- No clearing of the local queue/DB while unsynced commands exist; device-data removal requires online clean sync/export + owner confirmation.
- No automatic reseeding; "empty list" never means "seed defaults" (existing code already uses explicit snapshots, not seed-on-empty).
- No destructive local-store migration: failed local migrations must preserve the old DB and surface a recovery state.
- No user-visible false-success: distinguish `synced` / `syncing` / `offline_queued` / `needs_attention` / `blocked` (never imply cloud confirmation while queued).
- Feature flag (design, default **disabled**): company + branch + terminal scoped, with read-only diagnostics available even when the write flag is off. Not implemented in Phase 0.

## 13. Read-only checks performed (Phase 0)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` (`tsc --noEmit`) | **PASS** (exit 0) |
| Production build | `npm run build` (`next build`) | **PASS** (exit 0) only after exporting `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` to the local Postgres URL. Without it, `next build` fails with `no local hyperdrive connection string` (a pre-existing local build-env requirement; `npm run dev` sets this var automatically via `scripts/dev-local.cjs`, but `next build` does not). |

No tests were modified and no runtime/production action was taken. Hardware/browser/device checks (POS computer, printer, scanner, customer monitor, Android, iPhone/PWA) are **WAITING** — not applicable in Phase 0 and never claimed as PASS without physical testing.

## 14. Blockers and open questions (for later phases)

1. **Promotion versioning does not exist** — checkout uses in-place `Promotion` edits with `allowStacking:false`; offline requires a versioned promotion snapshot recorded on each sale (schema/logic addition).
2. **Loyalty logic is server-only** — `loyalty-service.ts` must have its pure earn/redeem math extracted for offline preview while cloud stays authoritative; redemption needs a new server-issued allowance model.
3. **Terminal is not a registered device** — `CompanyUser.assignedTerminal` / `PosDevice` are insufficient; a real device registration/revocation + policy cursor is required.
4. **Some store prefs are browser-local only** — `receiptPrintMode`, company logo, and customer-display appearance are not persisted to Postgres; offline durability/tenancy needs a decision.
5. **Two write patterns** (Server Actions for back office, `/api/pos` for POS) — the offline layer must unify behind repositories; parallel REST routes exist for back-office entities and can be reused for sync.
6. **Stock count rejects lot-tracked products today** — offline count needs a lot-aware workflow or an explicit block.
7. **Mixed placeholder UI** — several promotion/report/customer modals are non-functional placeholders; offline scope should target real flows only.
8. **Middleware auth scope** — only `/dashboard/*` uses `withAuth`; service-worker/navigation-fallback design must not weaken auth for other store routes or cache authenticated HTML unsafely.
