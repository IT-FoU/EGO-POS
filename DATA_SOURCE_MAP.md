# EGO POS — Data Source Map (B8-10)

> Updated for B8-10 settings/localStorage cleanup.
> Production source-of-truth is PostgreSQL/Prisma unless explicitly marked as local UI preference.

---

## Source-of-Truth Classification

| Area | Source of truth | Classification |
| --- | --- | --- |
| Dashboard KPIs | Prisma (`features/dashboard/dashboard-service.ts`) | Production DB |
| Reports analytics/KPIs | Prisma (`features/reports/prisma-repository.ts`) | Production DB |
| POS checkout totals/tax/member/promotion/loyalty | Prisma server checkout (`features/pos/prisma-repository.ts`) | Production DB |
| Recent sales/receipt/refund/void | Prisma APIs (`/api/pos/sales*`) | Production DB |
| Cash session/close-day | Prisma (`features/cash-sessions/*`) | Production DB |
| Promotions + usage | Prisma (`features/promotions/*`) | Production DB |
| Loyalty + points ledger | Prisma (`features/loyalty/*`) | Production DB |
| Supplier payable | Prisma (`features/suppliers/*`, `SupplierPayable`) | Production DB |
| Company settings (profile/receipt/tax/loyalty/currency) | Prisma (`CompanySetting`) | Production DB |
| Store business template (`Company.businessTemplateKey`) | Prisma (`Company`) | Production DB (LP-5 post-login redirect) |
| QR banks/accounts | Prisma (`QrPaymentBank`, `QrPaymentAccount`) | Production DB |
| Receipt print mode (auto/ask/no-auto) | browser localStorage (`ego-pos:receipt-print-mode`) | Safe local preference (device-specific) |
| Staff/roles/permissions | Prisma (`features/access-control/*`) | Production DB |
| Theme | browser localStorage | Safe local preference |
| Language UI locale | browser localStorage | Safe local preference |
| Customer display template/media/messages | browser localStorage | Safe local preference (device/display runtime) |
| POS secondary display transient state | browser localStorage (`customerDisplayState`) | Safe local preference/runtime view state |
| Onboarding draft context | browser localStorage | Demo-only when `IGO_DEMO_MODE=true` via `isDemoOnboardingEnabled()` (LP-6; not production tenant source) |

---

## LocalStorage Policy (B8-10)

### Allowed local storage (safe)

- Theme preference.
- Language/locale preference.
- Customer display media/template/messages and runtime display state.
- Onboarding draft/context used for setup/demo flow **only when `IGO_DEMO_MODE=true`** (`lib/demo/onboarding-access.ts`).

Production store login redirect uses `Company.businessTemplateKey` from PostgreSQL via `GET /api/auth/store-entry-path` (LP-5). localStorage onboarding must not override DB template in production (LP-6 hardening).

### Disallowed for production source-of-truth

- Company profile settings, tax/loyalty settings, QR payment settings, permissions, and checkout financial values.

All disallowed items above are now DB-backed and read from server snapshots/actions.

---

## Demo and Fallback Policy

- `IGO_DEMO_MODE` remains explicit opt-in.
- Session/admin demo fallback behavior is additionally gated by `IGO_ENABLE_DEMO_FALLBACK`.
- Runtime production reads do not fall back to local demo repositories for settings/checkout/reporting data.
- Production writes remain server-side Prisma writes with permission checks and audit where applicable.

---

## Key File Mapping

- Settings read/write:
  - `features/settings/prisma-repository.ts`
  - `features/settings/actions.ts`
  - `app/api/settings/route.ts`
- POS receipt print mode source:
  - `features/pos/prisma-repository.ts` (`receiptSettings.receiptPrintMode`)
  - `features/pos/components/pos-page-client.tsx` (reads server-provided print mode)
- Dashboard shell source:
  - `components/layout/dashboard-shell.tsx` (session/company derived; no demo settings repository reads)
- QR settings source:
  - `features/qr-payments/prisma-repository.ts`
  - `features/qr-payments/actions.ts`

---

## Residual Risk Notes

- Company logo is currently a client preview value and not persisted as a production-critical DB setting.
- Some demo repositories remain in codebase for explicit demo/setup paths; they are not production source-of-truth for core financial/operational modules.
