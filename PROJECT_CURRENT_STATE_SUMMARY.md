# EGO POS — Project Current State Summary

> Read-only analysis of the actual source code at commit **`29af75d` — "B8-3 POS Permission Enforcement Completed"**.
> Project was originally **IGO POS**, later renamed **EGO POS** (the `IGO_DEMO_MODE` env flag and `igo-admin` super-admin area still carry the legacy name in code).
> Stack: **Next.js 16 (App Router, Turbopack) + React + TypeScript + Prisma (PostgreSQL via pg adapter) + NextAuth**.
> No code was modified to produce this document.

---

## 1. Total files

| Scope | Count |
| --- | --- |
| Git-tracked files | **7,996** |
| Working-tree files (excludes `node_modules`, `.next`, `.git`) | **8,000** |
| **TypeScript source** (`.ts`/`.tsx`, excl. `node_modules`/`.next`) | **291** |
| Screenshot / `.tmp-*` artifact files | **7,557** |

> **~94% of tracked files are screenshot/tmp artifacts** (7,557 of 7,996). The other non-source weight is `Backups/`, `public/`, `locales/`, Prisma migration SQL, and committed planning markdown. The actual hand-written application surface is just **291 TypeScript files**.

### Per-folder breakdown (requested folders)

| Folder | Files | Subfolders | Notes |
| --- | --- | --- | --- |
| `app/` | 86 | 100 | Route groups `(dashboard)`, `(auth)`, `(platform)`, `(igo-admin)`; 53 pages + 29 API routes |
| `features/` | 145 | 30 | 17 domain modules (the core of the app) |
| `components/` | 14 | 5 | Shared layout/theme/i18n primitives |
| `lib/` | 21 | 8 | auth, db, demo, i18n, validation, api |
| `prisma/` | 18 | 13 | `schema.prisma`, migrations, 3 seed files |
| `locales/` | 4 | 3 | en/lo UI dictionaries |
| `scripts/` | 29 | 0 | tsx verification harnesses (B7-x, B8-x) + tooling |
| `Docs/` | 2 | 0 | sparse |
| `Database/` | 1 | 0 | sparse |
| `Roadmap/` | 1 | 0 | sparse |
| `Prompts/` | 1 | 0 | sparse |
| `types/` | 1 | 0 | global types |
| `public/` | 0 | 0 | empty |

---

## 2. Total folders

- Working-tree folders (excludes `node_modules`, `.next`, `.git`): **3,606** — again inflated by screenshot/backup trees.
- Meaningful source folders: `app` (100, mostly route-group nesting), `features` (30), `lib` (8), `prisma` (13 incl. migrations), `components` (5).

---

## 3. Main modules discovered

### `features/` domain modules (17)
`access-control`, `approvals`, `customers`, `dashboard`, `igo-admin`, `inventory`, `membership-levels`, `platform` (onboarding/templates), `pos`, `products`, `promotions`, `purchasing`, `qr-payments`, `reports`, `settings`, `shifts`, `suppliers`.

Dominant pattern per module: `*-service.ts` (reads) → `prisma-repository.ts` (DB) → `actions.ts` (server actions) → `components/*-client.tsx` (UI), with `dto.ts` / `dto-mapper.ts` validation.

### `app/` surface
- **53 page routes**, **29 API route handlers** (see §8).
- Most dashboard mutations go through **server actions**, not REST; REST routes exist primarily for products, customers, suppliers, promotions, membership, inventory, purchasing, POS sale, settings, approvals, igo-admin auth.

### Data layer
- **Prisma schema: 69 models** across auth/tenant, products, inventory, purchasing/suppliers, POS/sales, customers/membership, promotions, approvals/audit, settings/platform.
- Multi-tenant scoping via `CompanyUser` membership; writes wrapped in `withTenantTransaction` with **AuditLog** rows.

---

## 4. Implemented features (real, Prisma-backed)

| Area | State |
| --- | --- |
| **Auth / RBAC** | NextAuth credentials; roles, permissions, role-permission matrix, per-user roles — all DB-backed (`access-control`). |
| **POS checkout** | `completePrismaSale` is **server-authoritative** (DB pricing, server membership discount, promotion engine, tax, payment validation, client-total mismatch guard) — hardened in **B8-1**. |
| **POS permission enforcement** | `create_sale` + `apply_discount` enforced server-side using the user's **actual role**; role-aware discount caps — **B8-3**. |
| **Products & categories** | Full CRUD + price/barcode history models. |
| **Inventory** | Stock-in, adjustment, count, base-unit conversion, atomic stock deltas, lots/movements. |
| **Purchasing** | PO lifecycle (draft→ordered→partial→received→closed/cancelled), receiving with base-unit conversion, supplier payables + outstanding balance sync — **B7-1/2/3**. |
| **Suppliers** | CRUD + payables reads (UI has placeholders, see §5). |
| **Customers & membership** | CRUD, payments, loyalty points, membership levels CRUD. |
| **Promotions** | CRUD + applied at checkout (product/category/membership scoping, usage tracking). |
| **Approvals engine** | DB-backed create/decide/execute with role enforcement, self-approval block, cross-company isolation, stock-adjustment executor, audit — **B8-2**. |
| **Settings / tax / loyalty / QR banks** | DB-backed writes. |
| **Reports (sub-pages)** | `/reports/sales|inventory|customers|products|purchasing` + dashboard KPIs use real Prisma aggregates. |
| **Demo-fallback removal** | Service-layer read mock fallbacks removed; `isDemoMode()` is fail-safe OFF — **B7-4**. |

---

## 5. Unfinished features (UI exists, logic partial/stub)

| Area | Gap |
| --- | --- |
| **POS bill lifecycle** | `hold_bill`, `resume_bill`, `void_bill`, `refund_bill`, `cash_in`, `cash_out` are **client-only state**; no server persistence. `HoldBill`/`Refund`/`CashTransaction` models exist but are unused. |
| **Shift / cash session** | `CashSession` is **read-only** in POS; `features/shifts/` is a prototype component **never imported**; no open/close-shift writes. Dashboard "Status: OPEN" + Close Day button are hardcoded UI with no action. |
| **Reports "Report Center" tab** | Still renders `features/reports/mock-full-data.ts` (executive reports, report catalog rows, currency rates). |
| **Promotions advanced** | `/promotions/stack-rules`, `/promotions/integration-map`, parts of `/promotions/analytics` and `/promotions/calendar` are static/placeholder; Save does nothing. `PromotionRule`/`PromotionAction` models unused. |
| **Suppliers detail UI** | Documents, linked products, AP invoices, charts, "Record Payment" modal, activate/deactivate — placeholders. |
| **Products** | Product **image** management is a stub: `getPrismaProductImages()` returns `[]`; image search/scanner are mock UI. Import/export/barcode-audit modals are placeholders. |
| **Customers** | CSV/Excel import/export is a placeholder. |
| **Platform onboarding** | `/businesses/setup` persists to **localStorage only**; non–mini-mart templates route to a placeholder shell. |
| **Registration** | `/register` is a static form linking to `/businesses`; no signup endpoint. |
| **IGO admin** | Reads work; suspend/activate/delete business, block user, subscription changes are **disabled stub buttons**. |

---

## 6. Missing integrations

- **POS → Approvals**: the hardened approval engine (B8-2) is **not wired** to the POS over-limit discount / void / refund flows; POS still uses a client/localStorage approval panel (demo+devDebug gated).
- **POS → Cash/Shift ledger**: no link between sales and `CashSession`/`CashTransaction`; no end-of-day reconciliation persistence.
- **Onboarding → Company creation**: `platform` onboarding never creates `Company`/`Branch`/`Warehouse` rows (localStorage only).
- **Reports Report Center → DB**: catalog/exec-report metadata is static, not derived from real aggregates; report date-range filters are UI-only (no server re-query in some hub paths).
- **Product images → storage**: no upload/storage backend connected (`ProductImage` model unused).
- **IGO admin → tenant mutations**: no admin write APIs for lifecycle actions.
- **Notifications / Backups / Stock transfer**: models exist (`Notification`, `Backup`, `StockTransfer*`) with no app integration.

---

## 7. Mock / demo data still used at runtime

> `isDemoMode()` is **fail-safe OFF** (`IGO_DEMO_MODE === "true"` required). Service-layer read fallbacks were removed in B7-4. What remains:

**Always-on (not behind a flag):**
- `features/reports/components/reports-analytics-client.tsx` → `mock-full-data.ts` (Report Center tab content).
- `features/settings/components/settings-form.tsx` → localStorage mirror of logo/settings.
- `components/layout/dashboard-shell.tsx` → localStorage logo + plan name/days.
- `features/pos/components/pos-page-client.tsx` → localStorage for **recent sales, POS audit log, pending approvals, void stock restore** (the *checkout* path itself is demo-gated).
- UI prefs / onboarding via `lib/demo/storage`: theme, locale, customer-display settings, onboarding draft (multiple components).
- `getMockProductImages()` (legacy name) → calls Prisma but returns `[]`.

**Demo-gated (`IGO_DEMO_MODE=true`):** demo login/session (`lib/auth/*`), settings no-company fallback, `igo-admin` DB-error demo fallback, POS `completeDemoSale` localStorage path.

**Dead/unused:** `features/*/mock-data.ts` (seed/scripts only), most `lib/demo/repositories.ts` exports (category, inventory-movement, staff, QR, customer, membership, promotion), `writeDemoStaffCookie`, `features/reports/mock-data.ts` (orphaned), `features/shifts/` component.

---

## 8. Backend endpoints missing (for existing UI)

| Missing endpoint / action | Drives UI |
| --- | --- |
| `POST /api/pos/hold` (+ resume) | POS hold/resume bill |
| `POST /api/pos/void` | POS void bill |
| `POST /api/pos/refund` | POS refund |
| `POST /api/pos/cash-in` / `cash-out` | Cash drawer |
| `POST /api/pos/shift/open` / `close` | Shift / OT |
| `POST /api/dashboard/close-day` | End-of-day close |
| `POST /api/businesses` | Onboarding / company creation |
| `POST /api/auth/register` | Owner signup |
| `GET/PATCH /api/promotions/stack-rules` | Stack-rule config |
| `POST /api/igo-admin/businesses/[id]/*` | Suspend/activate/delete business |
| `POST /api/igo-admin/users/[id]/*` | Block/reset user |
| `POST /api/igo-admin/subscriptions/*` | Plan changes |
| `POST /api/products/import`/`export` | Bulk product workflows |
| `POST /api/customers/import`/`export` | Customer CSV/Excel |
| `PATCH /api/suppliers/[id]/status` | Supplier activate/deactivate |
| Product image upload/storage endpoint | Product image manager |

> Existing 29 endpoints are listed in the appendix at the bottom. Note: many dashboard reads intentionally use SSR Prisma services rather than REST — those are **not** counted as "missing".

---

## 9. Current production readiness

**Estimated ~70% for a single-store retail POS deployment** (the core sell/stock/purchase/customer loop is real and server-hardened). Lower if scored as a **multi-tenant SaaS** (onboarding, registration, admin lifecycle, billing are stubbed).

| Capability cluster | Readiness |
| --- | --- |
| Core POS checkout (pricing/tax/payment integrity) | ~90% |
| POS server-side permissions | ~85% (checkout surface only) |
| Products / Inventory / Purchasing / Suppliers (data) | ~85% |
| Customers / Membership / Promotions (data) | ~80% |
| Approvals engine (core) | ~80% (not wired to POS flows) |
| Reports & analytics | ~55% (sub-pages real; Report Center mock; filters UI-only) |
| POS bill lifecycle (hold/void/refund/cash/shift) | ~25% (UI only, no persistence) |
| End-of-day / cash reconciliation | ~15% |
| Onboarding / registration / company creation | ~15% (localStorage) |
| IGO super-admin lifecycle controls | ~25% (reads only) |
| Product image management | ~10% (stub) |
| **Overall weighted** | **~70%** |

---

## 10. Top 10 critical risks

1. **POS bill lifecycle has no server persistence** — void/refund/hold/cash movements live in client localStorage only. Refunds and voids cannot be audited, reconciled, or trusted; `Refund`/`HoldBill`/`CashTransaction` tables are empty by design. **Highest financial-integrity risk.**
2. **No end-of-day / cash reconciliation** — `CashSession` is read-only and the Close Day button is cosmetic. There is no authoritative record of drawer open/close vs. sales, so cash variance cannot be detected.
3. **Approvals engine not wired to POS** — the hardened B8-2 engine exists but POS over-limit discount/refund still use a demo/localStorage panel, so high-risk overrides aren't actually routed through DB approval + audit in the live UI.
4. **Reports show mock data in the Report Center tab** — `mock-full-data.ts` (executive reports, currency rates, catalog rows) renders always-on; users may make decisions on fabricated figures. Some hub filters are UI-only (no re-query).
5. **Onboarding & registration are localStorage-only** — no `Company`/`Branch`/`Warehouse` creation path; a fresh tenant cannot truly self-provision. Blocks real multi-tenant SaaS use.
6. **IGO super-admin lifecycle controls are disabled stubs** — no way to suspend/activate/delete tenants, block users, or change subscriptions; operational/billing control absent.
7. **Demo fallbacks can fabricate auth/data when `IGO_DEMO_MODE=true`** — demo login, fake sessions, and hardcoded super-admin login exist; if this env flag is ever true in production, it is an authentication-bypass risk. (Mitigated by fail-safe default, but the code path remains.)
8. **Persistent localStorage debt in client surfaces** — settings logo, dashboard header plan/logo, POS recent sales/audit, UI prefs are read from the browser, so they diverge per-device and aren't server truth.
9. **~20+ Prisma models are unused** (`StockTransfer*`, `PromotionRule/Action`, `Refund*`, `CashTransaction`, `HoldBill*`, `Notification`, `Backup`, `CustomerGroup*`, `CustomerSubscription`, `FavoriteProduct`, `PosDevice`, `Brand`, `ProductImage`) — schema/feature drift; risk of half-built assumptions and migration weight.
10. **Repo hygiene & rename incompleteness** — 7,996 tracked files include 14 `.tmp-*-screenshots/` trees + `Backups/`; legacy "IGO" naming persists (`IGO_DEMO_MODE`, `igo-admin`). Bloat slows tooling and the rename to "EGO POS" is only partial, risking confusion.

---

## Questions I need answered before a full repository audit

1. **Target deployment model:** Is EGO POS shipping as a **single-store/single-tenant** product first, or as a **multi-tenant SaaS** (with self-serve onboarding, subscriptions, and the IGO super-admin console)? This sets the readiness bar.
2. **POS bill lifecycle priority:** Are **void / refund / hold / cash-in-out / shift** required for the first production release, or is "ring up sales only" acceptable for v1?
3. **Cash management:** Do you need **end-of-day close + cash drawer reconciliation** persisted (and shift-based accountability), or is that out of scope initially?
4. **Approvals in POS:** Should I treat "wire the B8-2 approval engine into live POS overrides (discount/void/refund)" as the intended next phase, replacing the localStorage approval panel?
5. **Reports authority:** Should the **Report Center** tab be fully DB-backed (removing `mock-full-data.ts`), and do you want server-side **date-range filtering** across all report hub views?
6. **Demo mode policy:** Can the `IGO_DEMO_MODE` / demo-login / demo-repository code paths be **removed entirely** for production, or must demo mode remain a supported runtime (e.g., for sales demos)?
7. **localStorage usage:** Which client-side localStorage stores are **intentional** (theme, locale, customer-display) vs. should become server-backed (settings logo, plan info, POS recent sales/audit)?
8. **Unused models:** Should the ~20 unused Prisma models be **implemented** (i.e., they represent a roadmap) or **removed** to reduce drift? Which ones are roadmap vs. dead?
9. **Product images & files:** What is the intended **storage backend** (S3/Supabase storage/local) for product images, supplier documents, and logos — so the stubs can be completed?
10. **Naming & repo scope:** Do you want the **IGO→EGO rename** completed across code/env/routes, and should the screenshot/backup/tmp folders be removed from version control as part of the audit cleanup?
```

---

### Appendix — 29 existing API endpoints
```
GET/POST     /api/auth/[...nextauth]          GET/POST     /api/products
GET          /api/health/database             PATCH/DELETE /api/products/[id]
GET          /api/reports                     GET/POST     /api/products/categories
GET/POST     /api/customers                   PATCH/DELETE /api/products/categories/[id]
PATCH/DELETE /api/customers/[id]              GET/POST     /api/suppliers
POST         /api/customers/payments          PATCH/DELETE /api/suppliers/[id]
GET/POST     /api/promotions                  PATCH/DELETE /api/promotions/[id]
GET/POST     /api/membership-levels           PATCH/DELETE /api/membership-levels/[id]
POST         /api/inventory/stock-in          POST         /api/inventory/adjustment
POST         /api/inventory/count             POST         /api/purchasing/purchase-orders
POST         /api/purchasing/purchase-orders/status        POST /api/purchasing/receiving
POST         /api/purchasing/payments         POST         /api/pos/sales
GET/PATCH    /api/settings                    POST         /api/approvals
POST         /api/approvals/decision          POST         /api/igo-admin/login
POST         /api/igo-admin/logout
```
