# LP-7 — Self-Registration & Email Verification Planning Spec

> **Phase:** LP-7 (planning only — **LP-7A**)  
> **Baseline:** GitHub `main` @ `4259e1d` (LP-6A production demo env guard)  
> **Status:** Design document — **no live email sending, no public registration API, no tenant creation from `/register`**

---

## A. Current state

### A.1 `/register` page (post LP-6)

| Item | Current behavior |
| --- | --- |
| **Route** | `app/(auth)/register/page.tsx` |
| **Auth** | Public — no session required |
| **UI** | Request-access message (`registerClosedTitle`, `registerClosedDescription`, `registerClosedUat5Note`) |
| **CTA** | Single link → `/login` (`registerClosedBackToLogin`) |
| **Form** | **None** — no applicant fields, no submit handler |
| **API** | **None** — no `POST /api/register/*` routes exist |
| **Tenant creation** | **None** — no `Company`, `User`, `Branch`, or `Warehouse` rows created |
| **localStorage** | **None** — no onboarding draft or template selection |

### A.2 Login page link

| Item | Current behavior |
| --- | --- |
| **Location** | `components/auth/login-form.tsx` |
| **Label** | `registerNewAccount` (EN: "Register New Account") |
| **Action** | `<Link href="/register">` — navigation only |
| **Side effects** | None |

### A.3 Post-login `/businesses` (production)

| Case | Behavior |
| --- | --- |
| 0 companies | Safe no-assignment message |
| 1 company | DB redirect via `Company.businessTemplateKey` (LP-5) |
| 2+ companies | DB-backed `CompanyMembershipPicker` |
| Demo only | Template picker when `IGO_DEMO_MODE=true` and `NODE_ENV≠production` (LP-6/LP-6A) |

### A.4 Production store creation paths (active today)

| Path | Who | Creates tenant |
| --- | --- | --- |
| `/ego-admin/stores/new` | EGO Admin / Setup Admin | Yes — via `provisionStore()` |
| `POST /api/ego-admin/stores` | Setup Admin session only | Yes |
| Super Admin `/super-admin/businesses` | Super Admin | **Read-only** — no create UI |
| `/register` | Public | **No** |
| `/businesses/setup` | Merchant (demo only) | localStorage only in demo — blocked in production |

### A.5 LP-4 provisioning service (reuse target for LP-7F)

**Files:** `lib/setup-admin/provision-store.ts`, `app/api/ego-admin/stores/route.ts`

**Transactional creates:**

1. `User` (owner) — `username`, `email`, `passwordHash`, `fullName`, `preferredLocale`, `status: active`
2. `Company` — `name`, `storeCode`, `businessTemplateKey`, `ownerUserId`, `planId`, `status: active`, `defaultLocale`, `baseCurrency`
3. `Branch` — main branch
4. `Warehouse` — default warehouse
5. `CompanySetting` — receipt prefix, tax defaults, loyalty defaults
6. `CompanyUser` — owner membership with back-office + POS access
7. `Role` / `UserRole` / permissions — owner role template
8. `SaaSSubscription` — Free plan

**Validations:** unique `storeCode`, unique owner `username`/`email`, provisionable `businessTemplateKey`, password ≥ 8 chars.

**Not sent today:** no email to owner; credentials returned once in API response for handoff.

### A.6 What must remain blocked in production (until LP-7G)

- Public self-registration API acceptance
- Live email sending
- Tenant/company creation before Super Admin approval
- localStorage-based onboarding as production tenant source
- `IGO_DEMO_MODE=true` in `NODE_ENV=production` (LP-6A guard)
- Auto-approval without email verification

### A.7 Related prior spec

`OWNER_UAT_5_REGISTER_EMAIL_VERIFICATION_SPEC.md` — earlier UAT planning artifact. **LP-7 supersedes** for implementation phasing and reflects LP-4/LP-5/LP-6/LP-6A baseline.

---

## B. Target future flow

```
Public applicant                System                         Super Admin
      |                            |                                |
      |-- POST /api/register/request (if enabled) ------------------>|
      |                            |-- create RegistrationRequest   |
      |                            |   status=pending_email_verification
      |                            |-- send verification email ---->|
      |<-- "check your email" -----|                                |
      |                            |                                |
      |-- click verify link -------|-- POST /api/register/verify-email
      |                            |   status=email_verified
      |                            |   status=pending_approval      |
      |<-- waiting for approval ----|                                |
      |                            |                                |
      |                            |<-- GET registration-requests --|
      |                            |<-- POST .../approve -----------|
      |                            |-- provisionStore() (LP-4)      |
      |                            |   status=approved              |
      |                            |   createdCompanyId set         |
      |<-- activation email/login --|                                |
      |-- /login ------------------>|                                |
```

**States:** `pending_email_verification` → `email_verified` → `pending_approval` → `approved` | `rejected` | `expired`

**Critical rule:** No `Company` / `User` tenant rows until Super Admin **approve** calls `provisionStore()` (or shared provisioning service extracted from LP-4).

---

## C. User roles involved

| Role | Portal | Responsibilities in LP-7 flow |
| --- | --- | --- |
| **Public applicant** | `/register` (future) | Submit registration request; verify email; wait for approval |
| **Pending store owner** | Email + status pages | Same person after verify, before approval — cannot log in as store owner yet |
| **Super Admin** | `/super-admin/*` | Toggle self-registration; review queue; approve/reject; audit |
| **EGO Admin / Setup Admin** | `/ego-admin/*` | Continue manual provisioning (LP-4) — independent of self-registration queue |
| **Store Owner** | `/login` | After approval + provisioning — standard LP-5 post-login redirect |

**Separation preserved:** Super Admin approval queue ≠ EGO Admin provisioning UI. Both may create stores, but self-registration always flows through Super Admin approval.

---

## D. Database design proposal

### D.1 `PlatformSetting` (new or extend)

| Field | Type | Notes |
| --- | --- | --- |
| `selfRegistrationEnabled` | Boolean | Default `false` |
| `selfRegistrationRequireCaptcha` | Boolean | Default `true` when enabled |
| `emailVerificationTtlHours` | Int | Default 24 |
| `registrationApprovalTtlDays` | Int | Default 30 |

### D.2 `RegistrationRequest`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | cuid | PK |
| `applicantName` | String | Owner full name |
| `email` | String | Unique among non-terminal requests |
| `emailNormalized` | String | Lowercase for dedup |
| `phone` | String? | Optional |
| `storeName` | String | Display name |
| `requestedStoreCode` | String | Normalized slug candidate |
| `requestedBusinessTemplateKey` | String | From provisionable templates |
| `country` | String? | Optional ISO |
| `timezone` | String? | e.g. `Asia/Vientiane` |
| `defaultCurrency` | CurrencyCode | LAK / THB / USD |
| `defaultLocale` | String | `en` \| `lo` |
| `status` | Enum | See below |
| `passwordHash` | String | bcrypt — stored only until approval or expiry purge |
| `emailVerifiedAt` | DateTime? | Set on verify |
| `submittedIp` | String? | Abuse tracking |
| `userAgent` | String? | Abuse tracking |
| `approvedBySuperAdminId` | String? | FK → `SuperAdmin` |
| `rejectedBySuperAdminId` | String? | FK → `SuperAdmin` |
| `rejectionReason` | String? | Shown to applicant (sanitized) |
| `createdCompanyId` | String? | FK → `Company` after approval |
| `createdOwnerUserId` | String? | FK → `User` after approval |
| `expiresAt` | DateTime | Request/token expiry |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

**Status enum:** `pending_email_verification` | `email_verified` | `pending_approval` | `approved` | `rejected` | `expired`

### D.3 `EmailVerificationToken`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | cuid | PK |
| `registrationRequestId` | String | FK |
| `tokenHash` | String | SHA-256 of raw token — **never store raw token** |
| `purpose` | Enum | `register` \| `resend` |
| `expiresAt` | DateTime | |
| `consumedAt` | DateTime? | Single-use |
| `createdAt` | DateTime | |

### D.4 `RegistrationApprovalEvent` (audit-friendly; optional separate from `AuditLog`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | cuid | |
| `registrationRequestId` | String | |
| `action` | Enum | `submitted` \| `email_sent` \| `email_verified` \| `approved` \| `rejected` \| `expired` |
| `actorType` | Enum | `applicant` \| `super_admin` \| `system` |
| `actorId` | String? | |
| `metadata` | Json? | IP, template key, etc. |
| `createdAt` | DateTime | |

### D.5 `User` extension (LP-7B)

| Field | Type | Notes |
| --- | --- | --- |
| `emailVerifiedAt` | DateTime? | Required before store owner activation |

### D.6 Relations to existing `AuditLog`

On approve/reject, write `AuditLog` with `module: "registration"`, `action: "approve"|"reject"`, `newData` containing `registrationRequestId` and `createdCompanyId` when applicable. Company-scoped audit begins only after provisioning.

---

## E. API route proposal

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/register/status` | Public | Returns `{ enabled: boolean }` from `PlatformSetting` |
| `POST` | `/api/register/request` | Public (if enabled) | Create request + send verification email |
| `POST` | `/api/register/verify-email` | Public | Body: `{ token }` — verify + move to `pending_approval` |
| `POST` | `/api/register/resend-verification` | Public | Rate-limited resend |
| `GET` | `/api/super-admin/registration-requests` | Super Admin | List/filter queue |
| `GET` | `/api/super-admin/registration-requests/[id]` | Super Admin | Detail |
| `POST` | `/api/super-admin/registration-requests/[id]/approve` | Super Admin | Provision tenant via LP-4 service |
| `POST` | `/api/super-admin/registration-requests/[id]/reject` | Super Admin | Reject with reason |

**Not in LP-7A:** route handlers, Prisma models, email SDK calls.

**Approve handler (LP-7F) pseudocode:**

```typescript
// Inside Super Admin approve transaction:
// 1. Load RegistrationRequest (status must be pending_approval)
// 2. Call provisionStore({ ...mapped fields, ownerTemporaryPassword: generated })
// 3. Update request: status=approved, createdCompanyId, createdOwnerUserId
// 4. Purge passwordHash from request row
// 5. Send activation email (optional LP-7D)
// 6. Write RegistrationApprovalEvent + AuditLog
```

---

## F. Email provider comparison

| Provider | Pros | Cons | MVP fit |
| --- | --- | --- | --- |
| **Resend** | Simple REST API; excellent Next.js docs; fast setup; good transactional focus | Newer; Laos deliverability depends on DNS | **Best MVP** |
| **Amazon SES** | Low cost at scale; AWS integration | IAM/DKIM setup heavy; sandbox approval delay | Scale phase |
| **Postmark** | Top transactional deliverability | Paid; no generous free tier | Premium option |
| **SendGrid** | Mature; marketing + transactional | Complex UI; deliverability varies by warmup | Alternative |
| **Mailgun** | Strong API; EU regions | Setup friction; pricing changes | Alternative |
| **SMTP** | Works with any host | SPF/DKIM ops burden; deliverability risk; no analytics | Avoid for MVP |

### F.1 MVP recommendation: **Resend**

**Why:**

1. Fastest path to transactional verify/approve emails in a Next.js app (single API key, domain verify, React email templates optional).
2. LP-7D needs an **abstraction** (`lib/email/email-service.ts`) — Resend adapter is ~50 lines; swappable to SES later.
3. Free tier sufficient for pilot / early SaaS onboarding volume.
4. Clear separation: LP-7D implements interface only; LP-7G enables live sending in staging/production with DNS verified.

**Production checklist (LP-7G):** verified domain, SPF/DKIM/DMARC, bounce webhook, `EMAIL_FROM` env, secrets in Vercel/host only.

---

## G. Security design

| Control | Design |
| --- | --- |
| **Rate limiting** | Per IP: 3 register requests/hour; 1 resend/15min; 10 verify attempts/hour |
| **CAPTCHA** | Cloudflare Turnstile or hCaptcha on `POST /api/register/request` when enabled |
| **Token hashing** | Store `sha256(token)` only; raw token in email link query param once |
| **Token expiry** | Verification: 24h default; registration request: 30d pending approval max |
| **No enumeration** | Generic responses: "If this email is eligible, we sent instructions." |
| **Duplicate email** | Reject if active `User.email` exists; merge/update rules for in-flight requests |
| **Duplicate store code** | `normalizeStoreCode()` + unique check against `Company.storeCode` and pending requests |
| **Audit** | `RegistrationApprovalEvent` + Super Admin `AuditLog` on approve/reject |
| **No pre-approval tenant** | `provisionStore()` only on approve — never on request or verify |
| **Super Admin gate** | `requireSuperAdminPortalAccess()` on all queue routes |
| **Production demo safety** | LP-6A: `IGO_DEMO_MODE=true` blocked in production; self-registration also requires `selfRegistrationEnabled` |
| **Password handling** | bcrypt cost ≥ 12; purge `passwordHash` from request after approve/reject/expiry |
| **IGO_ENABLE_DEMO_FALLBACK** | Unrelated to registration; remain off in production |

---

## H. UX plan

| State | Route / page | Content |
| --- | --- | --- |
| **Disabled (now)** | `/register` | Request-access message + link to `/login` (current LP-6) |
| **Future: form** | `/register` | Applicant form when `selfRegistrationEnabled`; else same disabled view |
| **Email sent** | `/register/check-email` | "Check your inbox" + resend (rate-limited) |
| **Email verified** | `/register/verified` | Success → explain approval wait |
| **Pending approval** | `/register/pending` | Status poll or static wait message |
| **Rejected** | `/register/rejected` | Reason (if provided) + contact support |
| **Approved** | `/register/approved` | Link to `/login` + optional set-password if temp creds emailed |
| **Expired** | `/register/expired` | Re-apply CTA |

**Login page:** Keep `Register New Account` link; when disabled, lands on safe message (no change until LP-7C).

**No redesign in LP-7A** — wireframes only; reuse existing auth card layout patterns from `/login`.

---

## I. Implementation phases

| Phase | Scope | Deliverable | Status |
| --- | --- | --- | --- |
| **LP-7A** | Planning spec (this document) | Spec + doc updates | **THIS PHASE** |
| **LP-7B** | DB schema + migration | `RegistrationRequest`, `EmailVerificationToken`, `PlatformSetting`, enums | Not started |
| **LP-7C** | Register request API | `POST /api/register/request`, validation, rate limits — **no email send** (log token in dev) | Not started |
| **LP-7D** | Email service abstraction | `EmailService` interface + Resend adapter + dev null adapter | Not started |
| **LP-7E** | Super Admin approval queue | List/detail/approve/reject APIs + minimal queue UI under `/super-admin` | Not started |
| **LP-7F** | Approval → tenant | Approve calls `provisionStore()`; map `businessTemplateKey`; activation email | Not started |
| **LP-7G** | Production UAT | Live email in staging; harness; owner E2E: register → verify → approve → login | Not started |

**Dependency chain:** LP-7A → LP-7B → LP-7C → LP-7D → LP-7E → LP-7F → LP-7G

---

## J. What not to implement yet

- No live email sending (LP-7A / LP-7B / LP-7C)
- No public tenant creation from `/register`
- No auto-approval
- No payment / subscription checkout at registration
- No full Super Admin dashboard (queue UI only in LP-7E scope)
- No Offline mode
- No changes to Store / Super Admin / EGO Admin login behavior (LP-2–LP-6A preserved)

---

## K. Verification (LP-7A)

| Check | Expected |
| --- | --- |
| `npm run typecheck` | PASS (docs only) |
| `npm run build` | PASS |
| `/register` unchanged | Request-access page remains |
| No new API routes | Confirmed |
| LP-4 `provisionStore` documented as reuse target | Yes |

---

## L. LP-7B readiness

**GO for LP-7B** — schema and migration design is defined; production onboarding remains EGO Admin controlled; no implementation started.

**Do not start LP-7B until explicitly confirmed.**

---

## M. References

- `app/(auth)/register/page.tsx`
- `components/auth/login-form.tsx`
- `lib/setup-admin/provision-store.ts`
- `app/api/ego-admin/stores/route.ts`
- `lib/auth/store-post-login-redirect.ts` (LP-5)
- `lib/env/demo-mode-guard.ts` (LP-6A)
- `OWNER_UAT_5_REGISTER_EMAIL_VERIFICATION_SPEC.md` (superseded for phasing)
- `LOGIN_PORTAL_ARCHITECTURE_SPEC.md`
