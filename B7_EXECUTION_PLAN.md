# B7 Execution Plan — Purchasing / Supplier / Debt

**Date:** 2026-06-22  
**Baseline commit:** `c8d6e9d` (Git recovery + A2 gate)  
**Phase:** B.7 per `REBUILD_SEQUENCE_PLAN.md`  
**Status:** Planning only — no business logic changes in this document

---

## 1. Phase Goal (from master docs)

Connect **Purchasing → Inventory → Supplier Payables → Supplier Ledger** as one transactional workflow.

**Exit criteria (REBUILD_SEQUENCE_PLAN):**

> Receive goods updates inventory **and** supplier debt.

**Integration map anchors (`SYSTEM_INTEGRATION_MAP.md`):**

| Flow | Owner | Required outputs |
| --- | --- | --- |
| Purchasing → Inventory | Inventory | `PURCHASE_RECEIVE` stock movement, balance increase, optional lot/expiry |
| Supplier → Purchasing / Debt | Purchasing/AP | Payable on receive; payment reduces balance |
| Supplier ledger | Supplier profile + AP | Derived from PO, receiving, invoices, payments, adjustments |
| Approval → Purchasing | Access control | PO above amount; supplier payment |
| Sales/Inventory → Reports | Reports | Purchasing metrics from real records |

---

## 2. Current Baseline (post-A2, pre-B7)

### Already in place

| Area | State |
| --- | --- |
| **Prisma schema** | `Supplier`, `Purchase`, `PurchaseItem`, `GoodsReceipt`, `GoodsReceiptItem`, `SupplierPayable`, `PurchasePayment` |
| **Purchasing repository** | `features/purchasing/prisma-repository.ts` — snapshot, `createPurchaseOrder`, `receiveGoods`, `createSupplierPayment` |
| **Suppliers repository** | `features/suppliers/prisma-repository.ts` — CRUD, detail snapshot (PO, receivings, payments) |
| **Server actions** | `features/purchasing/actions.ts` with permission keys (`purchasing.create`, `purchasing.receive`, `purchasing.payment`) |
| **UI routes** | `/purchasing`, `/purchasing/new`, `/purchasing/receiving`, `/purchasing/payables`, `/purchasing/suppliers`, `/suppliers`, `/suppliers/[id]` |
| **Receiving UI** | Calls `receiveGoodsAction`; filters POs with status `ordered` \| `partial` |
| **Inventory write on receive** | `receiveGoods` creates `InventoryLot`, `StockMovement` (`movementType: "purchase"`), updates balances via `applyAtomicStockDelta` |
| **Reports (partial)** | `features/reports/prisma-repository.ts` reads `Purchase` aggregates and supplier snapshot |
| **Permissions (B6)** | Catalog keys + approval rules schema; server actions call `requireWritePermission` |
| **Seed** | `seed-demo.ts` seeds suppliers from mock catalog |

### Known gaps (B7 must close)

| Gap | Evidence | B7 priority |
| --- | --- | --- |
| **No `SupplierPayable` on receive** | `receiveGoods` never calls `supplierPayable.create` | **P0** |
| **Supplier `outstandingBalance` not updated** | No update in `receiveGoods` or `createSupplierPayment` | **P0** |
| **PO status workflow incomplete** | `createPurchaseOrder` sets `draft`; receiving UI expects `ordered` \| `partial`; spec lists Draft/Sent/Ordered/Partial/Completed/Cancelled | **P0** |
| **Payables may be empty in production** | Payment action updates payables only if row exists | **P0** |
| **Demo mock still active for purchasing reads** | `purchasing-service.ts` falls back to `mock-data` when `isDemoMode()` | **P1** |
| **Supplier detail placeholders** | `supplier-detail-client.tsx` shows "notes connected later" | **P1** |
| **Approval rules not enforced on PO/payment** | B6 rules exist; purchasing actions do not check thresholds | **P1** |
| **Base-unit conversion on receive** | Receive uses entered quantity directly; must match POS/inventory base-unit policy | **P1** |
| **Purchasing reports partially mock** | Report UI still has hardcoded supplier filter options | **P2** |
| **Dashboard payables KPI** | Dashboard still mixed/mock per `DATA_SOURCE_MAP.md` | **P2** |

---

## 3. B7 Work Packages

Execute in order. Each package ends with a verifiable checkpoint before the next starts.

### B7-1 — PO lifecycle and numbering

**Objective:** Purchase orders follow a real status machine and appear in receiving when ready.

| Task | Files (expected) | Done when |
| --- | --- | --- |
| Define PO status enum + transitions | `features/purchasing/types.ts`, `dto.ts` | Draft → Sent → Ordered → Partial → Completed / Cancelled documented |
| Add `getNextPurchaseNo()` (prefix-aware, like POS sale-no) | new helper + repository | Unique `purchaseNo` per company |
| Implement status transition actions | `prisma-repository.ts`, `actions.ts` | Owner/Manager can send/confirm/cancel PO |
| Align receiving filter with statuses | `receiving-page-client.tsx` | Receivable POs match backend rules |
| Seed/demo POs use valid statuses | `seed-demo.ts` | At least one `ordered` PO for QA |

**Checkpoint:** Create PO → transition to `ordered` → visible on `/purchasing/receiving`.

---

### B7-2 — Goods receiving → inventory (harden)

**Objective:** Receiving is atomic, base-unit correct, and audit-complete.

| Task | Files (expected) | Done when |
| --- | --- | --- |
| Convert received unit qty → base qty | `receiveGoods`, product unit helpers | Stock delta matches product unit conversion |
| Set PO status `partial` / `completed` per spec | `prisma-repository.ts` | Status matches received vs ordered totals |
| Write audit log entries | `withTenantTransaction` metadata | Receive action in audit trail |
| Idempotent receipt numbers | repository | Duplicate `receiptNo` rejected |

**Checkpoint:** Receive partial qty → inventory balance increases; second receive completes PO.

---

### B7-3 — Receiving → supplier payables (critical path)

**Objective:** Every goods receipt creates or updates AP records and supplier debt.

| Task | Files (expected) | Done when |
| --- | --- | --- |
| Create `SupplierPayable` on receive (same transaction) | `receiveGoods` in `prisma-repository.ts` | Payable row linked to `purchaseId` |
| Compute payable amount from received line costs | repository | `totalAmount`, `balanceAmount`, `dueDate` from credit terms |
| Update `Supplier.outstandingBalance` | repository | Supplier balance increases on receive |
| Handle partial receive payables | repository | Payable reflects received value, not full PO |
| Sync on payment | `createSupplierPayment` | Payable + supplier balance decrease atomically |

**Checkpoint:** Receive goods → `/purchasing/payables` shows new payable; supplier detail shows debt.

---

### B7-4 — Supplier ledger and detail UI

**Objective:** Supplier module reads one ledger derived from transactional data.

| Task | Files (expected) | Done when |
| --- | --- | --- |
| Ledger query (PO + receipts + payables + payments) | `suppliers/prisma-repository.ts` | Chronological ledger DTO |
| Wire supplier detail tabs | `supplier-detail-client.tsx` | Real PO/receiving/payment/ledger data |
| Remove placeholder copy | supplier components | No "connected later" for core fields |
| Outstanding balance display | suppliers list + detail | Matches sum of open payables |

**Checkpoint:** Supplier detail ledger reconciles with payables and payments.

---

### B7-5 — Permissions and approvals

**Objective:** B6 approval rules enforce purchasing thresholds.

| Task | Files (expected) | Done when |
| --- | --- | --- |
| Check PO total vs `ApprovalRule` (purchasing threshold) | `actions.ts` or repository | High-value PO creates pending approval |
| Check supplier payment vs rule | `createSupplierPayment` path | Payment requires approval when configured |
| Surface pending approvals in Settings | existing staff section | Purchasing approvals visible |
| Permission gates on UI buttons | purchasing/suppliers clients | Unauthorized actions hidden/blocked |

**Checkpoint:** Manager blocked on over-threshold PO unless approved.

---

### B7-6 — Demo/production parity

**Objective:** One service contract; production is source of truth when `IGO_DEMO_MODE=false`.

| Task | Files (expected) | Done when |
| --- | --- | --- |
| Production path default in `purchasing-service.ts` | service layer | No mock snapshot in production mode |
| Optional: demo purchasing repository | future adapter | Demo follows same DTOs (if demo mode retained) |
| API routes delegate to actions/repository | `app/api/purchasing/*` | Same write path as server actions |

**Checkpoint:** `IGO_DEMO_MODE=false` purchasing pages read PostgreSQL only.

---

### B7-7 — Reports and dashboard hooks

**Objective:** Purchasing reports reflect B7 writes.

| Task | Files (expected) | Done when |
| --- | --- | --- |
| Purchasing report metrics from payables/receipts | `reports/prisma-repository.ts` | Values change after receive/pay |
| Remove hardcoded supplier filters where possible | reports UI | Dynamic supplier list |
| Dashboard payables summary (if in scope) | dashboard service | KPI reads `SupplierPayable` |

**Checkpoint:** Receive + payment changes purchasing report totals.

---

### B7-8 — Verification harness

**Objective:** Repeatable B7 reality test (mirrors A2 pattern).

| Task | Files (expected) | Done when |
| --- | --- | --- |
| `scripts/phase-b7-verification.mjs` | new script | Automated flow: supplier → PO → receive → stock → payable → payment |
| DB assertions | companion `.ts` checks | Inventory delta, payable balance, no duplicate receipt/purchase nos |
| `MILESTONE_B7_REPORT.md` | completion report | Exit criteria signed off |

**Checkpoint:** Script exits 0 with all PASS; typecheck + build pass.

---

## 4. Implementation Rules (non-negotiable)

1. **One transaction** for receive: `GoodsReceipt` + items + stock movement + balance + payable + supplier balance + PO status + audit.
2. **No UI-only payables** — payables must exist in PostgreSQL before payment UI works.
3. **Do not change POS checkout logic** (A2 gate) unless a shared helper extraction is required and regression-tested.
4. **Tenant scope** — all queries/writes use `companyId`, branch, warehouse scope (existing pattern).
5. **Permissions before writes** — keep `requireWritePermission` on all actions.
6. **No translated storage keys** — DTO field names stay English/stable.

---

## 5. Files Likely Touched (implementation phase)

| Module | Primary files |
| --- | --- |
| Purchasing | `prisma-repository.ts`, `actions.ts`, `dto.ts`, `dto-mapper.ts`, `types.ts`, `purchasing-service.ts`, `components/*` |
| Suppliers | `prisma-repository.ts`, `actions.ts`, `supplier-detail-client.tsx`, `suppliers-list-client.tsx` |
| Inventory | `stock-concurrency.ts` (if conversion hooks shared) |
| Access control | `permission-catalog.ts`, approval check helper |
| Reports | `prisma-repository.ts`, `reports/purchasing/page.tsx` |
| Seed | `seed-demo.ts` |
| Verification | `scripts/phase-b7-verification.mjs` |

---

## 6. Out of Scope for B7

- Printing module (B.9)
- Full dashboard rebuild (partial hook only)
- Super Admin plan locks (B.10)
- Localization final pass (B.11)
- Return to supplier / credit notes (note in spec; defer unless required for exit criteria)
- New UI design — wire existing screens to real data only

---

## 7. Suggested Implementation Order (summary)

```
B7-1 PO lifecycle
  → B7-2 Receive hardening
    → B7-3 Payables on receive (critical)
      → B7-4 Supplier ledger UI
        → B7-5 Approvals
          → B7-6 Demo/production parity
            → B7-7 Reports
              → B7-8 Verification
```

**Estimated critical path:** B7-1 → B7-3 (payables on receive) → B7-8 (verification).

---

## 8. Success Criteria (GO for B7 completion)

| # | Criterion |
| --- | --- |
| 1 | Create supplier (PostgreSQL) |
| 2 | Create PO with unique `purchaseNo` |
| 3 | Transition PO to receivable status |
| 4 | Receive goods (partial or full) in one transaction |
| 5 | Inventory balance increases; `StockMovement` type purchase exists |
| 6 | `SupplierPayable` created/updated with correct balance |
| 7 | Supplier `outstandingBalance` reflects debt |
| 8 | Record supplier payment; payable and outstanding balance decrease |
| 9 | Supplier ledger matches transactions |
| 10 | `npm run typecheck` and `npm run build` pass |
| 11 | B7 verification script PASS |
