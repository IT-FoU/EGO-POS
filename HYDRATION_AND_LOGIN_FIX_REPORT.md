# Hydration and Login Fix Report

## Root Cause

The `/pos` page rendered time-sensitive values during the initial React render:

- `currentTime` used `new Date()` in `useState`.
- `businessDate` used `new Date()` inside `useMemo`.
- stock and expiry warning badges used `new Date()` while rendering product cards.

Those values can differ between the server HTML and the first client render, causing Next.js hydration attribute/text mismatch warnings.

The merchant login password eye toggle also had a duplicate inline script fallback attached to the same button as the React `onClick` handler. That could cause the password type to toggle twice from one click and appear broken.

During smoke testing, `/settings` also returned `500` because demo-mode settings tried to `findFirstOrThrow` a real company record for the demo tenant. That was not a hydration issue, but it broke the required route verification.

## Files Changed

- `features/pos/components/pos-page-client.tsx`
- `components/auth/login-form.tsx`
- `features/settings/prisma-repository.ts`
- `HYDRATION_AND_LOGIN_FIX_REPORT.md`

## Hydration Fixes

- Replaced initial POS clock render with a stable SSR-safe fallback: `--:--`.
- Replaced initial POS business date render with a stable SSR-safe fallback: `--`.
- Moved live POS clock/date updates into `useEffect`.
- Added a stable initial stock warning reference date and update it only after mount.
- Passed the stable stock reference date into favorite products and product grid stock badges.
- Removed render-time `new Date()` calls from the POS initial page content.

## Login Fixes

- Removed the inline password-toggle fallback script from `components/auth/login-form.tsx`.
- Kept the password field controlled by React state.
- Kept the eye button as `type="button"`.
- Kept form submission on `onSubmit` with `event.preventDefault()`.
- Login credentials are posted through NextAuth credentials callback and are not placed in the URL.

## Settings Route Fix

- Changed demo-mode settings load to return safe fallback settings when the demo company record is not found.
- Production/non-demo mode still fails loudly if company settings cannot be found.

## Verification Results

- `npm run typecheck`: PASS
- `prisma validate`: PASS
- `next build`: PASS

## Local Route Smoke Test

After owner login callback:

- `/login`: 307 redirect, expected when already signed in
- `/pos`: 200
- `/settings`: 200
- `/dashboard`: 200

## Login API Test

- `igo-admin / AdminChangeMe123!`: 200
- `manager / Manager123!`: 200
- `cashier / Cashier123!`: 200
- `igo-admin / WrongPassword!`: 401

## Browser Verification Note

The in-app Browser plugin could not start in this Windows sandbox with `CreateProcessAsUserW failed: 5`. Because of that, direct visual/browser interaction proof for the password eye button and React console overlay could not be captured in this run. Static code inspection, production build, route smoke tests, and auth callback tests all pass.

## Manual Test Checklist

- Open `/login`.
- Type a password and click the eye icon.
- Confirm password input changes between `password` and `text`.
- Login with owner, manager, and cashier demo users.
- Confirm no password appears in the URL.
- Open `/pos` and confirm there is no Next.js hydration overlay.
- Open `/settings` and confirm the page loads.
- Open `/dashboard` and confirm the page loads.
