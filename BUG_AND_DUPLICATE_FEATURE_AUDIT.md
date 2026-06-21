# EGO POS Bug and Duplicate Feature Audit

This is an audit only. No fixes are included here.

## 1. Biggest Duplicates

### 1.1 SaaS Subscription vs Customer Subscription

- SaaS platform plan: `Plan`, `SaaSSubscription`, `Company.planId`.
- Customer/member subscription: `SubscriptionPlan`, `CustomerSubscription`.
- Risk: UI labels may confuse store membership with EGO POS paid plan.
- Source of truth: SaaS plan belongs to Super Admin/tenant feature locks; customer membership belongs to Customers/Membership module.

### 1.2 Membership vs Customers

- Customer profile stores membership-related fields and points.
- Membership Levels stores level rules and discounts.
- Risk: plan/benefit/pricing data duplicated in Customers and Membership UI.
- Source of truth: Customers own customer identity and balances; Membership Levels own tier/rule definitions.

### 1.3 QR Bank Settings

- Legacy POS QR key exists.
- Dynamic bank/account keys exist.
- Storage keys are translation-derived in places.
- Risk: Settings and POS can read/write different QR sources.
- Source of truth should be one QR Account repository.

### 1.4 Product Data

- Product service demo path returns `mockProducts`.
- Product list/create currently uses `ego.pos.products`.
- Prisma product repository exists.
- Risk: Products page, POS, Inventory, Reports can disagree.
- Source of truth should be Product repository with demo and Prisma adapters.

### 1.5 Inventory Stock

- POS deducts stock in localStorage product records.
- Inventory UI still has mock inventory data.
- Prisma inventory models exist.
- Risk: POS stock and Inventory stock diverge.
- Source of truth should be InventoryBalance plus StockMovement; localStorage demo adapter should mimic that.

### 1.6 Reports and Dashboard

- Dashboard/report widgets use mock/full mock data.
- POS now writes localStorage sales.
- Prisma sales exist.
- Risk: reports do not reflect actual POS sales.
- Source of truth should be Sales repository.

### 1.7 Permissions

- Prisma permission matrix exists.
- Settings permission UI exists.
- POS has separate hardcoded permission policy.
- Risk: POS rules diverge from Settings.
- Source of truth should be one permission service.

### 1.8 Audit Logs

- POS local audit key.
- Staff local audit key.
- Prisma AuditLog.
- Super Admin audit display.
- Risk: audit reports miss client-only actions.
- Source of truth should be AuditLog service with demo adapter.

## 2. Fake/Demo Data Still Visible

Known mock/demo sources:

- `features/products/mock-data.ts`
- `features/inventory/mock-data.ts`
- `features/purchasing/mock-data.ts`
- `features/suppliers/mock-data.ts`
- `features/promotions/mock-data.ts`
- `features/reports/mock-data.ts`
- `features/reports/mock-full-data.ts`
- `features/customers/mock-data.ts`
- `features/pos/mock-data.ts`
- `features/igo-admin/admin-data.ts`
- `prisma/seed-demo.ts`

Visible examples discovered by scan:

- Pepsi Can
- Lay's Classic
- Yogurt Cup
- demo alerts
- demo promotion text
- placeholder supplier/product/history data

Rule:

- Demo data may exist behind explicit `NEXT_PUBLIC_DEV_DEBUG=true` or seed commands, but should not appear in normal user workflow once real data exists.

## 3. Hardcoded IGO / Old Brand Text

Remaining scan findings:

- `prisma/seed.ts`: `IGO Store Owner`
- `prisma/seed-demo.ts`: `IGO Store Owner`
- Environment/internal names: `IGO_DEMO_MODE`, `igo-admin`, package name `igo-pos`.

Decision:

- User-facing seed names should be renamed to EGO or neutral names in a later brand cleanup bug.
- Internal identifiers may remain until a planned migration.

## 4. Buttons Without Real Action / UI-only Actions

Examples from scan:

- Customer import/export style buttons without full persistence.
- Promotion review/create/near-expiry/slow-moving actions that are demo modal or message only.
- Supplier/product placeholder detail buttons.
- Report export/schedule/favorite actions may be UI-only.
- Settings printer/advanced controls need real print service connection.

Rule:

- Every button must navigate, submit, persist, open a real modal, or be hidden/disabled with a clear locked state.

## 5. Language Toggle Gaps

Observed architectural risks:

- Runtime translation bridge exists.
- Many components still include hardcoded English strings.
- Some localStorage keys are generated through `t(...)`, which can change by locale and break data retrieval.
- Admin and merchant language providers are separate.

Rule:

- Storage keys must be stable constants, never translated.
- Components must use translation keys directly.
- Runtime bridge is temporary and should not be the main localization system.

## 6. Broken Workflow Points

High-risk workflows:

- POS sale -> Reports: sales localStorage may not be read by Reports.
- POS sale -> Inventory: stock deducts product localStorage but not inventory movement records.
- Product create -> Inventory: opening stock stored as product stock, not a stock movement.
- Customer membership -> POS discount: demo POS customers may be empty.
- Promotions -> POS: promotion engine is not wired as final checkout source.
- QR bank Settings -> POS: duplicate QR storage sources.
- Staff Settings -> Prisma users: demo staff does not create production user.
- Permission matrix -> POS/actions: POS has local hardcoded policy.
- Approval center -> actual action apply: pending approvals are local/partial.
- Super Admin plan locks -> merchant UI/API: feature entitlement checks are not global.

## 7. Current Critical Integration Problems

1. Multiple data sources per module: mock data, localStorage, and Prisma are mixed without one adapter layer.
2. Demo mode blocks production writes while UI sometimes expects write persistence.
3. Reports are not guaranteed to read real POS localStorage sales or Prisma sales consistently.
4. Inventory does not consistently reflect POS stock deduction.
5. Permission and approval rules are not globally enforced across modules.
6. Localization uses both dictionaries and runtime repair, leaving hardcoded strings and unstable translated storage keys.
7. QR payment data has duplicate storage paths.
8. Printer system is specified but not implemented as shared infrastructure.

