# POS Recent Sales and Receipt Workflow Report

## Files Changed

- `features/pos/components/pos-page-client.tsx`
- `features/pos/permissions.ts`
- `features/settings/types.ts`
- `features/settings/prisma-repository.ts`
- `features/settings/components/settings-form.tsx`
- `lib/demo/repositories.ts`
- `MASTER_SPECIFICATION.md`
- `SYSTEM_INTEGRATION_MAP.md`
- `DATA_SOURCE_MAP.md`
- `PRINTING_SPEC.md`
- `PERMISSION_AND_APPROVAL_SPEC.md`

## Repositories Used

- `demoSalesRepository`
- `demoReceiptsRepository`
- `demoProductsRepository`
- `demoSettingsRepository`
- `demoPendingApprovalRepository`
- `demoAuditLogRepository`

No new storage keys were added.

## Receipt Print Workflow

- Settings now includes `Receipt Print Mode`.
- Modes:
  - Ask Every Time
  - Auto Print
  - No Auto Print
- Demo POS Pay creates sale, creates receipt, deducts stock, writes audit, clears cart, generates the next bill number, and refreshes Recent Sales.
- Receipt preview renders from a saved receipt snapshot, so it still works after the cart is cleared.

## Recent Sales Actions

- View Receipt
- Reprint Receipt
- Refund
- Void Bill
- Edit note/customer/payment
- Soft Delete Bill
- Duplicate Sale
- Sale Timeline

Delete is soft delete only and stores delete metadata.

## Permission Mapping

- `view_recent_sales`
- `view_receipt`
- `reprint_receipt`
- `refund_bill`
- `void_bill`
- `edit_sale_note`
- `edit_sale_customer`
- `edit_sale_payment`
- `delete_sale`
- `duplicate_sale`

Every Recent Sales action calls the POS permission guard before changing state.

## Audit Log Mapping

Audit entries are written for:

- Sale creation
- Receipt reprint
- Refund
- Void
- Metadata edit
- Soft delete
- Duplicate sale
- Blocked or approval-required permission decisions

## Remaining Limitations

- Production database services still need to mirror the demo sale/receipt/timeline DTO.
- Refund is status-based in demo mode; full refund payment reversal is not implemented yet.
- Void restores stock only when the action is allowed immediately. Approval payload replay still needs the future approval service.
- Browser print is used in demo mode; direct printer profiles remain future work.

## Manual Test Checklist

- Pay creates sale.
- Sale completed modal appears.
- Print Receipt opens receipt preview and print flow.
- View Receipt opens saved receipt.
- New Sale closes completion modal.
- Recent Sales shows the new sale immediately.
- Recent Sales search and filters work.
- View Receipt works from Recent Sales.
- Reprint Receipt works from Recent Sales.
- Duplicate Sale copies items to cart without changing stock.
- Delete Bill is soft delete only.
- Refund updates sale status.
- Void updates sale status and restores stock only when allowed.
