# LOGIN PORTAL ARCHITECTURE SPEC — EGO POS

> **Phase:** OWNER-UAT-7 (planning) + LP-2 (namespace cleanup completed)  
> **Baseline:** GitHub `main` @ `ce2ad49` (OWNER-UAT-8 login portal route foundation)  
> **Status:** Architecture specification — LP-2 canonical Super Admin namespace active; legacy `/igo-admin/*` redirects remain

---

## 1. Purpose

Define three **independent** login portals for EGO POS:

1. **Super Admin Portal** — platform owner (EGO POS system operator)
2. **EGO Admin / Setup Admin Portal** — onboarding staff who provision stores
3. **Store Portal** — store Owner, Manager, Cashier

**Critical rule:** These portals must **not** be chained. Store users do **not** log in through Super Admin or Setup Admin. Each portal has its own route, session, and permission boundary.

Preserve current Store Login behavior from OWNER-UAT-3 / OWNER-UAT-3B, language from OWNER-UAT-4, and reports fix from OWNER-UAT-6.

---

## 2. Current state audit (as of LP-2)

### 2.1 Routes

| Route | Exists today | Current behavior |
| --- | --- | --- |
| `/login` | Yes | Store merchant login via NextAuth credentials |
| `/register` | Yes | Static shell; no signup API |
| `/businesses` | Yes | Post-login template picker; merchant session |
| `/dashboard`, `/pos` | Yes | Store workspace; tenant-scoped |
| `/super-admin/login` | Yes | **Canonical** Super Admin login (email + password) |
| `/super-admin` | Yes | Super Admin placeholder home + read-only sub-pages under `/super-admin/*` |
| `/ego-admin/login` | Yes | EGO Admin / Setup Admin login (separate session) |
| `/igo-admin/login` | Yes (legacy) | Redirect alias → `/super-admin/login` |
| `/igo-admin/*` | Yes (legacy) | Redirect aliases → matching `/super-admin/*` |
| `/api/super-admin/login` | Yes | **Canonical** Super Admin auth API |
| `/api/igo-admin/login` | Yes (legacy) | Delegates to Super Admin auth; returns `redirectTo: /super-admin` with deprecation header |

### 2.2 Auth / session roles today

| Concept | Implementation | Session |
| --- | --- | --- |
| **Super Admin** | `SuperAdmin` model + `lib/admin/session.ts` | HTTP-only cookie `igo_super_admin_session` |
| **Store Owner** | `User` + `company_users.isOwner` + NextAuth JWT | NextAuth session (`session.user.id`, `activeCompanyId`, roles) |
| **Manager / Cashier** | `User` + `UserRole` + `company_users` | Same NextAuth session |
| **Setup Admin / EGO Admin** | `SetupAdmin` model + `lib/setup-admin/session.ts` | Cookie `ego_setup_admin_session` |

### 2.3 Store login rules (implemented — do not change in UAT-7)

| Role | Identifier | Secret | Notes |
| --- | --- | --- | --- |
| Owner | Email or username | Password or PIN | `lib/auth/merchant-login.ts` |
| Manager | Username only | PIN (password fallback if no PIN seeded) | Email login blocked |
| Cashier | Username only | PIN (password fallback if no PIN seeded) | Email login blocked |

Post-login: real DB `userId`, `company_users` membership, tenant scope (`lib/db/resolve-tenant-user.ts`, `lib/db/tenant-scope.ts`).

### 2.4 Gap vs target architecture

| Target | Gap |
| --- | --- |
| `/super-admin/login` | Today Super Admin uses `/igo-admin/login` |
| `/ego-admin/login` | No Setup Admin portal; `/businesses` onboarding is merchant-session + localStorage, not staff-provisioned |
| Independent sessions | Super Admin cookie can coexist path-wise with merchant NextAuth but portals are not formally separated by URL namespace |
| Template-aware redirect | `getStoredEntryPath()` uses localStorage onboarding; DB company template not yet authoritative for redirect |

---

## 3. Target architecture — three independent portals

```
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  Super Admin Portal │   │   EGO Admin Portal  │   │    Store Portal     │
│ /super-admin/login  │   │  /ego-admin/login   │   │      /login         │
│ /super-admin/*      │   │  /ego-admin/*       │   │  /dashboard /pos  │
└──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘
           │                         │                         │
    SuperAdmin table          SetupAdmin table*            User table
    platform cookie           setup-admin cookie*          NextAuth JWT
           │                         │                         │
    All tenants               Provision stores              One tenant
    Plans/billing             Templates/branches            Owner/Mgr/Cashier

* New models/sessions — not implemented yet
```

**Wrong flow (forbidden):** Super Admin → Setup Admin → Owner Login → Store  
**Correct flow:** Each actor uses **only** their portal entry URL.

---

## 4. Portal specifications

### 4.1 Super Admin Portal

| Item | Specification |
| --- | --- |
| **Login route** | `/super-admin/login` |
| **App routes** | `/super-admin`, `/super-admin/businesses`, `/super-admin/plans`, `/super-admin/subscriptions`, `/super-admin/setup-admins`, `/super-admin/audit-logs`, `/super-admin/health` |
| **Who** | EGO POS platform owner / system operator only |
| **Auth** | Email + password; **no PIN**; future 2FA/OTP |
| **Session** | Dedicated cookie (rename from `igo_super_admin_session` → `ego_super_admin_session` in implementation phase) |
| **Must NOT** | Access store POS, impersonate cashier without audited break-glass, share login URL with store staff |

**Responsibilities:**

- Manage all stores/tenants (list, suspend, activate, delete, restore)
- Approve/reject self-registration requests (future — see UAT-5 spec)
- Manage plans: Free / Paid tiers
- Manage subscriptions / billing (later phase)
- Manage Setup Admin accounts (create/disable)
- System-level logs, platform health, feature flags

**Post-login redirect:** `/super-admin` (platform dashboard)

---

### 4.2 EGO Admin / Setup Admin Portal

| Item | Specification |
| --- | --- |
| **Login route** | `/ego-admin/login` |
| **App routes** | `/ego-admin`, `/ego-admin/stores/new`, `/ego-admin/stores/[id]/setup`, `/ego-admin/templates` |
| **Who** | EGO onboarding / implementation staff — **not** store owners, managers, or cashiers |
| **Auth** | Username or email + password; **no PIN** |
| **Session** | Dedicated Setup Admin cookie/JWT — **separate from Super Admin and Store** |
| **Must NOT** | Use store `/login`, access tenant POS as normal user without explicit audited support mode |

**Responsibilities:**

- Create a new store (Company + Branch + Warehouse)
- Choose business template: Mini Mart, Restaurant, Pharmacy, Clothes Shop, Wholesale, Online Seller, Rental (future)
- Create first branch and default warehouse
- Create store owner account (`User` + `company_users` + Owner role)
- Configure initial settings: currency, language, tax, receipt, QR banks, default permissions
- Hand off to owner — owner then uses **Store Portal** `/login` only

**Post-login redirect:** `/ego-admin` (setup workspace)

**Store creation flow (target):**

```mermaid
sequenceDiagram
  participant SA as Setup Admin
  participant API as EGO Admin API
  participant DB as PostgreSQL
  participant Owner as Store Owner

  SA->>API: POST /api/ego-admin/stores (template, company, branch)
  API->>DB: Transaction: Company, Branch, Warehouse, User, CompanyUser, Roles, Settings
  API->>SA: Store provisioned; owner credentials issued
  Note over Owner: Owner receives credentials out-of-band
  Owner->>Owner: /login (Store Portal only)
  Owner->>DB: NextAuth session → assigned company/template
```

---

### 4.3 Store Portal

| Item | Specification |
| --- | --- |
| **Login route** | `/login` (unchanged) |
| **App routes** | `/dashboard`, `/pos`, `/products`, `/inventory`, `/reports`, `/settings`, etc. |
| **Who** | Store Owner, Manager, Cashier |
| **Auth** | See §4.3.1 |
| **Session** | NextAuth JWT (existing) |
| **Must NOT** | Login via `/super-admin/login` or `/ego-admin/login` |

#### 4.3.1 Store authentication rules (preserve UAT-3)

| Role | Login | Secret |
| --- | --- | --- |
| Owner | Email or username | Password or PIN |
| Manager | Username | PIN |
| Cashier | Username | PIN |

Generic error: `"Username or password is incorrect."` (localized per UAT-4)

#### 4.3.2 Post-login resolution (target)

1. Resolve real DB `User.id` (no synthetic demo IDs when DB seeded)
2. Resolve `company_users` membership → `activeCompanyId`, branch, warehouse
3. Load company **business template** from DB (not `localStorage`)
4. Apply role permissions (`features/access-control`)
5. Redirect by role + template:

| Role | Default redirect |
| --- | --- |
| Cashier (POS-only) | `/pos` |
| Owner / Manager | `/dashboard` (or template shell if non–mini-mart and supported) |

**Template behavior:**

- Company record stores `businessTemplateKey` (new field — implementation phase)
- Mini Mart → `/dashboard` (current default)
- Other templates → `/template-shell/[template]` or template-aware dashboard when modules diverge
- **No** `/businesses` template picker for provisioned stores unless owner has multi-company access and explicitly switches business

#### 4.3.3 Multi-store owners (future)

If a user owns multiple companies, show **Choose Business** (`/businesses`) after login — DB-backed list, not localStorage-only.

---

## 5. Permission boundaries

| Action | Super Admin | Setup Admin | Store Owner | Manager | Cashier |
| --- | --- | --- | --- | --- | --- |
| Suspend any tenant | Yes | No | No | No | No |
| Create store + owner | No* | Yes | No | No | No |
| Approve self-registration | Yes | No | No | No | No |
| Manage plans/billing | Yes | No | No | No | No |
| Store POS sales | No | No | Yes | Yes | Yes |
| Store settings | No | No | Yes | Limited | No |
| View store reports | No | No | Yes | Yes | No |

\* Super Admin may **delegate** store creation to Setup Admin; Super Admin does not use Setup Admin UI for day-to-day provisioning unless also granted Setup Admin role.

**Session isolation rules:**

- Super Admin session must not satisfy `requireSession()` (merchant)
- Setup Admin session must not satisfy `requireAdminSession()` (super) or merchant `requireSession()`
- Merchant session must not access `/super-admin/*` or `/ego-admin/*` admin APIs
- Cookies: separate names, paths optional (`/super-admin`, `/ego-admin`, `/` for NextAuth)

---

## 6. Route structure (recommended)

### 6.1 Public auth routes

| Portal | Login | Logout API |
| --- | --- | --- |
| Super Admin | `GET/POST /super-admin/login` | `POST /api/super-admin/logout` |
| EGO Admin | `GET/POST /ego-admin/login` | `POST /api/ego-admin/logout` |
| Store | `GET /login` | NextAuth `POST /api/auth/signout` |

### 6.2 Protected app routes

| Portal | Base path | Guard |
| --- | --- | --- |
| Super Admin | `/super-admin/*` | `requireSuperAdminSession()` |
| EGO Admin | `/ego-admin/*` | `requireSetupAdminSession()` |
| Store | `/(dashboard)/*`, `/(platform)/businesses/*` | `requireSession()` + permissions |

### 6.3 Migration from current paths

| Current | Target | Migration note |
| --- | --- | --- |
| `/igo-admin/login` | `/super-admin/login` | **LP-2:** server redirect alias |
| `/igo-admin/*` | `/super-admin/*` | **LP-2:** server redirect aliases via `mapLegacyIgoAdminPath()` |
| `/api/igo-admin/login` | `/api/super-admin/login` | **LP-2:** delegates with `X-Deprecated-Api` header |
| `/businesses` (onboarding) | `/ego-admin/stores/new` | Move provisioning to Setup Admin; keep `/businesses` only for multi-company picker |

---

## 7. Database models (existing + proposed)

### 7.1 Existing (relevant)

| Model | Portal use |
| --- | --- |
| `SuperAdmin` | Super Admin Portal |
| `User` | Store users (owner/manager/cashier) |
| `Company` | Tenant / store |
| `CompanyUser` | User ↔ company membership |
| `Branch`, `Warehouse` | Store structure |
| `Role`, `UserRole` | Store permissions |
| `CompanySetting` | Currency, tax, receipt, QR, locale |
| `Plan`, `Subscription` | Super Admin plan management |
| `CompanyAccessLog` | Super Admin access audit |

### 7.2 Proposed (implementation phases)

| Model | Purpose |
| --- | --- |
| `SetupAdmin` | EGO Admin staff accounts (separate from `SuperAdmin` and `User`) |
| `SetupAdminSession` / cookie ID | Setup Admin auth (or JWT claims) |
| `Company.businessTemplateKey` | Persist template for store redirect |
| `PlatformSetting` | Self-registration toggle (from UAT-5) |
| `RegistrationRequest` | Self-registration queue (from UAT-5) |

**Do not** reuse `SuperAdmin` for Setup Admin — different permission scope.

---

## 8. API routes needed (future)

### 8.1 Super Admin

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/super-admin/login` | Authenticate platform owner |
| `POST` | `/api/super-admin/logout` | Clear session |
| `GET` | `/api/super-admin/businesses` | List tenants |
| `PATCH` | `/api/super-admin/businesses/[id]/status` | Suspend/activate/delete |
| `GET/POST` | `/api/super-admin/plans` | Plan management |
| `GET/POST` | `/api/super-admin/setup-admins` | Manage Setup Admin accounts |
| `GET` | `/api/super-admin/registration-requests` | Approval queue (UAT-5) |

### 8.2 EGO Admin

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/ego-admin/login` | Setup staff login |
| `POST` | `/api/ego-admin/logout` | Clear session |
| `POST` | `/api/ego-admin/stores` | Provision company + owner |
| `GET` | `/api/ego-admin/templates` | List business templates |
| `PATCH` | `/api/ego-admin/stores/[id]/settings` | Initial settings |

### 8.3 Store (existing — preserve)

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/callback/credentials` | Merchant login (UAT-3) |
| `GET` | `/api/auth/session` | Session read |

---

## 9. UI pages needed (future)

### Super Admin

- Login, dashboard, businesses, plans, subscriptions, setup-admins, audit logs, system health

### EGO Admin

- Login, dashboard, new store wizard (template → company → branch → warehouse → owner → settings)

### Store

- **Keep** `/login` as-is (UAT-3B button/autofill fixes)
- Deprecate localStorage-only onboarding as source of truth
- Optional: `/businesses` as multi-company picker only

---

## 10. Future self-registration flow (cross-reference)

See `OWNER_UAT_5_REGISTER_EMAIL_VERIFICATION_SPEC.md`:

- Public registration remains **off** by default
- Super Admin approves requests
- Email verification before approval
- Approved users become Store Owners via **Store Portal** `/login` — not via admin portals

---

## 11. Security risks

| Risk | Mitigation |
| --- | --- |
| Portal confusion (store staff use admin URL) | Separate URLs, no cross-links on store login; document private Super Admin URL |
| Shared session cookies | Unique cookie names per portal; path-scoped cookies where possible |
| Setup Admin over-provisioning | Audit log every store create; limit Setup Admin count via Super Admin |
| Super Admin impersonation | Explicit break-glass with `CompanyAccessLog`; time-limited |
| Demo fallback on admin login | Keep `IGO_ENABLE_DEMO_FALLBACK=false` in production |
| Merchant login regression | Do not modify `lib/auth/merchant-login.ts` during portal route work without UAT-3 regression harness |
| Cross-tenant access | Existing `resolveTenantScope` + permission checks on all store APIs |

---

## 12. What must NOT be mixed

| Do NOT | Reason |
| --- | --- |
| Store users login at `/super-admin/login` or `/ego-admin/login` | Wrong portal; bypasses merchant credential rules |
| Super Admin uses `/login` (NextAuth merchant) | Wrong identity model (`SuperAdmin` vs `User`) |
| Setup Admin provisions stores via `/businesses` localStorage flow | No DB atomicity; not auditable |
| Single cookie for all portals | Session confusion and privilege bleed |
| Chain portals in UX | Owner must enter store directly |
| Rename `User` to serve Super Admin | Schema collision with store RBAC |

---

## 13. Recommended implementation phases

| Phase | Scope | Depends on |
| --- | --- | --- |
| **LP-1** | This spec + issue log (UAT-7) | — |
| **LP-2** | Rename route aliases: `/super-admin/login` ← `/igo-admin/login`; move Super Admin UI under `/super-admin` | LP-1 | **COMPLETED** |
| **LP-3** | `SetupAdmin` model + `/ego-admin/login` + session | LP-2 |
| **LP-4** | EGO Admin store provisioning API (DB transaction) | LP-3 |
| **LP-5** | `Company.businessTemplateKey` + store post-login redirect from DB | LP-4, UAT-3 |
| **LP-6** | Deprecate localStorage onboarding; `/businesses` = multi-company picker only | LP-5 |
| **LP-7** | Self-registration + Super Admin approval (UAT-5) | LP-2 |
| **LP-8** | 2FA for Super Admin; rate limits on all login endpoints | LP-2, LP-3 |

**UAT-7 does not implement LP-2+.**

---

## 14. UAT-7 acceptance

| Check | Result |
| --- | --- |
| Current routes audited | Yes |
| Auth/session roles audited | Yes |
| Three portals documented | Yes |
| Independent portal rule documented | Yes |
| Store login behavior preserved (spec only) | Yes |
| No route/auth code changed in UAT-7 | Yes |

---

## 15. References

- `app/(auth)/login/page.tsx`, `components/auth/login-form.tsx`
- `lib/auth/merchant-login.ts`, `lib/auth/options.ts`, `lib/auth/session.ts`
- `app/(igo-admin)/igo-admin/login/page.tsx`, `app/api/igo-admin/login/route.ts`
- `lib/admin/session.ts` (Super Admin cookie)
- `features/platform/onboarding-context.ts` (localStorage onboarding)
- `OWNER_UAT_5_REGISTER_EMAIL_VERIFICATION_SPEC.md`
- `OWNER_UAT_ISSUE_LOG.md`
