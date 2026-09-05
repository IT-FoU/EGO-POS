# EGO POS Mini Mart — Offline-First Implementation Tasks

## How Cursor must use this plan

- This is one existing EGO POS application. Do not create an `EGO POS Offline` application, duplicate UI, parallel database, or demo-only offline flow.
- Scope is Mini Mart store modules only. Do not modify `/super-admin`, `/ego-admin`, `/igo-admin`, plans, subscriptions, platform administration or cross-store administration except where a safe server sync boundary requires a shared backend change.
- Preserve current working online functionality. Refactor incrementally behind interfaces and keep compatibility routes until their replacement is tested.
- Use Prisma migrations for cloud schema changes. Never run unreviewed production SQL, delete data, reset a database, seed defaults into an empty live store, or expose secrets.
- Do not mark a task complete just because code compiles. Run the stated test, record actual results, and leave real hardware/browser checks as `WAITING` until physically performed.
- Commit in small, reviewable phases. Do not deploy or enable the feature in production without explicit owner approval.

## Phase 0 — Baseline audit and guardrails

- [ ] Create `docs/offline/FEATURE_DATA_MATRIX.md` from the current source. List every Mini Mart route, feature, model/API/action, data read, data write, offline mode (`full`, `limited`, `read-only`, `online-only`), dependency and conflict strategy.
- [ ] Confirm the source baseline and current branch/commit before edits. Record that the source snapshot contains Next.js App Router, Prisma/PostgreSQL, Cloudflare/OpenNext, server-rendered POS snapshot and direct `/api/pos`/server-action writes.
- [ ] Inventory all direct browser `fetch`, Server Action calls, `router.refresh`, Prisma imports and server-only imports in Mini Mart UI. Record the target adapter for each.
- [ ] Verify no existing production PWA/service-worker/IndexedDB/offline queue implementation exists before adding one.
- [ ] Define a single TypeScript `OfflineFeatureStatus` vocabulary: `online`, `syncing`, `offline_ready`, `offline_queued`, `needs_attention`, `blocked`, `not_available`.
- [ ] Add a feature flag design: company + branch + terminal controlled, default disabled. Include read-only diagnostics even when the write feature flag is off.
- [ ] Document recovery boundaries: no queue clearing with unsynced commands, no automatic reseeding, no destructive local-store migration, and no user-visible false-success state.
- [ ] Run the existing relevant typecheck/build/regression scripts before structural edits when dependencies and safe environment are available. Record actual pass/fail output.

## Phase 1 — Architecture foundations

- [x] Add `features/offline/` with typed modules for device identity, local database, schema migrations, outbox, inbox, sync coordinator, connectivity state, feature flags, diagnostics and common types. <!-- features/offline/** (index.ts barrel); inbox + sync-coordinator are typed skeletons for Phases 4/11. -->
- [x] Select a maintained IndexedDB wrapper compatible with React 19, Next.js 16 and the Cloudflare-deployed client runtime (Dexie or equivalent). Add only the required dependency and lockfile change. <!-- Chose the "equivalent small, tested abstraction" allowed by requirements §5.1: a typed pluggable backend (features/offline/local-db/backend.ts) with IndexedDB (browser) + in-memory (test/SSR) implementations. Rationale: deterministic Node tests with no new dependency, leaner Workers client bundle, and full control of migration-failure semantics. No dependency/lockfile change was needed. -->
- [x] Add a Local Store Database schema version table and migration runner. Failed migrations must preserve the old database and give a recovery/error state rather than erasing data. <!-- features/offline/local-db/{schema,migrations,database}.ts; tested: "failed migration preserves old database and version". -->
- [x] Define isolated local-database names per `companyId + branchId + terminalId`; verify one store cannot read another store’s cache in the same browser profile. <!-- offlineDatabaseName(); tested: "databases are isolated per company+branch+terminal". -->
- [x] Define base local entity fields: stable ID, tenant/branch/warehouse scope, server version, local version, created/updated timestamps, sync status, tombstone and source metadata. <!-- BaseLocalEntity in features/offline/types.ts. -->
- [x] Define a typed `OfflineOperationEnvelope` with UUID operationId, deviceId, terminalId, companyId, branchId, actorUserId, sequence, operation type, payload version, created time, dependencies and payload. <!-- features/offline/operations/envelope.ts + canonical payload hash. -->
- [x] Implement atomic `commitLocalAndQueue`: a local business mutation and its outbox envelope must commit in one IndexedDB transaction or neither must commit. <!-- features/offline/commit.ts; tested atomic write+queue and rollback. -->
- [x] Implement durable operation states: `pending`, `syncing`, `synced`, `retryable`, `blocked`, `rejected`, with attempts, error code, error detail and timestamps. <!-- features/offline/outbox/outbox.ts with guarded transitions. -->
- [x] Implement safe local entity states: `synced`, `pending_create`, `pending_update`, `pending_delete`, `conflict`, `rejected`. <!-- LocalEntityStatus in features/offline/types.ts. -->
- [x] Add unit tests for local DB migration, atomic write/queue, operation ordering, duplicate operationId handling, database isolation and reload persistence. <!-- features/offline/__tests__/*.test.ts; `npm run test:offline` → 38 passing. -->

## Phase 2 — PWA app shell and connectivity UX

- [x] Add a validated PWA manifest with EGO POS name, icons, theme color, start URL and display mode appropriate for the existing store app. <!-- app/manifest.ts served at /manifest.webmanifest (HTTP 200); SVG icons in public/icons. PNG raster icons (192/512) are a WAITING design-asset item. -->
- [x] Add a Next.js 16/OpenNext-compatible service worker build configuration. Do not rely on an unsupported legacy plugin without proof that build and production Worker output pass. <!-- Plain public/sw.js (no next-pwa/workbox plugin); `next build` passes; /sw.js served with application/javascript. -->
- [x] Cache only the approved Mini Mart app shell and immutable assets. Exclude APIs, admin routes, credentials, dynamic server data and sensitive authenticated documents from unsafe cache rules. <!-- features/offline/pwa/cache-policy.ts (authoritative, unit-tested); sw.js mirrors it (guard test). Never caches admin/platform, /api incl. NextAuth, or authenticated HTML. -->
- [x] Add navigation fallback so a previously bootstrapped installed app can open the POS shell with no internet. <!-- Network-first shell strategy falls back to pre-cached public /offline shell; app/offline exposes no store data. Full offline POS rendering from local data is Phase 5/6. -->
- [x] Implement a connectivity store using browser online/offline events plus actual sync request health; `navigator.onLine` alone is insufficient. <!-- features/offline/pwa/connectivity.ts (online/offline/focus events + reportHealth hook) + useConnectivity. -->
- [x] Add a compact global Mini Mart status indicator with last-sync time and pending count. It must not obscure POS checkout controls. <!-- components/offline/offline-status-indicator.tsx mounted as a small header pill in the dashboard shell (verified in-browser). -->
- [x] Add a detail panel/Sync Center entry point for Owner/Manager with status, retry action and user-safe errors. <!-- Sync Center dropdown (Owner/Manager gated) with counts + "Sync now"; retry wired to the no-op coordinator until Phase 4/11. -->
- [ ] Test first online install, cached relaunch with network disabled, hard reload offline, update of service-worker version, and graceful behavior in unsupported/private browser storage modes. <!-- PARTIAL/WAITING: status UI + Sync Center verified in-browser; unsupported-storage handled in code. Full installable-PWA install + offline relaunch + SW version-update QA needs an installable HTTPS/PWA context and physical device — tracked as WAITING in IMPLEMENTATION_PROGRESS. -->

## Phase 3 — Device, terminal and offline authentication

- [x] Add cloud schema migration(s) for registered terminal devices, device state/revocation, policy version/cursor, terminal receipt-number allocation, stock allocation/lease and loyalty redemption allowance. <!-- prisma/migrations/20260905_offline_phase3_device_terminal/migration.sql — REVIEW-ONLY, not applied. -->
- [x] Add Prisma models, relations, indexes, unique constraints and tenant/branch scoping for every new offline record. <!-- TerminalDevice, OfflineSyncCursor, TerminalReceiptRange, TerminalStockAllocation, OfflineLoyaltyAllowance in prisma/schema.prisma (scalar tenant-scoped FKs + @@unique/@@index). -->
- [x] Add a device registration/activation flow using a persistent non-secret device ID. Require assigned terminal or Owner/Manager activation before offline writes are enabled. <!-- features/offline/server/device-service.ts; /api/offline/device/register (POS view) + /activate (staff.edit). -->
- [x] Add a cloud endpoint to bootstrap device/terminal policy and return a minimal cached security snapshot. <!-- POST /api/offline/device/policy → getDevicePolicy + buildSecuritySnapshot; records lastPolicySyncAt. -->
- [x] Implement device-local offline unlock. It must require an already authorized identity and local lock credential; it may not retain plaintext passwords or long-lived cloud credentials. <!-- features/offline/auth/device-unlock.ts — salted PIN hash only (PBKDF2 default; pluggable), stored in local DB meta; never plaintext/tokens. -->
- [x] Cache only necessary user/role/POS-policy/approval-policy data, plus policy version and last successful security sync timestamp. <!-- SecuritySnapshot (features/offline/server/security-snapshot.ts) rejects secret-like fields; includes policyVersion + lastPolicySyncAt. -->
- [x] Implement default 7-day offline authorization grace with company configuration; on expiry, preserve read access and unsynced records but block new financial/inventory writes until online reauthorization. <!-- features/offline/server/authorization.ts (DEFAULT_OFFLINE_GRACE_DAYS=7, per-device offlineGraceDays; graceExpired → readOnly). -->
- [x] Implement cloud revocation/role-change/forced-sign-out application at next sync and write an audit event. <!-- revokeDevice + activate/policy audit via withTenantTransaction; sync engine blocks revoked/stale devices. Client-side application of revocation at next sync is wired to the flag/UI in Phase 11. -->
- [x] Add tests for first-use offline denial, registered-device unlock, expired grace period, revoked terminal, disabled cashier and branch/tenant isolation. <!-- features/offline/__tests__/{authorization,device-unlock,allocation}.test.ts. -->

## Phase 4 — Cloud sync protocol and server protection

- [x] Design versioned request/response schemas for device activation, bootstrap, delta pull, batched command push, sync status and conflict resolution. <!-- features/offline/server/sync-contract.ts (SYNC_SCHEMA_VERSION=1) + validators. -->
- [x] Add `OfflineOperation` cloud persistence with a unique constraint on `companyId + operationId` and stored accepted/rejected result. <!-- prisma model OfflineOperation + migration 20260905_offline_phase4_offline_operation (review-only); PrismaSyncStore persists terminal results. -->
- [x] Implement batched command push. It must process commands in dependency order, validate tenant/session/device/terminal/policy scope, and return a result for every operation. <!-- processPush in sync-engine.ts; POST /api/offline/sync/push (posSell). -->
- [x] Ensure an idempotent retry returns the original result without repeating a write, audit entry, loyalty ledger entry, payment or stock movement. <!-- idempotency by company+operationId short-circuits before applyCommand; tested "duplicate delivery". -->
- [x] Implement cursor-based delta pull with deterministic ordering, server versioning and tombstones. Never infer that an empty response requires default seed data. <!-- pullDelta + OfflineServerChange feed; tested empty=empty + tombstones + pagination. -->
- [x] Add resumable/paginated initial bootstrap for current store/branch/warehouse data and bounded history. <!-- bootstrap() paginated + GET /api/offline/sync/bootstrap; reference-data wiring lands in Phase 5 (documented). -->
- [x] Add server error codes for validation failure, permission denied, stale policy, stale version, receipt collision, insufficient terminal stock allocation, missing loyalty allowance, dependency blocked and unexpected server error. <!-- SyncErrorCode in sync-contract.ts. -->
- [x] Add server audit linkage for every accepted/rejected offline command, including device/terminal/actor/operation ID. <!-- PrismaSyncStore.saveOperationResult writes an AuditLog and stores audit_log_id on OfflineOperation. -->
- [x] Add integration tests for duplicate delivery, interrupted response after cloud commit, out-of-order batch dependency, stale cursor, cross-tenant operation injection and invalid terminal assignment. <!-- features/offline/__tests__/sync-engine.test.ts (deterministic, against InMemorySyncStore). "Interrupted response after cloud commit" is covered by the idempotent duplicate-delivery path. DB-backed integration + applying migrations is WAITING per the no-migration/no-production-data rule (see IMPLEMENTATION_PROGRESS). -->

## Phase 5 — Local snapshot and repository adapters

<!-- Scoped slice implemented: Mini Mart reference-data local replica + bootstrap/delta wiring (POS-required data only). Phase 5.1 repair made delta REAL end-to-end: POS-relevant reference writes (products, categories, customers, promotions, settings, inventory stock) now emit OfflineServerChange atomically in the same tenant transaction, with tombstones on delete/archive and branch-scoped pulls. Phase 5.2 repair made versioning concurrent-safe (atomic per-scope OfflineReferenceRevision counter; scope = company+branch+warehouse+kind+id), fixed stock keys to product+warehouse, added warehouse-scoped delta pulls, and enforced single-warehouse rollout in code + diagnostics (see docs/offline/IMPLEMENTATION_PROGRESS.md "Phase 5.1"/"Phase 5.2"). Remaining Phase 5 items (back-office reference/document data, image caching, full module repository adapters, client-component refactor, parity harness) and POS-sale-stock/cash-session/QR emission are intentionally deferred to a later slice / Phase 6. -->
- [x] Create `StoreSnapshotRepository` with `bootstrap`, `pullDelta`, `readLocalSnapshot` and local apply methods. <!-- features/offline/replica/store-snapshot-repository.ts — versioned apply, tombstones, isolation; stored in the local `reference` store. -->
- [x] Cache POS-required data: branch/warehouse context, active products, categories, units, barcodes, sellable stock/lot data, customers/membership, promotions, settings, QR banks/accounts, receipt configuration, cash-session context and permission policy. <!-- features/offline/replica/reference-types.ts + PrismaReferenceSnapshotProvider (reuses getPrismaPosSnapshot). Security/permission snapshot delivered via /api/offline/device/policy (Phase 3). QR accounts are covered under settings/QR-bank scope; full QR-account detail arrives with the change-feed wiring. -->
- [ ] Cache Mini Mart Back Office reference/document data: suppliers, purchase orders, receiving data, product/category history, inventory counts/adjustments and bounded report/recent-sale history. <!-- Deferred: out of the "offline POS reference data only" slice. -->
- [ ] Provide progressive product image caching with an offline placeholder. A failed image cache may never block a sale. <!-- Deferred to a later Phase 5 slice. -->
- [ ] Create typed repository interfaces for POS, cash session, held bills, post-sale, inventory, products, customers, promotions, purchasing, suppliers, reports and settings. <!-- Deferred: adapter layer lands with Phase 6 checkout wiring. -->
- [ ] Implement online adapters that preserve existing routes/business behavior and offline adapters that read/write the local database and outbox. <!-- Deferred to Phase 6. -->
- [ ] Refactor Mini Mart client components to use adapters rather than directly calling `fetch` or Server Actions. Do not import Prisma/server-only files into client bundles. <!-- Deferred to Phase 6 (no client components changed in this slice; online behavior preserved). -->
- [ ] Keep existing online API routes compatible until all consumers are migrated and regression tests pass. <!-- Preserved: no existing route changed; only new /api/offline/* endpoints added. -->
- [ ] Add parity tests proving an online snapshot and its local hydrated snapshot produce the same normalized POS/cart inputs. <!-- Deferred: lands with the Phase 6 adapter/parity harness. -->

## Phase 6 — Receipt identity, local sales and POS checkout

<!-- Read-side slice implemented (approved separately): the reference replica is wired into the Mini Mart POS read path behind a feature flag, with a scope-enforced online/offline read adapter, a pure offline gate (online/syncing/offline_ready/stale/blocked/read_only), a provider selector (flag-off/online -> online; offline+permitted -> replica; blocked -> none), and controlled bootstrap/delta sync (startup/reconnect/focus/Sync Now) via the secured /api/offline/sync endpoints. Phase 6.1 connected the SAME existing PosPageClient to the adapter: it renders read-only from the device-local replica on the public /offline shell when offline-ready (posReadModelToPosClientProps + OfflinePosWorkspace + restrictive read-only policy), with clear blocked/stale/revoked messaging and no store data in server HTML. Flag OFF preserves online /pos and the minimal /offline shell exactly (verified). Phase 6.2 added device-local PIN unlock (OfflinePosWorkspace starts locked; salted PBKDF2 hash only; wrong PIN reveals nothing and does not mutate the hash; unlock is in-memory so reload re-locks; valid PIN unlocks only the active terminal namespace), cached device-status/policy from the secured status endpoint to enforce revocation before the next offline session, and complete read-only UI blocking (PosPageClient readOnly prop disables Pay/hold/resume + guards secondary fetches; the restrictive policy denies every write action immediately with no network). See docs/offline/IMPLEMENTATION_PROGRESS.md "Phase 6.1" and "Phase 6.2". The write-side items below (receipt identity, local checkout, offline sale/stock/loyalty writes) are intentionally deferred to a later phase. -->


<!-- Phase 6A (approved separately) implemented the local offline CASH checkout DOMAIN foundation only, UI still read-only: pure cart/price/tax/discount/safe-promotion math (features/offline/checkout/cart-math.ts); immutable cash-sale payload + local entities (cash-sale-types.ts); atomic idempotent commitOfflineCashSale (commit-cash-sale.ts) keyed by operationId so retry/reload never duplicates sale/receipt/stock; permanent collision-free receipt reference drawn from the cloud-reserved terminal range (allocateNextReceipt); open compatible local cash-session precondition (cash-session-guard.ts); terminal sellable-lease + lot/expiry enforcement preventing negative local stock (stock-guard.ts). Local DB v3 adds receipt_ranges + stock_allocations stores. Cash-only; NO Pay button/UI wiring, QR/transfer/card, loyalty event, sync application, refunds/voids/returns/holds, cash movement, Recent Sales/receipt UI, or Customer Display — those are Phase 6B/7. See docs/offline/IMPLEMENTATION_PROGRESS.md "Phase 6A". -->

- [x] Implement cloud-reserved per-terminal receipt number ranges or an approved unique terminal-prefixed receipt reference. The printed offline receipt number must remain permanent after sync. <!-- Phase 6A: client draws sequential references from the reserved range (allocateNextReceipt); advanced atomically with the sale; within reserved bounds so it cannot collide with cloud numbers and is permanent after sync. -->
<!-- Phase 6B (approved separately) implemented the AUTHORITATIVE server application + reconciliation for queued offline CASH sales. applyOfflineCashSale (features/offline/server/cash-sale-apply.ts) validates device/scope/active-compatible cloud cash session/reserved receipt reference (collision-guarded)/terminal allocation+lot/expiry, then the PrismaCashSaleGateway commits the canonical sale by REUSING the online writeCompletePrismaSale (no parallel sale path) + advances receipt range/leases + records the accepted OfflineOperation with a local->cloud id mapping, all in one withTenantTransaction. Idempotent by companyId+operationId (duplicate returns original result, no repeats); rejections return a precise SyncErrorCode + detail and keep a rejected ledger row for review. CommandResult now carries the reconciliation result. Wired into pushSync (applyCommand routes only pos.sale.complete). No user-facing checkout enabled. Online checkout files untouched. Phase 6B.1 hardened server authorization BEFORE any sale write: device active + bound to terminal, tenant/branch/warehouse/terminal scope, cashier actor active + POS-sale permission, cached policy version + offline grace window (reusing evaluateOfflineWriteAuthorization), and sale timestamp within the offline window + not materially future-dated; invalid cases reject with existing machine-readable codes and no partial write, idempotency preserved. See docs/offline/IMPLEMENTATION_PROGRESS.md "Phase 6B" and "Phase 6B.1". -->

- [x] Update the current sale-number validation/issuance logic so valid reserved offline references are accepted safely and cannot collide with cloud-issued references. <!-- Phase 6B: the server validates the terminal-reserved receipt reference (validateReceiptReference: reserved prefix + within range + not behind cursor -> receipt_collision) and reuses resolvePosSaleNo via writeCompletePrismaSale for the canonical saleNo; the permanent offline reference is preserved in the reconciliation/OfflineOperation. -->
- [x] Extract/reuse pure cart, unit, tax, discount and promotion calculation functions. Preserve existing server validation as final authority. <!-- Phase 6A: features/offline/checkout/cart-math.ts reuses roundLak + pos-cart primitives; cloud remains final authority. -->
- [ ] Implement local POS checkout through `commitLocalAndQueue`: sale, sale items, payments, stock/lot consumption, loyalty event, receipt snapshot, audit event and operation envelope. <!-- Phase 6A: CASH-only atomic commit done (sale, items, cash payment, stock/lot consumption, immutable receipt snapshot, audit, operation envelope). Loyalty event, non-cash tenders, and UI wiring are Phase 6B. -->
- [x] Preserve current cash-session precondition: no local sale without a locally open compatible cash session. <!-- Phase 6A: cash-session-guard.ts; commit rejects without an open compatible local session. -->
- [x] Enforce local terminal stock allocation when adding/increasing cart quantities and at final checkout. <!-- Phase 6A: stock-guard.ts (cart) + consumeAllocation in commit (checkout); prevents negative local available stock. -->
- [ ] Implement local barcode lookup/search, product filtering, unit selection and category browsing from IndexedDB.
- [ ] Implement pending/synced/rejected status in Recent Sales and receipt UI.
- [ ] Make local receipt reprint use the immutable receipt snapshot; do not recalculate past prices or promotions from current master data.
- [ ] Support cash checkout fully offline. For QR/transfer/card, apply the configured policy and explicitly mark an unverified offline payment as cashier-confirmed/pending verification; never fabricate bank confirmation.
- [ ] Connect the Customer Display to the same local POS cart/QR/customer state so it continues operating offline on the POS device/browser profile.
- [ ] Add deterministic tests for offline sale, reload after sale, lost connection during checkout, duplicate submit, duplicate sync, receipt reference preservation and no duplicate stock movement.

## Phase 7 — Cash sessions, held bills and post-sale

- [ ] Refactor cash session open/current/close/cash-in/cash-out client calls behind `CashSessionRepository`.
- [ ] Implement offline opening/closing sessions and immutable cash movement commands with local expected-cash calculations.
- [ ] Ensure a local session has one stable ID that maps to the cloud session without duplicate open/close behavior.
- [ ] Refactor held-bill fetch/create/resume/cancel behind `HeldBillRepository`.
- [ ] Implement local terminal-scoped held bills, single-resume protection, pending/synced status and idempotent sync behavior.
- [ ] Refactor recent sales, receipt lookup, reprint, refund, return, exchange and void behind `PostSaleRepository`.
- [ ] Allow post-sale work offline only when original receipt, remaining quantities and required cached policy/approval details are present locally. Give an explicit unavailable message otherwise.
- [ ] Queue refund/return/exchange/void as immutable operations linked to original sale lines and local approval audit.
- [ ] Add tests for cash totals after offline sale, held bill resume after reload, one-time held bill resume, return remaining-quantity guard, void/refund idempotency and rejection recovery.

## Phase 8 — Inventory, purchasing and suppliers

- [ ] Implement server-issued terminal sellable stock allocations/leases and local allocation tracking per product/unit/lot where required.
- [ ] Support the GO BOX initial single-terminal configuration while retaining correct multiple-terminal allocation behavior.
- [ ] Refactor inventory stock-in, adjustment and count UI/API paths behind `InventoryRepository`.
- [ ] Queue every inventory mutation as an immutable event with reason, actor, warehouse, expected version, source document and lot/expiry allocation details.
- [ ] Update local balances immediately after a valid offline event and prevent local negative available stock.
- [ ] Refactor product/category/unit/barcode/price/image operations behind `ProductRepository`; use base versions and tombstones for offline edits/deletes.
- [ ] Refactor supplier, purchase order, receiving and purchase payment operations behind `SupplierRepository`/`PurchasingRepository`.
- [ ] Preserve source purchase order, receiving and lot traceability during local write and cloud sync.
- [ ] Implement cloud conflict/rejection handling for stale stock count/adjustment and stock allocation exhaustion. Do not silently overwrite a physical count.
- [ ] Add tests for two offline terminals competing for same stock, offline receiving then sale, adjustment/count conflict, lot traceability and product price change not altering past sale receipt.

## Phase 9 — Customers, membership, loyalty and promotions

- [ ] Refactor customer search/create/edit/payment/subscription flows behind `CustomerRepository`.
- [ ] Cache customers, active membership/subscription, current loyalty summary and only required personally identifiable fields for POS operations.
- [ ] Implement field/version conflict handling for offline customer edits and tombstones for deletions.
- [ ] Queue loyalty earning as an idempotent immutable ledger event tied to sale/operation IDs.
- [ ] Implement server-issued offline loyalty redemption allowance per member/terminal with expiry and amount/point cap.
- [ ] Block only the redemption action when no valid allowance exists; continue customer lookup and point earning offline with clear UI text.
- [ ] Refactor promotions behind `PromotionRepository`; download a versioned active-promotion snapshot and use shared pure promotion logic in local checkout.
- [ ] Record promotion IDs, versions, inputs and applied result in local sale data. The cloud must not silently change a customer’s completed total during sync.
- [ ] Support offline promotion/customer/master-data changes with base versions, pending status and conflict resolution. Do not distribute them to other terminals until cloud sync completes.
- [ ] Add tests for loyalty earn retry, double redemption prevention, expired allowance, membership discount, promotion version retention and customer-edit merge/conflict behavior.

## Phase 10 — Reports, dashboard and store settings

- [ ] Refactor dashboard loaders and reports behind local-capable read repositories.
- [ ] Show offline reports/dashboard from local data with `This terminal` and `Last synced` labels; never present them as store-wide real-time totals when another device may have queued work.
- [ ] Define bounded local report retention and export behavior; display the selected date/data coverage.
- [ ] Refactor store settings, receipt settings, QR payment catalogue and Customer Display settings behind `SettingsRepository`.
- [ ] Cache settings for normal store operation. Queue permitted store configuration changes with base versions and pending status.
- [ ] Keep store role/permission/approval-rule editing online-only; cache them read-only as an offline policy snapshot.
- [ ] Ensure Customer Display templates, logo, QR selector, reset behavior and bank settings retain existing online behavior and have a documented offline cache strategy.
- [ ] Add tests for offline dashboard labels, report coverage, queued settings change, stale settings conflict and Customer Display behavior without network.

## Phase 11 — Sync coordinator, conflicts and recovery UI

- [ ] Implement a single `SyncCoordinator` invoked at app start, user unlock, reconnect, focus, explicit Sync Now and safe periodic interval while app is open.
- [ ] Ensure only one sync runs per terminal/browser profile; use locking to avoid duplicate tabs pushing the same queue simultaneously.
- [ ] Implement deterministic topological operation ordering and backoff retry for retryable errors.
- [ ] Implement pull-after-push and safe transactional application of deltas to local data.
- [ ] Build an Owner/Manager Sync Center with queue counts, last successful sync, last policy sync, device/terminal name, retry button, blocked/rejected item details and resolution link.
- [ ] Create clear resolution paths: refresh master data, obtain new stock allocation, obtain loyalty allowance, resolve stale field conflict, retry server error, or contact owner/support.
- [ ] Do not allow destructive clearing of the queue/local database while unsynced records exist. Require online clean sync/export and owner confirmation for device-data removal.
- [ ] Add privacy-safe diagnostics export that excludes credentials/tokens/secrets and minimizes customer data.
- [ ] Add tests for browser restart with pending queue, sync interruption, stale lock recovery, conflicting record resolution, rejected command retention and zero-data-loss recovery.

## Phase 12 — Security, performance and operational hardening

- [ ] Audit all new API routes for authentication, tenant/branch/warehouse/terminal scope, input validation, rate controls where relevant and audit logging.
- [ ] Confirm no plaintext password, database URL, API secret, long-lived access token or `.env` value is written into IndexedDB, Cache Storage, localStorage, logs or diagnostics.
- [ ] Implement local data lock/logout behavior and owner-only device data removal workflow after safe sync/backup conditions.
- [ ] Handle unsupported IndexedDB, private mode, quota exceeded, corrupt local DB, failed local migration, clock change and service-worker update with recoverable user messages.
- [ ] Measure bootstrap size, IndexedDB read performance, POS search latency, checkout local transaction duration and sync batch duration using realistic GO BOX product volume.
- [ ] Ensure the POS remains usable while sync is running; long reports/image caching must not block sale checkout.
- [ ] Verify no offline cache exposes Super Admin/platform routes or data.
- [ ] Document data retention, device-support/browser requirements, offline authorization grace behavior and known browser limitations.

## Phase 13 — Automated tests and real-device QA

- [ ] Add unit tests for pure business rules shared by online/offline: cart/unit/tax/promotion, sale identity, receipt ranges, stock allocation and loyalty allowances.
- [ ] Add integration tests for cloud command idempotency, cursor delta pull, tenant isolation, permission/policy application and conflict result codes.
- [ ] Add browser/PWA tests using network interception for bootstrapped offline POS, sale, cash session, held bill, receipt, customer display and reconnect sync.
- [ ] Add failure-injection tests for no network before checkout, network loss after local commit, network loss after cloud commit before response, reload, close/reopen, duplicate tab and repeated sync.
- [ ] Add two-terminal tests for stock allocation/oversell prevention and loyalty double-spend prevention.
- [ ] Run all existing relevant EGO POS scripts (POS checkout, post-sale, cash, held bill, inventory, reports, Customer Display), typecheck and production build. Fix regressions rather than bypassing them.
- [ ] Perform physical QA on the real GO BOX POS computer, barcode scanner, receipt printer, customer monitor, Android and iPhone/PWA. Mark each hardware test `PASS`, `FAIL` or `WAITING`; source/test evidence alone is not physical PASS.
- [ ] Verify an offline-created sale appears once and with correct totals, payment, stock, loyalty, receipt and audit data in the online Mini Mart view after reconnect.

## Phase 14 — Controlled rollout

- [ ] Add per-company/per-branch/per-terminal feature flags and a safe monitoring dashboard for offline status/queue failures.
- [ ] Deploy backend/schema changes only after migration review, backup/recovery confirmation and explicit owner approval.
- [ ] Enable on one designated owner test terminal first. Complete a reconciliation checklist using controlled non-critical sales and inventory.
- [ ] Enable on the GO BOX primary POS only after the first terminal sync/reconciliation is clean.
- [ ] Test a second device/multi-terminal allocation scenario before broad rollout.
- [ ] Prepare incident procedure: temporarily block new offline writes if necessary, retain/recover queue, diagnose/reconcile, then re-enable only after owner approval.
- [ ] Produce final evidence report: commits, migrations, feature flags, automated test results, real-device QA, known limitations, data reconciliation result and any remaining `WAITING` items.

## Final completion checklist

- [ ] Mini Mart remains one codebase and one user-facing application, switching automatically between online and offline data sources.
- [ ] No separate offline project, duplicate UI, local-only permanent business database or demo-mode shortcut was created.
- [ ] Offline POS can safely sell, print/reprint and preserve receipts through restart.
- [ ] Reconnect synchronizes every queued item exactly once and preserves receipt/payment/stock/loyalty/audit integrity.
- [ ] Inventory cannot silently become negative across offline terminals and loyalty cannot be double-spent.
- [ ] Rejected/conflicted items remain visible and repairable; no unsynced record is silently dropped.
- [ ] Super Admin/EGO Admin remains online-only.
- [ ] Automated validation and physical-device QA have evidence, with unresolved items explicitly marked `WAITING`.
