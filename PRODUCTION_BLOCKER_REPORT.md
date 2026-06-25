# EGO POS — Production Blocker Report

> Code-verified at commit `29af75d` (+ audit-doc phase). Prioritized blockers for (A) single-store **GO BOX** usage and (B) future **multi-tenant SaaS** usage.
> Super Admin is intentionally **out of scope** this phase (its blockers are listed under SaaS for visibility only, not to be built now).

### Severity legend
- **Critical** — blocks safe go-live / risks money, stock, or audit integrity.
- **High** — must fix before real customers rely on it.
- **Medium** — degrades trust/operations but workable short-term.
- **Low** — polish / cleanup.

### Impact tags
`POS` checkout · `INV` inventory accuracy · `CASH` money/cash accuracy · `RPT` reports accuracy · `SEC` permissions/security · `CUST` customer/member data · `DEPLOY` deployment · `SAAS` SaaS readiness.

---

## A) TOP 20 BLOCKERS — Single-store GO BOX usage

| # | Blocker | Severity | Impact | Fix order |
| --- | --- | --- | --- | --- |
| 1 | ~~**Sales history (Recent Sales) is localStorage-only**~~ — **RESOLVED (B8-6):** DB-backed via `GET /api/pos/sales`. | ~~**Critical**~~ **Closed** | POS, RPT, CASH | — |
| 2 | ~~**Refund is localStorage status-only**~~ — **RESOLVED (B8-6):** `Refund`/`RefundItem`, stock, loyalty, cash session. | ~~**Critical**~~ **Closed** | CASH, INV, RPT | — |
| 3 | ~~**Void is localStorage-only**~~ — **RESOLVED (B8-6):** `saleStatus: cancelled`, stock restore, cash session. | ~~**Critical**~~ **Closed** | CASH, INV, RPT | — |
| 4 | ~~**Receipts persisted only in localStorage**~~ — **RESOLVED (B8-6):** receipt from DB; reprint audited. | ~~**Critical**~~ **Closed** | POS, CASH | — |
| 5 | **POS override approvals/audit are localStorage** (void/refund/over-limit) — B8-2 engine wired server-side (B8-6 executors); POS UI still uses localStorage panel in demo. | **High** | SEC, CASH | 4 |
| 6 | ~~**No end-of-day close / cash reconciliation**~~ — **RESOLVED (B8-5):** `CashSession` open/close/cash-in/out persisted. | ~~**Critical**~~ **Closed** | CASH | — |
| 7 | ~~**No cash-in / cash-out persistence**~~ — **RESOLVED (B8-5).** | ~~High~~ **Closed** | CASH | — |
| 8 | **Hold/Resume bill is client state only** — `HoldBill*` models unused; bills lost on refresh. | High | POS | 6 |
| 9 | **Reports "Report Center" tab shows mock data** (`mock-full-data.ts`) — risk of decisions on fake figures. | High | RPT | 7 |
| 10 | **Report date-range filters are UI-only / all-time aggregates** — cannot trust filtered totals. | High | RPT | 7 |
| 11 | **Settings logo + receipt print mode read from localStorage in POS** — diverges from saved DB settings per device. | High | POS, DEPLOY | 8 |
| 12 | **No hardware/receipt-printer integration** — browser print only; print mode device-local. | High | POS | 8 |
| 13 | **`IGO_DEMO_MODE` fail-open risk if mis-set** — demo login, fake session, demo checkout activate when `"true"`. | High | SEC, DEPLOY | 1 (verify) |
| 14 | **Product images are a stub** (`getPrismaProductImages()` → `[]`) — no storage backend. | Medium | — | 9 |
| 15 | **Client cart does not preview DB promotions** — on-screen total can differ from server total (guard prevents underpay only). | Medium | POS, RPT | 9 |
| 16 | **Promotion analytics placeholders** (ratios/charts, stack-rules, integration-map static). | Medium | RPT | 10 |
| 17 | **Supplier detail placeholders** (documents, linked products, AP invoices, record-payment, activate/deactivate). | Medium | — | 10 |
| 18 | **Customer & product import/export are placeholders.** | Medium | CUST | 10 |
| 19 | **Dashboard "Status: OPEN" hardcoded** — not tied to a real shift/session state. | Medium | CASH | 5 |
| 20 | **Repo hygiene / legacy naming** — IGO→EGO rename incomplete (`IGO_DEMO_MODE`, `igo-admin`); artifact bloat (now cleaned). | Low | DEPLOY | 11 |

**Single-store critical path (fix order):** ~~1 → 2/3 → 4 → 5 → 6~~ **B8-5/B8-6 closed items 1–4, 6–7.** Remaining: POS approval UI wiring (#5), hold bills (#8), reports polish (#9–10), settings/print (#11–12).

> **Updated 2026-06-22:** B8-5 (cash session), B8-6 (post-sale), and B8-7 (loyalty/membership) resolve production blockers #1–4, #6–7 for single-store GO BOX usage. Loyalty earn/redeem/tier/reversal is now DB-backed with ledger integrity.

> **Updated 2026-06-25 (B8-8):** Promotion hardening blocker (G6) is closed by commit `c07a41f` with server-side promotion calculation, client-promotion tamper rejection, member/loyalty interaction coverage, and refund/void promotion reversal coverage. Remaining promotion-related medium/low risks are documented (POS preview parity for DB promotions, advanced promo analytics/UI polish, and cost-missing below-cost edge cases).

> **Updated 2026-06-25 (B8-9):** Dashboard/analytics hardening closes KPI-accuracy blocker scope by reconciling dashboard sales/profit/inventory/supplier-payable totals with Prisma report aggregates, enforcing `dashboard.view`/`reports.view` server-side checks, and validating refund/void, loyalty, and promotion impacts in dashboard metrics. Remaining risk is mainly non-critical drilldown modal narrative content and heuristic health-score interpretation.

> **Updated 2026-06-25 (B8-10):** Settings/localStorage hardening closes production source-of-truth ambiguity for critical settings. Tax/loyalty/currency/profile and QR bank/account settings are DB-backed, runtime synthetic settings fallback was removed, and receipt print mode is explicitly isolated as a device-local preference (not financial source-of-truth). LocalStorage is retained only for safe UI/device preferences (theme/locale/customer-display runtime/setup draft), with demo fallback paths explicitly gated.

---

## B) TOP 20 BLOCKERS — Future multi-tenant SaaS usage

> Includes the single-store criticals (they apply to every tenant) plus SaaS-specific gaps. Super Admin items are listed for visibility only — **not** to be implemented this phase.

| # | Blocker | Severity | Impact | Fix order |
| --- | --- | --- | --- | --- |
| 1 | **No self-serve onboarding / company creation** — `/businesses/setup` persists to **localStorage**; no `Company`/`Branch`/`Warehouse` create path. | **Critical** | SAAS, DEPLOY | 1 |
| 2 | **No owner registration endpoint** — `/register` is a static form, no signup API. | **Critical** | SAAS, SEC | 1 |
| 3 | **All single-store CASH/INV integrity blockers** (sales history, refund, void, receipts, close-day) — multiplied across tenants. | **Critical** | CASH, INV, RPT | 2 |
| 4 | **POS approvals/audit not in DB** — per-tenant security & compliance unmet. | **Critical** | SEC | 2 |
| 5 | **Super Admin lifecycle controls are disabled stubs** (suspend/activate/delete tenant, block user, plan changes). *(Out of scope now — listed for visibility.)* | **Critical** | SAAS | later |
| 6 | **No subscription/billing enforcement** — `Plan`/`SaaSSubscription` not enforced at runtime (no plan gating/limits). | High | SAAS | 3 |
| 7 | **Demo auth fallbacks exist** (`lib/auth/*`, igo-admin login) — must be provably disabled per environment. | High | SEC, DEPLOY | 1 (verify) |
| 8 | **Tenant isolation not yet load/pen-tested across all write paths** — scoping exists (`withTenantTransaction`/tenant-scope) but needs adversarial verification. | High | SEC, SAAS | 3 |
| 9 | **No per-tenant data export / backup** — `Backup`/`Notification` models unused. | High | SAAS, DEPLOY | 6 |
| 10 | **Settings/logo/print localStorage coupling** breaks multi-device, multi-tenant consistency. | High | DEPLOY | 4 |
| 11 | **Reports Report Center mock + no date filtering** — unacceptable for paying tenants. | High | RPT | 5 |
| 12 | **No email/notification delivery** — onboarding, password reset, alerts absent. | High | SAAS | 6 |
| 13 | **Product image / file storage backend missing** — needed per-tenant (S3/Supabase). | Medium | SAAS, DEPLOY | 5 |
| 14 | **No rate limiting / abuse protection on public endpoints** (login, register). | High | SEC | 3 |
| 15 | **~20 unused Prisma models** (`StockTransfer*`, `PromotionRule/Action`, `CustomerGroup*`, `CustomerSubscription`, `PosDevice`, `FavoriteProduct`, etc.) — schema/feature drift across tenants. | Medium | DEPLOY | 7 |
| 16 | **No audit-log viewer / retention policy** for tenants (AuditLog written but not surfaced/retained). | Medium | SEC, SAAS | 5 |
| 17 | **No environment/secrets hardening doc** (NextAuth secret, DB creds, demo flag) for multi-env deploy. | High | DEPLOY, SEC | 1 |
| 18 | **No automated migration/seed strategy per tenant** (seed targets a single GO BOX company). | Medium | SAAS, DEPLOY | 7 |
| 19 | **Promotion stack-rules persistence missing** — advanced pricing not durable per tenant. | Medium | RPT | 8 |
| 20 | **Observability/monitoring absent** (no health beyond `/api/health/database`, no error tracking). | Medium | DEPLOY | 8 |

**SaaS critical path (fix order):** secure env + disable demo fallbacks (#7,#17,#1-verify) → onboarding/registration (#1,#2) → tenant integrity + isolation + rate limiting (#3,#4,#8,#14) → settings/reporting/storage productionization → Super Admin (separate later phase).

---

## Consolidated severity rollup

| Severity | Single-store count | SaaS count |
| --- | --- | --- |
| Critical | 6 (#1–6) | 5 (#1–5; #5 SuperAdmin out-of-scope) |
| High | 6 | 8 |
| Medium | 7 | 6 |
| Low | 1 | — |

## Recommended phase sequencing (documentation recommendation only — no build this phase)
1. **POS Sales-History & Lifecycle Persistence** — DB-backed Recent Sales, receipts, refund, void (single-store #1–4). Highest ROI.
2. **POS Approvals/Audit Wiring** — route void/refund/over-limit through the B8-2 DB engine (#5).
3. **Cash & Close-Day** — `CashSession`/`CashTransaction`, end-of-day reconciliation (#6,#7,#19-dash).
4. **Reports Authority** — remove `mock-full-data`, add server date-range filtering (#9,#10).
5. **Settings/Print productionization** — DB-served logo + print mode; drop localStorage mirror (#11,#12).
6. **(SaaS track)** Onboarding/registration + env/secrets hardening + tenant isolation tests.
7. **Super Admin** — separate later phase (explicitly deferred now).

> **B8-4 is NOT started.** This report is documentation only; no application logic or business logic was changed.
