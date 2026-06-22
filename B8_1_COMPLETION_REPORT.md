# B8-1 — POS Checkout Hardening — Completion Report

**Phase:** B8-1 (POS checkout calculation integrity)
**Scope:** B8-1 only. No B8-2+, no reports/approvals/UI redesign. Git baseline preserved. Tenant/company/branch/warehouse scoping preserved.
**Result:** **PASS**

---

## 1. Goal

Make the server the single source of truth for POS checkout math so persisted `Sale` / `SaleItem` / `Payment` totals cannot be driven by (or diverge from) untrusted client values, while preserving all working B7 behavior.

---

## 2. Audit findings (before B8-1)

End-to-end audit of `features/pos/components/pos-page-client.tsx` (client) and `features/pos/prisma-repository.ts` (`completePrismaSale`, server):

| Area | Before B8-1 | Risk |
| --- | --- | --- |
| Item selling price | Server used **client** `item.sellingPrice` | Client could send any price |
| Item cost price | Server used **client** `item.costPrice` | Wrong profit / margin |
| Unit conversion | Server used **client** `item.conversionQty` | Wrong base-unit stock deduction |
| Membership discount | Applied **client-side only** (baked into `priceLak`) | Not reproducible / verifiable server-side |
| Subtotal / promo / manual / tax / total | Already recomputed server-side ✅ | OK, but built on untrusted unit prices |
| Client vs server total | **Not compared** | Under-charge / tampering undetected |
| Payment sufficiency | **Not validated** | Sale could persist underpaid |
| `changeAmount` | Taken from **client** | Wrong change persisted |
| Negative discount / qty / payment, >100% discount | Partially guarded (qty only) | Invalid financial rows |

The server already recomputed aggregate totals (good), but **trusted client unit price/cost/conversion**, **omitted server-side membership pricing**, and performed **no client-total or payment validation**.

---

## 3. Changes implemented

### `features/pos/prisma-repository.ts` (`completePrismaSale`)
- **DB-authoritative line pricing:** fetches live products + units (`tx.product.findMany({ include: { units: true }, where: { isActive: true }})`) and the customer membership inside the transaction. Each line's `sellingPrice`, `costPrice`, and `conversionQty` now come from the resolved **DB unit** (`resolveSaleUnit`), never from the client payload. Unknown or inactive `unitId` is rejected; missing/inactive product is rejected.
- **Server-side membership tier discount:** `resolveMembershipDiscountPercent` mirrors the client rule (active membership + `discountPercent`) and applies `round(retail * (1 - pct/100))` so member pricing is reproduced on the server.
- **Authoritative recomputation order:** subtotal → DB promotions (`applyActivePromotions`, refactored to consume the already-fetched product/customer context, no double fetch) → manual discount → loyalty redemption → tax (from `CompanySetting`) → total.
- **Client total mismatch guard:** rejects checkout when the client total is below the server total beyond a **1 LAK** rounding tolerance (under-charge / tamper). The server total is the sole persisted value.
- **Payment validation:** tender amounts must be non-negative and must cover the server total; **`changeAmount` is recomputed server-side** (`max(paid - total, 0)`) and the client value is ignored.
- **Validation guards:** empty cart, non-positive/non-finite quantity, negative discount, discount percent > 100, negative payment amounts, and invalid (negative/non-finite) computed total.

### Preserved B7 behavior (unchanged logic paths)
- `sale_no` uniqueness via `resolvePosSaleNo` / `getNextPosSaleNo`.
- Atomic stock deduction (`applyAtomicStockDelta`) + `StockMovement` audit rows.
- Loyalty earn/redeem ledger + customer balance update.
- Promotion usage rows + promotion counters.
- Tenant/company/branch/warehouse scoping (`assertBranchInScope` / `assertWarehouseInScope`).
- PostgreSQL persistence; Owner/Manager/Cashier flows unaffected (server enforces `pos.sell`; client UX unchanged).

> Note: the client payload shape is unchanged (still sends `sellingPrice`, `taxAmount`, `changeAmount`, `totalAmount`), so the existing UI keeps working — these are now treated as **preview-only** and ignored where the server is authoritative.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `features/pos/prisma-repository.ts` | DB-authoritative pricing, membership pricing, client-total guard, payment validation, server change, validation guards; `applyActivePromotions` refactored to accept pre-fetched context |
| `scripts/phase-b8-1-checkout-check.ts` | **New** B8-1 verification harness (29 checks) |
| `B8_IMPLEMENTATION_SPEC.md` | G1 status updated — server hardening DONE (B8-1); UI quote-parity flagged for a later sub-phase |
| `B8_1_COMPLETION_REPORT.md` | **New** this report |

---

## 5. Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** (exit 0) |
| `npm run build` | **PASS** (58/58 pages, compiled successfully) |
| `scripts/phase-b8-1-checkout-check.ts` | **29 / 29 PASS** |
| B7-1 lifecycle harness | 12 / 12 PASS |
| B7-2 receiving harness | 16 / 16 PASS |
| B7-3 payable harness | 22 / 22 PASS |
| B7-4 demo-fallback harness | 14 / 14 PASS |

### B8-1 scenarios covered
Normal sale (DB price overrides bogus client price), discounted sale, **product-scoped promotion sale** (server applies lower total + records `PromotionUsage`), tax sale (temporary VAT toggle, restored), **member sale** (server applies tier discount), multi-item sale, **unit-conversion sale** (box ×12 deducts 12 base units, DB box price used), overpay change calculation, sale_no uniqueness / no duplicates, stock deduction correctness.

### Negative / manipulation scenarios (all correctly rejected)
Manipulated low client total, negative discount, insufficient payment, negative quantity, discount percent > 100, negative payment amount, unknown `unitId`.

---

## 6. Result

**B8-1 POS Checkout Hardening: PASS.** Server is authoritative for all checkout math; client cannot underpay or alter persisted totals; B7 behavior fully preserved; all checks green.

**Do not start B8-2.**
