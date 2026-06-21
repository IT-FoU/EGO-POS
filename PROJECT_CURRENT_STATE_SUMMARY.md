# EGO POS — Project Current State Summary

**Report date:** 21 June 2026  
**Scope:** Full repository inspection (source code, schema, routes, integrations) — not spec documents alone  
**Verdict:** Advanced multi-module POS platform in **demo/QA-ready** state; **not production-ready**

---

## Executive Summary

EGO POS (renamed from IGO POS) is a **Next.js 16 modular monolith** with **53 pages**, **26 API routes**, **14 feature modules**, and a **66-model Prisma schema**. The UI surface area covers most of the planned product (POS, products, inventory, purchasing, customers, promotions, reports, settings, platform onboarding, Super Admin, customer display).

The project has evolved far beyond Phase 0. Core engineering passes (`typecheck`, `build`, `prisma validate`), but the system runs on a **hybrid data architecture**: demo/localStorage repositories coexist with partial PostgreSQL/Prisma write paths. Internal audits (`GO_NO_GO_REPORT.md`, `FULL_SYSTEM_AUDIT_REPORT.md`) confirm **NO-GO for production** until demo mode, permissions, reports, and settings integration are hardened.

**Estimated production readiness: ~55%**

---

## 1. Total File Count

| Scope | Count |
|-------|------:|
| **All files** (excl. `node_modules`, `.next`, `.git`) | **7,909** |
| Core source (`app`, `features`, `components`, `lib`, `prisma`, `locales`, `public`) | 259 |
| Markdown reports/docs at repo root | 66 |
| Spec folders (`Docs`, `Database`, `Design`, `Roadmap`, `Prompts`) | 6 |
| `.tmp-*` screenshot artifacts | 7,541 |

> **Note:** ~95% of file count is temporary screenshot folders, not application source.

---

## 2. Total Folder Count

| Scope | Count |
|-------|------:|
| **All folders** (excl. `node_modules`, `.next`, `.git`) | **3,591** |
| Core folders (excl. `.tmp-*`, `screenshots`, `Backups`) | 166 |

---

## 3. Current Project Name Found in Code

| Context | Name |
|---------|------|
| **Primary product brand (UI, metadata, constants)** | **EGO POS** |
| Company | **IGO Technology** |
| npm package | `igo-pos` |
| Database default | `igo_pos` |
| Legacy/internal identifiers still present | `IGO_DEMO_MODE`, `igo-admin`, `igo-pos:*` storage keys (with `ego-pos:*` aliases) |

**Conclusion:** User-facing name is **EGO POS**; internal tooling and env vars retain **IGO** naming from the original project.

---

## 4. Main Modules Discovered

| Module | Route(s) | Backend | Data Mode |
|--------|----------|---------|-----------|
| **Auth / Login** | `/login`, `/register` | NextAuth | Demo users + Prisma users |
| **Platform / Onboarding** | `/businesses/*` | Client context | localStorage demo |
| **Dashboard** | `/dashboard` | `dashboard-service` | Mock/derived |
| **POS** | `/pos`, `/customer-display` | API + actions + prisma-repo | Hybrid |
| **Products** | `/products/*` | API + actions + prisma-repo | Hybrid |
| **Inventory** | `/inventory/*` | API + actions + prisma-repo | Mock + partial Prisma |
| **Purchasing** | `/purchasing/*` | API + actions + prisma-repo | Mock + partial Prisma |
| **Suppliers** | `/suppliers/*` | API + actions + prisma-repo | Mock + partial Prisma |
| **Customers** | `/customers/*` | API + actions + prisma-repo | Mock + partial Prisma |
| **Membership Levels** | `/membership-levels` | API + prisma-repo | Prisma path exists |
| **Promotions** | `/promotions/*` (incl. analytics, calendar, stack-rules) | API + actions + prisma-repo | UI-rich; checkout subset |
| **Reports** | `/reports/*` | API + report-service | **Mostly mock data** |
| **Settings** | `/settings` | API + prisma-repo | Partial persistence |
| **Shifts / Cash** | Embedded in dashboard/POS | Components | Partial |
| **Super Admin** | `/igo-admin/*` | Separate session + API | Foundation only |

**Feature folders:** `customers`, `dashboard`, `igo-admin`, `inventory`, `membership-levels`, `platform`, `pos`, `products`, `promotions`, `purchasing`, `reports`, `settings`, `shifts`, `suppliers`

---

## 5. Current Architecture

```
Next.js 16 App Router (React 19, TypeScript 6)
├── Route groups: (auth) | (dashboard) | (platform) | (igo-admin)
├── Feature modules: services + actions + DTOs + UI components
├── Data layer (dual):
│   ├── Demo: lib/demo/* + localStorage (ego-pos:* keys)
│   └── Production: Prisma 7 + PostgreSQL + tenant-scoped transactions
├── Auth: NextAuth v4 (merchant) + cookie session (Super Admin)
├── Middleware: proxy.ts — route protection, admin gate
└── i18n: locales/ui JSON + inline dictionaries + repair runtime
```

**Stack in use:** Next.js, TypeScript, Tailwind CSS 4, Prisma 7, PostgreSQL, NextAuth, bcryptjs, Lucide.  
**Not in code:** Supabase Auth/Storage, Flutter mobile, automated test runners.

---

## 6. Current Database Status

| Item | Status |
|------|--------|
| ORM | Prisma 7 with `@prisma/adapter-pg` |
| Schema | **66 models**, ~1,406 lines — covers companies, products, inventory, sales, promotions, audit, SaaS plans, Super Admin |
| Migrations | **4 applied** (`clean_baseline`, settings, constraints, branch isolation) |
| Seeds | `prisma/seed.ts`, `prisma/seed-demo.ts` |
| Tenant isolation | `resolveTenantScope()`, `withTenantTransaction()` in `lib/db/` |
| Prisma repositories | 10 modules (products, pos, inventory, purchasing, customers, suppliers, promotions, reports, settings, membership-levels) |
| Demo default | `IGO_DEMO_MODE` defaults to **on** unless explicitly `"false"` |

**Gap:** Schema is production-grade; **runtime data source is inconsistent** — many UI flows still read/write demo storage or mock services instead of Prisma.

---

## 7. Current Localization Status

| Item | Status |
|------|--------|
| Supported locales | Lao (`lo`) + English (`en`) |
| UI dictionary files | `locales/ui/lo.json`, `locales/ui/en.json` (~540 keys each) |
| Legacy inline dictionary | `lib/i18n/dictionaries.ts` |
| Lao UI translations | `lib/i18n/lao-ui-translations.ts` |
| Runtime repair | `LocalizationRepairRuntime` component |
| Default HTML lang | `lo` |

**Gap:** Bilingual foundation exists, but hardcoded English strings and mixed key systems remain across modules. Full Lao/English parity is **incomplete** (~65% estimated).

---

## 8. Current Integration Status

| Integration | Status |
|-------------|--------|
| **NextAuth login** | Working (demo + DB paths) |
| **PostgreSQL / Prisma writes** | Partial — POS sale path supports transactional writes (sale, stock, audit); many modules still mock |
| **Super Admin panel** | Separate login/session; pages exist |
| **Customer display** | Second-window route `/customer-display` |
| **QR payment settings** | Demo storage; not fully wired to checkout |
| **Receipt / printing** | Spec documented; no hardware integration in code |
| **Promotion checkout engine** | Simplified subset vs. full promotion UI |
| **Reports ↔ Dashboard** | Not sharing real aggregated data |
| **SaaS plan / feature locks** | Schema + UI hints; not enforced end-to-end |
| **External services** | No Supabase, payment gateway, email, or push in active code |
| **CI / tests** | No `lint`, `test`, or `test:e2e` scripts configured |

---

## 9. Production Readiness Percentage

**Overall: ~55%**

| Area | Estimate |
|------|----------|
| UI / page coverage | 85% |
| Database schema design | 95% |
| Real DB data integration | 45% |
| Auth & permission enforcement | 35% |
| Audit logging coverage | 40% |
| Reports & analytics truth | 25% |
| Localization completeness | 65% |
| Automated testing & CI | 5% |

**Build health:** `typecheck` PASS · `build` PASS · `prisma validate` PASS · `lint`/`test` NOT CONFIGURED

**Official project decision (from audits):** **NO-GO** for production launch; **GO** for controlled demo/QA and integration hardening.

---

## 10. Top 10 Risks or Problems

1. **Unresolved demo vs. production execution mode** — `IGO_DEMO_MODE` defaults on; write actions fail or split between localStorage and DB unpredictably.
2. **Permissions not enforced server-side end-to-end** — Demo bypasses checks; Settings permission matrix is not the authorization source of truth.
3. **Reports and dashboard use mock/demo data** — Cannot trust sales, profit, or inventory analytics for business decisions.
4. **Promotion UI overpromises vs. checkout engine** — Stack rules, coupons, profit protection shown in UI but only partially implemented at sale time.
5. **IGO / EGO naming split** — Package, env vars, routes (`igo-admin`), and storage keys conflict with rebranded EGO POS UI.
6. **No automated tests or lint pipeline** — Regressions likely as integration work continues.
7. **Incomplete audit trail** — Only some `withTenantTransaction()` writes produce audit logs; demo/localStorage actions are untracked.
8. **Settings not fully persisted or propagated** — QR banks, staff access, approval rules, customer display, currency affect UI but are inconsistently enforced across POS/receipts/reports.
9. **Dual service layer (mock services + prisma repositories)** — Same modules have parallel code paths; migration to single source of truth is incomplete.
10. **Repository bloat** — 7,500+ files in `.tmp-*` screenshot folders obscure the real codebase and inflate workspace size.

---

## Recommended Immediate Focus

1. Define and enforce a single **execution mode matrix** (demo local / sandbox DB / production DB).
2. Complete **server-side permission + SaaS entitlement** enforcement.
3. Unify **POS checkout** as the single calculation engine (price, promo, tax, stock, payment, audit).
4. Replace **reports mock data** with shared Prisma aggregation queries used by dashboard.
5. Finish **i18n migration** and resolve IGO→EGO naming in internal identifiers.

---

## Audit Prerequisites — Confirmed (21 June 2026)

Answers below define pass/fail criteria for the full audit. Primary source of truth: **`MASTER_SPECIFICATION.md`**.

### 1. Business rules — source of truth

- **Primary:** `MASTER_SPECIFICATION.md`
- If code conflicts with Master Specification → **specification wins**
- If Go BOX operational reality conflicts with Master Specification → **update the specification first**, then update code

### 2. Workflow expectations — approvals

| Role | Rules |
|------|-------|
| **Cashier** | Cannot change product price; cannot adjust stock; cannot refund completed sales |
| **Manager** | Can approve discounts up to **20%**; can approve refunds; can approve stock adjustments |
| **Owner** | Full access |
| **PIN override** | Allowed only for **Manager and Owner** (not Cashier) |

### 3. POS operations — Go BOX go-live scope

**Required:**

- Barcode scan
- Product search
- Hold / Resume bill
- Mixed payment (Cash + Transfer + QR on one bill)
- Cash, Transfer, QR payment
- Receipt print
- Customer display
- Shift open / close
- Negative stock **warning** (not hard block)

**Not required for go-live:**

- Split payment by multiple customers

### 4. Membership logic

- Sales **can complete without membership**
- Membership supports: QR member card, points earning, points redemption, tier discount, Student plan, VIP plan
- **Order of calculation:** Promotion applies **first** → points calculated **after promotion**

### 5. Promotion logic

**Required promotion types:**

- Percentage discount
- Fixed amount discount
- Buy X Get Y
- Spend threshold discount
- Free gift

**Stacking:** Only **one automatic promotion per item**

**Negative profit:** **Warn Manager**; **Owner can override** (not hard block for Owner)

### 6. Reporting expectations

**Must be financially accurate for v1:**

- Sales
- Profit
- Inventory valuation
- Supplier payable
- Cash reconciliation

**Informational reports** may be approximate in v1.

### 7. Multi-branch requirements

**V1 launch:** Single branch (Go BOX)

**Architecture must remain ready for:** multi-branch, multi-warehouse, branch reporting

**Staff:** Belongs to **one branch at a time**

### 8. Offline mode

**Offline mode is REQUIRED**

**Must work offline:**

- POS checkout
- Barcode scan
- Product search
- Receipt print
- Shift operations

**On reconnect:** Automatic synchronization

### 9. Deployment goals

| Item | Target |
|------|--------|
| Database | **Supabase PostgreSQL** |
| Frontend | **Vercel** |
| Data | **Single production database** |
| Demo mode | **Off in production** (no demo/localStorage writes) |

### 10. Production rollout plan

| Item | Plan |
|------|------|
| Phase 1 | **Go BOX pilot** |
| Production-ready when | Sales work correctly; inventory updates correctly; reports are accurate; printing works; no critical errors |
| Rollback | Continue using current POS until EGO POS passes pilot testing |

---

## Audit Implications (Preview)

Based on confirmed prerequisites vs. current codebase (~55% production readiness):

| Area | Audit focus | Current gap signal |
|------|-------------|-------------------|
| Source of truth | Compare code to `MASTER_SPECIFICATION.md` | Dual demo/DB paths conflict with “no demo in production” |
| Permissions | Cashier/Manager/Owner + PIN rules | Server-side enforcement incomplete in demo mode |
| POS go-live | 11 required flows incl. offline | Offline sync not implemented; mixed payment partial |
| Membership | Promo first, then points | Checkout order must be verified against spec |
| Promotions | 5 types, 1 promo/item, Manager warn / Owner override | UI exceeds checkout engine; profit rules differ |
| Reports | 5 financially accurate reports | Reports still largely mock-driven |
| Branch | Single branch v1, multi-ready architecture | Branch isolation exists in schema; validate single-branch pilot path |
| Offline | Required for checkout, scan, print, shifts | **Major gap** — online-first architecture today |
| Deployment | Supabase + Vercel, demo off | Env and data layer not aligned with target |
| Pilot gate | Sales, inventory, reports, print, stability | GO/NO-GO audits already flag blockers |

---

*Generated from live repository inspection. Audit prerequisites confirmed 21 June 2026. No code was modified.*
