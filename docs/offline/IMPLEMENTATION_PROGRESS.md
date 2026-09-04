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
| 3 | Device, terminal and offline authentication | Not started (awaiting approval) |
| 4 | Cloud sync protocol and server protection | Not started |
| 5 | Local snapshot and repository adapters | Not started |
| 6 | Receipt identity, local sales and POS checkout | Not started |
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

- Phase 3 not started (awaiting review approval).
