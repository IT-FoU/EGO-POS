# B7-4 Pre-Audit — Demo Fallback & Mock Data Paths

**Mode:** Audit only. No code modified. No commits.
**Date:** 2026-06-22
**Focus modules:** Purchasing, Receiving, Supplier, Payables, Inventory

---

## 0. How demo mode works today

- `lib/demo-mode.ts` exposes `isDemoMode()` → returns `true` unless `process.env.IGO_DEMO_MODE === "false"`. **Default is demo ON** (fail-open).
- **Read path:** each feature `*-service.ts` checks `isDemoMode()`; if true it returns hardcoded `mock*` arrays instead of querying Prisma.
- **Write path:** `lib/db/write-context.ts → withTenantTransaction()` calls `assertProductionWritesEnabled()`, which throws `DemoModeWriteError` when `isDemoMode()`. So in demo mode **all writes are already blocked** (PO create, receive, payment, status). The risk is the **read fallback**, not phantom writes.
- `.env.example` already ships `IGO_DEMO_MODE="false"`, and the B7 harnesses force `IGO_DEMO_MODE=false`.
- `lib/demo/{repositories,storage,storage-keys}.ts` is a **separate** browser-`localStorage` layer used for UI state (locale, theme, plan badge, settings logo, POS approval scratch). The `DemoStorageKeys.locale` reads in purchasing/supplier/payables/inventory clients are **i18n only**, not data fallback.

---

## 1. Findings (in-scope: Purchasing / Receiving / Supplier / Payables / Inventory)

### F1 — `isDemoMode()` default-on gate
| Field | Detail |
|---|---|
| **File** | `lib/demo-mode.ts` |
| **Function** | `isDemoMode()` |
| **Demo logic** | `return process.env.IGO_DEMO_MODE !== "false";` — defaults to demo ON when the env var is missing/typo'd. |
| **Risk** | **CRITICAL** |
| **Safe removal strategy** | Either (a) keep the helper but invert the default to fail-safe (`=== "true"`), or (b) remove demo branching entirely (preferred for B7-4) so production never depends on env spelling. If kept, default must be production. |
| **Dependency impact** | Referenced by `purchasing-service`, `inventory-service`, `write-context`, `igo-admin/admin-data`, `auth/options`, and A1 reality test. Changing the default affects ALL of these; removing the helper requires updating each consumer. |

### F2 — Purchasing snapshot mock fallback
| Field | Detail |
|---|---|
| **File** | `features/purchasing/purchasing-service.ts` |
| **Function** | `getPurchasingSnapshot()` |
| **Demo logic** | `if (!isDemoMode()) return getPrismaPurchasingSnapshot(...)` else returns `mockSuppliers / mockPurchaseOrders / mockSupplierPayables / mockProducts / mockWarehouses / mockInventoryItems`. |
| **Risk** | **CRITICAL** |
| **Safe removal strategy** | Mirror `supplier-service.ts`: always `return getPrismaPurchasingSnapshot(tenantFromSession(await requireSession()))`. Drop all mock imports. |
| **Dependency impact** | Powers `/purchasing`, `/purchasing/new`, `/purchasing/receiving`, `/purchasing/payables`, `/purchasing/suppliers`. All already render from the same DTO shape the Prisma repo returns, so removal is low-risk once demo branch is gone. |

### F3 — Inventory snapshot mock fallback
| Field | Detail |
|---|---|
| **File** | `features/inventory/inventory-service.ts` |
| **Function** | `getInventorySnapshot()` |
| **Demo logic** | `if (!isDemoMode()) return getPrismaInventorySnapshot(...)` else returns `mockWarehouses / mockInventoryItems / mockStockMovements`. |
| **Risk** | **CRITICAL** |
| **Safe removal strategy** | Always return the Prisma snapshot (same pattern as F2). Drop mock imports. |
| **Dependency impact** | Powers `/inventory`, `/inventory/count`, `/inventory/adjustment`, `/inventory/stock-in`, `/inventory/quick-stock-in`. Receiving (B7-2) writes feed these views, so DB-only is required for receiving to be visible. |

### F4 — Purchasing mock data arrays
| Field | Detail |
|---|---|
| **File** | `features/purchasing/mock-data.ts` |
| **Function** | exports `mockSuppliers`, `mockPurchaseOrders`, `mockSupplierPayables` |
| **Demo logic** | Hardcoded suppliers/POs/payables sample data. |
| **Risk** | **MEDIUM** |
| **Safe removal strategy** | Delete the file once F2 no longer imports it. |
| **Dependency impact** | Imported **only** by `purchasing-service.ts`. Safe to delete after F2. |

### F5 — Inventory mock data arrays
| Field | Detail |
|---|---|
| **File** | `features/inventory/mock-data.ts` |
| **Function** | exports `mockWarehouses`, `mockInventoryItems`, `mockStockMovements` |
| **Demo logic** | Hardcoded warehouses/stock/movements sample data. |
| **Risk** | **MEDIUM** |
| **Safe removal strategy** | Delete after both F2 and F3 stop importing it. |
| **Dependency impact** | Imported by **`inventory-service.ts` AND `purchasing-service.ts`** (`mockWarehouses`, `mockInventoryItems`). Both consumers must be cleaned first. |

### F6 — Suppliers mock data (dead code)
| Field | Detail |
|---|---|
| **File** | `features/suppliers/mock-data.ts` |
| **Function** | exports `mockSuppliers`, `mockSupplierPurchaseOrders`, `mockSupplierReceivings`, `mockSupplierPayments` |
| **Demo logic** | Hardcoded supplier sample data. |
| **Risk** | **LOW** |
| **Safe removal strategy** | Delete — it has **no code importers** (grep shows zero `import` references outside docs). `supplier-service.ts` is already 100% Prisma. |
| **Dependency impact** | None (already-dead code). Pure cleanup. |

### F7 — Products mock data referenced by purchasing
| Field | Detail |
|---|---|
| **File** | `features/products/mock-data.ts` (consumed in `purchasing-service.ts`) |
| **Function** | `mockProducts` used inside `getPurchasingSnapshot()` demo branch |
| **Demo logic** | Provides product list for the PO form in demo. |
| **Risk** | **MEDIUM** (cross-module) |
| **Safe removal strategy** | Removing F2's demo branch drops this usage. Do **not** delete `products/mock-data.ts` in B7-4 (products module owns it / may be used elsewhere); only remove the purchasing import. |
| **Dependency impact** | `products/mock-data.ts` is products-module scope; out of B7-4 deletion scope. Just sever the purchasing import. |

### F8 — Production write guard (KEEP)
| Field | Detail |
|---|---|
| **File** | `lib/db/write-context.ts` |
| **Function** | `assertProductionWritesEnabled()`, `DemoModeWriteError`, `withTenantTransaction()` |
| **Demo logic** | Throws `DemoModeWriteError` when `isDemoMode()`. |
| **Risk** | **LOW** (this is a safety guard, not a fallback) |
| **Safe removal strategy** | Keep behavior. If F1 helper is removed, replace the check so writes are always enabled (guard becomes inert) — or retain `isDemoMode()` purely for this guard. Decide together with F1. Do not silently delete the audit-log transaction wrapper. |
| **Dependency impact** | Wraps **every** purchasing/inventory/supplier write + audit log. Must remain functional. |

### F9 — Supplier list UI placeholder copy
| Field | Detail |
|---|---|
| **File** | `features/suppliers/components/suppliers-list-client.tsx` |
| **Function** | render (`HistoryPlaceholder`, rating/notes labels) |
| **Demo logic** | Static copy: "real/demo purchase records", "mock/demo placeholder until AP invoices are…", "Manual/demo score". |
| **Risk** | **LOW** (cosmetic) |
| **Safe removal strategy** | Reword copy to drop "demo" once data is live; optional polish, not functional. |
| **Dependency impact** | UI text only; tied to i18n keys in `locales/ui/*.json`. |

### F10 — Locale reads in module clients (KEEP)
| Field | Detail |
|---|---|
| **File** | `purchasing-page-client.tsx`, `suppliers-page-client.tsx`, `payables-page-client.tsx`, `inventory-page-client.tsx` |
| **Function** | `readLocale()` via `readStringFromStorage(DemoStorageKeys.locale)` |
| **Demo logic** | Reads UI locale from localStorage (key namespace is historically named "demo"). |
| **Risk** | **LOW / NONE** (not a data fallback) |
| **Safe removal strategy** | **Do not remove.** This is the client i18n mechanism, unrelated to purchasing data. Renaming the storage namespace is a separate cosmetic task. |
| **Dependency impact** | Shared i18n storage used app-wide; removing would break language toggle. |

---

## 2. Related demo paths OUTSIDE B7-4 scope (documented, not for this phase)

| # | File | What | Risk to B7-4 |
|---|---|---|---|
| O1 | `lib/demo/repositories.ts`, `lib/demo/storage.ts`, `lib/demo/storage-keys.ts` | Browser localStorage layer (theme, locale, plan badge, settings logo, POS approvals scratch). | None for purchasing data; broad UI dependency — leave intact. |
| O2 | `features/igo-admin/admin-data.ts` | `try/catch` → `demoDashboardSnapshot()` / `demoBusiness` / `demoUser` fallback on DB error. | Admin module; out of scope. |
| O3 | `lib/auth/options.ts`, `lib/auth/demo-staff-access.ts`, `lib/auth/session.ts` | Demo login users + demo session when `isDemoMode()`. | Auth; out of scope but coupled to F1 default. |
| O4 | `app/(dashboard)/pos/page.tsx`, `features/pos/components/pos-page-client.tsx`, `customer-display-client.tsx` | POS demo mode prop + demo repositories + demo checkout state. | POS module; out of scope. |
| O5 | `features/reports/*`, `features/promotions/*`, `features/products/*` | "mock/demo" analytics copy and placeholders. | Cosmetic; out of scope. |

---

## 3. Summary

- **Total demo paths found (in-scope):** 10 (F1–F10).
  - To remove/neutralize: F1, F2, F3, F4, F5, F6, F7.
  - To keep deliberately: F8 (write guard), F10 (i18n storage). F9 is optional cosmetic.
- **Related out-of-scope demo paths:** 5 clusters (O1–O5).
- **Critical paths:** **F1 (isDemoMode default-on), F2 (purchasing read fallback), F3 (inventory read fallback)** — plus their data dependencies F4/F5/F7.

### Key risks
1. **Fail-open default (F1):** missing/misspelled `IGO_DEMO_MODE` silently serves mock data. Highest-priority fix.
2. **Shared inventory mock (F5):** imported by two services — must clean both `purchasing-service` and `inventory-service` before deleting.
3. **Cross-module `mockProducts` (F7):** sever the purchasing import but do not delete the products-owned file.
4. **Do not over-remove:** the write guard (F8) and locale storage (F10) are not fallbacks and must stay.

### Suggested implementation order for B7-4 (next phase, not now)
1. F2 + F3: make read services Prisma-only (drop demo branch + mock imports).
2. F4 + F5 + F6: delete now-unused mock-data files (purchasing, inventory, dead suppliers).
3. F7: confirm no remaining purchasing import of `mockProducts`.
4. F1 + F8: decide whether to delete `isDemoMode()` or invert default to fail-safe; keep write guard functional.
5. F9: optional copy cleanup.
6. Verify: `npm run typecheck`, `npm run build`, re-run B7-1/B7-2/B7-3 harnesses with the DB.

---

## Verdict

**GO for B7-4 implementation.**

The in-scope demo surface is small, well-contained, and the write path is already production-guarded. Removal mainly means making the purchasing and inventory read services Prisma-only (matching the already-clean `supplier-service.ts`) and deleting their mock-data files, while deliberately preserving the write guard and the i18n localStorage layer.
