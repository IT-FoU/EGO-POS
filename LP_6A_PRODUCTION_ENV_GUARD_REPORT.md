# LP-6A — Production Demo Mode ENV Guard Report

> **Phase:** LP-6A  
> **Baseline:** LP-6 @ `906ebe9`  
> **Status:** **COMPLETED**

---

## 1. Summary

Production deployments can no longer silently run with `IGO_DEMO_MODE=true`. Build and server startup fail with a clear error; runtime helpers force effective demo mode off in `NODE_ENV=production`.

**Error message:** `Unsafe configuration: IGO_DEMO_MODE=true is not allowed in production.`

---

## 2. Guard behavior

| Layer | Behavior |
| --- | --- |
| `next.config.ts` | Calls `assertProductionDemoModeSafe()` before build; sets `NEXT_PUBLIC_IGO_DEMO_MODE=false` in production |
| `instrumentation.ts` | Re-validates on production server startup |
| `lib/demo-mode.ts` | `isDemoMode()` uses `resolveEffectiveDemoMode()` — always `false` in production |
| `lib/demo/onboarding-access.ts` | `isDemoOnboardingEnabled()` returns `false` when `NODE_ENV=production` |
| `GET /api/health/config` | Returns `ok`, `requestedDemoMode`, `effectiveDemoMode`, `production` |

---

## 3. Files changed

| File | Change |
| --- | --- |
| `lib/env/demo-mode-guard.ts` | **New** — centralized validation + health status |
| `instrumentation.ts` | **New** — production startup guard |
| `app/api/health/config/route.ts` | **New** — demo mode health reporting |
| `lib/demo-mode.ts` | Uses effective resolver |
| `lib/demo/onboarding-access.ts` | Production NODE_ENV block |
| `next.config.ts` | Build-time assert + safe public env |
| `app/(auth)/login/page.tsx` | Uses `isDemoMode()` |
| `app/(dashboard)/layout.tsx` | Uses `isDemoMode()` |
| `app/(dashboard)/pos/page.tsx` | Uses `isDemoMode()` |
| `scripts/phase-lp-6a-production-env-guard-check.ts` | **New** LP-6A harness |
| Docs | `DATA_SOURCE_MAP.md`, `SYSTEM_INTEGRATION_MAP.md`, `OWNER_UAT_RUNBOOK.md`, `PRODUCTION_BLOCKER_REPORT.md` |

---

## 4. Local development

| Environment | `IGO_DEMO_MODE=true` |
| --- | --- |
| `NODE_ENV=development` (`next dev`) | Allowed |
| `NODE_ENV=production` (`next build` / deploy) | **Blocked** |

---

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS (with `IGO_DEMO_MODE=false`; build **correctly fails** if `.env.local` has `IGO_DEMO_MODE=true` during production build) |
| LP-6A harness | **16/16 PASS** |
| LP-6 regression | PASS |
| LP-5 regression | PASS |
| LP-4 regression | PASS |
| OWNER-UAT-8A regression | PASS |
| B8-11 regression | PASS |

---

## 6. LP-7 readiness

**GO for LP-7 planning** — production demo env misconfiguration is guarded. LP-7 not started.

---

## 7. Push status

Commit created locally; push to `origin/main` required after review.
