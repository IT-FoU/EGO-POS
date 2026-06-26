# Owner UAT Runbook — EGO POS (GO BOX)

> **Phase:** OWNER-UAT-1  
> **Baseline:** GitHub `main` @ `6efd2af` (B8-11 Final Production Readiness Audit Completed)  
> **Audience:** Store owner, manager, and testers running manual UAT on a single GO BOX store.

---

## 1. Purpose

This runbook gets the owner from a clean checkout to a safe manual testing session. Use it together with:

- `OWNER_UAT_FLOW_CHECKLIST.md` — step-by-step flows to test
- `OWNER_UAT_ISSUE_TEMPLATE.md` — how to log bugs
- `OWNER_TESTING_CHECKLIST.md` — original high-level checklist (B8-11)
- `PILOT_BLOCKER_REPORT.md` — known P1 caveats

---

## 2. Prerequisites

| Requirement | Notes |
| --- | --- |
| Node.js | LTS recommended (project uses Next.js 16) |
| PostgreSQL | Running and reachable from this machine |
| Git | On `main`, synced with `origin/main` |
| `.env.local` | Copy from `.env.example` and fill real values |

---

## 3. Required environment checks

Create or verify `.env.local`:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/igo_pos?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secure-random-secret"
IGO_DEMO_MODE="false"
```

**Critical flags for owner testing:**

| Variable | Required value | Why |
| --- | --- | --- |
| `IGO_DEMO_MODE` | `false` | Prevents demo checkout/session fallbacks |
| `IGO_ENABLE_DEMO_FALLBACK` | unset or `false` | Prevents fail-open demo sessions |
| `DATABASE_URL` | valid PostgreSQL URL | All production data lives in DB |
| `NEXTAUTH_SECRET` | non-empty secret | Login/session security |

**Verify demo mode is off (PowerShell):**

```powershell
Select-String -Path .env.local -Pattern "IGO_DEMO_MODE"
# Expect: IGO_DEMO_MODE="false"
```

---

## 4. Database setup and connection check

### First-time / reset test data

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:seed:demo
```

`db:seed:demo` loads GO BOX company, products, users, and sample operational data.

### Database health check

1. Start the app (see §5).
2. Open: `http://localhost:3000/api/health/database`
3. Expect JSON: `{ "ok": true }`

If `ok: false`, fix `DATABASE_URL` and PostgreSQL before testing.

---

## 5. How to start the app locally

From project root:

```bash
npm install
npm run dev
```

Default URL: **http://localhost:3000**

Production-like local run (optional, after `npm run build`):

```bash
npm run start
```

---

## 6. Login accounts / test users

After `npm run db:seed:demo`:

| Role | Username | Password | Typical use |
| --- | --- | --- | --- |
| Owner | `igo-admin` | `AdminChangeMe123!` | Full access, settings, approvals |
| Manager | `manager` | `Manager123!` | Back office, reports, purchasing |
| Cashier | `cashier` | `Cashier123!` | POS sales, limited permissions |

Login page: **http://localhost:3000/login**

### Login portals (OWNER-UAT-8)

| Portal | Route | Who | Auth |
| --- | --- | --- | --- |
| **Store Login** | `/login` | Owner, Manager, Cashier | Owner: email/username + password/PIN; Manager/Cashier: username + PIN |
| **Super Admin** | `/super-admin/login` | Platform owner only | Email + password (no PIN) |
| **EGO Admin** | `/ego-admin/login` | Setup/onboarding staff | Username or email + password (no PIN) |

Legacy `/igo-admin/login` redirects to `/super-admin/login`. Legacy `/igo-admin/*` redirects to matching `/super-admin/*`. Full Super Admin dashboard home is **placeholder only**; read-only sub-pages live under `/super-admin/businesses`, `/users`, `/subscriptions`, `/audit-logs`.

After `npm run db:seed:demo`:

| Portal | Identifier | Password |
| --- | --- | --- |
| Super Admin | `admin@igopos.local` | `AdminChangeMe123!` |
| EGO Admin | `ego-setup` | `SetupChangeMe123!` |

**EGO Admin prerequisite:** run `npx prisma migrate deploy && npm run db:seed:demo` before first setup admin login on a new environment.

After EGO Admin login, `/ego-admin` links to **Create store** at `/ego-admin/stores/new`. Provisioning creates company, branch, warehouse, owner account, and settings in one transaction. Hand off store owner credentials manually — owner logs in at `/login` only.

**Store post-login (LP-5):** Production redirect uses `Company.businessTemplateKey` from DB via `/api/auth/store-entry-path`. Mini Mart owner → `/dashboard`; cashier → `/pos`; other templates → `/template-shell/[template]` or `/dashboard?template=...`. Multi-company users pick assigned stores at `/businesses`.

---

## 7. Recommended test order (what to test first)

Test in this order so each step builds on the last:

1. **Login** — owner, then manager, then cashier
2. **Dashboard** — KPIs load, shift status visible
3. **Settings** — confirm company profile loads (owner)
4. **Products** — list loads, edit one product
5. **Inventory** — stock quantities visible
6. **Suppliers** — list loads
7. **Purchase Order** — create/send PO (manager or owner)
8. **Receiving** — receive against PO, stock increases
9. **POS open shift** — open cash session with opening float
10. **POS sale** — complete a cash sale
11. **Receipt** — view/print receipt
12. **Recent Sales** — sale appears after refresh
13. **Refund** — refund a sale (owner/manager)
14. **Void** — void a different sale
15. **Cash session close** — close shift, verify expected vs counted cash
16. **Reports** — compare sales total to dashboard (same date range)
17. **Customers / Membership** — member pricing or points if used
18. **Promotions** — active promo at checkout (if configured)
19. **Permissions / Approval** — cashier blocked from settings; inventory approval if applicable

Full per-flow steps: `OWNER_UAT_FLOW_CHECKLIST.md`.

---

## 8. What NOT to test yet (out of scope)

Do **not** treat failures in these areas as UAT blockers unless they break core money/stock flows:

| Area | Reason |
| --- | --- |
| Super Admin (`/super-admin`, legacy `/igo-admin`) | Placeholder only — not full platform console |
| Offline POS | Not implemented |
| SaaS onboarding / `/register` self-signup | Not production-ready |
| Hold/resume bill durability | Client-only; lost on refresh (known P1) |
| ESC/POS hardware printer | Browser print only (known P1) |
| Company logo persistence | Preview-only in settings (known P1) |
| Product image upload backend | Stub / no storage |
| Customer & product import/export | Placeholder UI |
| Promotion analytics / stack-rules / integration-map polish | Non-critical UI |
| Report modal narrative / Business Health Score copy | Heuristic/advisory only |

---

## 9. How to record bugs

1. Copy `OWNER_UAT_ISSUE_TEMPLATE.md` for each issue.
2. Fill: page, role, steps, expected vs actual, screenshot, severity.
3. Severity guide:
   - **P0** — money/stock/security wrong; blocks testing
   - **P1** — major workflow broken or confusing; workaround exists
   - **P2** — secondary feature or polish
   - **Cosmetic** — visual/text only
4. Save issues in a folder or tracker the team agrees on (e.g. `uat-issues/YYYY-MM-DD-issue-01.md`).
5. Note if issue matches a known P1 from `PILOT_BLOCKER_REPORT.md` (may be expected).

---

## 10. How to stop the server safely

**Development server (`npm run dev`):**

- In the terminal running the server, press **Ctrl+C** once.
- Wait until the process exits (prompt returns).

**Production server (`npm run start`):**

- Same: **Ctrl+C** in the server terminal.

**Do not:**

- Force-kill during an active sale/checkout if avoidable.
- Close the terminal without stopping Node (orphan process may hold port 3000).

If port 3000 is stuck, restart terminal or find and stop the Node process, then run `npm run dev` again.

---

## 11. Quick pre-UAT verification (maintainer)

Before owner sits down, maintainer should confirm:

```bash
git status          # clean working tree
git log -1 --oneline  # 6efd2af or later B8-11+ commit
npm run typecheck   # PASS
npm run build       # PASS
```

Then start app and verify login as `igo-admin`.

---

## 12. Sign-off

| Item | Done |
| --- | --- |
| Env flags verified (`IGO_DEMO_MODE=false`) | ☐ |
| Database health `ok: true` | ☐ |
| Seed users login | ☐ |
| Owner received flow checklist | ☐ |
| Issue template shared | ☐ |

**Owner UAT session date:** _______________  
**Tester name:** _______________
