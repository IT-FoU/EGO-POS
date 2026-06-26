# LP-8 — MVP Login Portal Simplification Report

> **Phase:** LP-8  
> **Baseline:** LP-7A @ `e874edb`  
> **Status:** **COMPLETED**

---

## 1. Summary

MVP exposes only **Store Login** and **Super Admin Login** as visible portals. EGO Admin / Setup Admin code, routes, and `setup_admins` DB model are **retained but hidden/deferred**. Super Admin is the MVP control portal for platform and store creation.

---

## 2. Visible login portals (MVP)

| Portal | Route | Users |
| --- | --- | --- |
| **Store Login** | `/login` | Store Owner, Manager, Cashier |
| **Super Admin** | `/super-admin/login` | EGO POS platform owner |

---

## 3. Hidden / deferred portals

| Portal | Route | Status |
| --- | --- | --- |
| **EGO Admin / Setup Admin** | `/ego-admin/login` | Code + DB retained; deferred notice on direct access; not linked from visible UI |

---

## 4. MVP architecture rule

**Forbidden chain:** Super Admin → EGO Admin → Store Login

**Correct MVP:**

- Super Admin logs in → controls platform → creates stores at `/super-admin/stores/new`
- Store users log in at `/login` → assigned company workspace (LP-5)

---

## 5. Files changed

| File | Change |
| --- | --- |
| `lib/portals/mvp-login-portals.ts` | **New** — MVP visible/deferred portal constants |
| `app/api/super-admin/stores/route.ts` | **New** — Super Admin provisioning API |
| `app/(super-admin)/super-admin/stores/new/page.tsx` | **New** — MVP store creation UI |
| `app/(super-admin)/super-admin/page.tsx` | Create store CTA + MVP copy |
| `app/(auth)/login/page.tsx` | Store audience copy |
| `app/(ego-admin)/ego-admin/login/page.tsx` | Deferred MVP notice |
| `components/ego-admin/store-provision-form.tsx` | Configurable API path + back link |
| `lib/i18n/dictionaries.ts` | MVP portal copy (EN/LO) |
| `scripts/phase-lp-8-mvp-login-portal-simplification-check.ts` | **New** LP-8 harness |
| Docs | Runbook, architecture spec, issue log, flow checklist, blocker report |

---

## 6. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| LP-8 harness | **19/19 PASS** |
| LP-6A regression | PASS |
| LP-6 regression | PASS |
| LP-5 regression | PASS |
| LP-4 regression | PASS |
| LP-2 regression | PASS |
| OWNER-UAT-8A regression | PASS |
| OWNER-UAT-3 regression | PASS |
| B8-11 regression | PASS |

---

## 7. Remaining risks

- EGO Admin routes remain reachable by direct URL (intentional for developers).
- Super Admin dashboard beyond store creation is still placeholder/read-only.
- Self-registration (LP-7B+) not implemented.
- LP-4 harness still validates EGO Admin path — both paths share `provisionStore()`.

---

## 8. Next phase readiness

**GO for LP-9 planning** when scoped. LP-9 not started.

**EGO Admin re-enable:** Future phase can restore promotion when dedicated setup staff role is needed.

---

## 9. Push status

Commit created locally; push to `origin/main` required after review.
