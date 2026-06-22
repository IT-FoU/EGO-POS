# B7-4 Completion Report — Remove Demo Fallback Read Paths

**Phase:** B7-4
**Scope:** Remove demo/mock fallback read paths from purchasing & inventory runtime services so reads come from live PostgreSQL via Prisma only. Write guard, i18n, and tenant scoping preserved.
**Status:** PASS
**B7 final-verification gate:** GO

---

## 1. Files Changed

| File | Change |
|------|--------|
| `lib/demo-mode.ts` | `isDemoMode()` made **fail-safe**: now `=== "true"` (default OFF) instead of `!== "false"` (default ON). Documented that it now serves only the write guard and auth/admin demo helpers. |
| `features/purchasing/purchasing-service.ts` | Removed `isDemoMode()` branch and all `mock*` imports. `getPurchasingSnapshot()` now unconditionally returns `getPrismaPurchasingSnapshot(tenantFromSession(await requireSession()))`. |
| `features/inventory/inventory-service.ts` | Removed `isDemoMode()` branch and all `mock*` imports. `getInventorySnapshot()` now unconditionally returns `getPrismaInventorySnapshot(tenantFromSession(await requireSession()))`. |
| `features/purchasing/mock-data.ts` | Added "TEST/DEMO ARTIFACT ONLY" banner (no runtime importers). |
| `features/inventory/mock-data.ts` | Added "TEST/DEMO ARTIFACT ONLY" banner (no runtime importers). |
| `features/suppliers/mock-data.ts` | Added "TEST/DEMO ARTIFACT ONLY" banner (already dead code). |
| `B7_IMPLEMENTATION_SPEC.md` | Marked B7-4 **DONE**. |
| `scripts/phase-b7-4-demo-fallback-check.ts` | **New** targeted verification harness. |
| `B7_4_COMPLETION_REPORT.md` | This report. |

---

## 2. Fallback Paths Removed

| Audit ID | Path removed |
|----------|--------------|
| **F1** | `lib/demo-mode.ts` fail-open default → now fail-safe (production by default). Runtime DB reads no longer depend on env spelling. |
| **F2** | `purchasing-service.ts` mock fallback (`mockSuppliers / mockPurchaseOrders / mockSupplierPayables / mockProducts / mockWarehouses / mockInventoryItems`). |
| **F3** | `inventory-service.ts` mock fallback (`mockWarehouses / mockInventoryItems / mockStockMovements`). |
| **F7** | Severed the cross-module `mockProducts` import from purchasing (products-owned file left untouched). |

---

## 3. DB-Backed Paths Verified

All of the following now read live PostgreSQL via Prisma with tenant/company/warehouse scoping intact:

- **Purchasing** — `getPurchasingSnapshot()` → `getPrismaPurchasingSnapshot(tenant)`: purchase orders, suppliers, payables, products, warehouses, inventory items. Powers `/purchasing`, `/purchasing/new`, `/purchasing/receiving`, `/purchasing/payables`, `/purchasing/suppliers`.
- **Inventory** — `getInventorySnapshot()` → `getPrismaInventorySnapshot(tenant)`: warehouses, stock items (balances + lots), movements. Powers `/inventory`, `/inventory/count`, `/inventory/adjustment`, `/inventory/stock-in`, `/inventory/quick-stock-in`.
- **Suppliers** — `supplier-service.ts` was already Prisma-only; unchanged.
- Missing data returns **empty live DB results**, never mock.

---

## 4. Preserved (intentionally not changed)

| Item | Why |
|------|-----|
| `lib/db/write-context.ts` (write guard) | `assertProductionWritesEnabled()` / `DemoModeWriteError` / `withTenantTransaction()` still throw when `IGO_DEMO_MODE="true"`. Behavior intact; default now production. |
| i18n / locale reads (`DemoStorageKeys.locale` in page clients) | Client localization mechanism, not a data fallback. Untouched. |
| Tenant scoping (`resolveTenantScope`, `branchOwnedWhere`, warehouse filters) | Unchanged; verified by harness using a real seeded user/tenant. |
| `lib/demo/*`, auth demo users, igo-admin fallback, POS demo state | Out of B7-4 scope (documented O1–O5 in the audit). |

---

## 5. Remaining Mock / Test-Only Files

These have **zero runtime importers** after B7-4 and are retained (not deleted) as documented test/demo artifacts:

- `features/purchasing/mock-data.ts`
- `features/inventory/mock-data.ts`
- `features/suppliers/mock-data.ts` (already dead before B7-4)
- `features/products/mock-data.ts` — products-module owned; left as-is (out of scope). Verified no purchasing import remains.

Each purchasing/inventory/suppliers file now carries a header banner stating it is a test/demo artifact not used at runtime. They are still imported by the B7-4 verification harness only.

---

## 6. Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (exit 0) |
| `scripts/phase-b7-4-demo-fallback-check.ts` | **14/14 PASS** |
| `scripts/phase-b7-1-lifecycle-check.ts` (regression) | **12/12 PASS** |
| `scripts/phase-b7-2-receiving-check.ts` (regression) | **16/16 PASS** |
| `scripts/phase-b7-3-payable-check.ts` (regression) | **22/22 PASS** |

### B7-4 harness coverage (14 checks)
- Static: purchasing-service & inventory-service have **no** `mock-data` import and **no** `isDemoMode` branch, and call the Prisma snapshot functions.
- `isDemoMode()` fail-safe: default `false` when unset, `true` only for `"true"`, `false` for `"false"`.
- Runtime: purchasing snapshot is a live DB superset (25/25 POs absent from mock fixtures); inventory snapshot includes the DB-only `gobox-default-warehouse`; inventory items/movements carry no mock fixture ids.

> **Note on id overlap:** `prisma/seed-demo.ts` intentionally reuses canonical ids (e.g. `sup-lao-bev`, `wh-main`) that the mock fixtures also use. The harness therefore proves DB-backed reads via (a) static guarantees that mock arrays are unreachable and (b) presence of rows the fixtures don't contain — not by simple id-absence.

---

## 7. Verification Summary

- Purchasing pages no longer have any code path to mock purchase/supplier/payable data — the only data source is Prisma, tenant-scoped.
- Inventory pages no longer have any code path to mock warehouse/item/movement data — Prisma only, tenant-scoped.
- B7-1, B7-2, B7-3 logic unchanged and **not regressed** (all harnesses still green).
- Write guard and i18n behavior preserved.

---

## 8. Remaining Risks

- **Low — dead mock files retained:** kept by request as documented test/demo artifacts; a future contributor could re-wire them. Mitigated by header banners and the static harness checks. Deletion can be a trivial follow-up.
- **Low — `products/mock-data.ts` still exists:** products-module owned, out of scope; no purchasing import remains.
- **Low — auth/admin still consult `isDemoMode()`:** with the fail-safe default they behave production-first; explicit `IGO_DEMO_MODE="true"` is required to enable demo login/admin fallback.

---

## Verdict

**B7-4 status: PASS**
**Next recommended step:** Proceed to **B7 final verification** (full-phase regression + typecheck/build) and, if clean, commit B7-4 as its own commit (`B7-4 Remove Demo Fallback Read Paths Completed`).
