# Phase A.0 - Single Source of Truth Foundation Report

Date: 2026-06-21

Status: Foundation added. Not production ready.

## 1. Storage Constants Created

Created central stable storage keys in `lib/demo/storage-keys.ts`.

Stable keys added:

- `ego.pos.products`
- `ego.pos.inventory.movements`
- `ego.pos.sales`
- `ego.pos.receipts`
- `ego.pos.auditLogs`
- `ego.pos.pendingApprovals`
- `ego.pos.staff.access.users`
- `ego.pos.staff.access.audit`
- `ego.pos.settings`
- `ego.pos.customers`
- `ego.pos.memberships`
- `ego.pos.promotions`
- `ego.pos.qr.banks`
- `ego.pos.qr.accounts`
- `ego.pos.customerDisplay.state`
- `ego.pos.customerDisplay.settings`
- `ego-pos:company-logo-url`
- `ego-pos:plan-name`
- `ego-pos:plan-days-left`
- `ego-pos:locale`
- `ego-pos:theme`
- `ego-pos:onboarding-business`
- `ego-pos:onboarding-complete`
- `ego-pos:onboarding-draft`
- `ego-pos:onboarding-template`

Important rule implemented:

- Storage keys are now stable constants.
- No translated strings are used as storage keys in the migrated areas.

## 2. Repositories Created

Created central demo storage helpers:

- `lib/demo/storage.ts`
- `lib/demo/repositories.ts`

Repositories/services created:

- `demoProductsRepository`
- `demoInventoryMovementRepository`
- `demoSalesRepository`
- `demoReceiptsRepository`
- `demoAuditLogRepository`
- `demoPendingApprovalRepository`
- `demoStaffRepository`
- `demoSettingsRepository`
- `demoCustomerRepository`
- `demoMembershipRepository`
- `demoPromotionRepository`
- `demoQrRepository`

Shared helper behavior:

- Safe JSON read/write
- Safe list read/write
- Safe string read/write
- Browser-storage guard
- Stable local ID helper
- Migration runner

## 3. Old Keys Migrated

Migration support added for:

- `igo-theme` -> `ego-pos:theme`
- `igo-pos:onboarding-business` -> `ego-pos:onboarding-business`
- `igo-pos:onboarding-complete` -> `ego-pos:onboarding-complete`
- `igo-pos:onboarding-draft` -> `ego-pos:onboarding-draft`
- `igo-pos:onboarding-template` -> `ego-pos:onboarding-template`
- `ego-pos:customer-display-settings` -> `ego.pos.customerDisplay.settings`
- `ui.ego.pos.customer.display.state` -> `ego.pos.customerDisplay.state`
- `ui.ego.pos.company.logo.url` -> `ego-pos:company-logo-url`
- `ui.ego.pos.locale` -> `ego-pos:locale`
- `ui.ego.pos.qr.banks` -> `ego.pos.qr.banks`
- `ui.ego.pos.dynamic.qr.banks` -> `ego.pos.qr.banks`
- `ui.ego.pos.dynamic.qr.accounts` -> `ego.pos.qr.accounts`

Product migration/normalization:

- Deduplicates product IDs.
- Normalizes missing product IDs.
- Normalizes unit IDs.
- Preserves user-created products.
- Normalizes stock fields for POS/product compatibility.

## 4. Pages Switched To Repositories

Products:

- `features/products/components/product-form.tsx`
- `features/products/components/product-list-client.tsx`

Changes:

- Product create now writes through `demoProductsRepository`.
- Product list now reads through `demoProductsRepository`.
- Product delete, bulk delete, and clear use `demoProductsRepository`.
- Direct product localStorage access removed from these components.

POS:

- `features/pos/components/pos-page-client.tsx`

Changes:

- POS products load through `demoProductsRepository`.
- Demo sale writes through `demoSalesRepository`.
- Receipt writes through `demoReceiptsRepository`.
- Product stock deduction uses `demoProductsRepository.deductStock`.
- POS audit writes through `demoAuditLogRepository`.
- POS pending approvals write through `demoPendingApprovalRepository`.
- POS QR banks read through `demoQrRepository`.
- Customer display state uses stable key and shared storage helper.
- Store logo reads through `demoSettingsRepository`.

Customer Display:

- `features/pos/customer-display-settings.ts`
- `features/pos/components/customer-display-client.tsx`

Changes:

- Customer display settings use `ego.pos.customerDisplay.settings`.
- Customer display live state uses `ego.pos.customerDisplay.state`.

Settings:

- `features/settings/components/settings-form.tsx`

Changes:

- Company logo uses `demoSettingsRepository`.
- QR banks/accounts use `demoQrRepository`.
- Staff access users and staff audit use `demoStaffRepository`.
- Removed translated key usage for QR/account storage paths.

Global Shell / Auth / Onboarding:

- `components/theme-provider.tsx`
- `components/layout/dashboard-shell.tsx`
- `components/layout/language-toggle.tsx`
- `components/igo-admin/admin-i18n.tsx`
- `features/platform/onboarding-context.ts`
- `lib/auth/demo-staff-access.ts`

Changes:

- Theme uses `ego-pos:theme`.
- Language uses `ego-pos:locale`.
- Onboarding uses `ego-pos:*` keys.
- Demo staff auth key points to central `DemoStorageKeys.staffUsers`.
- Dashboard shell reads plan/logo through settings repository.

Other locale readers switched away from direct translated keys:

- `features/reports/components/reports-analytics-client.tsx`
- `features/purchasing/components/purchasing-page-client.tsx`
- `features/purchasing/components/payables-page-client.tsx`
- `features/purchasing/components/suppliers-page-client.tsx`
- `features/inventory/components/inventory-page-client.tsx`
- `features/customers/components/customers-list-client.tsx`
- `components/i18n/localization-repair-runtime.tsx`

## 5. Remaining Direct localStorage Reads

Scan result:

- Remaining direct `localStorage` reads/writes are contained in `lib/demo/storage.ts`.
- No direct `localStorage` use remains in scanned `features`, `components`, `lib`, or `app` files outside the central storage helper.

Command used:

```text
rg -n localStorage features components lib app -g *.ts -g *.tsx
```

Remaining expected results:

- `lib/demo/storage.ts`

## 6. Remaining Mock Data Sources

These are still present and must be handled in later phases because they are server-rendered services or module-specific demo adapters:

- `features/products/product-service.ts` still uses `features/products/mock-data.ts`.
- `features/inventory/inventory-service.ts` still uses `features/inventory/mock-data.ts`.
- `features/reports/report-service.ts` still uses report, product, and inventory mock data.
- `features/purchasing/purchasing-service.ts` still uses product and inventory mock data.
- `features/promotions/promotion-service.ts` still uses product/category mock data.
- `features/reports/mock-data.ts` remains an independent report mock source.
- `features/inventory/mock-data.ts` remains an independent inventory mock source.

Reason not fully switched in Phase A.0:

- These services execute on the server in current routes.
- Browser localStorage repositories cannot be read during server render.
- A proper next step is to add a demo server/session data adapter or move the affected dashboards to client-side repository hydration.

## 7. Removed / Reduced Module-Specific Fake Sources

Completed:

- POS no longer loads its product grid from POS mock products when demo product storage is present.
- POS no longer uses its own hardcoded product storage key.
- Product create/list/delete no longer use their own hardcoded product storage key.
- Customer Display and Settings no longer use translated storage keys.
- QR bank/account demo paths are centralized.
- Staff access storage path is centralized.

Not completed:

- Server services still retain mock fallback data.
- Product edit route still depends on server product service for initial product lookup.
- Reports dashboard still has UI-level mock/full demo data that does not yet derive from `ego.pos.sales`.
- Inventory dashboard still receives server mock inventory props.

## 8. Files Changed

Created:

- `lib/demo/storage-keys.ts`
- `lib/demo/storage.ts`
- `lib/demo/repositories.ts`
- `PHASE_A0_SINGLE_SOURCE_OF_TRUTH_REPORT.md`

Updated:

- `features/products/components/product-form.tsx`
- `features/products/components/product-list-client.tsx`
- `features/pos/components/pos-page-client.tsx`
- `features/pos/customer-display-settings.ts`
- `features/pos/components/customer-display-client.tsx`
- `features/settings/components/settings-form.tsx`
- `components/theme-provider.tsx`
- `components/layout/dashboard-shell.tsx`
- `components/layout/language-toggle.tsx`
- `components/igo-admin/admin-i18n.tsx`
- `components/i18n/localization-repair-runtime.tsx`
- `features/platform/onboarding-context.ts`
- `lib/auth/demo-staff-access.ts`
- `features/reports/components/reports-analytics-client.tsx`
- `features/purchasing/components/purchasing-page-client.tsx`
- `features/purchasing/components/payables-page-client.tsx`
- `features/purchasing/components/suppliers-page-client.tsx`
- `features/inventory/components/inventory-page-client.tsx`
- `features/customers/components/customers-list-client.tsx`

## 9. Verification

`npm run typecheck`

- PASS

`npm run build`

- PASS
- Build completed successfully after a longer timeout.

## 10. Next Required Foundation Work

Recommended next Phase A.0 continuation before POS bug fixing:

1. Add a server-compatible demo data adapter so server services can read the same demo records without browser localStorage.
2. Convert `features/products/product-service.ts` to prefer repository-backed data in demo/client contexts.
3. Convert Reports service/UI to derive sales metrics from `ego.pos.sales`.
4. Convert Inventory service/UI to derive stock from `ego.pos.products` and `ego.pos.inventory.movements`.
5. Convert Purchasing and Promotions services away from `mockProducts` toward product repository adapters.
6. Add one central DTO mapping layer from demo Product -> POS Product -> Inventory Item -> Report Product Row.

## 11. Final Status

Phase A.0 foundation is in place and build-safe.

Not production ready.

The app now has central demo storage constants, migration helpers, and repositories. Products, POS, Settings QR/staff/logo, Customer Display, language, theme, and onboarding are moved onto the foundation. Server-rendered Reports/Inventory/Purchasing/Promotions still use mock fallback sources and require the next adapter pass.
