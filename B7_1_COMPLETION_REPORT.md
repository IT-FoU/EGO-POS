# B7-1 Completion Report — Purchase Order Lifecycle

**Date:** 2026-06-22  
**Phase:** B7-1 (Purchase Order lifecycle and status machine)  
**Scope:** Lifecycle only. No Supplier Payables, no Supplier Balance sync, no Demo Fallback removal.  
**Baseline:** `main`, commit `c8d6e9d`

---

## Summary

| Item | Result |
| --- | --- |
| Required statuses implemented | **YES** — Draft, Ordered, Partial Received, Received, Closed, Cancelled |
| PO creation flow fixed | **YES** — server-assigned sequential `purchaseNo`, starts `draft` |
| Status transition machine | **YES** — guarded transitions with validation |
| Receiving compatibility | **YES** — only `ordered`/`partial` POs are receivable |
| Repository layer | **YES** — `updatePurchaseOrderStatus`, receiving guard, number generator |
| Server actions | **YES** — `updatePurchaseStatusAction` |
| API routes | **YES** — `POST /api/purchasing/purchase-orders/status` |
| UI status handling | **YES** — Send / Cancel / Close buttons + status filter |
| Filters & reports | **YES** — list status filter; reports exclude `cancelled` purchases |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Lifecycle verification | **PASS — 12/12** |

---

## Required Status Machine

```
draft ──send──▶ ordered ──receive(partial)──▶ partial ──receive(rest)──▶ received ──close──▶ closed
  │                 │                              │
  └──cancel─────────┴──────────────cancel─────────┘                       ▶ cancelled
```

| From | Allowed to |
| --- | --- |
| draft | ordered, cancelled |
| ordered | partial, received, cancelled |
| partial | partial, received, cancelled |
| received | closed |
| closed | (terminal) |
| cancelled | (terminal) |

- Receiving-driven transitions (`ordered`/`partial` → `partial`/`received`) are owned by `receiveGoods`.
- Manual transitions (`send`, `close`, `cancel`) are owned by `updatePurchaseOrderStatus`.

---

## Files Changed

| File | Change |
| --- | --- |
| `features/purchasing/types.ts` | Added `closed` to `PurchaseStatus` |
| `features/purchasing/purchase-status.ts` | **NEW** — status values, labels, transition guard, manual-action map, receivable check |
| `features/purchasing/purchase-no.ts` | **NEW** — sequential, collision-proof `purchaseNo` generator |
| `features/purchasing/dto.ts` | `purchaseNo` optional; added `parsePurchaseStatusInput` |
| `features/purchasing/prisma-repository.ts` | Server-side number resolution on create; receiving status guard; `updatePurchaseOrderStatus` |
| `features/purchasing/actions.ts` | `updatePurchaseStatusAction` |
| `app/api/purchasing/purchase-orders/status/route.ts` | **NEW** — status transition API |
| `lib/auth/permissions.ts` | Added `purchasingEdit: "purchasing.edit"` |
| `features/purchasing/components/purchasing-status.tsx` | `closed` badge style; labels from `PURCHASE_STATUS_LABELS` |
| `features/purchasing/components/purchasing-page-client.tsx` | Status filter; Send/Cancel/Close actions; receive link gated by status |
| `features/purchasing/components/purchase-order-form.tsx` | Removed client timestamp `purchaseNo` (server generates) |
| `features/reports/prisma-repository.ts` | Exclude `cancelled` purchases from report aggregates |
| `scripts/phase-b7-1-lifecycle-check.ts` | **NEW** — lifecycle verification harness |

---

## Permission / Role Impact

- New permission key alias `purchasing.edit` used for status transitions.
- Owner: full (`*`). Manager: `purchasing.edit` granted by default matrix (Purchasing module, Edit action). Cashier: blocked.
- No schema/migration change; `Purchase.status` is a free-form string column, so `closed` needs no migration.

---

## Verification

### Build gates

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (Next.js 16.2.9, clean `.next` rebuild) |

### Lifecycle harness (`scripts/phase-b7-1-lifecycle-check.ts`, `IGO_DEMO_MODE=false`)

```
PASS  Create PO returns draft status — status=draft
PASS  Create PO assigns purchase number — purchaseNo=PO-1781435254568
PASS  Send PO -> ordered
PASS  Receive partial -> partial status
PASS  Partial receive increases stock by 2
PASS  Receive remaining -> received status
PASS  Full receive increases stock by 4 total
PASS  Close PO -> closed
PASS  Cancel draft PO -> cancelled
PASS  Cannot receive a closed PO
PASS  Cannot transition closed -> ordered
PASS  Cannot cancel a cancelled PO

B7-1 lifecycle: 12/12 PASS, 0 FAIL
```

Covers the required manual checks: **Create PO**, **Receive partial**, **Receive complete**, **Close PO**, **Cancel PO**, plus negative transition guards.

To reproduce:

```bash
npm run typecheck
npm run build
npx tsx scripts/phase-b7-1-lifecycle-check.ts
```

---

## Explicitly NOT Done (per scope)

- B7-2 receiving hardening beyond status compatibility (base-unit conversion) — deferred
- B7-3 Supplier Payables creation on receive — deferred
- B7-3 Supplier outstanding balance sync — deferred
- B7-4 Demo fallback removal — deferred

---

## Notes / Follow-ups for B7-2+

- `receiveGoods` still uses entered quantity directly as base quantity; base-unit conversion belongs to B7-2.
- Receiving creates inventory + stock movement but **no payable yet** (B7-3).
- `purchase-no` generator uses lexicographic latest + collision loop; historical timestamp-style numbers coexist safely.

---

## Final Verdict

# B7-1: **GO** for B7-2

Purchase Order lifecycle and status machine are implemented, compile clean, and pass 12/12 lifecycle checks. Ready to proceed to **B7-2 (Receiving goods integration / hardening)** when authorized.
