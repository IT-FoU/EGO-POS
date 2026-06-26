# LP-4 — EGO Admin Store Provisioning Foundation Report

> **Phase:** LP-4  
> **Baseline:** LP-3 @ `321daa1`  
> **Status:** **COMPLETED**

---

## 1. Summary

EGO Admin can provision new stores from `/ego-admin/stores/new` using a setup admin session. Provisioning runs in a DB transaction and hands off store owners to `/login` without chaining sessions.

---

## 2. Delivered

| Area | Result |
| --- | --- |
| Schema | `Company.storeCode` (unique), `Company.businessTemplateKey` |
| UI | `/ego-admin/stores/new` form + success screen |
| API | `POST /api/ego-admin/stores` (setup admin only) |
| Transaction | Company, branch, warehouse, settings, owner, roles, permissions, subscription |
| Safety | Duplicate code/owner rejected; password hashed; no email; no owner auto-login |
| Templates | mini_mart, restaurant, pharmacy, clothing, wholesale_store, online_seller |

---

## 3. Routes / APIs

| Route / API | Purpose |
| --- | --- |
| `/ego-admin/stores/new` | Store provisioning form (protected) |
| `POST /api/ego-admin/stores` | Provision store transaction |

---

## 4. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| LP-4 harness | **24/24 PASS** |
| LP-3 regression | **23/23 PASS** |
| LP-2A regression | **18/18 PASS** |
| OWNER-UAT-8A regression | **25/25 PASS** |
| OWNER-UAT-3 regression | **16/16 PASS** |
| B8-11 regression | **46/46 PASS** |

```bash
npx prisma migrate deploy
npm run db:seed:demo
npm run typecheck
npm run build
npx tsx scripts/phase-lp-4-store-provisioning-check.ts
```

---

## 5. LP-5 readiness

**GO for LP-5 planning** — store provisioning and `businessTemplateKey` on company are in place. LP-5 should implement template-aware post-login routing from DB (not localStorage).

**Do not start LP-5 until confirmed.**
