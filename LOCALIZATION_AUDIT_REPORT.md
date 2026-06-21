# Localization Audit Report

## Status

NOT READY

The shared language behavior and platform Lao translation file were improved, but the full application is not yet 100% localized. Several feature components still render hardcoded English strings directly in JSX.

## Translation Structure

- Existing dictionary structure remains in `lib/i18n`.
- Platform template translations exist in:
  - `locales/en/platform.ts`
  - `locales/lo/platform.ts`
- `locales/lo/platform.ts` was replaced with clean UTF-8 Lao text because the previous content was mojibake.
- Shared merchant shell labels now use local copy maps in `components/layout/dashboard-shell.tsx`.

## Lao Font Implementation

Implemented in `app/globals.css`:

```css
html[data-locale="lo"] {
  --app-font-family: "Phetsarath OT", "Noto Sans Lao", sans-serif;
}
```

`components/layout/language-toggle.tsx` now sets `document.documentElement.lang` and `document.documentElement.dataset.locale` after mount so Lao mode can use the Lao font stack without SSR localStorage access.

If `Phetsarath OT` is not installed on the device, the app falls back to `Noto Sans Lao`, then `sans-serif`.

## Pages Audited

- `/login`
- `/dashboard`
- `/pos`
- `/inventory`
- `/purchasing`
- `/customers`
- `/membership-levels`
- `/suppliers`
- `/promotions`
- `/reports`
- `/settings`
- `/businesses`
- `/businesses/setup`

## Fixed In This Pass

- Login language switch labels no longer show English-only `Lao` / `English` in Lao mode.
- Shared sidebar labels switch between English and Lao.
- Shared plan display maps `Free Plan` to Lao in Lao mode.
- Shared paid-feature lock aria label switches language.
- Platform business templates and onboarding errors now have readable Lao text.
- Lao font stack is applied through `data-locale`.
- Super Admin login, sidebar, dashboard, businesses, users, subscriptions, and audit logs now use an admin localization helper for visible headings, nav, major table headers, and core action labels.
- Super Admin admin chrome now includes a LAO|ENG switch and follows the same `ego-pos:locale` preference.
- Super Admin brand text now uses `EGO Admin` and `EGO Super Admin`.

## Remaining Untranslated Strings

The following examples confirm full Lao localization is still incomplete:

- `features/suppliers/components/suppliers-list-client.tsx`: `Create supplier`, `Search code, company, contact...`
- `features/suppliers/components/supplier-form.tsx`: `Create supplier`, `Save`
- `features/customers/components/customers-list-client.tsx`: `Active Customers`, `Available Points`, `Outstanding Balance`
- `features/pos/components/pos-page-client.tsx`: `Search product, SKU, code`, `Membership Search`, `Delete Held Bill`
- `features/settings/components/settings-form.tsx`: `Settings`, `Save settings`, `Settings saved successfully.`
- `features/reports/components/reports-analytics-client.tsx`: `Inventory Alerts`, `Export Center`, several modal/action labels
- Some dynamic Super Admin record values are still data-driven and may appear in English, for example status values from the database and business/template names.

## Approved English Technical Terms In Lao Mode

- POS
- QR
- VAT
- SKU
- PIN
- WiFi
- USB
- API
- Backup
- Cloud
- Login
- Username
- Password

## Mixed-Language Pages

Not 0 yet.

Known mixed or hardcoded-English surfaces remain in POS, Customers, Suppliers, Settings, Reports, and Purchasing subflows.

Super Admin remaining IGO display references = 0.

Super Admin localization status: Partially localized. The main Super Admin page chrome, headings, table headers, and action labels now switch between English and Lao. Data values from records remain as stored.

## Hydration Notes

- Language preference continues to load after mount.
- `data-locale` and `lang` are updated after mount.
- No new SSR localStorage reads were introduced.

## Verification

- `npm run typecheck`: PASS
- `npm run build`: PASS
- `npm run lint`: FAIL, script is not configured in `package.json`

Latest Super Admin verification:

- Focused Super Admin IGO display scan: PASS, no matches.
- `npm run typecheck`: PASS
- `npm run build`: PASS

## Recommendation

Do not start Phase A Permission Enforcement until a dedicated localization hardening pass moves remaining feature strings into shared translation resources and replaces hardcoded JSX strings with translation keys.
