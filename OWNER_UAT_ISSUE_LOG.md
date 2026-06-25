# Owner UAT Issue Log

> Manual issues found during owner UAT and fixes applied between UAT phases.

---

## P0 — Fixed

### UAT-2: Owner dashboard blocked by dashboard permission

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-001 |
| **Page** | `/dashboard` |
| **Role used** | Owner (`igo-admin`) |
| **Reported error** | `PermissionDeniedError: Permission denied: dashboards.view` (runtime also observed as `dashboard.view`) |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Steps to reproduce (before fix):**

1. Set `IGO_DEMO_MODE=true` (or use demo auth path with seeded DB).
2. Log in as `igo-admin` / `AdminChangeMe123!`.
3. Open `http://localhost:3000/dashboard`.

**Expected:** Dashboard loads for owner.

**Actual:** Runtime `PermissionDeniedError` at `assertPermission` in dashboard service.

**Root cause:**

- Demo-mode login returned synthetic session user IDs (`demo-owner-login`, etc.) that do not exist in `company_users`.
- `getUserPermissionKeys` returned an empty permission set for those IDs, so dashboard permission checks failed even for the store owner.
- Canonical permission key is `dashboard.view` (not `dashboards.view`); legacy `dashboards.view` checks are now aliased to `dashboard.view`.

**Fix:**

- Demo login now resolves to real DB user/session when seeded users exist (`lib/auth/options.ts`).
- Permission lookup maps legacy demo user IDs to seeded usernames and grants company-owner wildcard when appropriate (`features/access-control/prisma-repository.ts`).
- Added `dashboards.view` → `dashboard.view` permission alias (`features/access-control/permission-catalog.ts`).
- Demo fallback session prefers DB-backed owner session when available (`lib/auth/session.ts`).

**Verification:** `scripts/phase-owner-uat-2-dashboard-permission-check.ts`

---

### UAT-3: Dashboard blocked by tenant scope (active company assignment)

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-002 |
| **Page** | `/dashboard` |
| **Role used** | Owner (`igo-admin`) |
| **Reported error** | `User is not assigned to the active company.` at `resolveTenantScope` |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Steps to reproduce (before fix):**

1. Log in with a session that still carries a synthetic demo user ID (`demo-owner-login`) or demo fallback path.
2. Open `http://localhost:3000/dashboard`.

**Expected:** Dashboard loads and report snapshot resolves tenant scope.

**Actual:** Dashboard permission passed (post UAT-2) but `getPrismaReportsSnapshot` failed in `resolveTenantScope`.

**Root cause:**

- UAT-2 fixed permission lookup for synthetic demo user IDs, but `resolveTenantScope` still queried `company_users` using the raw session `userId`.
- Synthetic IDs such as `demo-owner-login` have no `company_users` row, so tenant scope resolution failed even when the seeded owner user (`igo-admin`) is valid for `gobox-company`.

**Fix:**

- Added shared tenant membership resolver that maps legacy demo session user IDs to seeded DB users before company membership checks (`lib/db/resolve-tenant-user.ts`).
- `resolveTenantScope` now uses resolved effective user ID for membership, branch, and warehouse scope (`lib/db/tenant-scope.ts`).
- Permission lookup reuses the same resolver (`features/access-control/prisma-repository.ts`).

**Verification:** `scripts/phase-owner-uat-3-tenant-scope-check.ts`

---

## Open issues

_(Log new UAT issues below using `OWNER_UAT_ISSUE_TEMPLATE.md`.)_
