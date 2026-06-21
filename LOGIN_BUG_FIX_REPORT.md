# Login Bug Fix Report

## Root Cause

- The observed `/login?username=...&password=...` URL indicates the login form was falling back to native browser form submission instead of the client submit handler.
- The form did not specify a safe `method`, so native fallback used GET and exposed credentials in the address bar.
- The login flow also performed a database health check before `signIn`, which blocks demo-mode login when the app is intended to allow demo users.
- Merchant demo credentials requested by the product owner were not available through the merchant auth provider. `igo-admin` existed as a Super Admin account, but not as a merchant Owner login.
- Follow-up finding: the previous fix still relied on the `next-auth/react` client helper and normal React hydration for both submit and password toggle. Because the user still saw a dead eye button, the client handler path was hardened further with direct credential callback submit and a non-sensitive password-toggle fallback listener.

## Files Changed

- `components/auth/login-form.tsx`
- `app/(auth)/login/page.tsx`
- `lib/auth/options.ts`
- `prisma/seed.ts`
- `prisma/seed-demo.ts`
- `LOGIN_BUG_FIX_REPORT.md`

## Fixes Applied

- Converted login form fields to controlled React state.
- Kept the password visibility button as `type="button"` and tied it only to input `type`.
- Added safe form fallback with `method="post"` so native fallback does not put passwords in the URL.
- Removed the pre-login database health check from the client form.
- Login now submits through a direct `fetch("/api/auth/callback/credentials")` call with CSRF, avoiding the extra `next-auth/react` client helper layer.
- `/login` now sanitizes unsafe `username` or `password` query parameters by redirecting back to `/login`.
- `proxy.ts` now sanitizes `/login?username=...&password=...` before the page renders, so credentials are not included in the rendered RSC payload.
- Added a password visibility fallback listener that only toggles the password input type and never reads or logs the password value.
- Added demo-mode merchant auth fallback for:
  - Owner
  - Manager
  - Cashier
- Updated seed scripts so real database seed/demo seed can create the same merchant test users.
- Wrong password now fails authentication instead of leaking into URL.

## Demo Users Verified

| Role | Username | Password | Expected access |
|---|---|---|---|
| Owner | `igo-admin` | `AdminChangeMe123!` | Full merchant access |
| Manager | `manager` | `Manager123!` | Manager permissions |
| Cashier | `cashier` | `Cashier123!` | POS + own sales report |

## Test Results

- Query credential URL cleanup:
  - Request: `/login?username=igo-admin&password=AdminChangeMe123%21`
  - Result: `307` redirect to `/login`
  - Response body credential leakage check: PASS, no username/password in redirect body after proxy fix
- Direct NextAuth callback:
  - `igo-admin / AdminChangeMe123!`: PASS
  - `manager / Manager123!`: PASS
  - `cashier / Cashier123!`: PASS
  - `cashier / wrong password`: PASS, returns unauthorized
- `npm run typecheck`: PASS
- `npm run build`: PASS
- Browser manual test: Browser plugin could not be used in this sandbox, so the browser interaction was verified by source-level control checks plus direct auth callback and URL sanitization tests.

## Remaining Limitations

- Browser plugin validation was unavailable in this sandbox, so password eye toggle was verified by source and build rather than in-browser automation.
- Demo-mode users are fallback auth users. Production staff login still needs Prisma-backed Staff Access records, server-side password hashing, session integration, permission loading, and audit-log writes.
- Disabled/inactive staff enforcement is implemented in the database-backed auth path and documented for production staff auth, but demo fallback users are all active.
