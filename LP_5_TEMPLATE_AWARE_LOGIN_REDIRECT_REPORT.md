# LP-5 — Template-Aware Post-Login Redirect Report

> **Phase:** LP-5  
> **Baseline:** LP-4 @ `2631716`  
> **Status:** **COMPLETED**

---

## 1. Summary

Store login post-redirect now uses `Company.businessTemplateKey` from PostgreSQL as the production source of truth. localStorage onboarding no longer drives production tenant routing.

---

## 2. Template route mapping

| Template key | Owner / Manager | Cashier (POS-only) |
| --- | --- | --- |
| `mini_mart` | `/dashboard` | `/pos` |
| `restaurant`, `pharmacy`, `clothing`, `wholesale_store`, `online_seller` | `/template-shell/[template]` | `/dashboard?template=[template]` |
| `clothes_shop` (alias) | `/template-shell/clothing` | `/dashboard?template=clothing` |
| `wholesale` (alias) | `/template-shell/wholesale_store` | `/dashboard?template=wholesale_store` |
| Unknown / `rental` | `/dashboard?template=[key]` | `/dashboard?template=[key]` |

Missing `businessTemplateKey` falls back to `mini_mart` (`/dashboard` or `/pos`).

---

## 3. Routes / APIs

| Path | Purpose |
| --- | --- |
| `GET /api/auth/store-entry-path` | Resolve DB-backed redirect for authenticated store user |
| `POST /api/auth/select-company` | Switch active company in session + return template redirect |

---

## 4. `/businesses` production behavior

| Case | Behavior |
| --- | --- |
| 0 companies | Safe no-assignment message |
| 1 company | Auto-redirect to template-aware workspace |
| 2+ companies | DB-backed company picker |
| `IGO_DEMO_MODE=true` | Legacy template picker preserved for demo |

---

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| LP-5 harness | **19/19 PASS** |
| LP-4 regression | **24/24 PASS** |
| LP-3 regression | **23/23 PASS** |
| LP-2A regression | **18/18 PASS** |
| OWNER-UAT-8A regression | **25/25 PASS** |
| OWNER-UAT-3 regression | **16/16 PASS** |
| B8-11 regression | **46/46 PASS** |

---

## 6. LP-6 readiness

**GO for LP-6 planning** — DB template redirect is live. LP-6 can remove remaining demo localStorage onboarding paths.

**Do not start LP-6 until confirmed.**
