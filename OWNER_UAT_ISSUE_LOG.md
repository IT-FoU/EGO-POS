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

**Current state (post LP-6):**

- `/register` shows a request-access message; no form submission, no link to `/businesses` setup.
- No `POST /api/auth/register`, no email verification tokens, no approval queue.
- Production onboarding uses EGO Admin provisioning (`/ego-admin/stores/new`) + DB `Company.businessTemplateKey`; localStorage onboarding is demo-only (`IGO_DEMO_MODE=true`).
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

### UAT-7: Login portal architecture

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-PLAN-002 |
| **Scope** | Super Admin, EGO Admin, Store Login portals |
| **Status** | **PLANNED** (documentation only) |

**Note:** Login portal architecture clarified: Super Admin, EGO Admin, and Store Login must be independent portals.

**Current gap:** `/igo-admin/login` today authenticates `SuperAdmin` (platform owner). There is no separate Setup Admin portal or `/super-admin/login` route yet. Store login at `/login` remains the only path for Owner/Manager/Cashier.

**Planning artifact:** `LOGIN_PORTAL_ARCHITECTURE_SPEC.md`

---

### UAT-8: Login portal route foundation

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-012 |
| **Scope** | `/super-admin/login`, `/ego-admin/login`, `/login` portal separation |
| **Status** | **FIXED** |

**Implemented:**

- **Store Login** — `/login` unchanged for Owner/Manager/Cashier (UAT-3/3B preserved).
- **Super Admin Portal** — `/super-admin/login` (email + password only, no PIN); placeholder at `/super-admin`.
- **EGO Admin Portal** — `/ego-admin/login` (username/email + password, no PIN); `SetupAdmin` model + placeholder at `/ego-admin`.
- Legacy `/igo-admin/login` redirects to `/super-admin/login`.
- Merchant sessions blocked from admin portal placeholders via `rejectMerchantSessionForAdminPortal()`.

**Placeholder only:** Full Super Admin dashboard and EGO Admin store provisioning wizard remain future work (LP-4+).

**Test accounts (after seed):**

| Portal | Identifier | Password |
| --- | --- | --- |
| Super Admin | `admin@igopos.local` | `AdminChangeMe123!` |
| EGO Admin | `ego-setup` | `SetupChangeMe123!` |
| Store Owner | `igo-admin` | `AdminChangeMe123!` or PIN `123456` |

**Verification:** `scripts/phase-owner-uat-8-login-portal-check.ts`

---

### LP-2: Super Admin namespace cleanup

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-013 |
| **Scope** | Canonical `/super-admin/*` namespace; legacy `/igo-admin/*` redirect aliases |
| **Status** | **FIXED** |

**Implemented:**

- Canonical routes: `/super-admin/login`, `/super-admin/*`, `/api/super-admin/login`, `/api/super-admin/logout`
- Legacy `/igo-admin/login` and `/igo-admin/*` redirect to matching `/super-admin/*` paths
- Legacy `/api/igo-admin/*` delegates with `X-Deprecated-Api` header
- Super Admin shell copy updated to “Super Admin” (EGO Admin naming preserved for Setup Admin portal)
- `requireSuperAdminPortalAccess()` blocks merchant and EGO Admin sessions from Super Admin pages

**Placeholder only:** `/super-admin` home remains a placeholder; read-only sub-pages moved under canonical namespace.

**Verification:** `scripts/phase-lp-2-super-admin-namespace-check.ts`

---

### LP-3: EGO Admin setup portal hardening

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-014 |
| **Scope** | `/ego-admin/login`, `/ego-admin` setup shell, session isolation |
| **Status** | **FIXED** |

**Implemented:**

- Setup admin login hardened: username/email + password; PIN rejected; store and Super Admin credentials rejected unless explicit setup admin record.
- Separate `ego_setup_admin_session` cookie; logout clears setup admin session only.
- `requireEgoAdminPortalAccess()` blocks merchant (`/dashboard`) and Super Admin (`/super-admin`) sessions.
- `/ego-admin` readiness panel shows signed-in setup admin and LP-4 coming-soon actions.
- Missing `setup_admins` table returns ops guidance instead of raw stack trace.

**Prerequisite:** `npx prisma migrate deploy && npm run db:seed:demo`

**Verification:** `scripts/phase-lp-3-ego-admin-setup-portal-check.ts`

---

### LP-4: EGO Admin store provisioning foundation

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-015 |
| **Scope** | `/ego-admin/stores/new`, `POST /api/ego-admin/stores`, `Company.storeCode`, `Company.businessTemplateKey` |
| **Status** | **FIXED** |

**Implemented:**

- EGO Admin can provision stores at `/ego-admin/stores/new` (setup admin session only).
- Transaction creates company, branch, warehouse, settings, owner user, membership, roles, permissions, subscription.
- Duplicate store code and owner username/email rejected safely; owner password hashed; no auto-login or email.
- Success screen shows store, template, owner credentials, and `/login` handoff URL.
- Templates: Mini Mart, Restaurant, Pharmacy, Clothes Shop, Wholesale, Online Seller; Rental marked LP-5.

**Prerequisite:** `npx prisma migrate deploy && npm run db:seed:demo` (includes LP-4 migration `20260626_lp4_store_provisioning_foundation`)

**Verification:** `scripts/phase-lp-4-store-provisioning-check.ts`

---

### LP-5: Template-aware post-login redirect

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-016 |
| **Scope** | `/login` redirect, `/api/auth/store-entry-path`, `/businesses`, `Company.businessTemplateKey` |
| **Status** | **FIXED** |

**Implemented:**

- Production post-login redirect reads `Company.businessTemplateKey` from DB (not localStorage).
- `GET /api/auth/store-entry-path` and `POST /api/auth/select-company` for store sessions.
- Owner/manager/cashier redirect by role + template; LP-4 provisioned stores route correctly.
- `/businesses` in production: single company auto-redirect, multi-company DB picker, no-assignment safe message.
- localStorage onboarding redirect gated to `IGO_DEMO_MODE=true` only.

**Verification:** `scripts/phase-lp-5-template-aware-login-redirect-check.ts`

---

### LP-6: Demo localStorage onboarding cleanup

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-017 |
| **Scope** | `/businesses`, `/register`, `/businesses/setup`, onboarding localStorage, login fallback |
| **Status** | **FIXED** |

**Implemented:**

- Production `/businesses`: DB membership redirect/picker only; no localStorage tenant creation.
- Production `/register`: request-access message; references OWNER-UAT-5; no `/businesses` setup bypass.
- `/businesses/setup` redirects to `/businesses` when `IGO_DEMO_MODE=false`.
- `isDemoOnboardingEnabled()` gates all onboarding localStorage reads/writes.
- Login form uses DB `store-entry-path` first; production API failure falls back to `/businesses` (not localStorage).
- Template shell uses session company name; review-setup link demo-only.

**Verification:** `scripts/phase-lp-6-demo-onboarding-cleanup-check.ts`

---

### LP-7: Self-registration and email verification (planning)

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-PLAN-002 |
| **Scope** | `/register`, email verification, Super Admin approval queue, future tenant provisioning |
| **Status** | **PLANNED** (LP-7A documentation only) |

**Current state:**

- `/register` shows request-access message (LP-6); no public signup API.
- Store creation remains **EGO Admin** (`/ego-admin/stores/new`) and future **Super Admin approval** path only.
- Email verification and live email sending **not implemented**.
- `provisionStore()` (LP-4) documented as reuse target after Super Admin approval (LP-7F).

**Planning artifact:** `LP_7_SELF_REGISTRATION_EMAIL_VERIFICATION_SPEC.md`

**Do not start LP-7B until explicitly confirmed.**

---

### LP-8: MVP login portal simplification

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-018 |
| **Scope** | Visible login portals, EGO Admin deferred UX, Super Admin store creation |
| **Status** | **FIXED** |

**Implemented:**

- MVP visible portals: `/login` (Store) and `/super-admin/login` only.
- EGO Admin `/ego-admin/login` retained but not linked from visible UI; deferred notice shown on direct access.
- Super Admin home promotes store creation at `/super-admin/stores/new` via `POST /api/super-admin/stores`.
- Store Login copy clarifies owner/manager/cashier audience; no Super Admin or EGO Admin links.
- `setup_admins` table and EGO Admin code preserved.

**Verification:** `scripts/phase-lp-8-mvp-login-portal-simplification-check.ts`

---

### OWNER-UAT-9: Login page locale render loop

| Field | Value |
| --- | --- |
| **Issue ID** | UAT-2026-06-25-P0-019 |
| **Page** | `/login`, `/super-admin/login`, `/ego-admin/login` |
| **Reported error** | Repeated `GET /login?locale=en 200` without user action; page keeps compiling/rendering |
| **Severity** | P0 |
| **Status** | **FIXED** |

**Steps to reproduce (before fix):**

1. Start dev server.
2. Open `/login?locale=en` (or `/login` with stored locale).
3. Observe continuous GET requests and visible re-renders without clicking ENG/LAO.

**Expected:** Page loads once and settles; locale toggle updates only on user click.

**Actual:** `LanguageToggle` called `onLocaleChange` on mount; login switchers ran `router.replace` + `router.refresh` every time, causing an infinite navigation loop.

**Root cause:**

- `LanguageToggle` sync `useEffect` invoked `onLocaleChange` on every mount/locale prop change.
- `LoginLocaleSwitcher` / `PortalLocaleSwitcher` wired `onLocaleChange` to `router.replace` + `router.refresh` unconditionally.
- Locale bootstrap and `persistClientLocale` wrote cookie/storage on every pass without idempotency checks.

**Fix:**

- `LanguageToggle` sync effect updates local state only; parent notified on user click via `updateLocale`.
- Login/portal switchers guard with `if (nextLocale === locale) return` and stable `useCallback`.
- `persistClientLocale` and `LocaleBootstrap` skip writes when `isClientLocaleSynced()` is true.
- Added `readCookieLocale()` and `isClientLocaleSynced()` helpers in `lib/i18n/locale.ts`.

**Verification:** `scripts/phase-owner-uat-9-login-locale-loop-check.ts`

---

## Open issues

_(Log new UAT issues below using `OWNER_UAT_ISSUE_TEMPLATE.md`.)_
