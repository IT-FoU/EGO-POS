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

### UAT-3: Login button not submitting correctly

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-003 |
| **Page** | `/login` |
| **Role used** | Owner / Manager / Cashier |
| **Reported error** | Login button appeared inactive or submitted without authenticating; Enter key did not reliably submit |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Login form used native `action="/login" method="post"` alongside a client `preventDefault` handler, so some interactions fell back to a non-auth POST instead of the credentials callback.
- Successful/failed auth was inferred from `response.ok` only; NextAuth `json=true` responses can return HTTP 200 with an error URL, so wrong credentials did not always surface the safe generic message.

**Fix:**

- Removed native form action/method; submit always goes through the credentials callback fetch path (`components/auth/login-form.tsx`).
- Parse callback JSON and treat `error=` URLs as failed login; show generic `"Username or password is incorrect."`.
- Enable submit when required fields are present; Enter submits via standard form submit.

**Verification:** `scripts/phase-owner-uat-3-login-session-check.ts`

---

### UAT-3: Password show/hide button not working

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-004 |
| **Page** | `/login` |
| **Role used** | All merchant roles |
| **Reported error** | Eye icon did not toggle password visibility or cleared the entered value |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Password field type toggle relied only on initial React hydration; the button did not consistently sync the DOM input `type` after interaction.

**Fix:**

- Keep password as controlled state (`value={password}`) so toggling never clears input.
- Toggle button is `type="button"` with `preventDefault`/`stopPropagation`, `aria-pressed`, and `aria-controls`.
- Sync input `type` on visibility state changes via `useEffect` (`components/auth/login-form.tsx`).

**Verification:** `scripts/phase-owner-uat-3-login-session-check.ts`

---

### UAT-3: Owner/Manager/Cashier credential rules and session hardening

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-005 |
| **Page** | `/login`, `/dashboard` |
| **Role used** | Owner, Manager, Cashier |
| **Reported error** | PIN login unsupported; manager/cashier could authenticate by email; generic credential errors inconsistent |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Production auth only compared `passwordHash` and allowed email lookup for all roles.
- Demo seed users had no `pinHash`, so username + PIN flows could not be tested or used.

**Fix:**

- Added merchant credential resolver (`lib/auth/merchant-login.ts`): owner email or username + password or PIN; manager/cashier username + PIN (password fallback only when PIN not seeded).
- Wired production authorize path through the resolver (`lib/auth/options.ts`).
- Seeded demo PIN hashes for owner/manager/cashier (`prisma/seed-demo.ts`).
- Standardized English invalid-credentials copy (`lib/i18n/dictionaries.ts`).

**Verification:** `scripts/phase-owner-uat-3-login-session-check.ts`, `scripts/phase-owner-uat-3-tenant-scope-check.ts`

---

## Open issues

_(Log new UAT issues below using `OWNER_UAT_ISSUE_TEMPLATE.md`.)_
