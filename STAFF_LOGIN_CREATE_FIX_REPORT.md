# Staff Login Create Fix Report

## Status

PASS

## Root Cause

The Add Staff Login modal was not using a real form submit flow. The save button was a generic dialog action outside an `onSubmit` form path, so create/save behavior was fragile and Enter/native submit behavior did not work reliably.

The second root cause was integration-related: staff records were stored only in browser-side UI storage, while NextAuth login validation runs on the server. That meant a newly created staff user could appear in UI state but could not be used by the login provider.

## Files Changed

- `features/settings/components/settings-form.tsx`
- `lib/auth/demo-staff-access.ts`
- `lib/auth/options.ts`
- `types/next-auth.d.ts`
- `app/(dashboard)/pos/page.tsx`
- `STAFF_LOGIN_CREATE_FIX_REPORT.md`

## Fixes Applied

### Add Staff Login Form

- Converted Add/Edit Staff Login modal to a real `<form onSubmit>`.
- Added `event.preventDefault()`.
- Create/Save button is visible and uses `type="submit"`.
- Required fields are enforced:
  - Full name
  - Username
  - Password
  - Confirm password
  - Role
  - Branch
  - Assigned POS terminal
  - Status
- Password and confirm password must match.
- Username uniqueness is checked against existing demo staff and reserved demo usernames.

### Save Behavior

Demo staff records now persist to:

- `localStorage`: `ego.pos.staff.access.users`
- demo login cookie: `ego_pos_staff_access_users`

This allows:

- Staff list to update immediately after create.
- Staff list to survive page refresh.
- NextAuth server-side credential login to read created demo staff.

Stored staff fields:

- `id`
- `fullName`
- `username`
- `passwordHash`
- `passwordSalt`
- `role`
- `branch`
- `assignedTerminal`
- `status`
- `allowPosAccess`
- `allowBackOfficeAccess`
- `requirePasswordChange`
- `createdAt`
- `updatedAt`

Passwords are not stored as plain text. Demo mode uses salted SHA-256 hash storage.

## Login Connection

NextAuth demo login now checks:

- Built-in demo users.
- Created demo staff users from `ego_pos_staff_access_users`.

Created staff login behavior:

- Active staff can login with username + password.
- Inactive staff are blocked.
- Wrong password is blocked.
- Role loads into session.
- POS/Back Office access flags load into session.
- Assigned POS terminal loads into session.

POS access is now checked on `/pos`. If `allowPosAccess` is false, POS shows:

`You do not have permission to perform this action.`

## Audit Log

Demo audit events are persisted to:

- `ego.pos.staff.access.audit`

Recorded actions:

- Staff created
- Staff updated
- Staff disabled
- Password reset
- Role changed

## Verification

Programmatic auth verification was completed with the required user:

```text
Full name: Gitar Hang
Username: gitar
Password: 123456
Role: Manager
Branch: Main Branch
Terminal: POS-01
Status: Active
Allow POS access: true
Allow Back Office access: true
```

Result:

- Staff record creation: PASS
- `gitar / 123456` login through NextAuth provider: PASS
- Loaded role: Manager
- POS access flag loaded: PASS
- Back Office access flag loaded: PASS
- Wrong password blocked: PASS
- Inactive staff blocked: PASS

Browser UI manual verification was not completed in this run because the local browser/server environment from the prior reality test remained unstable. The form and auth paths were verified through TypeScript and direct NextAuth provider execution.

## Build Result

- `npm run typecheck`: PASS
- `npm run build`: PASS
