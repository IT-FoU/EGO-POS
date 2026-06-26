# LP-6 — Demo localStorage Onboarding Cleanup Report

> **Phase:** LP-6  
> **Baseline:** LP-5 @ `b9fdf80`  
> **Status:** **COMPLETED**

---

## 1. Summary

Production store onboarding no longer uses browser localStorage as a tenant/template source. Demo onboarding remains available only when `IGO_DEMO_MODE=true`, explicitly gated via `isDemoOnboardingEnabled()`. Production store creation continues through EGO Admin provisioning (`/ego-admin/stores/new`) with DB `Company.businessTemplateKey` driving post-login redirect (LP-5).

---

## 2. Path classification

| Path | Classification | Production behavior |
| --- | --- | --- |
| `/businesses` | Production + demo split | Production: DB redirect (1 company), picker (2+), no-assignment message (0). Demo: template picker + localStorage draft |
| `/businesses/setup` | Demo-only | Redirects to `/businesses` when `IGO_DEMO_MODE=false` |
| `/register` | Deprecated (public signup) | Request-access message; links to `/login`; references OWNER-UAT-5 |
| `TemplatePicker` | Demo-only | Rendered only in demo branch of `/businesses` |
| `BusinessSetupForm` | Demo-only | Writes localStorage only when `isDemoOnboardingEnabled()` |
| `OnboardingEntryRedirect` | Demo-only | `enabled` prop; production pages pass `isDemoMode()` |
| `GET /api/auth/store-entry-path` | Production | DB `businessTemplateKey`; `usesLocalStorageTemplate` true only in demo |
| `/ego-admin/stores/new` | Production | LP-4 DB provisioning — unchanged |
| Theme/locale/customer-display localStorage | Safe local preference | Unchanged (B8-10 policy) |
| Demo product/sales repositories | Demo-only dead paths in production reads | Unchanged |

---

## 3. Routes changed

| Route | Change |
| --- | --- |
| `/register` | Replaced fake signup form with request-access message |
| `/businesses/setup` | Production redirect to `/businesses` |
| `/businesses` | No code change (LP-5 production path preserved); demo path unchanged |
| `/login` | Passes `demoMode` to login form for fallback policy |
| `/template-shell/[template]` | Uses session company name; demo-only review-setup link |

---

## 4. Files changed

| File | Change |
| --- | --- |
| `lib/demo/onboarding-access.ts` | **New** — `isDemoOnboardingEnabled()` server/client gate |
| `next.config.ts` | Expose `NEXT_PUBLIC_IGO_DEMO_MODE` for browser guard |
| `features/platform/onboarding-context.ts` | Gate all onboarding localStorage reads/writes |
| `app/(auth)/register/page.tsx` | Request-access page |
| `app/(platform)/businesses/setup/page.tsx` | Production redirect |
| `components/auth/login-form.tsx` | Production fallback → `/businesses` (not localStorage) |
| `app/(auth)/login/page.tsx` | Pass `demoMode` prop |
| `features/platform/components/template-placeholder-shell.tsx` | DB company name; demo-gated setup link |
| `app/(platform)/template-shell/[template]/page.tsx` | Pass `storeName` + `demoMode` |
| `lib/i18n/dictionaries.ts` | Register closed copy (EN/LO) |
| `scripts/phase-lp-6-demo-onboarding-cleanup-check.ts` | **New** LP-6 harness |
| Docs | `DATA_SOURCE_MAP.md`, `SYSTEM_INTEGRATION_MAP.md`, `LOGIN_PORTAL_ARCHITECTURE_SPEC.md`, `OWNER_UAT_RUNBOOK.md`, `OWNER_UAT_ISSUE_LOG.md`, `PRODUCTION_BLOCKER_REPORT.md` |

---

## 5. localStorage paths removed or gated

| Key / function | Action |
| --- | --- |
| `ego-pos:onboarding-business` | Read/write gated by `isDemoOnboardingEnabled()` |
| `ego-pos:onboarding-complete` | Read/write gated |
| `ego-pos:onboarding-draft` | Read/write gated |
| `ego-pos:onboarding-template` | Read/write gated |
| `getStoredEntryPath()` | Returns `/businesses` in production |
| `completeOnboarding()` | No-op in production |
| `saveSelectedTemplateDraft()` | No-op in production |
| Login form post-auth fallback | `/businesses` in production (not `getStoredEntryPath()`) |

---

## 6. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** (79 routes) |
| LP-6 harness | **19/19 PASS** |
| LP-5 regression | **19/19 PASS** |
| LP-4 regression | **24/24 PASS** |
| LP-3 regression | **23/23 PASS** |
| LP-2 regression | **18/18 PASS** |
| OWNER-UAT-8A regression | **25/25 PASS** |
| OWNER-UAT-3 regression | **16/16 PASS** |
| B8-11 regression | **46/46 PASS** |

---

## 7. Remaining risks

- Demo repositories (`lib/demo/repositories.ts`) still exist for explicit demo paths; not production SOT.
- Stale browser localStorage from prior demo sessions is ignored in production but not auto-cleared.
- Self-registration API and email verification remain unimplemented (OWNER-UAT-5 / LP-7).
- `IGO_DEMO_MODE=true` in production deploy would re-enable localStorage onboarding — env verification remains a deploy checklist item.

---

## 8. LP-7 readiness

**GO for LP-7 planning** — production onboarding is DB-backed and demo localStorage is isolated. LP-7 (self-registration + approval per OWNER-UAT-5) can proceed when explicitly started.

**Do not start LP-7 until confirmed.**

---

## 9. Push status

Commit created locally; **push to `origin/main` required** after review.
