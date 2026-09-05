# EGO POS Mini Mart — Offline-First Implementation Progress

Single source of truth for phase-by-phase progress of the Offline-first initiative. Updated as each phase completes. **No production code, schema migration, feature flag, or deployment has been performed.**

- Repository: `it-fou/ego-pos`
- Working branch: `cursor/offline-first-phase-0-71b5`
- PR: base `feature/offline-first-mini-mart` ← compare `cursor/offline-first-phase-0-71b5` (never `main`)
- Base commit branched from: `a2b0d46` (`feat: polish customer display experience`)

## Phase status overview

| Phase | Title | Status |
|---|---|---|
| 0 | Baseline audit and guardrails | **COMPLETE** (documentation only) |
| 1 | Architecture foundations | **COMPLETE** (code + tests; default-off, no schema/migration) |
| 2 | PWA app shell and connectivity UX | **COMPLETE** (code + tests + in-browser QA; default-off) |
| 3 | Device, terminal and offline authentication | **COMPLETE** (models + reviewed migration [not applied] + tests) |
| 4 | Cloud sync protocol and server protection | **COMPLETE** (models + reviewed migration [not applied] + engine + tests) |
| 5 | Local snapshot and repository adapters | **PARTIAL** — reference replica + bootstrap/delta + real delta emission (5.1) + **concurrent-safe versioning & warehouse isolation (5.2)** COMPLETE; adapters/client-refactor deferred |
| 6 | Receipt identity, local sales and POS checkout | **PARTIAL** — read-side POS integration + **same-UI offline render (6.1)** COMPLETE; offline checkout/writes deferred to a later phase |
| 7 | Cash sessions, held bills and post-sale | Not started |
| 8 | Inventory, purchasing and suppliers | Not started |
| 9 | Customers, membership, loyalty and promotions | Not started |
| 10 | Reports, dashboard and store settings | Not started |
| 11 | Sync coordinator, conflicts and recovery UI | Not started |
| 12 | Security, performance and operational hardening | Not started |
| 13 | Automated tests and real-device QA | Not started |
| 14 | Controlled rollout | Not started |

## Phase 0 — Baseline audit and guardrails (COMPLETE, docs only)

### Result

Phase 0 is complete as documentation. The repository was audited read-only; every Mini Mart route/feature was mapped to its data reads/writes, models, API/server-action boundaries, dependencies, offline mode, and conflict strategy in `docs/offline/FEATURE_DATA_MATRIX.md`. No offline code, schema, feature flag, or deployment was introduced.

Phase 0 task checklist (`offline-first-tasks.md` §"Phase 0"):

| Task | Status | Where |
|---|---|---|
| Create `docs/offline/FEATURE_DATA_MATRIX.md` (routes, models/API/action, reads/writes, offline mode, dependency, conflict) | Done | `docs/offline/FEATURE_DATA_MATRIX.md` §6, §14 |
| Confirm source baseline & current branch/commit; record stack (App Router, Prisma/PostgreSQL, Cloudflare/OpenNext, SSR POS snapshot, direct `/api/pos`/server-action writes) | Done | FEATURE_DATA_MATRIX §2, §5 |
| Inventory direct browser `fetch` / Server Action / `router.refresh` / Prisma/server-only imports in Mini Mart UI; record target adapter | Done | FEATURE_DATA_MATRIX §8 |
| Verify no existing PWA/service-worker/IndexedDB/offline queue | Done | FEATURE_DATA_MATRIX §2 (all confirmed absent) |
| Define single `OfflineFeatureStatus` vocabulary | Documented (not yet code) | FEATURE_DATA_MATRIX §4 |
| Feature-flag design (company+branch+terminal, default disabled, read-only diagnostics when off) | Documented (not yet code) | FEATURE_DATA_MATRIX §16 |
| Document recovery boundaries (no queue clearing w/ unsynced, no reseeding, no destructive local migration, no false-success) | Done | FEATURE_DATA_MATRIX §16 |
| Run existing typecheck/build; record actual pass/fail | Done | FEATURE_DATA_MATRIX §17 (and below) |

### Files changed (this branch vs base)

| File | Change |
|---|---|
| `offline-first-requirements.md` (repo root) | Added — exact authoritative copy (md5 `a18603a387d17e9c51a2a1d5ac3c3bb3`) |
| `offline-first-tasks.md` (repo root) | Added — exact authoritative copy (md5 `9e1b44cae90736eadb599622301ceca5`) |
| `docs/offline/FEATURE_DATA_MATRIX.md` | Added, then completed (§1–§18) |
| `docs/offline/IMPLEMENTATION_PROGRESS.md` | Added (this file) |

No other files were modified. No production code, Prisma schema, migration, feature flag, or deployment config was touched.

### Commits (Phase 0)

| Commit | Description |
|---|---|
| `2822da6` | docs(offline): add authoritative Offline-first plan files at repo root |
| `d44024b` | docs(offline): add Phase 0 Mini Mart FEATURE_DATA_MATRIX (initial) |
| `1ead0e4` | docs(offline): complete Phase 0 FEATURE_DATA_MATRIX (repair — §9–§18) |
| (this file's commit) | docs(offline): add Phase 0 IMPLEMENTATION_PROGRESS |

### Validation evidence (read-only)

Run from `/workspace` on `cursor/offline-first-phase-0-71b5`; exit codes via `$?`.

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Type check | `npm run typecheck` (`tsc --noEmit`) | **0 (PASS)** | No type errors. |
| Build (no Hyperdrive var) | `npm run build` with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` unset | **1 (FAIL)** | `no local hyperdrive connection string` — pre-existing local build-env requirement (not caused by docs); `npm run dev` sets this var via `scripts/dev-local.cjs`, `next build` does not. |
| Build (with Hyperdrive var) | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgresql://postgres:postgres@127.0.0.1:5432/igo_pos?schema=public" npm run build` | **0 (PASS)** | `✓ Compiled successfully in 8.1s`; `✓ Generating static pages (90/90)`; route table printed (145 route lines); `ƒ Proxy (Middleware)`. |

### Key blockers surfaced (detail in FEATURE_DATA_MATRIX §15)

- Stock/lot: no terminal stock allocation (oversell risk across offline terminals); stock count rejects lot-tracked products; FEFO traceability must be preserved in offline commands.
- Loyalty: redemption is server-only and needs an `OfflineLoyaltyAllowance`; loyalty math not extracted as pure TS; points-adjust UI unwired.
- Payment: QR/transfer/card cannot be cloud-verified offline (record as pending verification); receipt numbering cannot guarantee cross-terminal uniqueness without a reserved range.
- Approval: approval policy is server-evaluated; offline must use a read-only cached policy snapshot; role/permission/approval editing stays online-only.
- Architecture: two write patterns to unify behind repositories; promotion versioning absent; terminal not a registered device; some store prefs browser-local only; middleware auth covers only `/dashboard/*`.

### WAITING items (not validated in Phase 0)

- Physical hardware/device QA (POS computer, barcode scanner, receipt printer, customer-display monitor, Android, iPhone/PWA) — **WAITING**; never claimed PASS. Reason: no offline runtime and no attached physical devices.
- Automated offline/sync tests — **WAITING**; no offline runtime exists yet (Phase 1+).
- Live PWA install / offline relaunch — **WAITING**; no manifest/service worker yet (Phase 2).
- Existing CI regression suite (`test:*`) — **WAITING**; requires live DB/dev server and is out of scope for a documentation-only phase.

### Guardrails honored

- Mini Mart scope only; platform admin surfaces (`/super-admin`, `/ego-admin`, `/igo-admin`, `(platform)`, plans/subscriptions) documented as excluded/online-only.
- No production code, schema, migration, feature flag, deployment, or `main` change. PR targets `feature/offline-first-mini-mart`.

## Phase 1 — Architecture foundations (COMPLETE)

### Result

Added the `features/offline/` foundations: common types, immutable operation envelope, a typed pluggable local-DB backend (IndexedDB for browser + in-memory for tests/SSR), namespace-isolated database, schema versioning + migration runner (failed migration preserves data), durable outbox with guarded transitions, atomic `commitLocalAndQueue`, device identity, feature flags (default disabled), read-only diagnostics, and inbox/sync-coordinator skeletons for later phases. Deterministic unit tests cover all required behaviors. Nothing is wired into production paths; online behavior is unchanged.

### IndexedDB wrapper decision

Requirements §5.1 allow "a maintained typed wrapper (for example Dexie) or an equivalent small, tested abstraction." We implemented the latter — a typed pluggable backend (`features/offline/local-db/backend.ts`) with `IndexedDbOfflineBackend` (browser) and `MemoryOfflineBackend` (tests/SSR). Rationale: deterministic Node tests with **no new dependency or lockfile churn**, a leaner Cloudflare Workers client bundle, and full control over migration-failure semantics. No dependency was added.

### Files added

- `features/offline/types.ts`, `features/offline/index.ts`
- `features/offline/operations/envelope.ts`
- `features/offline/local-db/{backend,memory-backend,indexeddb-backend,schema,migrations,database}.ts`
- `features/offline/outbox/outbox.ts`
- `features/offline/commit.ts`
- `features/offline/device-identity.ts`, `features/offline/feature-flags.ts`, `features/offline/diagnostics.ts`
- `features/offline/sync/{inbox,sync-coordinator}.ts`
- `features/offline/__tests__/{envelope,local-db,commit}.test.ts`
- `package.json` (added `test:offline` script)

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Offline unit tests | `npm run test:offline` (`node --import tsx --test features/offline/__tests__/*.test.ts`) | **0 (PASS)** | Phase 1: 23 tests pass (migration, failed-migration-preserves-data, isolation, reload persistence, atomic write/queue + rollback, sequence/ordering, duplicate operationId, status transitions). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`. |

### Commit

| Commit | Description |
|---|---|
| `4f1ca06` | feat(offline): Phase 1 architecture foundations + typed local DB |

## Phase 2 — PWA app shell and connectivity UX (COMPLETE)

### Result

Added a safe, default-off PWA layer: manifest, a plain (plugin-free) service worker with unit-tested cache boundaries, a public offline shell route, connectivity detection, a global Offline/Sync status indicator, and an Owner/Manager Sync Center entry with read-only diagnostics. The service worker registers only when the offline flag is enabled (or `NEXT_PUBLIC_OFFLINE_SW=true`) and unregisters otherwise, so production online behavior is preserved by default. Cache rules never touch Super Admin/EGO Admin/IGO Admin/platform, `/api` (incl. NextAuth), or authenticated HTML.

### Files added / changed

- Added: `app/manifest.ts`, `app/offline/page.tsx`
- Added: `public/sw.js`, `public/icons/icon.svg`, `public/icons/maskable-icon.svg`
- Added: `features/offline/pwa/{cache-policy,connectivity,use-connectivity}.ts`
- Added: `components/offline/{offline-shell,offline-status-indicator,service-worker-manager}.tsx`
- Added: `features/offline/__tests__/{cache-policy,feature-status}.test.ts`
- Changed: `components/layout/dashboard-shell.tsx` (mount indicator + SW manager, non-obstructive header pill)

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Offline unit tests | `npm run test:offline` | **0 (PASS)** | 38 tests pass (adds cache-policy exclusions incl. sw.js mirror guard, feature-status derivation, feature-flag resolution, connectivity snapshot). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`; routes include `○ /manifest.webmanifest` and `ƒ /offline`. |
| Endpoint smoke (dev) | `curl` | 200 | `/manifest.webmanifest`, `/sw.js` (application/javascript), `/offline`, `/icons/icon.svg` all return 200. |
| Manual GUI QA | computerUse | PASS | Logged in as `igo-admin`; "Online" pill visible in header; Sync Center opens with Connection/Offline-mode/Queued/Syncing/Needs-attention/Last-sync; "Sync now" shows the not-enabled-yet message; page stays stable (no flicker/reload) after fix. |

### Bug found and fixed during QA

The first QA run showed the dashboard blanking after opening the Sync Center. Root cause: the status indicator derived `namespace` as a new object each render, so `loadDiagnostics` + its effect looped ("Maximum update depth exceeded"). Fixed by memoizing `namespace` (by primitive ids) and the flag (by namespace). Re-verified in-browser: no flicker/crash; dev log shows no recurrence.

### Commits

| Commit | Description |
|---|---|
| `356fe68` | feat(offline): Phase 2 PWA app shell, service worker & connectivity UX |
| `f692d8d` | fix(offline): prevent Sync Center render loop (memoize namespace/flag) |

### Known limitations / WAITING (Phases 1–2)

- **PNG raster icons (192/512, maskable) — WAITING.** Only SVG icons are provided (no binary asset generation). Chrome installability may be partial until PNGs are added by design/marketing.
- **Live installable-PWA QA — WAITING.** First-install, offline relaunch of the installed app, and service-worker version-update QA need an installable HTTPS/PWA context and a physical device; the SW is default-off and untested as an installed app.
- **Physical hardware/device QA — WAITING** (unchanged from Phase 0): POS computer, scanner, printer, customer monitor, Android, iPhone/PWA.
- **Sync engine — not implemented (by design).** `NoopSyncCoordinator` and the inbox are typed skeletons; real device registration (Phase 3), sync protocol (Phase 4), and coordinator (Phase 11) are out of scope for Phases 1–2.
- Offline writes remain **disabled by default**; enabling requires the per-scope flag / `NEXT_PUBLIC_OFFLINE_ENABLED`.

## Phase 3 — Device, terminal & offline-authorization foundation (COMPLETE)

### Result

Added the secure device/terminal + offline-authorization foundation. Prisma models + a reviewed migration file (NOT applied), pure authorization/scope logic, receipt-range / terminal-stock-allocation / loyalty-allowance invariants, a minimal non-secret cached security snapshot, a device-local offline unlock (salted PIN hash only), and Prisma-backed device register/activate/revoke/policy endpoints — all reusing existing tenant scope, POS policy loading, permission checks, and `withTenantTransaction` audit. Offline remains default-off.

### Files added / changed

- `prisma/schema.prisma` (5 models) + `prisma/migrations/20260905_offline_phase3_device_terminal/migration.sql` (review-only)
- `features/offline/server/{types,authorization,receipt-range,stock-allocation,loyalty-allowance,security-snapshot,device-service}.ts`
- `features/offline/auth/device-unlock.ts`, `features/offline/local-db/schema.ts` (meta keys)
- `app/api/offline/device/{register,activate,revoke,policy}/route.ts`
- Tests: `features/offline/__tests__/{authorization,allocation,device-unlock}.test.ts`

### Migration list (review-only, NOT applied)

- `20260905_offline_phase3_device_terminal` → `terminal_devices`, `offline_sync_cursors`, `terminal_receipt_ranges`, `terminal_stock_allocations`, `offline_loyalty_allowances`.

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npm run prisma:generate` | **0** | Client regenerated (schema→client only; no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 66 tests pass (28 new: authorization/scope, receipt/stock/loyalty invariants, device unlock, security snapshot). |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`; `/api/offline/device/{register,activate,revoke,policy}` present. |

### Commit

| Commit | Description |
|---|---|
| `a7acd7e` | feat(offline): Phase 3 device/terminal & offline-authorization foundation |

## Phase 4 — Cloud sync protocol & server protection (COMPLETE)

### Result

Added the versioned cloud sync contract and engine. Prisma models + a reviewed migration file (NOT applied), versioned request/response schemas + validators, machine-readable result/error codes, a `SyncStore` abstraction (in-memory for tests, Prisma for production), and a deterministic sync engine (dependency-ordered push, idempotency by `companyId+operationId`, per-command scope/policy validation, terminal-only ledger persistence with audit linkage, cursor delta pull with tombstones, resumable bootstrap). Secured endpoints via `runRead`/`runWrite`.

### Files added / changed

- `prisma/schema.prisma` (OfflineOperation, OfflineServerChange) + `prisma/migrations/20260905_offline_phase4_offline_operation/migration.sql` (review-only)
- `features/offline/server/{sync-contract,sync-store,sync-engine,prisma-sync-store,sync-service}.ts`
- `app/api/offline/sync/{push,pull,bootstrap,status}/route.ts`
- Tests: `features/offline/__tests__/{sync-engine,sync-contract}.test.ts`

### Migration list (review-only, NOT applied)

- `20260905_offline_phase4_offline_operation` → `offline_operations` (unique `company_id, operation_id`), `offline_server_changes`.

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npm run prisma:generate` | **0** | Client regenerated (no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 83 tests pass (17 new: idempotency, duplicate delivery, tenant isolation, stale policy, invalid terminal, dependency order, out-of-order dependency, cross-tenant injection, in-batch duplicate, cursor pull + tombstones, bootstrap pagination, contract validators). |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`; `/api/offline/sync/{push,pull,bootstrap,status}` present. |

### Commit

| Commit | Description |
|---|---|
| `1b7aff2` | feat(offline): Phase 4 versioned cloud sync contract & engine |

### Known limitations / WAITING (Phases 3–4)

- **Migrations are REVIEW-ONLY and NOT applied** to any database (local dev uses `prisma db push`; production apply requires the normal migration review + owner approval).
- **DB-backed integration tests — WAITING.** Phase 4 tests are deterministic and DB-free (InMemorySyncStore); running the Prisma-backed store + endpoints against a live database is deferred per the no-migration/no-production-data rule.
- **Bootstrap reference-data wiring — Phase 5.** `PrismaSyncStore.listBootstrapEntities` returns an empty, correctly paginated page (empty means empty — never seeds); real reference snapshots land in Phase 5.
- **Domain application of accepted commands — Phase 5/6.** The engine records the authoritative accept/reject decision and provides an `applyCommand` hook; actual sale/stock/loyalty writes are wired later.
- **Device-local unlock UI + client revocation application — Phase 11.** The credential/store foundation exists; UI wiring and applying server revocation at next sync land with the Sync Center work.
- Offline writes remain **disabled by default**.

## Phase 5 (scoped slice) — Mini Mart reference-data replica + bootstrap/delta wiring (COMPLETE)

### Result

Implemented the read-only Mini Mart reference-data local replica and wired it to the Phase 4 bootstrap/delta contract + `PrismaSyncStore`/POS snapshot. Only POS-required, non-secret data is stored; no admin data, tokens, secrets, passwords, or unrelated reports. This slice deliberately excludes the broader Phase 5 items (back-office reference/document data, image caching, full module repository adapters, client-component refactor, parity harness), which are deferred to a later slice / Phase 6.

### Scope stored (POS-required only)

Store context (company/branch/warehouse/terminal), settings (receipt/tax/loyalty/currency), categories, products (units/barcodes/prices/category/stock-display), customers/member lookup, safe-offline promotion policy, QR banks, read-only stock/lot levels (with terminal allocation), active cash-session context. Security/permission snapshot is delivered by `/api/offline/device/policy` (Phase 3).

### Files added / changed

- Added: `features/offline/replica/{reference-types,reference-snapshot,store-snapshot-repository}.ts`
- Added: `features/offline/server/prisma-reference-provider.ts`
- Changed: `features/offline/server/sync-service.ts` (bootstrapSync → real reference snapshot), `app/api/offline/sync/bootstrap/route.ts` (accepts `deviceId`), `features/offline/local-db/schema.ts` (new `reference` store; structural v2), `features/offline/index.ts`
- Tests: `features/offline/__tests__/{reference-snapshot,store-snapshot-repository}.test.ts`

### Design notes (rules honored)

- Reuses the Phase 4 bootstrap/pull contract + `PrismaSyncStore` + the existing tenant/branch/warehouse-scoped `getPrismaPosSnapshot` (isolation + POS rules already enforced) + Phase 3 terminal stock allocation.
- **Never seeds defaults** when cloud data is empty (empty bootstrap/delta → empty snapshot).
- **Tombstones retained** with version, so deleted categories/products never reappear from a stale re-delivery; **stale updates ignored** (older version never overwrites).
- **Tenant/branch/warehouse/terminal isolation**: local DB is namespaced per company+branch+terminal, every reference record carries scope, and apply rejects out-of-tenant records.

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npm run prisma:generate` | **0** | Client regenerated (no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 97 tests pass (14 new: bootstrap pagination, delta price update, product/category deletion tombstones, empty response, stale snapshot handling, tenant isolation, namespace isolation, ordering/pagination/scope helpers). |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`; `/api/offline/sync/bootstrap` present. |

### Commit

| Commit | Description |
|---|---|
| `d354c40` | feat(offline): Phase 5 Mini Mart reference-data replica + bootstrap/delta wiring |

### Known limitations / WAITING (Phase 5 slice)

- **Change-feed emission — WAITING.** Delta pull reads `OfflineServerChange`; emitting change rows on every reference mutation (products/categories/etc.) is deferred (would touch existing services). Bootstrap delivers the full current snapshot; delta apply is fully implemented + tested against the in-memory feed.
- **Per-entity server versioning — foundation.** Bootstrap assigns version 1 uniformly today; incrementing per-entity versions land with the change-feed wiring. Client versioned/stale/tombstone apply is complete + tested.
- **Bootstrap network client (fetch glue) + client-component consumption — Phase 6.** The repository, mapping helpers, provider, and secured endpoint are complete; wiring a React data path is Phase 6.
- **Lot detail + QR-account detail** in stock/settings payloads arrive with the change-feed wiring.
- **DB-backed integration + migrations** remain review-only/not applied; deterministic tests are DB-free.
- Offline remains **disabled by default**.

## Phase 5.1 (repair) — real reference-data delta sync end-to-end (COMPLETE)

### Result

Made reference-data delta sync real: POS-relevant Mini Mart reference changes now emit an `OfflineServerChange` **atomically in the same tenant transaction** as the existing online write (business write + audit), so another device receives them through `pullDelta`. Delete/archive emit tombstones; a stale older upsert can never resurrect a deleted product/category. Cross-tenant and cross-branch data never leak. Only POS reference data is emitted — no admin/token/secret/report data. All existing online behavior, permission checks, audit, and tenant-transaction patterns are preserved.

### Mechanism

- `withTenantTransaction` gained a generic in-transaction `afterWrite(result, tx)` hook (no offline coupling in the core lib).
- `features/offline/server/reference-change.ts` — pure payload builders (product/category/customer/promotion/settings/stock) + `tombstone` + `emitReferenceChanges` (strictly-newer per-entity version = max existing + 1; ordering via `OfflineServerChange.seq`).
- `features/offline/server/reference-emit.ts` — tx-scoped emit helpers reusing `resolveTenantScope`.
- Branch-scoped delta: `listChangesSince(..., branchIds?)` returns company-wide (null-branch) changes plus the device's branch(es) only → cross-branch isolation; wired through `pullDelta` → `pullSync`.

### Wired online write paths (emit on change)

| Module | Writes wired |
|---|---|
| Products | create, update, duplicate, bulk price update, archive→tombstone, delete→tombstone |
| Categories | upsert, delete→tombstone |
| Customers | create, update, archive→tombstone (via update) |
| Promotions | create, update, archive→tombstone (via update) |
| Settings | update (company-wide) |
| Inventory | stock-in, adjustment, count → stock_level |

### Files added / changed

- Added: `features/offline/server/{reference-change,reference-emit}.ts`, `features/offline/__tests__/{reference-change,reference-delta-e2e}.test.ts`
- Changed: `lib/db/write-context.ts` (afterWrite hook), `features/offline/server/{sync-store,sync-engine,sync-service,prisma-sync-store}.ts` (branch-scoped pull), and the wired repositories: `features/{products,customers,promotions,settings,inventory}/prisma-repository.ts`

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npm run prisma:generate` | **0** | Regenerated (no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 108 tests pass (11 new). |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`. |

Required repair tests (all passing): (1) online price change reaches another device via delta; (2) product/category deletion reaches device and never reappears; (3) cross-tenant and cross-branch never leak; (4) duplicate delivery harmless; (5) cursor pagination/order stable; (6) bootstrap == bootstrap+delta replica parity. Plus pure builder + strictly-newer version tests.

### Commit

| Commit | Description |
|---|---|
| `64e43b8` | feat(offline): Phase 5.1 real reference-data delta sync (emit OfflineServerChange) |

### Known limitations / WAITING (Phase 5.1)

- **POS-sale stock consumption, cash-session open/close/movement, QR-account, and terminal-allocation emission — deferred.** These use non-`withTenantTransaction` paths (e.g. `writeCompletePrismaSale`'s own transaction) or a not-yet-online allocator; the identical emit mechanism applies and bootstrap already delivers this data. Deferred to keep the core sale path untouched (preserve online behavior).
- **Per-entity server versioning** uses `max(existing seq-version)+1` at emit; multi-warehouse stock keyed by productId is simplified (single-warehouse POS).
- **DB-backed integration** remains review-only; the emit path is exercised by build/typecheck (compiles into the real write paths) and the delta/apply path is proven by deterministic in-memory end-to-end tests.
- Migrations remain review-only/not applied; offline remains disabled by default.

## Phase 5.2 (repair) — concurrent-safe reference versioning + warehouse isolation (COMPLETE)

### Result

Replaced the racy `max existing + 1` version generation with a **database-safe atomic mechanism**, fixed stock/lot reference keys so the same product in different warehouses cannot overwrite or leak, made delta pulls **warehouse-scoped**, and **enforced** the single-warehouse rollout in code + diagnostics.

### Concurrent-safe versioning

- New `OfflineReferenceRevision` counter with a **unique `scope_key`**; version is allocated by a single atomic statement: `INSERT ... ON CONFLICT (scope_key) DO UPDATE SET version = version + 1 RETURNING version` (`prismaRevisionAllocator`). Two concurrent transactions serialize on the row and can never share a version.
- `MemoryRevisionAllocator` mirrors the semantics for deterministic tests.
- **Scope identity** = company + branch + warehouse + entity kind + entity id (`referenceScopeKey`). The `seq` auto-increment remains the **pagination cursor only**, never the per-entity version.
- Tombstones still outrank older upserts; a stale lower-version event can never resurrect a deleted product/category (version-guarded client apply).

### Warehouse correctness / isolation

- Stock-level reference key is now **product + warehouse** (`stockLevelEntityId`) in both the emitter and the bootstrap provider — same product in different warehouses stays isolated.
- `OfflineServerChange` gained `warehouse_id`; delta pull filters by **warehouse (plus branch)** so a terminal receives only its permitted warehouse/branch changes (company-wide null-scope changes still reach everyone).
- **Single-warehouse rollout enforced** in code (`features/offline/config.ts`, `assertSingleWarehouseRollout`) — the sync context rejects a terminal resolving to >1 warehouse; the sync status surfaces `singleWarehouseRollout` + `warehouseScope` for diagnostics. Not assumed.

### Files added / changed

- Added: `features/offline/config.ts`, `features/offline/__tests__/reference-concurrency.test.ts`, migration `20260905_offline_phase52_reference_revision` (review-only)
- Changed: `prisma/schema.prisma` (OfflineReferenceRevision + OfflineServerChange.warehouseId), `features/offline/server/{reference-change,reference-emit,prisma-reference-provider,sync-contract,sync-store,prisma-sync-store,sync-engine,sync-service}.ts`, `features/offline/replica/store-snapshot-repository.ts`, `features/offline/index.ts`, `features/offline/__tests__/reference-change.test.ts`

### Migration list (review-only, NOT applied)

- `20260905_offline_phase52_reference_revision` → adds `offline_reference_revisions` (unique `scope_key`) and `offline_server_changes.warehouse_id` (+ index).

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npm run prisma:generate` | **0** | Regenerated (no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 114 tests pass (6 new). |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`. |

Required 5.2 tests (all passing): (1) concurrent same-entity updates → unique, ordered versions; (2) update-vs-delete race → replica matches authoritative final state (+ no resurrection); (3) same product in two warehouses isolated; (4) two terminal replicas receive only their permitted warehouse/branch changes; (5) all prior delta/tombstone/bootstrap/tenant-isolation tests still pass.

### Commit

| Commit | Description |
|---|---|
| `0348bd2` | fix(offline): Phase 5.2 concurrent-safe reference versioning + warehouse isolation |

### Known limitations / WAITING (Phase 5.2)

- **Concurrency proof is deterministic-in-memory** (`MemoryRevisionAllocator` mirrors the atomic upsert). The production guarantee comes from the single-statement Postgres `ON CONFLICT ... RETURNING`; a live DB concurrency test is deferred per the no-migration/no-production-data rule.
- POS-sale stock consumption, cash-session, QR-account, and terminal-allocation emission remain deferred (Phase 5.1 note); they will reuse the same atomic allocator + warehouse-scoped keys.
- Migrations remain review-only/not applied; offline remains disabled by default.

## Phase 6 (read-side slice) — POS read-path integration + controlled client sync (COMPLETE)

> Scope note: the task plan's "Phase 6" header is the write side (receipt identity / local checkout). This iteration implemented the approved **read-side integration only**; offline checkout/sales/refunds/voids/holds/stock/cash/loyalty writes are deferred to a later phase.

### Result

Wired the approved reference replica into the Mini Mart **POS read path** behind a feature flag, with controlled bootstrap/delta client sync and clear state. With the flag OFF, online POS behavior is unchanged (verified in-browser). No offline writes; no admin surfaces; no migration/flag/deploy.

### Delivered

- **Adapter boundary** (`features/offline/pos-read/`): `PosReadRepository` with `OnlinePosReadRepository` (wraps the existing SSR snapshot — online reads unchanged in meaning) and `OfflinePosReadRepository` (reads the local replica). Terminal/company/branch/warehouse scope is **enforced at the boundary** (`assertReplicaScope`). Shared pure search/barcode helpers give identical results from either source.
- **Read model + mapper**: `posSnapshotToReadModel` normalizes the SSR snapshot; the offline repo reads the Phase 5 replica payloads directly — products (units/barcodes/prices), categories, customers/members, safe promotions, stock display, cash-session.
- **Gate** (`pos-offline-gate.ts`, pure): surfaces `online | syncing | offline_ready | stale | blocked | read_only` and **blocks** offline use when never-bootstrapped, stale-beyond-policy, device revoked, terminal-scope mismatch, or invalid replica.
- **Provider** (`pos-read-provider.ts`): flag OFF or online → online repo; offline + permitted → replica; blocked → none.
- **Controlled sync** (`pos-sync-controller.ts` + `network-client.ts`): bootstrap when needed, then delta pull, on startup / reconnect / focus / Sync Now, via the secured `/api/offline/sync/*` endpoints (which the SW never caches). Single run per controller.
- **Client wiring**: `<PosOfflineSync/>` mounted on the POS page is a **strict no-op when the flag is off** (returns null, registers no effects) so online behavior is preserved; when enabled it runs the controller and publishes POS offline state to a shared store surfaced in the Sync Center indicator, whose "Sync now" triggers a real sync.

### Files added / changed

- Added: `features/offline/pos-read/{pos-search,pos-read-types,pos-read-repository,pos-offline-gate,pos-read-provider,pos-sync-controller,network-client,pos-offline-status-store}.ts`, `components/offline/pos-offline-sync.tsx`, tests `features/offline/__tests__/{pos-read-repository,pos-offline-gate,pos-read-provider,pos-sync-controller}.test.ts`
- Changed: `app/(dashboard)/pos/page.tsx` (mount no-op sync component), `components/offline/offline-status-indicator.tsx` (show POS state + real Sync Now), `features/offline/index.ts`

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npm run prisma:generate` | **0** | Regenerated (no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 136 tests pass (22 new). |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`. |
| Manual GUI (flag OFF) | computerUse | PASS | Online POS loads/searches normally; header "Online"; no errors/blank/crash. |

Required tests (all passing): online behavior unchanged with flag off (provider selection + online reads); offline product search + barcode from replica; offline category/price/member reads; bootstrap→delta reaches the POS adapter; tombstone hides deleted product/category; stale/revoked/never-bootstrapped/scope-mismatched terminal blocked; no tenant/branch/warehouse leakage (scope enforcement + replica isolation).

### Commit

| Commit | Description |
|---|---|
| `970b4e6` | feat(offline): Phase 6 read-side POS integration (flag-gated replica reads + controlled sync) |

### Known limitations / WAITING (Phase 6 read-side)

- **Offline POS rendering of the full `/pos` page from the replica is not swapped in.** The adapter/gate/provider/controller are complete and the online path is untouched; mounting a replica-backed POS renderer on the offline shell is a follow-on UI step. Offline checkout/writes are explicitly out of scope (later phase).
- **Client device-status/revocation gating** in the read gate currently assumes an active registered device (registration is a precondition for the secured sync endpoints); full client revocation application lands with the Phase 11 Sync Center. The server already blocks revoked devices for writes.
- Live installable-PWA offline POS QA remains WAITING (needs an installable PWA context).
- Migrations review-only/not applied; offline default-OFF.

## Phase 6.1 — render the same POS UI read-only from the local replica offline (COMPLETE)

### Result

Connected the existing Mini Mart POS UI to the approved read-side adapter so the **same `PosPageClient`** renders read-only from the device-local replica while offline — no second POS app, no duplicate UI. Flag OFF preserves online `/pos` and the minimal `/offline` shell exactly (verified in-browser). No offline writes; no admin surfaces; `/api` + authenticated HTML are never SW-cached.

### How it works

- `posReadModelToPosClientProps` (pure): maps a POS read model — from the online SSR snapshot **or** the offline replica — into the **exact** `PosPageClient` props, plus a **restrictive read-only permission policy** so the existing permission gate blocks every write action (checkout/hold/void/etc.). `nextSaleNo` is empty and `maxDiscountPercent` is 0.
- `OfflinePosWorkspace` (public `/offline` client shell): server HTML carries **no store data**; on the client, when the flag is on and the terminal is offline-ready, it opens the device-local replica, runs the gate, and renders the **same** `PosPageClient` read-only (with an "Offline — read-only" banner). Otherwise it shows the minimal safe shell, an "Open POS" link (when online), or a **clear blocked message** (never bootstrapped / stale / revoked / invalid / scope-mismatch).
- `active-terminal` pointer (non-secret ids only) is persisted by `PosOfflineSync` so the public offline shell can reopen the correct namespaced replica after an offline reload.
- The replica now records `lastSyncAt` (on bootstrap/pull) for staleness gating.

### Files added / changed

- Added: `features/offline/pos-read/{pos-client-props,active-terminal}.ts`, `components/offline/offline-pos-workspace.tsx`, test `features/offline/__tests__/pos-client-props.test.ts`
- Changed: `app/offline/page.tsx` (render the workspace), `components/offline/pos-offline-sync.tsx` (persist active terminal; use `lastSyncAt`), `features/offline/local-db/schema.ts` (+`lastSyncAt` meta), `features/offline/replica/store-snapshot-repository.ts` (write/expose `lastSyncAt`), `features/offline/index.ts`

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npm run prisma:generate` | **0** | Regenerated (no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 140 tests pass (4 new). |
| Production build | `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=… npm run build` | **0 (PASS)** | `✓ Compiled successfully`. |
| Manual GUI (flag OFF) | computerUse | PASS | Online POS unchanged (search works, "Online" pill); `/offline` shows only the minimal safe shell — no products/prices/customers. |

Required tests (all passing): same-component props from an online repository/model; equivalent props from a preloaded offline replica; tombstoned products/categories absent from the mapped UI props; blocked/stale/revoked/scope-invalid cannot display usable POS data (gate + workspace); flag OFF has no new effects (online `/pos` + `/offline` shell unchanged, verified); no tenant/branch/warehouse/terminal leakage (scope enforcement + replica isolation + safe HTML shell).

### Commit

| Commit | Description |
|---|---|
| `6438b88` | feat(offline): Phase 6.1 render the same POS UI read-only from the local replica offline |

### Known limitations / WAITING (Phase 6.1)

- **Live installable-PWA offline QA — WAITING.** Deterministic tests + flag-off GUI are done; exercising a real offline reload of the installed PWA (SW navigation fallback → `/offline` → replica render) needs an installable HTTPS/PWA context and is deferred.
- **Device unlock UI** (PIN) is not part of this phase; the gate uses replica presence + scope + `bootstrapComplete` + device-active. Full lock/unlock + client revocation application land with Phase 3/11.
- `PosPageClient`'s secondary network effects (recent-sales/cash refresh) are best-effort and simply no-op offline; the primary grid/search/cart render from props. Deeper action-level disabling beyond the read-only policy is a later polish.
- Migrations review-only/not applied; offline default-OFF.

## Phase 6.2 — device-local PIN unlock + complete read-only UI blocking (COMPLETE)

### Result

The public offline workspace now **starts locked** and requires a successful device-local **PIN unlock** (Phase 3 PBKDF2 foundation) before any store data is read from IndexedDB. While locked it shows **only** a PIN prompt — no product names, prices, customers, stock, categories, or counts. A wrong PIN reveals nothing and never mutates the stored hash. Unlock is **in-memory only**, so a reload/new session returns to the locked state. Device **revocation + policy updates** are fetched from the secured status endpoint while online, cached, and enforced before the next offline session. Every POS write control is disabled in read-only mode via the restrictive permission policy (immediate client block, **no network write**), and the primary Pay/hold/resume controls are additionally `disabled`. Flag OFF preserves the online POS exactly.

### How it works

- **Lock gate.** `decideOfflineWorkspace` (pure) resolves the workspace to one of `flag_off | online | online_setup_pin | blocked | no_lock | locked`. Offline + gate-permitted + a stored lock → `locked` (never straight to `ready`). `OfflinePosWorkspace` computes the gate/scope/lock-set **without holding any store data in state**; store props are assembled **only after** a successful `unlockDevice`.
- **PIN storage.** Reuses `features/offline/auth/device-unlock.ts` — only a salted **PBKDF2-SHA256** hash + salt is stored in the meta store; the plaintext PIN, tokens, passwords, and secrets are never persisted (verified by test). `unlockDevice` is read-only w.r.t. the stored hash; a wrong PIN cannot weaken/reset it.
- **Namespace isolation.** A valid PIN unlocks only the currently active terminal's namespaced database; a sibling terminal DB on the same browser has no lock and returns `not_set`.
- **Revocation.** `statusSync` now returns `deviceStatus` + `policyVersion`; the network client exposes a `status` fetcher; `PosOfflineSync` fetches it after each online sync and calls `repo.cacheDeviceStatus(...)`. The offline gate reads the cached `deviceStatus` (meta) — a revoked device is `blocked` (data hidden) on the next offline evaluation.
- **Read-only UI.** `PosPageClient` gains a `readOnly` prop: the Pay button, Hold Bill, and Resume Bills are `disabled`, `completeSale` is guarded, and the focus/`storage` refetch effect no-ops. All other write actions already funnel through `enforcePosAction` → `evaluatePosPermission`, which the restrictive read-only policy denies **immediately** (no approval path, no network) — proven for every `PosPermissionAction`.

### Files added / changed

- Added: `features/offline/pos-read/offline-workspace-state.ts`; test `features/offline/__tests__/offline-workspace-pin.test.ts`
- Changed: `components/offline/offline-pos-workspace.tsx` (PIN lock/unlock/setup gate + LockScreen), `features/pos/components/pos-page-client.tsx` (`readOnly` prop + guards), `features/offline/pos-read/pos-client-props.ts` (expose `readOnly`), `components/offline/pos-offline-sync.tsx` (fetch/cache device status), `features/offline/pos-read/network-client.ts` (`status` fetcher), `features/offline/replica/store-snapshot-repository.ts` (cache/read `deviceStatus`+`policyVersion`), `features/offline/local-db/schema.ts` (+`deviceStatus` meta), `features/offline/server/sync-contract.ts` + `sync-service.ts` (status returns `deviceStatus`+`policyVersion`), test `features/offline/__tests__/pos-read-repository.test.ts` (meta literal)

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Prisma client generate | `npx prisma generate` | **0** | Regenerated (no DB touched). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Offline tests | `npm run test:offline` | **0 (PASS)** | 159 tests pass (19 new in 6.2). |
| Production build | `npm run build` | **0 (PASS)** | Compiled; `/offline` route built. |

Required tests (all passing): no replica data before unlock (only a lock meta record; no persisted unlocked flag); wrong PIN → `invalid_pin` and stored hash unchanged; correct PIN unlocks only the matching terminal namespace; reload returns to `locked`; revoked device → `blocked device_revoked` (offline) and no PIN-setup offer (online); every write action denied immediately with `approvalRequired:false` (no network); flag OFF → `flag_off`. Plus a default-PBKDF2 test proving the stored value is a 64-hex-char non-plaintext hash that verifies.

### Commit

| Commit | Description |
|---|---|
| _(see PR)_ | feat(offline): Phase 6.2 device-local PIN unlock + read-only UI blocking |

### Known limitations / WAITING (Phase 6.2)

- **Live installable-PWA offline QA — WAITING.** The lock → unlock → replica render loop over a real service-worker offline reload needs an installable HTTPS/PWA context; covered here by deterministic tests + flag-off GUI.
- Revocation caching happens during online `/pos` sessions (where `PosOfflineSync` mounts); the offline workspace enforces the last cached status.
- Migrations review-only/not applied; offline default-OFF.

## Phase 6.3 — fix the React `getServerSnapshot` caching warning (COMPLETE)

### Result

Removed the React warning "The result of getServerSnapshot should be cached to avoid an infinite loop" emitted by the connectivity store during SSR/hydration. `getServerSnapshot` now returns a **frozen, module-level constant** (`SERVER_SNAPSHOT`) instead of a fresh object literal per call, so `useSyncExternalStore` sees a referentially stable server snapshot and cannot enter a render loop. No offline business logic, feature flags, UI behavior, permissions, replica data, sync protocol, or POS write behavior changed.

### How it works

- `features/offline/pwa/connectivity.ts`: added `const SERVER_SNAPSHOT = Object.freeze({ state: "online", navigatorOnline: true, lastHealthyAt: null, updatedAt: "1970-01-01T00:00:00.000Z" })` and returned it from `getServerSnapshot()`. It stays a neutral "online" default so server HTML never flashes offline before the client store hydrates real connectivity.
- Client `getSnapshot()` was already referentially stable (the store only replaces its snapshot on a real change and skips redundant emits), so there is no render loop, no repeated sync, no stale status, and no false Online/Offline transition.

### Files changed

- Changed: `features/offline/pwa/connectivity.ts` (stable frozen server snapshot)
- Added: `features/offline/__tests__/connectivity.test.ts`

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Offline tests | `npm run test:offline` | **0 (PASS)** | 163 tests pass (4 new connectivity tests). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Production build | `npm run build` | **0 (PASS)** | Compiled; routes built. |
| Manual GUI | computerUse | PASS | Console shows NO `getServerSnapshot` warning; Phase 6.2 locked → wrong PIN → unlock → read-only POS still works. |

New tests: `getServerSnapshot` returns the same frozen reference across calls; the singleton is shared; `getSnapshot` is stable until connectivity changes; subscribe wires window listeners exactly once; offline/online events transition state and notify once each; a redundant offline event neither re-emits nor flips state (no false transition); unsubscribe stops notifications; the server snapshot stays independent + stable through client transitions.

### Known limitations / WAITING (6.3)

- None. Scope was limited to the connectivity server-snapshot caching fix.

## Documentation correction — prior "Phase 6" work was read-side + security sub-slices

To keep the record accurate against the authoritative `offline-first-tasks.md`: the earlier Phase 6 / 6.1 / 6.2 / 6.3 iterations delivered the **read-side POS integration** (adapter/gate/provider + controlled bootstrap/delta sync), the **same-UI offline read-only render**, the **device-local PIN unlock + read-only blocking + revocation**, and a **connectivity fix**. They did **not** complete the write side of the task plan's Phase 6 (receipt identity, local checkout, offline sale/stock writes). Those Phase 6 checkboxes remain unchecked. The write side begins with **Phase 6A** below.

## Phase 6A — local offline CASH checkout domain foundation (COMPLETE)

### Result

Implemented the **domain foundation** for offline CASH checkout: a permanent, collision-free terminal receipt reference; pure cart/price/tax/discount/safe-promotion math; the immutable cash-sale operation payload + local entities; and an **atomic, idempotent** `commitOfflineCashSale`. The Offline POS UI stays **read-only** in this slice — the Pay button is not enabled and nothing calls the commit from the UI yet. Cash-only: no QR/transfer/card, no sync application, no refunds/voids/returns/holds, no cash movement, no Recent Sales/receipt UI, no Customer Display. The cloud remains the final authority and re-validates on sync.

### How it works

- **Permanent, collision-free receipt reference.** `commitOfflineCashSale` draws the next reference from a cloud-**reserved** per-terminal range via the pure `allocateNextReceipt` (Phase 3) and advances the local range atomically with the sale. References are sequential within the reserved `[rangeStart, rangeEnd]` and never wrap/reuse, so they cannot collide with cloud-issued numbers (which live outside reserved ranges) and remain permanent after sync. Range exhaustion throws `ReceiptRangeExhaustedError`.
- **Pure calculations** (`features/offline/checkout/cart-math.ts`): line totals, subtotal, best-single **safe promotion** (non-stacking, capped), manual discount (capped), tax (inclusive/exclusive), total, and change — reusing `roundLak` + `cartLineSubtotal`/`requiredBaseQty` from `features/pos`. Cloud re-validates.
- **Immutable payload + local entities** (`cash-sale-types.ts`): `OfflineCashSalePayload` (sale, items, cash payment, terminal stock/lot consumption, immutable receipt snapshot, audit metadata) carried on a `pos.sale.complete` operation envelope with `clientEntityIds` + `dependencies`. Local `sales` + `inventory_events` records extend the Phase 1 base bookkeeping. The receipt snapshot is **deep-frozen** and self-contained, so later price/promotion changes never alter it.
- **Atomic commit + idempotency** (`commit-cash-sale.ts`): one transaction over meta + outbox + sales + inventory_events + cash_sessions + receipt_ranges + stock_allocations. Keyed by `operationId`: a retry/reload with the same id returns the already-committed sale and performs **no** new writes → no duplicate sale, receipt reference, or stock movement. Any validation failure throws and rolls back the whole transaction (no partial write).
- **Cash-session precondition** (`cash-session-guard.ts`): a sale is rejected unless a locally-**open, compatible** cash session exists for this company/branch/terminal.
- **Terminal allocation + lot/expiry** (`stock-guard.ts` + `consumeAllocation`): cart quantities and checkout consume the terminal's sellable lease; a lot-scoped lease that is inactive/expired is an invalid lot; leases can never be over-consumed, so local available stock cannot go negative. Missing lease → `NoTerminalAllocationError`; insufficient → `InsufficientTerminalStockError`; expired lot → `InvalidLotError`.
- **Isolation**: all records are written to the per-company/branch/terminal namespaced local DB (v3 adds `receipt_ranges` + `stock_allocations` stores), and the sale entity carries company/branch/warehouse scope. A different terminal's DB cannot see or consume another terminal's sale or lease.

### Files added / changed

- Added: `features/offline/checkout/{cart-math,cash-sale-types,terminal-provisioning,cash-session-guard,stock-guard,commit-cash-sale}.ts`; test `features/offline/__tests__/cash-checkout.test.ts`
- Changed: `features/offline/local-db/schema.ts` (v3 stores: `receipt_ranges`, `stock_allocations`), `features/offline/index.ts` (barrel exports)

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Offline tests | `npm run test:offline` | **0 (PASS)** | 175 tests pass (12 new Phase 6A). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Prisma client generate | `npx prisma generate` | **0** | Regenerated (no DB touched). |
| Production build | `npm run build` | **0 (PASS)** | Compiled; routes built. |

Required tests (all passing): (1) a valid cash sale commits sale + outbox + movement atomically and advances the range/lease; (2) duplicate submit and reopen-after-reload are idempotent (no duplicate sale/receipt/movement, range + lease unchanged); (3) missing/closed cash session rejected with no write; (4) insufficient allocation / missing lease / invalid-expired lot / insufficient cash rejected with no partial write; (5) receipt snapshot immutable after a later price/promotion change; (6) operation dependency ordering (`topologicalOrder` places the sale after its cash-session-open) + per-company/branch/warehouse/terminal isolation. Plus pure cart-math + stock-guard unit tests.

### Known limitations / WAITING (6A)

- **UI intentionally read-only** — the Pay button is not enabled and no component calls `commitOfflineCashSale` yet (wiring is Phase 6B).
- Server sale-number issuance/validation is unchanged; accepting reserved offline references on the server + actual sync application are later slices.
- Not in scope (later phases): QR/transfer/card, loyalty redemption event, refunds/voids/returns/holds, cash movement, Recent Sales + receipt UI, Customer Display.

## Phase 6B — authoritative server application + reconciliation for queued offline CASH sales (COMPLETE)

### Result

Implemented the **authoritative server handler** for accepted `pos.sale.complete` offline operations. It validates the operation, applies the **canonical cloud sale by REUSING the existing online write path** (`writeCompletePrismaSale` — no parallel/weaker sale path), advances the terminal receipt range + stock leases, and records the accepted `OfflineOperation` with a local→cloud id mapping — all in one authoritative transaction. Duplicate delivery returns the original result with no repeats; rejections return a precise machine-readable reason and keep a rejected ledger row for review. CASH only. No user-facing checkout action is enabled.

### How it works

- **Pure handler + gateway boundary.** `applyOfflineCashSale` (`server/cash-sale-apply.ts`) orchestrates: idempotency (by companyId+operationId) → CASH-only guard → tenant/branch/warehouse/terminal/actor scope → device active → **referenced active-compatible cloud cash session** → **terminal-reserved receipt reference** (`validateReceiptReference`: parses under the reserved prefix, in `[start,end]`, not behind the cursor → else `receipt_collision`) → **terminal stock allocation + lot/expiry** (`consumeAllocation`; expired lot-scoped lease → `invalid_lot`; over-consumption → `insufficient_stock_allocation`). Persistence lives behind a `CashSaleGateway` so the flow is deterministically testable.
- **Atomic accept.** `PrismaCashSaleGateway.commitAccepted` runs ONE `withTenantTransaction`: `writeCompletePrismaSale(tx, …)` (canonical sale + items + cash payment + stock movement + receipt + audit, server-authoritative re-pricing) → advance `TerminalReceiptRange` + `TerminalStockAllocation` (optimistic base version) → create the accepted `OfflineOperation` (with the reconciliation `result`) + audit link. So the sale and its idempotency ledger commit together (a crash before commit leaves nothing; the retry re-applies safely).
- **Idempotency.** The engine already short-circuits a stored operation; the handler also re-checks the ledger. `CommandResult` now carries `result`, returned on both a fresh accept and a duplicate, so the client can always reconcile. A duplicate creates no second sale/receipt/payment/stock movement/audit.
- **Reconciliation.** Accept returns `{ localSaleId, cloudSaleId, saleNo, receiptNo, receiptReference, totalLak, itemIdMap: [{localLineId, cloudItemId}] }` so the local outbox/recent-sale record can transition pending → synced.
- **Rejections.** A precise `SyncErrorCode` + `detail` (e.g. `cash_session_incompatible`, `receipt_reference_already_used`, `insufficient_stock_allocation`, `invalid_lot`, `terminal_mismatch`) is returned and a **rejected** `OfflineOperation` is recorded (no sale) so the client can transition pending → rejected and a human can review. The local sale is never silently dropped, altered, or duplicated.
- **Wiring.** `pushSync` passes an `applyCommand` that routes only `pos.sale.complete` through `applyOfflineCashSale` (other types unchanged). Online checkout files are untouched.

### Files added / changed

- Added: `features/offline/server/{cash-sale-apply,cash-sale-gateway,prisma-cash-sale-gateway}.ts`; test `features/offline/__tests__/offline-cash-sale-apply.test.ts`
- Changed: `features/offline/server/sync-contract.ts` (`CommandResult.result`), `sync-engine.ts` (return `result` on fresh + duplicate), `sync-service.ts` (`applyCommand` wiring + `getCashSaleGateway`)

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Offline tests | `npm run test:offline` | **0 (PASS)** | 194 tests pass (19 new Phase 6B). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors (incl. `writeCompletePrismaSale` reuse). |
| Prisma client generate | `npx prisma generate` | **0** | Regenerated (no DB touched). |
| Production build | `npm run build` | **0 (PASS)** | Compiled; routes built. |

Required tests (all passing): (1) accepted queued cash sale creates exactly one canonical cloud sale + advances range/lease; (2) duplicate delivery/retry after an interrupted response creates nothing twice and returns the original result; (3) invalid receipt range/reference, cash session (missing/closed/incompatible), allocation (missing/insufficient), lot (expired), device (revoked/unregistered), tenant/company, branch, warehouse, terminal, and non-cash payment are each rejected with a machine-readable code + detail and **no partial server write**; (4) accepted response reconciles local sale/item ids to canonical cloud ids; (5) a rejected response persists a rejected ledger + audit and stays idempotent on re-delivery; (6) the offline applier is isolated and online checkout files are unchanged (git diff + build/typecheck).

### Known limitations / WAITING (6B)

- **No user-facing checkout action** — the Pay button stays disabled; this is server application only.
- The `PrismaCashSaleGateway` requires the offline Prisma tables + a live DB, so it is exercised in production/integration (the offline tables are intentionally not migrated in this dev DB per the task rules); the orchestration + validation are covered by the in-memory tests.
- The canonical cloud `saleNo`/`receiptNo` come from the existing online generator; the permanent offline **`receiptReference`** is preserved in the reconciliation + `OfflineOperation` result (mapping), not necessarily as the cloud `saleNo`.
- Not in scope (later): QR/transfer/card, loyalty, holds/refunds/returns/voids, inventory back-office, cash-session sync (Phase 7), and client-side application of the reconciliation (Phase 6C).

## Phase 6B.1 — server authorization hardening for offline cash-sale apply (COMPLETE)

### Result

Strengthened `applyOfflineCashSale` so that BEFORE any authoritative sale write it explicitly validates: (1) the device is active **and bound to the terminal**; (2) tenant/company/branch/warehouse/terminal scope; (3) the cashier actor is still active **and** permitted for POS sale; (4) the cached policy version and offline authorization/grace window; (5) the sale timestamp is within the allowed offline window and not materially future-dated. Invalid policy/grace/actor/device cases are rejected with existing machine-readable codes and create **no** sale/receipt/payment/stock movement/cash movement/duplicate audit. Idempotency is preserved (a repeat returns the stored original result without re-running validation or writes). Online checkout is unchanged; the Pay button stays disabled.

### How it works

- Reuses the Phase 3 pure `evaluateOfflineWriteAuthorization` (device revoked/not-active, user disabled, permission denied, **policy stale**, **grace expired**) with the actor's live `active` + `canSellPos` and the device's `policyVersion` + `offlineGraceDays` + `lastPolicySyncAt`; the envelope's cached `policyVersion` is compared against the server's. Reasons map to `permission_denied` / `stale_policy` / `invalid_terminal` codes.
- New explicit checks: **device-bound-to-terminal** (`device.terminalId === terminalId` → else `invalid_terminal:device_terminal_unbound`) and **actor existence** (`getActor` → `permission_denied:actor_not_found`).
- New pure `validateSaleTimestamp`: rejects `future_dated_sale` beyond a 5-minute skew and `sale_outside_offline_window` older than the device grace days (`stale_policy`).
- Ordering guarantees no partial write: all authorization runs before receipt/allocation consumption and the atomic commit; any failure throws → the gateway records only a rejected ledger row.
- `CashSaleGateway` gains `getActor`; `CloudDeviceView` gains `terminalId` + `offlineGraceDays` + `lastPolicySyncAt`; `ApplyContext` gains `cachedPolicyVersion` (wired from the envelope in `pushSync`). The `PrismaCashSaleGateway` resolves the actor from `company_users` + `users` and the device fields from `TerminalDevice`.

### Files changed

- Changed: `features/offline/server/cash-sale-apply.ts` (auth sequence + `validateSaleTimestamp` + `getActor`/device fields), `cash-sale-gateway.ts` (+actor), `prisma-cash-sale-gateway.ts` (device fields + `getActor`), `sync-service.ts` (pass `cachedPolicyVersion`)
- Added: `features/offline/__tests__/offline-cash-sale-authz.test.ts`

### Validation evidence

| Check | Exact command | Exit code | Output summary |
|---|---|---|---|
| Offline tests | `npm run test:offline` | **0 (PASS)** | 205 tests pass (11 new Phase 6B.1). |
| Type check | `npm run typecheck` | **0 (PASS)** | No type errors. |
| Prisma client generate | `npx prisma generate` | **0** | Regenerated (no DB touched). |
| Production build | `npm run build` | **0 (PASS)** | Compiled; routes built. |

Required tests (all passing): (1) disabled cashier → `permission_denied:user_disabled`; (2) stale policy version → `stale_policy:policy_stale`; (3) expired offline grace → `stale_policy:grace_expired`; (4) revoked device → `permission_denied:device_revoked` (+ device-terminal-unbound → `invalid_terminal`); (5) materially future-dated sale → `validation_failed:future_dated_sale` (+ out-of-window → `stale_policy`); (6) valid path still accepts exactly one canonical sale. Plus: no-permission cashier rejected; idempotent repeat of a rejected/accepted op returns the stored result with no re-run/second sale; each rejection asserts no sale + range/lease untouched + rejected ledger kept.

### Known limitations / WAITING (6B.1)

- Still server-application only — no user-facing checkout; online checkout untouched.
- The `PrismaCashSaleGateway` (incl. `getActor`) runs against a live DB in production/integration; orchestration + validation are covered by the in-memory tests.

- Phase 6C / Phase 7 not started (awaiting review approval).
