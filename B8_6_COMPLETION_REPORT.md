# B8-6 Completion Report — Post-sale Refund / Void / Receipt Hardening

**Phase:** B8-6  
**Date:** 2026-06-22  
**Verdict:** **PASS**

---

## Summary

B8-6 hardens post-sale operations for production POS: DB-backed Recent Sales, receipt view/reprint, full refund and void flows with stock/loyalty/promotion reversal, cash-session correctness (no double-count), server-side POS permissions, approval executors for refund/void, and audit on reprint. B7–B8-5 behavior preserved.

---

## Changes Delivered

### Post-sale module (`features/pos/post-sale-*`)
| Component | Purpose |
|-----------|---------|
| `post-sale-types.ts` | `PosRecentSaleRecord`, `PosReceiptSnapshot`, mutation result types |
| `post-sale-repository.ts` | `listPrismaRecentSales`, `getPrismaSaleReceipt`, `logPrismaReceiptReprint`, `refundPrismaSale`, `voidPrismaSale` |
| `post-sale-client.ts` | Browser fetch helpers for POS UI |

### API routes
- `GET /api/pos/sales` — recent sales list (DB)
- `GET /api/pos/sales/[id]/receipt` — receipt snapshot from Sale/Items/Payments
- `POST /api/pos/sales/[id]/reprint` — reprint audit log
- `POST /api/pos/sales/[id]/refund` — full refund
- `POST /api/pos/sales/[id]/void` — void/cancel sale

### Server mutations (transactional + audited)
- **Refund:** `Refund` + `RefundItem` rows, `saleStatus: refunded`, stock restore (`StockMovement.return`), loyalty reversal, promotion usage rollback
- **Void:** `saleStatus: cancelled`, stock restore, loyalty/promotion reversal
- **Permissions:** `assertPosActionAllowed` for `view_recent_sales`, `view_receipt`, `reprint_receipt`, `refund_bill`, `void_bill`
- **Approvals:** pending request when policy requires; `executePostSaleApproval` on approve (B8-2 engine)
- **Receipt:** `receiptNo` set on checkout (`RCPT-{saleNo}`)

### Cash session fix (B8-5 extension)
- Full refunds/voids no longer double-subtract drawer cash (removed from completed cash sales only)
- Partial refunds on still-completed sales reduce expected cash via cash-portion `refundLak`
- `computeCashRefundLak` in `cash-session-calculator.ts`

### POS client
- Production path uses API for Recent Sales, receipt view/reprint, refund, void
- Demo mode retains localStorage behavior

---

## Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| B8-6 harness (`phase-b8-6-post-sale-check.ts`) | **18/18 PASS** |
| B8-5 cash session regression | **13/13 PASS** |
| B8-4 report regression | **13/13 PASS** |
| B8-3 permission regression | **42/42 PASS** |
| B8-2 approval regression | **29/29 PASS** |
| B8-1 checkout regression | **29/29 PASS** |
| B7 regression | **64/64 PASS** |

### B8-6 harness coverage
- Recent sales reads DB sale
- Receipt loads from DB; reprint creates audit log
- Refund restores stock, adjusts cash session, reverses loyalty
- Void restores stock, adjusts cash session
- Duplicate refund/void blocked
- Cashier unauthorized; cross-company blocked
- Refunded/voided excluded from completed report aggregate

---

## Remaining Post-sale Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Partial refund UI | Medium | Server supports partial via model; only full refund API exposed |
| Manager void/refund approval in POS UI | Medium | Server creates pending approval; client shows message only |
| POS localStorage audit/approvals in demo | Low | Production uses DB audit on reprint/mutations |
| Soft-delete sale | Low | Not implemented server-side |
| Edit sale fields post-close | Low | Still demo/localStorage only |
| Mixed-payment refund cash split | Low | Cash portion computed proportionally; needs production QA |

---

## GO / NO-GO for Next Phase

**GO** — B8-6 gates pass; post-sale lifecycle is DB-backed with stock, loyalty, and cash-session integrity. Proceed to **G5 (loyalty)** or **G6 (promotions)** per spec when stakeholder confirms.

---

*Verified on PostgreSQL demo seed (`gobox-company`).*
