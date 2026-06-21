# IGO POS Business Template & Localization Update Report

## Completed

- Added platform locale resources:
  - `locales/en/platform.ts`
  - `locales/lo/platform.ts`
- Added a platform localization helper:
  - `features/platform/platform-localization.ts`
- Reworked business template metadata so template names/descriptions live in locale resources instead of mixed `nameEn` / `nameLo` UI fields.
- Added two new business templates:
  - Wholesale Store / ຮ້ານຂາຍສົ່ງ
  - Online Seller / ຜູ້ຂາຍອອນລາຍ
- Updated the Choose Business page to show 8 localized template cards:
  - Mini Mart
  - Restaurant
  - Pharmacy
  - Coffee Shop
  - Beauty Salon
  - Clothing
  - Wholesale Store
  - Online Seller
- Updated the Business Setup page to show the selected template in the active language only.
- Updated the template placeholder shell to use localized platform messages and template names.
- Kept Mini Mart routing unchanged. `mini_mart` still redirects to `/dashboard`.

## Files Changed

- `app/(platform)/businesses/page.tsx`
- `app/(platform)/businesses/setup/page.tsx`
- `app/(platform)/template-shell/[template]/page.tsx`
- `features/platform/components/business-setup-form.tsx`
- `features/platform/components/template-picker.tsx`
- `features/platform/components/template-placeholder-shell.tsx`
- `features/platform/platform-data.ts`
- `features/platform/platform-localization.ts`
- `locales/en/platform.ts`
- `locales/lo/platform.ts`
- `BUSINESS_TEMPLATE_LOCALIZATION_UPDATE_REPORT.md`

## Localization Status

### Completed For This Phase

- Choose Business page template names and descriptions are localized.
- Business Setup selected template label is localized.
- Template placeholder shell copy is localized.
- New Wholesale Store and Online Seller templates include English and Lao resources.
- Business template cards no longer show English and Lao together.

### Remaining Full-App Localization Work

The entire application still contains many hardcoded strings outside the platform onboarding flow. These need a module-by-module localization migration before the app can truthfully meet the "zero mixed-language content on all pages" requirement.

High-priority remaining areas:

- POS register and customer display strings
- Products list, product forms, product categories, and unit labels
- Inventory dashboard, quick stock-in, and stock movement labels
- Purchasing page, PO forms, and supplier credit panels
- Customers CRM cards, profile modals, and import/export dialogs
- Membership Levels page labels, modals, and reports
- Suppliers detail pages, ledgers, documents, and action modals
- Promotions wizard, analytics, calendar, stack rules, and recommendation modals
- Reports dashboard, report center, filters, charts, and export dialogs
- Settings cards, permissions, QR payment bank management, approval center, and staff access management
- Super Admin portal pages

## Known Localization Risk

`lib/i18n/dictionaries.ts` currently contains existing Lao text that appears mojibake in terminal output. Some UI may still render incorrectly until that shared dictionary is re-encoded or replaced with clean `locales/lo/*` resources module by module.

## Verification

- `npm run typecheck`: PASS
- `prisma validate`: PASS
- `next build`: PASS

## Recommendation

GO for the business template additions and Phase A onboarding/template localization.

NO-GO for claiming full-app localization complete. The next recommended phase is a structured module-by-module i18n migration, starting with the shared merchant shell/navigation and then POS, Products, Inventory, Purchasing, Reports, and Settings.
