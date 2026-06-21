# Milestone B3 — Reports & Dashboard Truth Report

**Date:** 21 June 2026  
**Scope:** Replace mock/demo report and dashboard calculations with real Prisma/PostgreSQL aggregates  
**Out of scope:** Offline mode, permissions rewrite, approval flows, POS customer-display localStorage removal

---

## Executive Summary

Milestone B3 migrated **report and dashboard financial metrics** from mock/demo sources to **tenant-scoped Prisma queries**. Sales revenue, profit, tax, transactions, category breakdown, payment breakdown, inventory valuation, supplier payables, and dashboard cards now derive from completed sales, sale items, inventory balances, and purchasing data in PostgreSQL.

The analytics hub (`/reports`) loads a server-built `ReportsAnalyticsHub` snapshot and passes it to the client. Sub-report pages (`/reports/sales`, `/products`, `/inventory`, `/customers`, `/purchasing`) already consumed `getReportsSnapshot()` and now receive fully computed Prisma data.

**Verification:** `npm run typecheck` PASS · `npm run build` PASS · `npm run db:seed:demo` PASS

---

## Reports Migrated

| Area | Before | After |
|------|--------|-------|
| `features/reports/report-service.ts` | `isDemoMode()` branch returned `mock-data.ts` | Always `getPrismaReportsSnapshot(tenantFromSession(...))` |
| `features/reports/prisma-repository.ts` | Partial/incomplete aggregates | Full tenant-scoped queries: sales, sale items, payments, purchases, inventory, customers, suppliers |
| `features/reports/dto-mapper.ts` | `totalProfit: 0`, empty category breakdown | Accepts real `profitLak` + `categoryBreakdown` |
| `features/reports/build-analytics-hub.ts` | *(new)* | Builds KPIs, health score, alerts, top sellers, dead stock, trends from snapshot inputs |
| `app/(dashboard)/reports/page.tsx` | Client-only mock hub | Server `getReportsSnapshot()` → `<ReportsAnalyticsClient hub={hub} />` |
| `app/(dashboard)/reports/sales/page.tsx` | Already wired to service | Revenue/profit/tax/transactions from `sale` aggregates |
| `app/(dashboard)/reports/products/page.tsx` | Already wired to service | Product rows from `saleItem.groupBy` |
| `app/(dashboard)/reports/inventory/page.tsx` | Hardcoded expiry `2026-08-01` | Dynamic +30-day horizon; stock metrics from Prisma inventory |
| `app/(dashboard)/reports/customers/page.tsx` | Already wired to service | Customer list from Prisma |
| `app/(dashboard)/reports/purchasing/page.tsx` | Already wired to service | Purchase trend + supplier payables from Prisma |

### Calculation sources (Prisma)

| Metric | Source |
|--------|--------|
| Sales totals | `sale` where `saleStatus: completed`, scoped by `companyId` + `branchId` |
| Profit | `sale.profitAmount` / `saleItem.profitAmount` (sale price − cost at transaction time) |
| Category breakdown | `saleItem` joined to product category |
| Payment breakdown | `salePayment.groupBy(paymentMethod)` |
| Inventory valuation | `inventoryItems` → `quantity × cost` via `inventoryValueLak` |
| Supplier payables | `supplierPayable` aggregate (dashboard) + purchasing snapshot (reports) |
| Top sellers / dead stock | `saleItem.groupBy` + inventory `daysWithoutSale` |
| Period metrics | Monthly / weekly / yearly / all-time from `sale.createdAt` windows |
| Revenue/profit trend | Last 7 days from completed sales |
| Hourly sales | Current-month sales grouped by hour |

### Tenant / branch isolation

- Reports repository uses `resolveTenantScope(tenant)` → `companyId`, `branchId`, `warehouseIds`
- Sales filtered: `{ companyId, branchId, saleStatus: "completed" }`
- Purchases/inventory filtered: `{ companyId, warehouseId: { in: warehouseIds } }`
- Dashboard filters sales by `tenant.companyId` + `tenant.branchId` and inventory by `tenant.warehouseId`

---

## Dashboard Widgets Migrated

| Widget | Source |
|--------|--------|
| `getMiniMartDashboardSnapshot()` | Removed `isDemoMode()` empty-snapshot branch; always `getPrismaDashboardSnapshot()` |
| Sales today / profit today | `sale` aggregates for selected date range |
| Total bills / items sold | Completed sales + sale items in period |
| Low stock / near expiry / expired | `inventoryBalance` + `inventoryLot` queries |
| Supplier payables due | `supplierPayable` where status `unpaid`/`partial` |
| Customer credit due | `customer.outstandingBalance` aggregate |
| Cash drawer / shift summary | `cashSession` + transactions |
| Hourly sales chart | Sales grouped by hour for period |
| Top products | Sale items in period |
| Alerts | Derived from low stock, expiry, dead stock, payables |

---

## Mock Calculations Removed (B3)

| Issue | Location | Resolution |
|-------|----------|------------|
| `isDemoMode()` demo report branch | `report-service.ts` | Removed |
| Hardcoded `totalProfit: 0` | `dto-mapper.ts` | Real profit from aggregates |
| Entire analytics hub from `mock-full-data.ts` | `reports-analytics-client.tsx` | Props from `hub` snapshot |
| `rangeMultipliers` fake date scaling | `reports-analytics-client.tsx` | Removed; KPIs from DB |
| Mock health score formula on fake alerts | `reports-analytics-client.tsx` | `hub.healthScore` from `buildAnalyticsHub()` |
| Demo mode empty dashboard | `dashboard-service.ts` | Removed |
| Hardcoded expiry `2026-08-01` | `reports/inventory/page.tsx` | Dynamic +30 days |
| "Demo Data" data-source badges | `reports-analytics-client.tsx` | "Synced" with DB-derived counts |

---

## Remaining Mock / Placeholder Calculations

| Location | What remains | Severity | Phase |
|----------|--------------|----------|-------|
| `reports-analytics-client.tsx` | Report Center catalog (`reportCategories`, `executiveReports`) — navigation only | Low | B6 cleanup |
| `reports-analytics-client.tsx` | `ReportDetailModal` table rows from `reportRows` mock | Medium | B6 |
| `reports-analytics-client.tsx` | `KpiDetailModal` static summary bullets (i18n strings) | Low | B6 |
| `reports-analytics-client.tsx` | `DayDetailModal` / `HourDetailModal` hardcoded day/hour KPI values | Medium | B6 (needs per-day/hour server queries) |
| `reports-analytics-client.tsx` | `BusinessHealthScore` sub-breakdown bars (88%, 82%, …) — cosmetic | Low | B6 |
| `reports-analytics-client.tsx` | `AIInsightsPanel` static insight text | Low | Future AI feature |
| `reports-analytics-client.tsx` | Filter bar (date range, branch, warehouse) — UI only, does not re-query | Medium | B6 |
| `features/reports/mock-data.ts` | Unused at runtime; seed input only | None | B6 delete from runtime paths |
| `features/inventory/inventory-service.ts` | `isDemoMode()` branch | Medium | B4+ |
| `features/purchasing/purchasing-service.ts` | `isDemoMode()` branch | Medium | B4+ |
| `features/dashboard/dashboard-service.ts` | Supplier payables not branch-scoped (company-wide) | Low | B5/B6 |

---

## Files Changed (B3)

| File | Change |
|------|--------|
| `features/reports/report-service.ts` | Prisma-only; extended `ReportsSnapshot` with `hub` |
| `features/reports/prisma-repository.ts` | Rewritten tenant-scoped aggregates + hub composition |
| `features/reports/build-analytics-hub.ts` | **New** — hub KPI/health/alert builder |
| `features/reports/dto-mapper.ts` | Real profit + category breakdown |
| `features/reports/components/reports-analytics-client.tsx` | Accepts `hub` prop; removed mock KPI/trend/alert data |
| `features/dashboard/dashboard-service.ts` | Removed demo empty snapshot branch |
| `app/(dashboard)/reports/page.tsx` | Server snapshot → client hub |
| `app/(dashboard)/reports/inventory/page.tsx` | Dynamic expiring-stock cutoff |

---

## Verification Results

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `npm run db:seed:demo` | **PASS** (idempotent sandbox seed) |

### Sandbox IDs (unchanged)

- Company: `gobox-company`
- Branch: `gobox-main-branch`
- Warehouse: `gobox-default-warehouse`
- Logins: `igo-admin` / `AdminChangeMe123!`, `manager` / `Manager123!`, `cashier` / `Cashier123!`

---

## Risks Before B4

| Risk | Severity | Mitigation |
|------|----------|------------|
| POS snapshot still missing QR banks / full customer promo context | **High** | B4: complete `getPosSnapshot()` from Prisma |
| POS customer display still localStorage IPC | **Medium** | B4: BroadcastChannel or SSE |
| Report hub date-range filters are UI-only (no server re-fetch) | **Medium** | B6: pass range params to `getReportsSnapshot()` |
| `ReportDetailModal` still shows mock row table | **Low** | B6: wire to `productRows` from snapshot |
| `inventory-service` / `purchasing-service` demo branches remain | **Medium** | Migrate in B4/B5 client decoupling |
| QR banks schema gap | **Medium** | B5 |
| Dashboard supplier payables company-wide (not branch-filtered) | **Low** | Align with purchasing scope in B5/B6 |

---

## Milestone B4 Gate Decision

### **GO for Milestone B4 — POS Snapshot Completion**

**Rationale:**

1. Core financial truth paths (sales, profit, inventory valuation, payables, dashboard cards) read from PostgreSQL with tenant/branch scoping.
2. `report-service.ts` and `dashboard-service.ts` no longer branch on `isDemoMode()` for aggregates.
3. Build, typecheck, and demo seed all pass.
4. Remaining mock usage in reports is **UI catalog / modal placeholder** content, not the primary KPI widgets — acceptable deferral to B6.
5. B4 scope (POS snapshot: customers, QR banks, promotions, customer-display IPC) is the correct next dependency per `MILESTONE_B_DATABASE_FOUNDATION_PLAN.md`.

**Conditions for pilot financial review:**

- Log in as `igo-admin` with seeded DB (`IGO_DEMO_MODE=false`)
- Verify `/dashboard` cards match `/reports` monthly totals for the same branch
- Complete a POS sale and confirm dashboard/reports refresh after `router.refresh()`

---

*Next milestone: **B4 — POS snapshot completion** (`pos-service.ts`, customer display IPC, QR/promotion loading from Prisma).*
