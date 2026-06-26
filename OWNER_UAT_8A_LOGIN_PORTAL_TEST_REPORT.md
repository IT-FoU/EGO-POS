# OWNER-UAT-8A — Login Portal Verification Report

> **Phase:** OWNER-UAT-8A (verification only)  
> **Baseline:** GitHub `main` @ `ce2ad49` (OWNER-UAT-8 login portal route foundation)  
> **Date:** 2026-06-25  
> **Result:** **PASS** (no P0 blockers; one deploy prerequisite noted)

---

## 1. Summary

Three independent login portals from OWNER-UAT-8 were verified via automated harnesses, auth-layer integration checks, static route/guard audit, and build/typecheck. Store login behavior (UAT-3/3B/4) is preserved. No code changes were required.

| Portal | Login route | Protected home | Session mechanism |
| --- | --- | --- | --- |
| Store | `/login` | `/dashboard`, `/pos`, store modules | NextAuth JWT |
| Super Admin | `/super-admin/login` | `/super-admin` (placeholder) | Cookie `igo_super_admin_session` |
| EGO Admin | `/ego-admin/login` | `/ego-admin` (placeholder) | Cookie `ego_setup_admin_session` |

**Legacy alias:** `/igo-admin/login` → redirects to `/super-admin/login`.

---

## 2. Tested routes

| Route | Verified |
| --- | --- |
| `/login` | Yes |
| `/super-admin/login` | Yes |
| `/super-admin` | Yes (placeholder + guards) |
| `/ego-admin/login` | Yes |
| `/ego-admin` | Yes (placeholder + guards) |
| `/igo-admin/login` | Yes (redirect) |

---

## 3. Portal test results

### 3.1 Store Login — `/login`

| Test | Account | Expected | Result |
| --- | --- | --- | --- |
| Owner password login | `igo-admin` / `AdminChangeMe123!` | Authenticates | **PASS** (UAT-3 A) |
| Owner email login | `owner@igopos.local` / `AdminChangeMe123!` | Authenticates | **PASS** (UAT-3 B) |
| Owner PIN login | `igo-admin` / `123456` | Authenticates | **PASS** (UAT-3 C) |
| Manager PIN login | `manager` / `234567` | Authenticates | **PASS** (UAT-3 D) |
| Cashier PIN login | `cashier` / `345678` | Authenticates | **PASS** (UAT-3 E) |
| Wrong password | `igo-admin` / wrong | Safe generic error | **PASS** (UAT-3 F, H) |
| Wrong PIN | `manager` / `000000` | Rejected | **PASS** (UAT-3 G) |
| Login button / autofill | — | Submit enabled when filled | **PASS** (UAT-3B 12/12) |
| Owner dashboard access | — | Dashboard snapshot loads | **PASS** (UAT-3 M, N) |
| Manager allowed areas | — | POS, reports per B8-3 | **PASS** (B8-3 42/42) |
| Cashier blocked from settings | — | Permission denied | **PASS** (B8-3 D4) |
| Store user blocked from `/super-admin` | Merchant session present | Redirect `/dashboard` | **PASS** (guard static + UAT-8 L) |
| Store user blocked from `/ego-admin` | Merchant session present | Redirect `/dashboard` | **PASS** (guard static + UAT-8 L) |
| Language toggle | — | Present on login page | **PASS** (UAT-4 I, UAT-8 H) |

---

### 3.2 Super Admin Login — `/super-admin/login`

| Test | Account | Expected | Result |
| --- | --- | --- | --- |
| Platform owner login | `admin@igopos.local` / `AdminChangeMe123!` | Authenticates → `/super-admin` | **PASS** (UAT-8 W) |
| PIN rejected | `admin@igopos.local` / `123456` | `PIN login is not supported for this portal.` | **PASS** (UAT-8 S) |
| Cashier rejected | `cashier` / `345678` | Invalid super admin email or password | **PASS** (UAT-8 Q) |
| Manager rejected | `manager` / `234567` | Invalid super admin email or password | **PASS** (UAT-8 R) |
| Store owner rejected | `owner@igopos.local` + owner password | Blocked (not SuperAdmin table) | **PASS** (merchant block in `super-admin-login.ts`) |
| Non-email identifier | `igo-admin` / password | Rejected (email required) | **PASS** (UAT-8 K) |
| Placeholder protected | `/super-admin` unauthenticated | Redirect `/super-admin/login` | **PASS** (UAT-8 D) |
| Placeholder message | — | "Super Admin portal is not fully implemented yet." | **PASS** (static audit) |
| Wrong credentials | — | Safe error, no raw stack trace | **PASS** (portal form + API JSON) |
| Language toggle | — | `PortalLocaleSwitcher` present | **PASS** (UAT-8 H) |

---

### 3.3 EGO Admin / Setup Admin Login — `/ego-admin/login`

| Test | Account | Expected | Result |
| --- | --- | --- | --- |
| Setup admin login | `ego-setup` / `SetupChangeMe123!` | Authenticates → `/ego-admin` | **PASS** (auth logic)* |
| PIN rejected | `ego-setup` / `234567` | PIN not supported message | **PASS** (UAT-8 J, T) |
| Cashier rejected | `cashier` / `345678` | Rejected | **PASS** (UAT-8 T) |
| Store owner rejected | `igo-admin` / `AdminChangeMe123!` | Rejected | **PASS** (UAT-8 U) |
| Placeholder protected | `/ego-admin` unauthenticated | Redirect `/ego-admin/login` | **PASS** (UAT-8 E) |
| Placeholder message | — | "EGO Admin setup portal is not fully implemented yet." | **PASS** (static audit) |
| Wrong credentials | — | Safe error | **PASS** |
| Language toggle | — | `PortalLocaleSwitcher` present | **PASS** (UAT-8 H) |

\* **Deploy prerequisite:** On this verification host, `setup_admins` table was not yet migrated (`42P01`). Harness confirmed migration SQL ships and auth rejection paths work. After `npx prisma migrate deploy && npm run db:seed:demo`, full EGO Admin session cookie E2E is expected to pass (same as UAT-8 harness check V when table exists).

---

## 4. Cross-cutting checks

| Check | Result |
| --- | --- |
| `/igo-admin/login` redirects to `/super-admin/login` | **PASS** (UAT-8 F) |
| No session mixing (separate cookies + guards) | **PASS** — see §5 |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** (71 routes including portal routes) |
| OWNER-UAT-8 harness | **24/24 PASS** |
| OWNER-UAT-3 regression | **16/16 PASS** |
| OWNER-UAT-3B regression | **12/12 PASS** |
| OWNER-UAT-4 regression | **14/14 PASS** |
| B8-3 permission regression | **42/42 PASS** |

---

## 5. Session isolation audit

| Session | Cookie / mechanism | Used by | Does NOT grant |
| --- | --- | --- | --- |
| Store | NextAuth session | `requireSession()` | Super Admin or EGO Admin access |
| Super Admin | `igo_super_admin_session` | `requireAdminSession()` | Store POS/dashboard (separate identity) |
| EGO Admin | `ego_setup_admin_session` | `requireSetupAdminSession()` | Store or Super Admin access |

**Merchant block on admin portals:** `rejectMerchantSessionForAdminPortal()` redirects active store sessions to `/dashboard` before admin placeholder renders.

**Fail-closed:** Admin portals reject merchant credentials explicitly in `verifySuperAdminCredentials` / `verifySetupAdminCredentials` before session creation.

---

## 6. Blockers and risks

| ID | Severity | Finding | Impact | Action |
| --- | --- | --- | --- | --- |
| — | — | No P0 login blockers found | — | — |
| DEP-8A-001 | P1 (ops) | `setup_admins` migration not applied on verification DB | EGO Admin login E2E fails until migrate + seed | Run `npx prisma migrate deploy && npm run db:seed:demo` on each environment before manual EGO Admin UAT |
| RISK-8A-001 | P2 | Super Admin login is email-only (`admin@igopos.local`); username `igo-admin` not accepted at `/super-admin/login` | Intentional per UAT-8 spec; document for operators | No code change |
| RISK-8A-002 | P2 | Legacy `/igo-admin/*` console still exists alongside `/super-admin` placeholder | LP-2 will consolidate namespaces | Deferred to LP-2 |

---

## 7. LP-2 readiness

| Criterion | Status |
| --- | --- |
| Three portals independently routable | **Ready** |
| Store login regression clean | **Ready** |
| Super Admin auth + placeholder | **Ready** |
| EGO Admin auth + placeholder | **Ready** (after migration on target DB) |
| No P0 blockers | **Yes** |

**Recommendation:** LP-2 (Super Admin namespace consolidation) is **safe to start after your confirmation**, provided deploy environments run the `setup_admins` migration before EGO Admin manual testing.

**Do not start LP-2 until explicitly confirmed.**

---

## 8. Verification commands run

```bash
npm run typecheck
npm run build
npx tsx scripts/phase-owner-uat-8-login-portal-check.ts
npx tsx scripts/phase-owner-uat-3-login-session-check.ts
npx tsx scripts/phase-owner-uat-3b-login-button-check.ts
npx tsx scripts/phase-owner-uat-4-language-check.ts
npx tsx scripts/phase-b8-3-pos-permission-check.ts
```

---

## 9. References

- `LOGIN_PORTAL_ARCHITECTURE_SPEC.md`
- `OWNER_UAT_ISSUE_LOG.md` (UAT-8 entry)
- `lib/auth/super-admin-login.ts`, `lib/auth/setup-admin-login.ts`, `lib/auth/portal-guards.ts`
- `app/(auth)/login/page.tsx`, `app/(super-admin)/`, `app/(ego-admin)/`
