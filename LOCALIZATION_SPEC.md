# EGO POS Localization Specification

## 1. Purpose

This document defines Lao and English localization rules for all EGO POS merchant and Super Admin pages.

## 2. Supported Languages

- English
- Lao

Language preference source:

- Demo key: `ego-pos:locale`
- Production target: user/company locale setting

## 3. Core Rules

English mode:

- English UI only.
- No Lao labels unless user-entered data.

Lao mode:

- Lao UI only.
- No English UI except approved technical terms, product names, brand names, or user-entered data.

Approved technical terms in Lao mode:

- EGO POS
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

## 4. Scope

Localization applies to:

- Login
- Register
- Business selection
- Onboarding/setup
- Dashboard
- POS
- Products
- Inventory
- Purchasing
- Customers
- Membership
- Suppliers
- Promotions
- Reports
- Settings
- Customer Display
- Receipt preview/print
- Notifications
- Modals
- Validation messages
- Empty states
- Tooltips
- Super Admin

## 5. Translation Architecture

Target:

- Central dictionaries under `locales/en/*` and `locales/lo/*` or existing equivalent.
- Components call translation keys, not hardcoded display strings.
- Shared enums have display mappers:
  - roles
  - statuses
  - plans
  - payment methods
  - approval states
  - audit events
  - permissions
  - modules

Forbidden:

- Translated storage keys
- Translated IDs
- Translated enum values stored as data
- Hardcoded UI strings in components

Allowed:

- Stable keys and enum codes in English internally.
- Display mapping at UI boundary.

## 6. Font Rules

Lao mode font stack:

```css
font-family: "Phetsarath OT", "Noto Sans Lao", sans-serif;
```

Fallback behavior:

- If Phetsarath OT is unavailable, use Noto Sans Lao.
- If neither is available, use system sans-serif.

Apply to:

- App shell
- Forms
- Tables
- Modals
- Receipts
- Customer display
- Super Admin

## 7. Language Switch Behavior

Requirements:

- Updates UI without page refresh where possible.
- Saves language preference.
- Does not cause hydration mismatch.
- Does not read browser storage during server render.
- Dispatches event or uses provider state for live updates.

## 8. Missing Key Behavior

Development:

- Log missing translation key.
- Show clear fallback for current language only.

Production:

- Avoid mixed-language fallback.
- Use current language fallback dictionary or controlled placeholder.

## 9. Super Admin Localization

Super Admin must follow same rules:

- `/igo-admin`
- Businesses
- Users
- Subscriptions
- Audit Logs
- Admin login
- Admin headers/sidebar/cards/tables/modals

Route `/igo-admin` and username `igo-admin` may remain technical/internal.

## 10. Storage and Data Rules

Never translate:

- storage keys
- database field names
- enum codes
- IDs
- route paths
- API paths

Examples:

- Use `ego.pos.products`, not translated text.
- Use `role = "Manager"` internally, display Lao translation in UI.

## 11. Final QA Requirement

Before localization is considered complete:

- Remaining English UI strings in Lao mode = 0 excluding approved terms.
- Remaining hardcoded user-facing strings = 0.
- Mixed-language pages = 0.
- Missing Lao translation keys = 0.
