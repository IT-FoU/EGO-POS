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

### UAT-4: Language toggle inconsistent between English and Lao

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-006 |
| **Page** | Dashboard header / global shell |
| **Role used** | Owner |
| **Reported error** | ENG/LAO toggle did not consistently apply or persist across refresh |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Locale resolution was split across URL query (login only), session `preferredLocale` (default Lao), and `localStorage` without a shared cookie for SSR.
- `LanguageToggle` defaulted to Lao when storage was empty and did not broadcast locale changes to all shell consumers.

**Fix:**

- Added shared locale source-of-truth (`lib/i18n/locale.ts`) with English default, cookie persistence, and `ego-pos:locale-change` events.
- Updated `LanguageToggle`, `LocaleBootstrap`, and `DashboardShell` to read/write the same locale store.

**Verification:** `scripts/phase-owner-uat-4-language-check.ts`

---

### UAT-4: Login page language not fully applied

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-007 |
| **Page** | `/login` |
| **Role used** | All merchant roles |
| **Reported error** | Login page defaulted to Lao and used separate query links that did not persist with dashboard locale |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Login page defaulted to Lao when `?locale=` was absent and used ad-hoc locale links instead of the shared toggle/persistence path.

**Fix:**

- Login page now resolves locale from cookie + query via `getServerLocale`, defaults to English, and uses `LoginLocaleSwitcher` (shared `LanguageToggle`).
- Login form aria labels and invalid-credentials copy come from dictionaries per selected locale.

**Verification:** `scripts/phase-owner-uat-4-language-check.ts`

---

### UAT-4: Dashboard/sidebar mixed language

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-008 |
| **Page** | `/dashboard` sidebar |
| **Role used** | Owner |
| **Reported error** | Sidebar mixed Lao labels with English business terms inconsistently |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Sidebar Lao copy translated approved business terms (Dashboard, Report, Promotion, Membership) while other surfaces kept English POS terms.

**Fix:**

- Updated Lao shell navigation copy to keep approved English business terms while translating general UI labels.
- Dashboard server page now uses locale-aware `dashboard-copy` resolved from the same cookie/store.

**Verification:** `scripts/phase-owner-uat-4-language-check.ts`

---

### UAT-4: Key owner UAT pages not respecting selected language

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-009 |
| **Page** | `/dashboard`, `/products`, global layout |
| **Role used** | Owner |
| **Reported error** | Server-rendered pages ignored stored locale and fell back to Lao/session defaults |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Root layout hardcoded `<html lang="lo">`; server pages did not read persisted locale cookie; `getDictionary()` defaulted to Lao.

**Fix:**

- Root layout resolves locale from cookie with English default and bootstraps client storage sync.
- `getDictionary()` now defaults to English; dashboard and products pages read cookie locale for SSR copy.
- Approved English POS/business terms preserved in Lao runtime translation allowlist.

**Verification:** `scripts/phase-owner-uat-4-language-check.ts`

---

### UAT-3B: Login Sign in button disabled during manual testing

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-010 |
| **Page** | `/login?locale=en` |
| **Role used** | Owner |
| **Reported error** | Sign in button appeared disabled/blocked even after entering credentials |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- Submit button `disabled` state relied only on React controlled state (`username` / `password`).
- Browser/password-manager autofill can populate visible inputs without firing `onChange`, leaving React state empty and `canSubmit` false.

**Fix:**

- Extracted shared submit eligibility helper (`lib/auth/login-form-state.ts`).
- Login submit now reads credentials from `FormData` as the source of truth, with state fallback.
- Added `onInput` handlers and autofill sync so controlled state matches filled fields.
- Preserved OWNER-UAT-3 credentials callback flow and generic error messaging.

**Verification:** `scripts/phase-owner-uat-3b-login-button-check.ts`, `scripts/phase-owner-uat-3-login-session-check.ts`

---

## Planned — not implemented during UAT

### UAT-5: Register / email verification

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-PLAN-001 |
| **Page** | `/register`, `/businesses`, Super Admin businesses |
| **Status** | **PLANNED** (documentation only) |

**Note:** Register/email verification is planned but not implemented during UAT.

**Current state:**

- `/register` is a static UI shell; "Continue" links to `/businesses` without creating users or sending email.
- No `POST /api/auth/register`, no email verification tokens, no approval queue.
- Onboarding after login uses `localStorage` only — not production tenant provisioning.
- Super Admin business controls are read-only placeholders.

**Planning artifact:** `OWNER_UAT_5_REGISTER_EMAIL_VERIFICATION_SPEC.md`

---

### UAT-6: Reports page crashed on Customer field mismatch

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-011 |
| **Page** | `/reports` |
| **Role used** | Owner |
| **Reported error** | `PrismaClientValidationError: Unknown argument 'name'` in `db.customer.findMany()` |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Root cause:**

- `getReportFilterOptions` queried `Customer.name`, but the Prisma `Customer` model uses `fullName` (not `name`).

**Fix:**

- Updated reports filter query to `orderBy: { fullName: "asc" }` and `select` `fullName` (+ optional `customerCode` / `phone` for labels).
- Preserved `companyId` tenant scope and existing `{ id, label }` filter option shape for the Reports UI.

**Verification:** `scripts/phase-owner-uat-6-reports-customer-check.ts`

---

## Open issues

_(Log new UAT issues below using `OWNER_UAT_ISSUE_TEMPLATE.md`.)_
