# B7-2 Completion Report — Receiving Goods Integration

**Date:** 2026-06-22  
**Phase:** B7-2 (Receiving goods integration + base-unit stock handling)  
**Scope:** Receiving only. Supplier Payables and Supplier Balance sync are **deferred to B7-3**. Demo fallback removal deferred to B7-4.  
**Baseline:** `main` (post B7-1)

---

## Summary

| Item | Result |
| --- | --- |
| Accepts only `ordered` / `partial` POs | **YES** |
| Rejects `draft` / `closed` / `cancelled` / fully `received` POs | **YES** |
| Partial receiving | **YES** |
| Complete receiving | **YES** |
| Inventory stock updated correctly | **YES** (base-unit) |
| PO status transitions on receive | **YES** (`ordered→partial`, `ordered→received`, `partial→received`) |
| GRN record written | **YES** (`GoodsReceipt` + `GoodsReceiptItem`) |
| Tenant/company/branch/warehouse scoping preserved | **YES** |
| Unit → base-unit conversion | **YES** (new in B7-2) |
| No negative / duplicate stock movement | **YES** |
| Stock movement traceable | **YES** (`referenceType=goods_receipt`, `referenceId=receiptId`) |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Receiving harness | **PASS — 16/16** |

---

## What Changed

The B7-1 receiving flow already enforced the status guard and PO status transitions. **The key B7-2 fix is base-unit conversion** on receive — previously the entered receiving quantity (in pack/carton/unit) was written directly to stock, which would under/over-count base stock for multi-unit products.

### Behaviour now

- Received quantity is interpreted in the **receiving unit** (same unit as the PO line).
- Stock balance, inventory lot, and stock movement are all written in **base units**:  
  `baseQuantity = receivedQuantity × ProductUnit.conversionQty`.
- Units are validated to belong to the product; missing/invalid conversion factors throw.
- `PurchaseItem.receivedQuantity` and the over-receive guard remain in **unit terms** (consistent with the ordered quantity), so partial/complete logic is correct.
- Duplicate/over-receive is rejected by the per-item optimistic guard and the status guard; stock is never double-counted.
- Exact-duplicate receipts are blocked by `@@unique([companyId, receiptNo])`.

---

## Files Changed

| File | Change |
| --- | --- |
| `features/purchasing/prisma-repository.ts` | `receiveGoods`: added unit→base conversion (`baseQuantityFor`), applied base quantity to stock delta, inventory lot, and stock movement |
| `scripts/phase-b7-2-receiving-check.ts` | **NEW** — receiving lifecycle + conversion harness |
| `B7_IMPLEMENTATION_SPEC.md` | B7-2 marked implemented (base-unit conversion) |

No schema/migration change. No UI design change (existing receiving page already calls `receiveGoodsAction`).

---

## Unit Conversion / Base-Unit Handling

Verified against real seed data: product `prd-pepsi-can`, unit `unit-pepsi-pack`, `conversionQty = 6`.

| Action | Unit qty | Base stock delta |
| --- | --- | --- |
| Receive partial | 2 packs | **+12** base |
| Receive remaining | 4 packs | **+24** base |
| Total | 6 packs | **+36** base |

- Stock movement `quantity` recorded in base units (12, then 24), positive, one movement per receipt.
- Each movement traceable to its `GoodsReceipt` via `referenceId` / `referenceType=goods_receipt`.

---

## Test Result

`scripts/phase-b7-2-receiving-check.ts` (run with `IGO_DEMO_MODE=false`):

```
Using product=prd-pepsi-can unit=unit-pepsi-pack conversionQty=6
PASS  Conversion factor is positive
PASS  PO is ordered before receiving
PASS  Partial receive sets status partial
PASS  Partial receive increases base stock by qty*conversion — expected +12, got +12
PASS  Receipt A has traceable stock movement
PASS  Stock movement A quantity equals base quantity — quantity=12
PASS  Stock movement A is positive (no negative)
PASS  Remaining receive sets status received
PASS  Full receive total base stock = order*conversion — expected +36, got +36
PASS  Exactly one movement per receipt (no duplicates) — A=1, B=1
PASS  Over-receive beyond ordered is rejected
PASS  Stock unchanged after rejected over-receive
PASS  Received PO cannot be received
PASS  Draft PO cannot be received
PASS  Cancelled PO cannot be received
PASS  Closed PO cannot be received

B7-2 receiving: 16/16 PASS, 0 FAIL
```

Required scenarios covered: create PO → ordered → receive partial → verify stock → receive remaining → verify `received`; closed/cancelled/draft cannot receive; duplicate/over-receive does not double-count stock.

### Build gates

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (Next.js 16.2.9, clean `.next`) |

To reproduce:

```bash
npm run typecheck
npm run build
npx tsx scripts/phase-b7-2-receiving-check.ts
```

---

## Explicitly Deferred

- **B7-3 — Supplier Payable creation on receive:** NOT implemented. Receiving does not yet create/increment `SupplierPayable`.
- **B7-3 — Supplier `outstandingBalance` sync:** NOT implemented.
- **B7-4 — Demo fallback removal:** NOT implemented (`purchasing-service.ts` still has the mock branch).

---

## Remaining Risks

| Risk | Notes |
| --- | --- |
| Receiving creates inventory but no payable yet | By design; closes in B7-3. Supplier debt not reflected until then. |
| `GoodsReceiptItem.quantity` stored in unit terms | Intentional (has `unitId`); base conversion applied only to stock/lot/movement. Reports reading GRN must convert if base needed. |
| Lot quantity in base units | Consistent with inventory base-unit storage; expiry/lot reporting should assume base units. |
| Concurrency | Over-receive guarded by optimistic `updateMany` + status guard; heavy concurrent receiving still serialized by transaction. |

---

## Final Verdict

# B7-2 Receiving Goods Integration: **PASS**

# B7-3 gate: **GO**

Receiving correctly converts units to base stock, enforces PO status rules, writes traceable GRN + stock movements, and prevents double-counting. Ready for **B7-3 (Supplier Payable / Supplier Balance)** when authorized. B7-3 was not started.
