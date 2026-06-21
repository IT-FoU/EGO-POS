# Brand Rename Report

## Status

PARTIAL PASS

Runtime user-facing references scanned in `app`, `components`, `features`, `lib`, and `locales` no longer contain `IGO POS` or `iGo POS`.

## Files Changed

- `app/globals.css`
- `app/(auth)/login/page.tsx`
- `app/(igo-admin)/igo-admin/layout.tsx`
- `app/(igo-admin)/igo-admin/page.tsx`
- `app/(igo-admin)/igo-admin/login/page.tsx`
- `app/(igo-admin)/igo-admin/businesses/page.tsx`
- `app/(igo-admin)/igo-admin/users/page.tsx`
- `app/(igo-admin)/igo-admin/subscriptions/page.tsx`
- `app/(igo-admin)/igo-admin/audit-logs/page.tsx`
- `components/layout/dashboard-shell.tsx`
- `components/layout/language-toggle.tsx`
- `components/igo-admin/admin-i18n.tsx`
- `components/igo-admin/admin-login-form.tsx`
- `components/igo-admin/admin-logout-button.tsx`
- `locales/lo/platform.ts`
- `lib/constants.ts`
- `README.md`
- `Design/IGO_POS_UI_SITEMAP_V1.md`
- `Docs/IGO_POS_MASTER_SPEC_V1.md`
- `Database/IGO_POS_DATABASE_SCHEMA_V1.md`
- `Roadmap/IGO_POS_DEVELOPMENT_ROADMAP_V1.md`

## User-Facing Brand Updates

- POS product display name remains centralized through `APP_NAME = "EGO POS"`.
- Login page renders `EGO POS`.
- Sidebar/shared merchant shell renders `EGO POS`.
- Platform onboarding translations now use `EGO POS`.
- Existing README/specification text was updated from `IGO POS` to `EGO POS`.

## Technical Identifiers Intentionally Kept

- `IGO_DEMO_MODE`
- `igo-admin`
- `igo_pos` or database-style identifiers if present
- `IGO Technology` as company/legal owner name where it is not used as the POS product brand
- Existing filenames such as `IGO_POS_MASTER_SPEC_V1.md`

## Scan Result

Command:

```text
rg -n "\bIGO POS\b|iGo POS" app components features lib locales README.md Docs Design Database Roadmap -g "*.ts" -g "*.tsx" -g "*.md"
```

Result:

```text
No matches
```

## Remaining IGO POS Display References

0 in the scanned runtime and documentation scope above.

## Super Admin Brand Fix

Updated Super Admin user-facing display strings:

- `IGO Admin` -> `EGO Admin`
- `IGO Super Admin` -> `EGO Super Admin`
- Super Admin login submit copy now says `Sign in to EGO Admin`
- Super Admin dashboard eyebrow now says `EGO Super Admin`

Intentionally unchanged:

- `/igo-admin` route
- `/api/igo-admin/*` routes
- `igo-admin` demo username
- internal file/folder names

Focused scan:

```text
rg -n "IGO Admin|IGO Super Admin|IGO POS|IGO Technology|\bIGO\b" "app\\(igo-admin)" components\\igo-admin features\\igo-admin -g "*.tsx" -g "*.ts"
```

Result:

```text
No matches
```

Super Admin remaining IGO display references = 0.
