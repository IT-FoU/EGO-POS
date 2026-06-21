# EGO POS — Production Readiness Report

**Audit date:** 21 June 2026  
**Target:** Go BOX Pilot Launch (Phase 1)  
**Deployment target:** Vercel frontend + Supabase PostgreSQL, single production DB, demo mode off  
**Official criteria:** `MASTER_SPECIFICATION.md` + confirmed audit prerequisites in `PROJECT_CURRENT_STATE_SUMMARY.md`

---

## Executive Decision

# NO-GO for Go BOX Pilot Launch

The platform has substantial UI and schema maturity but **fails mandatory pilot gates** in offline operation, financial report accuracy, production data integrity, permission enforcement, and deployment stability.

**Safe to continue:** Controlled demo/QA, integration hardening, and sandbox DB testing.  
**Not safe to replace:** Go BOX current POS until all P0 gates below pass.

---

## Pilot Gate Scorecard

| Gate (your criteria) | Required | Current status | Verdict |
|----------------------|----------|----------------|---------|
| Sales work correctly | Real DB checkout, accurate totals | Prisma sale path exists but client ≠ server discount stack; prod POS missing customers/QR | **FAIL** |
| Inventory updates correctly | Stock moves with sales/adjustments | Prisma writes exist; demo/prod split; negative stock hard-blocked | **FAIL** |
| Reports are accurate | Sales, profit, inventory value, payables, cash | Main reports hub mock; profit hardcoded 0 | **FAIL** |
| Printing works | Receipt print at checkout | Browser `window.print()` only; no ESC/POS; offline print not built | **PARTIAL** |
| No critical errors | Build, runtime, data | Build failed on `/api/membership-levels`; 15 critical issues | **FAIL** |
| Offline POS | Checkout, scan, search, print, shifts + sync | Not implemented | **FAIL** |
| Demo mode off in production | Single Supabase DB | Demo defaults on; localStorage writes in UI | **FAIL** |
| Rollback plan | Keep current POS until pilot passes | Plan valid; EGO POS not ready to switch | **OK** |

**Gates passed:** 1 / 8 (rollback plan only)

---

## Readiness Score by Area

| Area | Weight | Score | Weighted |
|------|--------|------:|---------:|
| Documentation completeness | 5% | 70% | 3.5% |
| Folder structure / architecture | 5% | 80% | 4.0% |
| Database architecture | 10% | 90% | 9.0% |
| Multi-tenant readiness | 8% | 55% | 4.4% |
| POS workflows | 15% | 45% | 6.8% |
| Inventory workflows | 8% | 50% | 4.0% |
| Membership workflows | 7% | 30% | 2.1% |
| Promotion workflows | 7% | 40% | 2.8% |
| Reporting accuracy | 10% | 25% | 2.5% |
| Localization | 5% | 65% | 3.3% |
| Permission system | 8% | 30% | 2.4% |
| Approval system | 5% | 20% | 1.0% |
| Offline readiness | 10% | 0% | 0.0% |
| Integration map consistency | 4% | 50% | 2.0% |
| Production / deployment | 8% | 35% | 2.8% |
| **Overall** | **100%** | — | **48.6%** |

**Rounded production readiness: ~49%** (down from prior ~55% estimate after build failure verification and offline mandatory gate)

---

## Build & Deploy Status

| Check | Result | Notes |
|-------|--------|-------|
| `npm run typecheck` | PASS (prior audit) | TypeScript compiles |
| `prisma validate` | PASS (prior audit) | Schema valid |
| `npm run build` | **FAIL** (21 Jun 2026) | `/api/membership-levels` page data collection error |
| `npm run lint` | NOT CONFIGURED | No lint script |
| `npm test` | NOT CONFIGURED | No unit tests |
| `npm run test:e2e` | NOT CONFIGURED | No E2E tests |
| Vercel deploy config | Minimal | No `vercel.json`; env docs in README only |
| Supabase PostgreSQL | Configured in `.env.example` | Prisma adapter-pg ready |
| Demo mode default | **Unsafe** | Defaults ON unless explicitly `"false"` |

---

## Go BOX Pilot Requirements vs. Implementation

### POS (Required)

| Feature | Status |
|---------|--------|
| Barcode scan | ✅ Client keyboard wedge |
| Product search | ✅ Client filter |
| Hold / Resume bill | ⚠️ Memory only, not persisted |
| Mixed payment (Cash + Transfer + QR) | ⚠️ UI exists; cashier blocked; server validation weak |
| Receipt print | ⚠️ Browser print only |
| Customer display | ⚠️ localStorage sync (same browser) |
| Shift open / close | ❌ Not persisted, not enforced |
| Negative stock warning | ❌ Hard block instead of warn |

### Membership (Required)

| Feature | Status |
|---------|--------|
| Sales without member | ✅ Allowed |
| QR member card | ❌ No QR lookup at POS |
| Points earn / redeem | ⚠️ Server redeem exists; no UI; earn rate mismatch |
| Tier / Student / VIP discount | ❌ Client-only or mock |
| Promo first → points after | ⚠️ Partial; tier discount order wrong |

### Promotions (Required)

| Type | Status |
|------|--------|
| Percentage discount | ✅ Server checkout |
| Fixed amount discount | ✅ Server checkout |
| Buy X Get Y | ✅ Server checkout |
| Spend threshold | ❌ Not in checkout engine |
| Free gift | ❌ UI template only |
| One promo per item | ✅ Implemented |
| Negative profit: warn Manager, Owner override | ❌ Form blocks; checkout unguarded |

### Reports (Must be accurate)

| Report | Status |
|--------|--------|
| Sales | ⚠️ Sub-pages partial Prisma; hub mock |
| Profit | ❌ Hardcoded 0 in analytics DTO |
| Inventory valuation | ⚠️ Prisma path OK; demo UI uses mock |
| Supplier payable | ⚠️ Partial; branch scoping gaps |
| Cash reconciliation | ⚠️ Logic exists; per-shift math bug |

### Permissions (Confirmed rules)

| Rule | Status |
|------|--------|
| Cashier: no price change, stock adjust, refund | ⚠️ Client only |
| Manager: approve discounts to 20% | ❌ Hard-coded 10% |
| Manager: approve refunds, stock adjustments | ❌ Refund stub; stock no approval gate |
| Owner: full access | ⚠️ Client only |
| PIN override Manager/Owner | ❌ Not built |

### Offline (Required)

| Capability | Status |
|------------|--------|
| Offline checkout | ❌ |
| Barcode / search offline | ❌ |
| Receipt print offline | ❌ |
| Shift operations offline | ❌ |
| Auto sync on reconnect | ❌ |

---

## Minimum Path to GO (Recommended Milestones)

### Milestone A — Production Safety (2–3 weeks)
- [ ] Unify demo mode; enforce `IGO_DEMO_MODE=false`
- [ ] Fix production build (lazy DB init)
- [ ] Server-side permission enforcement on all writes
- [ ] Remove mock/localStorage from production UI paths (products, reports hub)

### Milestone B — Pilot Core (3–4 weeks)
- [ ] POS production snapshot (customers, QR banks, promotions)
- [ ] Server-side checkout engine (full discount stack)
- [ ] Shift persistence + sale gating
- [ ] Hold bill persistence
- [ ] Negative stock warning (not block)
- [ ] Refund workflow with Manager approval
- [ ] PIN override for Manager/Owner

### Milestone C — Financial Truth (2 weeks)
- [ ] Reports hub on Prisma
- [ ] Fix profit DTO and period grouping
- [ ] Cash reconciliation per shift
- [ ] Dashboard = reports source of truth

### Milestone D — Offline (3–5 weeks)
- [ ] PWA + service worker
- [ ] IndexedDB catalog + sale/shift outbox
- [ ] Background sync + conflict policy
- [ ] Offline receipt print queue

### Milestone E — Pilot Validation (1–2 weeks)
- [ ] Go BOX UAT checklist
- [ ] E2E tests: login, sale, stock-in, report, print
- [ ] Parallel run with current POS
- [ ] Sign-off for cutover

**Estimated time to GO:** 11–16 weeks focused integration (excluding offline could reduce to ~8 weeks but **violates your stated requirement**)

---

## Risk Summary for Stakeholders

| Risk | Impact if launched now |
|------|------------------------|
| Wrong sales/profit numbers | Business decisions based on mock data |
| Offline outage = no sales | Store cannot operate during network loss |
| Permission bypass | Cashiers could exceed authority via API |
| Inventory drift | Demo reads vs DB writes cause confusion |
| No rollback safety net beyond keeping old POS | Acceptable if old POS kept (your plan) |

---

## Final Recommendation

| Decision | **NO-GO** |
|----------|-----------|
| Go BOX Pilot Launch | **Do not proceed** |
| Continue development | **Yes** — sandbox DB + integration hardening |
| Replace current POS | **Only after Milestones A–E pass UAT** |

---

*See `AUDIT_REPORT.md` for full 15-area analysis. See `CRITICAL_ISSUES.md` for 15 blocking issues.*
