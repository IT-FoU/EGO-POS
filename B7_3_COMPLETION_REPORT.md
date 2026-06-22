# B7-3 Completion Report — Supplier Payable / Outstanding Balance Sync

**Phase:** B7-3
**Scope:** Supplier Payable creation/accumulation on receiving + Supplier outstanding balance synchronization on receive and payment.
**Status:** PASS
**B7-4 gate:** GO

---

## 1. Scope Delivered

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Receiving Goods must create/update Supplier Payable | DONE |
| 2 | Supplier Outstanding Balance increases when goods received | DONE |
| 3 | Supplier Payment reduces Outstanding Balance | DONE |
| 4 | Partial receiving creates partial payable amount | DONE |
| 5 | Multiple receives accumulate correctly | DONE |
| 6 | Payment history and payable history stay synchronized | DONE |
| 7 | Prevent duplicate payable creation from duplicate receives | DONE |
| 8 | Preserve tenant/company/branch/warehouse isolation | DONE |
| 9 | Update reports/analytics depending on outstanding balance | DONE (DB-driven) |

B7-4 (Demo Fallback Removal) was **not** started, as instructed.

---

## 2. Implementation Summary

### `features/purchasing/prisma-repository.ts`

**New helpers**

- `payableStatusFor(totalAmount, paidAmount)` → `"unpaid" | "partial" | "paid"` (single source of truth for payable status).
- `dueDateFromCreditTerms(creditTerms)` → parses a numeric day count from the supplier's `creditTerms` string and computes a due date; returns `undefined` when no usable term exists.

**`receiveGoods` (within the existing receive transaction, after PO status update)**

- Computes **received value** in LAK = `Σ(receiptItem.quantity × purchaseItem.unitCost × purchase.exchangeRate)`. This is the *received* value, so partial receives generate partial payables.
- **Single open payable per purchase** — looks up an existing `SupplierPayable` by `(companyId, purchaseId)`:
  - If found → increments `totalAmount` and recomputes `balanceAmount` / `status` (accumulation across multiple receives).
  - If not found → creates one with `dueDate` from supplier credit terms.
  - This guarantees **no duplicate payable rows** from multiple/duplicate receives (combined with B7-2's over-receive rejection).
- Increments `Supplier.outstandingBalance` by the received LAK value.

**`createSupplierPayment` (rewritten)**

- Payable is now the **source of truth** for outstanding (previous code derived balance from `purchase.totalAmount`, which was wrong for partially-received POs).
- Guards: amount must be `> 0`; a payable must exist (otherwise *"No outstanding payable for this purchase. Receive goods first."*); amount cannot exceed the current payable balance (overpay rejected).
- Records the `PurchasePayment`, updates payable `paidAmount` / `balanceAmount` / `status`, **decrements** `Supplier.outstandingBalance` (floored at 0), and keeps the purchase header `paidAmount` / `balanceAmount` in sync for PO-level display.

### Reports / Analytics (Req 9)

Supplier outstanding is surfaced through `mapPrismaSupplier` (`outstandingBalanceLak` ← DB `outstandingBalance`), consumed by the suppliers list, supplier detail, purchasing page, and purchasing reports. Because these read the live DB value, they now reflect the synced balance automatically with **no additional code changes** required.

### Tenant / Scope Isolation (Req 8)

All reads/writes remain scoped: receiving and payment resolve the purchase via `companyId` + `warehouseId ∈ resolveTenantScope(...)`, and payables are looked up/created with explicit `companyId` + `purchaseId`. No cross-company access path was introduced.

---

## 3. Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS (exit 0) |
| `npm run build` | PASS (exit 0) |
| B7-3 payable harness | 19/19 PASS |

### Test harness — `scripts/phase-b7-3-payable-check.ts`

Runs with `IGO_DEMO_MODE=false` against the database. Tracks supplier outstanding as a **delta from baseline** to remain robust against pre-existing balances.

| Case | Description | Result |
|------|-------------|--------|
| A | Create PO 1,000,000 (1000 × 1,000) | PASS |
| B/C | Receive 50% → payable total & balance = 500,000; outstanding +500,000 | PASS |
| D/E | Receive remaining 50% → payable = 1,000,000; outstanding +1,000,000; exactly 1 payable row | PASS |
| F/G | Pay 300,000 → balance 700,000, paid 300,000, status `partial`; outstanding = baseline + 700,000 | PASS |
| H/I | Pay remaining 700,000 → balance 0, status `paid`; outstanding back to baseline | PASS |
| — | Payment history total equals payable paid amount | PASS |
| — | Overpay beyond balance rejected | PASS |
| — | Payment before any receive rejected (no payable) | PASS |
| — | No payable created without receiving | PASS |

```
B7-3 payable: 19/19 PASS, 0 FAIL
```

---

## 4. Notes & Decisions

- **Currency basis:** Payable and supplier outstanding are stored in LAK (matching the existing `*Lak` DTO mappers). Received value and payments are converted via `purchase.exchangeRate`. For the standard LAK case (`exchangeRate = 1`) this is a 1:1 mapping.
- **One payable per purchase:** Chosen over per-receipt payables to keep supplier ledgers simple and satisfy the duplicate-prevention requirement; partial/multiple receives accumulate into the same row.
- **Payment requires a payable:** Payments can only be made against received goods, preventing outstanding balances from going negative.

---

## 5. Out of Scope (Deferred to B7-4)

- Demo fallback / mock-data removal for purchasing & suppliers.

---

## Verdict

**B7-3: PASS**
**B7-4 gate: GO**
