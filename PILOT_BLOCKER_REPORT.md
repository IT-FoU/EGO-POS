# Pilot Blocker Report — Post B8-11

> For single-store GO BOX pilot deployment. Super Admin, Offline mode, and SaaS onboarding are out of scope.

**Audit date:** 2026-06-25  
**B8-11 verdict:** PASS  
**Pilot allowed:** **YES** (with P1 items below)

---

## Pilot gate summary

| Gate | Status |
| --- | --- |
| Money integrity (checkout, refund, void) | CLEAR |
| Stock integrity (sale, refund, void, receiving) | CLEAR |
| Cash session integrity | CLEAR |
| Permission enforcement (server) | CLEAR |
| Report/dashboard accuracy (DB-backed) | CLEAR |
| Settings source-of-truth | CLEAR |
| Owner UAT readiness | CLEAR (see `OWNER_TESTING_CHECKLIST.md`) |

---

## P0 — Blocks pilot (must fix first)

**None** at B8-11 audit time.

---

## P1 — Fix before or during pilot (operational risk)

| # | Blocker | Risk | Mitigation until fixed |
| --- | --- | --- | --- |
| 1 | POS approval panel is localStorage, not DB | Manager approvals in POS may not persist across devices | Use owner account for overrides; use back-office approval flow for inventory |
| 2 | Hold/resume bill is client-only | Lost bills on refresh | Train staff not to rely on hold; complete sales promptly |
| 3 | No ESC/POS printer | Receipt printing depends on browser | Use browser print dialog; test on pilot hardware early |
| 4 | Company logo not DB-persisted | Logo missing on new device/browser | Accept text-only receipts or re-upload per device |
| 5 | Cart promo preview vs server total | Cashier confusion at checkout | Train: final total is on receipt after complete |
| 6 | Production env flags | Demo mode could activate if misconfigured | Deploy checklist: `IGO_DEMO_MODE=false`, no demo fallback flag |

---

## P2 — Defer past pilot

| # | Item | Notes |
| --- | --- | --- |
| 1 | Product image backend | Stub returns empty; catalog works without images |
| 2 | Promotion analytics UI polish | Core promo checkout hardened in B8-8 |
| 3 | Supplier detail placeholders | Core payable/receive paths work |
| 4 | Import/export placeholders | Manual entry acceptable for pilot |
| 5 | Report modal narrative copy | KPIs are DB-backed |
| 6 | Business Health Score heuristic | Advisory only |
| 7 | Legacy naming / dead mock files | No production runtime impact |

---

## Out of scope (do not block pilot)

- Offline POS
- Super Admin tenant controls
- SaaS registration/onboarding
- Subscription billing enforcement
- UI redesign

---

## Recommended pilot sequence

1. Deploy with production env flags verified.
2. Run `OWNER_TESTING_CHECKLIST.md` with owner + manager + cashier.
3. Run one full business day: open session → sales → close session → compare reports.
4. Log P1 issues; schedule **Pilot Hardening** phase for POS approval wiring + hold bill + printer.

---

## Recommended next development phase

**Pilot Hardening & POS Operational Wiring**
- Wire POS approvals/audit to DB (B8-2 engine)
- Hold bill persistence or feature gate
- Deploy/runbook documentation
- Optional printer integration spike
