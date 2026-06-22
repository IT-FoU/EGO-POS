# B7 Implementation Spec — Purchasing, Receiving, Supplier Payables, Demo Fallback Removal

**Date:** 2026-06-22  
**Phase:** B7-0 (specification only — no coding)  
**Baseline:** `main`, committed Git repository (post A2 + Git recovery)  
**Scope source:** `REBUILD_SEQUENCE_PLAN.md` Phase B.7, `B7_EXECUTION_PLAN.md`, `B7_READINESS_REPORT.md`

> This document is the contract for B7 implementation. No application logic or UI is changed here.

---

## 1. Current State Summary

### 1.1 Verified baseline

| Gate | State |
| --- | --- |
| A2 final verification | PASS (31/31) |
| Git recovery | PASS — repo on `main`, baseline `c8d6e9d` |
| Typecheck / build | PASS (see B7_READINESS_REPORT) |

### 1.2 What already exists

| Layer | File | State |
| --- | --- | --- |
| Schema | `prisma/schema.prisma` | `Supplier`, `Purchase`, `PurchaseItem`, `GoodsReceipt`, `GoodsReceiptItem`, `SupplierPayable`, `PurchasePayment` all present |
| Purchasing repo | `features/purchasing/prisma-repository.ts` | `getPrismaPurchasingSnapshot`, `createPurchaseOrder`, `receiveGoods`, `createSupplierPayment` |
| Purchasing DTO | `features/purchasing/dto.ts` | Validated inputs; `PurchaseStatus` enum present in `types.ts` |
| Purchasing service | `features/purchasing/purchasing-service.ts` | **Demo fallback to mock-data when `isDemoMode()`** |
| Purchasing actions | `features/purchasing/actions.ts` | Permission-gated server actions |
| Suppliers repo | `features/suppliers/prisma-repository.ts` | CRUD + snapshot (PO, receivings, payments); **no demo fallback** |
| Suppliers service | `features/suppliers/supplier-service.ts` | Prisma-only (good) |
| UI | `/purchasing*`, `/suppliers*` | Compile clean; wired to actions |
| Permissions | `features/access-control/permission-catalog.ts`, `lib/auth/permissions.ts` | `purchasing.create/receive/payment`, supplier keys present |

### 1.3 Gaps B7 must close

| # | Gap | Evidence | Severity |
| --- | --- | --- | --- |
| G1 | PO created as `draft`; receiving UI only shows `ordered`/`partial` | `createPurchaseOrder` sets `status: "draft"`; `receiving-page-client.tsx` filter | **P0** |
| G2 | Receiving does **not** create `SupplierPayable` | `receiveGoods` has no `supplierPayable.create` | **P0** |
| G3 | Supplier `outstandingBalance` never updated on receive/payment | no update in repo | **P0** |
| G4 | Payment only updates existing payable rows | `createSupplierPayment` uses `updateMany` only | **P0** |
| G5 | Demo fallback returns mock purchasing data | `purchasing-service.ts` `isDemoMode()` branch | **P1** |
| G6 | No PO status transition action (send/confirm/cancel) | actions has create/receive/payment only | **P1** |
| G7 | No unique purchase-no generator | `purchaseNo` passed from client | **P2** |

---

## 2. B7-1 — Purchase Order Lifecycle Plan

### 2.1 Status machine (spec §9)

```
draft ──send──▶ ordered ──receive(partial)──▶ partial ──receive(rest)──▶ received(completed)
  │                 │                              │
  └──cancel─────────┴──────────────cancel─────────┘  ▶ cancelled
```

- Persisted values (existing `PurchaseStatus`): `draft | ordered | partial | received | cancelled`.
- "Sent" and "Ordered" in spec collapse onto `ordered` for now (confirmed = ready to receive). Document mapping; no schema change required.

### 2.2 Tasks

| Task | Target file | Change type |
| --- | --- | --- |
| Add `updatePurchaseOrderStatus(purchaseId, nextStatus)` with allowed-transition guard | `features/purchasing/prisma-repository.ts` | new function |
| Add `updatePurchaseStatusAction` | `features/purchasing/actions.ts` | new action (`purchasing.edit`/`create`) |
| Add `getNextPurchaseNo(scope)` prefix-aware helper | new `features/purchasing/purchase-no.ts` | new file |
| Use generated `purchaseNo` if client omits | `createPurchaseOrder` | logic add (no UI break) |
| Wire status buttons (send/cancel) | `purchasing-page-client.tsx` | UI wiring only (no redesign) |
| Seed at least one `ordered` PO | `prisma/seed-demo.ts` | seed data |

### 2.3 Success

Create PO (draft) → send (ordered) → appears in `/purchasing/receiving`.

---

## 3. B7-2 — Receiving Goods Integration Plan

### 3.1 Requirements (integration map flow #4, #5, #12)

Single transaction must produce:

1. `GoodsReceipt` + `GoodsReceiptItem`
2. Base-unit converted stock increase (`applyAtomicStockDelta`) — **already present**
3. `StockMovement` (`movementType: "purchase"`, `referenceType: "goods_receipt"`) — **already present**
4. `InventoryLot` when lot/expiry given — **already present**
5. `PurchaseItem.receivedQuantity` increment with guard — **already present**
6. PO status → `partial` / `received` — **already present**
7. **NEW:** `SupplierPayable` create/update (B7-3)
8. **NEW:** Supplier `outstandingBalance` update (B7-3)
9. Audit log via `withTenantTransaction` metadata — present (verify entry shape)

### 3.2 Tasks

| Task | Target file | Change type | Status |
| --- | --- | --- | --- |
| Add base-unit conversion when receiving in pack/carton units | `receiveGoods` + product unit lookup | logic add | **DONE (B7-2)** |
| Confirm idempotent `receiptNo` (`@@unique([companyId, receiptNo])`) | schema/`receiveGoods` | guard | **DONE** |
| Ensure status mapping uses `received` for completed | `receiveGoods` | verify | **DONE (B7-1/2)** |

### 3.3 Success

Partial receive increments stock + sets `partial`; final receive sets `received`.

**B7-2 status: COMPLETE** — see `B7_2_COMPLETION_REPORT.md` (16/16 harness PASS, base-unit conversion verified at conversionQty=6).

---

## 4. B7-3 — Supplier Payable / Supplier Balance Plan — **DONE**

**Critical path.** This closes the B.7 exit criterion: *"Receive goods updates inventory and supplier debt."*

> **Status:** Implemented and verified (19/19 harness PASS). See `B7_3_COMPLETION_REPORT.md`.

### 4.1 Payable creation on receive

Inside `receiveGoods` transaction, after receipt items processed:

1. Compute received value = Σ(`receiptItem.quantity` × matching `purchaseItem.unitCost`).
2. Resolve due date from supplier `creditTerms` (fallback: none/null).
3. Upsert payable per receipt **or** per purchase:
   - Decision: **one payable per purchase**, incrementally increased per receipt (matches `SupplierPayable.purchaseId` 1-many but we maintain a single open row per purchase).
   - If open payable for `purchaseId` exists → increment `totalAmount` + `balanceAmount`.
   - Else → create with `paidAmount = 0`, `status = unpaid`.
4. Increment `Supplier.outstandingBalance` by received value.

### 4.2 Payment sync (`createSupplierPayment`)

| Current | Change |
| --- | --- |
| Updates `purchase.paidAmount/balanceAmount` | keep |
| `supplierPayable.updateMany` by `purchaseId` | keep, but also recompute `status` |
| — | **NEW:** decrement `Supplier.outstandingBalance` by payment amount |
| — | guard: payment amount ≤ open balance |

### 4.3 Tasks

| Task | Target file | Change type |
| --- | --- | --- |
| Payable create/increment on receive | `features/purchasing/prisma-repository.ts` (`receiveGoods`) | logic add |
| Supplier balance increment on receive | same | logic add |
| Supplier balance decrement on payment | `createSupplierPayment` | logic add |
| Payment over-balance guard | `createSupplierPayment` / `dto.ts` | validation |
| Map due date from credit terms | repo helper | logic add |

### 4.4 Success

Receive → payable visible in `/purchasing/payables`, supplier `outstandingBalanceLak` increases. Payment → both decrease atomically.

---

## 5. B7-4 — Demo Fallback Removal Plan — **DONE**

> **Status:** Implemented and verified (14/14 demo-fallback harness PASS; B7-1/B7-2/B7-3 not regressed). `isDemoMode()` is now fail-safe (default OFF); purchasing and inventory read services are Prisma-only; mock-data files retained as documented test/demo artifacts. See `B7_4_COMPLETION_REPORT.md`.

### 5.1 Scope

Only `features/purchasing/purchasing-service.ts` contains a purchasing demo/mock fallback. Suppliers service is already Prisma-only.

```ts
// CURRENT
if (!isDemoMode()) {
  return getPrismaPurchasingSnapshot(...);
}
return { suppliers: mockSuppliers, purchaseOrders: mockPurchaseOrders, ... };
```

### 5.2 Decision

- **Production source of truth always** for purchasing reads.
- Remove the mock branch so `getPurchasingSnapshot()` always calls `getPrismaPurchasingSnapshot`.
- Keep `mock-data.ts` only if still referenced by seed/tests; otherwise mark for deletion after grep confirms zero runtime imports.

### 5.3 Tasks

| Task | Target file | Change type |
| --- | --- | --- |
| Remove `isDemoMode()` mock branch | `purchasing-service.ts` | delete branch |
| Drop now-unused mock imports | `purchasing-service.ts` | cleanup |
| Verify no other runtime import of `purchasing/mock-data` | repo-wide grep | check |
| Keep/remove `mock-data.ts` based on grep result | `features/purchasing/mock-data.ts` | conditional |

### 5.4 Success

With `IGO_DEMO_MODE=true` or `false`, purchasing pages read PostgreSQL. No mock POs/payables appear.

---

## 6. File-by-File Implementation Targets

| File | B7 package | Action |
| --- | --- | --- |
| `prisma/schema.prisma` | — | No change expected (models sufficient); confirm `creditTerms`/`dueDate` usage |
| `features/purchasing/purchase-no.ts` | B7-1 | **NEW** prefix-aware number generator |
| `features/purchasing/prisma-repository.ts` | B7-1/2/3 | Status transition, base-unit convert, payable + supplier balance |
| `features/purchasing/actions.ts` | B7-1 | `updatePurchaseStatusAction` |
| `features/purchasing/dto.ts` | B7-1/3 | Status input parse; payment over-balance guard |
| `features/purchasing/purchasing-service.ts` | B7-4 | Remove demo fallback |
| `features/purchasing/mock-data.ts` | B7-4 | Remove if unused |
| `features/purchasing/components/purchasing-page-client.tsx` | B7-1 | Status action wiring (no redesign) |
| `features/purchasing/components/receiving-page-client.tsx` | B7-2 | Confirm receivable filter matches backend |
| `features/purchasing/components/payables-page-client.tsx` | B7-3 | Display real payables (verify) |
| `features/suppliers/prisma-repository.ts` | B7-3/extra | Supplier ledger derive (balance reconcile) |
| `features/suppliers/components/supplier-detail-client.tsx` | extra | Replace placeholder notes (optional in B7) |
| `prisma/seed-demo.ts` | B7-1 | Seed `ordered` PO + payable example |
| `scripts/phase-b7-verification.mjs` | test | **NEW** reality harness |
| `scripts/phase-b7-db-check.ts` | test | **NEW** DB assertions |

---

## 7. Database Models Involved

| Model | Role in B7 | Mutated by |
| --- | --- | --- |
| `Supplier` | Profile + `outstandingBalance` | receive (+), payment (−) |
| `Purchase` | PO header, status, paid/balance | create, status change, receive, payment |
| `PurchaseItem` | Ordered lines, `receivedQuantity` | receive |
| `GoodsReceipt` / `GoodsReceiptItem` | Receipt record | receive |
| `SupplierPayable` | AP open balance | receive (create/increment), payment (decrement) |
| `PurchasePayment` | Payment record | payment |
| `InventoryBalance` | Stock qty | receive (+) |
| `InventoryLot` | Lot/expiry | receive |
| `StockMovement` | Audit of stock change | receive |
| `AuditLog` | Action trail | all writes via `withTenantTransaction` |

---

## 8. Data Flow Map

```
Create PO ─▶ Purchase(draft) + PurchaseItem[]
   │
 send ─▶ Purchase(ordered)
   │
 Receive ─▶ [ one transaction ]
   ├─ GoodsReceipt + GoodsReceiptItem
   ├─ applyAtomicStockDelta ─▶ InventoryBalance(+)
   ├─ StockMovement(purchase)
   ├─ InventoryLot (if lot/expiry)
   ├─ PurchaseItem.receivedQuantity(+)
   ├─ Purchase.status ─▶ partial | received
   ├─ SupplierPayable (create/increment)   ◀── NEW
   ├─ Supplier.outstandingBalance(+)        ◀── NEW
   └─ AuditLog
   │
 Payment ─▶ [ one transaction ]
   ├─ PurchasePayment
   ├─ Purchase.paidAmount(+) / balanceAmount(−)
   ├─ SupplierPayable.paidAmount(+) / balance(−) / status
   ├─ Supplier.outstandingBalance(−)        ◀── NEW
   └─ AuditLog
```

---

## 9. Integration Map (module connections)

| From | To | Mechanism |
| --- | --- | --- |
| Purchasing | Inventory | `applyAtomicStockDelta`, `StockMovement` |
| Purchasing | Suppliers (debt) | `SupplierPayable`, `Supplier.outstandingBalance` |
| Suppliers | Reports | `getPrismaSuppliersSnapshot`, `reports/prisma-repository.ts` |
| Purchasing | Reports/Dashboard | `Purchase` aggregates, payables totals |
| Access control | Purchasing | `requireWritePermission` + approval rules |
| Settings (B6) | Purchasing | Approval thresholds (`ApprovalRule`) |

---

## 10. Permission / Role Impact

| Action | Permission key | Owner | Manager | Cashier |
| --- | --- | --- | --- | --- |
| Create PO | `purchasing.create` | ✓ | ✓ (configurable) | ✗ |
| Send/cancel PO | `purchasing.edit` / `purchasing.create` | ✓ | ✓ | ✗ |
| Receive goods | `purchasing.receive` | ✓ | ✓ | ✗ |
| Supplier payment | `purchasing.payment` | ✓ | configurable | ✗ |
| Manage supplier | `suppliers.create/update/delete` | ✓ | configurable | ✗ |

**Approval (B6, optional in B7-5):** PO above threshold and supplier payment may create pending approval instead of applying immediately. Not required for the core B.7 exit criterion but listed for completeness.

No new permission keys are required; existing catalog covers B7.

---

## 11. Success Criteria

| # | Criterion |
| --- | --- |
| 1 | Create supplier persists to PostgreSQL |
| 2 | Create PO with unique `purchaseNo`, status `draft` |
| 3 | Send PO → `ordered`, visible in receiving |
| 4 | Receive (partial) → stock(+), `PurchaseItem.receivedQuantity`(+), status `partial` |
| 5 | `StockMovement` (purchase) + optional `InventoryLot` created |
| 6 | `SupplierPayable` created with correct `balanceAmount` |
| 7 | `Supplier.outstandingBalance` increased by received value |
| 8 | Final receive → status `received` |
| 9 | Supplier payment → payable + purchase + supplier balance decrease atomically |
| 10 | Payment cannot exceed open balance |
| 11 | Purchasing pages read PostgreSQL in both demo and production mode (no mock) |
| 12 | `npm run typecheck` + `npm run build` pass |
| 13 | `scripts/phase-b7-verification.mjs` all PASS |

---

## 12. Test Plan

### 12.1 Automated reality harness (`scripts/phase-b7-verification.mjs`)

Flow (production mode, `IGO_DEMO_MODE=false`):

1. Login Owner.
2. Create supplier → assert row.
3. Create PO (2 items) → assert unique `purchaseNo`, status draft.
4. Send PO → assert `ordered`.
5. Receive partial → assert stock delta, `partial`, payable created, supplier balance up.
6. Receive remaining → assert `received`, payable total correct.
7. Record payment (partial) → assert payable + supplier balance down.
8. Record payment (rest) → assert payable `paid`, supplier balance to baseline.

### 12.2 DB assertions (`scripts/phase-b7-db-check.ts`)

- No duplicate `purchaseNo` / `receiptNo` per company.
- `InventoryBalance` delta equals received base qty.
- `SupplierPayable.balanceAmount = totalAmount − paidAmount`.
- `Supplier.outstandingBalance = Σ open payable balances` (within tolerance).
- Payment cannot push balance negative.

### 12.3 Regression

- A2 harness still 31/31 (POS, products, customers, permissions unaffected).
- `npm run typecheck` + `npm run build`.

### 12.4 Manual UI smoke

- `/purchasing` list, `/purchasing/new`, `/purchasing/receiving`, `/purchasing/payables`, `/suppliers/[id]` render with real data.

---

## 13. Rollback Plan

| Scenario | Action |
| --- | --- |
| Logic regression | `git revert` of B7 commits; baseline `c8d6e9d` is clean |
| Schema migration issue | No destructive migration planned for B7; if a migration is added, keep it additive and reversible; `prisma migrate resolve` if needed |
| Data corruption in dev | Re-run `npm run db:seed:demo` (idempotent upserts) |
| Partial deploy | Each B7 package is an isolated commit; revert individually |
| Verification fails | Do not tag B7 complete; fix-forward or revert to last green commit |

**Safety:** commit per work package (B7-1 … B7-8) so any single step is independently revertible. No `git push --force`. No history rewrite.

---

## 14. GO / NO-GO Checklist Before Coding (B7-1)

| # | Check | Required |
| --- | --- | --- |
| 1 | All 7 baseline docs read | ✓ |
| 2 | `B7_IMPLEMENTATION_SPEC.md` created | ✓ |
| 3 | Gaps G1–G7 enumerated with file targets | ✓ |
| 4 | Data flow + integration map documented | ✓ |
| 5 | Permission impact assessed (no new keys) | ✓ |
| 6 | Test + rollback plan defined | ✓ |
| 7 | `npm run typecheck` PASS | see §15 |
| 8 | `npm run build` PASS | see §15 |
| 9 | Baseline commit clean on `main` | ✓ (`c8d6e9d`) |
| 10 | No app logic / UI changed in B7-0 | ✓ |

---

## 15. Verification Results

B7-0 run (no code changes; spec authoring only).

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (Next.js 16.2.9, all routes incl. `/purchasing*`, `/suppliers*`) |

---

## 16. Implementation Order

```
B7-1 PO lifecycle ──▶ B7-2 Receiving hardening ──▶ B7-3 Payable + supplier balance (critical)
        └────────────────────────────────────────────▶ B7-4 Demo fallback removal
                                                              └─▶ verification harness (B7-8)
```

**First coding step after GO:** B7-1 (PO lifecycle), implemented as an isolated commit.
