# EGO POS — Critical Issues

**Audit date:** 21 June 2026  
**Authority:** `MASTER_SPECIFICATION.md` + confirmed Go BOX pilot criteria  
**Decision context:** Go BOX Pilot Launch

Critical issues **must be resolved** before pilot. Each item includes severity, root cause, affected modules, and recommended fix.

---

## CRIT-001 — Offline POS Not Implemented

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Online-first Next.js architecture; no PWA, service worker, IndexedDB outbox, or sync queue |
| **Affected modules** | POS, inventory lookup, shifts, receipt print, entire pilot deployment |
| **Evidence** | Zero matches for `serviceWorker`, `indexedDB`, `navigator.onLine`, sync queue in application code |
| **Pilot requirement violated** | Offline checkout, barcode scan, product search, receipt print, shift operations + auto sync on reconnect |
| **Recommended fix** | Implement offline layer: PWA manifest + service worker; IndexedDB catalog cache + sale/shift outbox; background sync API; conflict resolution policy; online/offline status indicator in POS |

---

## CRIT-002 — Demo Mode Bypasses Server Permissions

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | `assertPermission()` returns immediately when `isDemoMode()` is true |
| **Affected modules** | All write APIs, POS sales, inventory, promotions, customers, settings |
| **Evidence** | `lib/auth/permissions.ts` L52–55; `isDemoMode()` true unless `IGO_DEMO_MODE === "false"` |
| **Pilot requirement violated** | Cashier/Manager/Owner rules must be enforced; production = no demo mode |
| **Recommended fix** | Remove permission bypass in demo; enforce role checks on every server action regardless of mode; set `IGO_DEMO_MODE=false` in production; invert default to false |

---

## CRIT-003 — Inconsistent Demo Mode Semantics

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Three different demo checks across codebase |
| **Affected modules** | All modules using `isDemoMode()`, dashboard layout, POS page, auth session |
| **Evidence** | `lib/demo-mode.ts`: `!== "false"` (default ON); `app/(dashboard)/pos/page.tsx`: `=== "true"`; layout `demoMode` prop uses `=== "true"` |
| **Pilot requirement violated** | Single production DB, no demo/localStorage writes |
| **Recommended fix** | Single `getRuntimeMode(): "demo" \| "production"` helper; replace all checks; production build fails if demo keys detected in write paths |

---

## CRIT-004 — Production POS Returns Empty Customers / QR Banks

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | `getPosSnapshot()` strips customers, promotion banners, and QR banks when not in demo mode |
| **Affected modules** | POS, membership, QR payment, promotions at checkout |
| **Evidence** | `features/pos/pos-service.ts` L19–26 explicitly sets `customers: []`, `qrBanks: []` |
| **Pilot requirement violated** | QR member card, QR payment, tier discount, points earn/redeem at checkout |
| **Recommended fix** | Load branch-scoped customers from `customers/prisma-repository.ts`; load QR banks from settings; map membership levels into POS customer DTO |

---

## CRIT-005 — Reports Analytics Hub Uses 100% Mock Data

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Main `/reports` page renders client component fed exclusively from `mock-full-data.ts` |
| **Affected modules** | Reports, dashboard (shared metrics expectation) |
| **Evidence** | `app/(dashboard)/reports/page.tsx` → `ReportsAnalyticsClient` with no server data; imports from `mock-full-data.ts` |
| **Pilot requirement violated** | Financially accurate sales, profit, inventory valuation, supplier payable, cash reconciliation |
| **Recommended fix** | Wire reports hub to `/api/reports` or server-side `getPrismaReportsSnapshot()`; remove mock from production path |

---

## CRIT-006 — Production Profit Hardcoded to Zero in Reports DTO

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | `buildReportAnalytics()` always returns `totalProfit: 0` |
| **Affected modules** | Reports analytics, dashboard profit cards |
| **Evidence** | `features/reports/dto-mapper.ts` L13 |
| **Pilot requirement violated** | Financially accurate profit reporting |
| **Recommended fix** | Pass `salesAggregate._sum.profitAmount` from `prisma-repository.ts`; add tests against known sale data |

---

## CRIT-007 — Server Sale Completion Does Not Enforce Role Rules

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | `completePrismaSale` trusts client payload for discounts, payment modes; only checks `pos.sell` permission |
| **Affected modules** | POS checkout, permissions, approvals |
| **Evidence** | `features/pos/prisma-repository.ts`, `app/api/pos/sales/route.ts`; no role/discount cap validation server-side |
| **Pilot requirement violated** | Cashier cannot change price/refund; Manager 20% discount; PIN override Manager/Owner only |
| **Recommended fix** | Pass session role into sale handler; reject unauthorized discounts/payment modes; validate approval tokens; mirror `features/pos/permissions.ts` rules server-side |

---

## CRIT-008 — PIN Override Not Implemented

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | POS PIN collected at onboarding only; no verification at restricted actions |
| **Affected modules** | POS, permissions, approvals |
| **Evidence** | No `verifyPin` or PIN modal in `features/pos/`; approval uses Owner session role only |
| **Pilot requirement violated** | PIN override allowed only for Manager and Owner |
| **Recommended fix** | Manager/Owner PIN modal for gated actions; server verifies PIN hash; audit log every override |

---

## CRIT-009 — Refund Workflow Not Implemented

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Refund is debug-panel stub; `Refund` schema exists but no production flow |
| **Affected modules** | POS, finance, inventory (restock), audit |
| **Evidence** | `pos-page-client.tsx` `refund_bill` action sets message only; no refund API |
| **Pilot requirement violated** | Manager can approve refunds; Cashier cannot refund |
| **Recommended fix** | Refund workflow: sale lookup → permission/approval → `Refund` + restock + audit in transaction |

---

## CRIT-010 — Shift Operations Not Persisted or Enforced

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Shift UI is React state only; `CashSession` model unused by POS; sales not gated on open shift |
| **Affected modules** | POS, finance, cash reconciliation |
| **Evidence** | `StaffControl` in-memory state; `CashierShiftPanel` never imported; no `CashSession` API |
| **Pilot requirement violated** | Shift open/close required; must work offline; cash reconciliation accuracy |
| **Recommended fix** | Wire shift open/close to `CashSession` + `CashTransaction`; block sale without open session; persist offline in IndexedDB outbox |

---

## CRIT-011 — Promotion Engine Missing Required Types at Checkout

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | `calculatePromotionDiscount` only handles percentage, fixed, buy_x_get_y, member_discount; spend threshold and free gift return 0 |
| **Affected modules** | POS checkout, promotions |
| **Evidence** | `features/pos/prisma-repository.ts` — `default: return 0`; `PromotionRule`/`PromotionAction` tables unused |
| **Pilot requirement violated** | Spend threshold discount, free gift required at launch |
| **Recommended fix** | Implement rule engine using `PromotionRule`/`PromotionAction`; add gift product line at POS; shared preview + checkout calculator |

---

## CRIT-012 — Tier Discount Not Applied Server-Side

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Membership discount applied in browser only; server never loads `membershipLevel.discountPercent` |
| **Affected modules** | POS, membership, reports (revenue/profit accuracy) |
| **Evidence** | Client `applyCustomerPricing()` in `pos-page-client.tsx`; `completePrismaSale` uses client-sent prices |
| **Pilot requirement violated** | Promotion first → points after; tier discount must affect sale records accurately |
| **Recommended fix** | Send retail price + `customerId`; apply full discount stack server-side: promo → tier → manual → points |

---

## CRIT-013 — Negative Stock Hard-Blocked Instead of Warning

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Client caps quantity; server throws when `afterQty < 0` |
| **Affected modules** | POS, inventory |
| **Evidence** | `getStockValidationError()` blocks checkout; `completePrismaSale` throws on negative balance |
| **Pilot requirement violated** | Negative stock **warning** (not hard block) per confirmed audit criteria |
| **Recommended fix** | Allow oversell with visible warning; configurable policy; Manager notified; Owner can proceed; audit log |

---

## CRIT-014 — Inventory Demo Reads / Production Writes Split

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | `inventory-service.ts` reads mock in demo; `actions.ts` always writes to PostgreSQL |
| **Affected modules** | Inventory UI, stock accuracy, pilot inventory updates |
| **Evidence** | Demo read path vs Prisma-only write path with no demo guard |
| **Pilot requirement violated** | Inventory must update correctly during pilot |
| **Recommended fix** | Unified repository adapter; demo writes to demo store OR block writes when viewing mock snapshot; single read/write source |

---

## CRIT-015 — Production Build Failure (Observed)

| Field | Detail |
|-------|--------|
| **Severity** | Critical |
| **Root cause** | Build fails collecting page data for `/api/membership-levels` (likely DB connection at build time) |
| **Affected modules** | Deployment, Vercel CI |
| **Evidence** | `npm run build` error: `Failed to collect page data for /api/membership-levels` (21 June 2026 audit run) |
| **Pilot requirement violated** | Deployable to Vercel + Supabase; no critical errors |
| **Recommended fix** | Lazy-init Prisma in API routes; avoid DB calls during static page collection; add CI build with production env vars |

---

## Summary

| Count | Severity |
|------:|----------|
| 15 | Critical |

**All 15 critical issues block Go BOX Pilot Launch.**

Resolve order: CRIT-003 → CRIT-002 → CRIT-015 → CRIT-004 → CRIT-007 → CRIT-010 → CRIT-001 → CRIT-005/006 → CRIT-011/012 → CRIT-013 → CRIT-008/009/014.

---

*No code was modified during this audit.*
