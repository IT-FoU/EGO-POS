# Cleanup and Real Workflow Integration Report

Date: 2026-06-20

## Summary

This phase removed normal-user demo clutter from the POS path, connected POS product/sale state to local demo storage for real testing, and fixed the cashier name source so the cart uses the current authenticated user instead of hardcoded owner text.

## Demo Items Removed or Hidden

- POS snapshot no longer loads mock products, mock customers, promotion banners, or QR banks in normal demo flow.
- POS Permission Debug Panel is hidden unless `NEXT_PUBLIC_DEV_DEBUG=true`.
- Customer Display checkout demo data is hidden unless `NEXT_PUBLIC_DEV_DEBUG=true` and the explicit demo query is used.
- Settings staff seed users are not auto-created in normal UI. Demo seed staff only appears when `NEXT_PUBLIC_DEV_DEBUG=true`.
- Hardcoded `IGO Store Owner`, `IGO Store Manager`, `IGO Store Cashier`, and `IGO Mini Mart` display fallbacks were replaced.

## Language Switch

- Global language toggle now dispatches a client-side locale change event after saving the selected locale.
- This supports immediate UI refresh through the existing localization runtime without requiring page refresh.

## POS Complete Sale Workflow

Implemented for demo storage:

- Generate sale number through existing POS flow.
- Save sale record to `ego.pos.sales`.
- Save receipt record to `ego.pos.receipts`.
- Deduct stock from `ego.pos.products` in base quantity.
- Preserve Product page data shape when updating stock.
- Create POS audit entry for completed sale.
- Open receipt.
- Clear cart after configured Customer Display return time.
- Move Customer Display to thank-you state and then back to advertising.

## Product Delete Workflow

Products page now supports demo-storage cleanup:

- Delete a single product.
- Bulk delete selected products.
- Clear all locally stored products.
- Product list initializes empty in normal mode unless real/local products exist.
- Product changes persist to `ego.pos.products` and are read by POS.

## Cashier Session Binding

- POS cashier name now comes from `session.user.name`.
- If full name is missing, POS falls back to `session.user.username`.
- Final fallback is `Cashier`.
- Hardcoded `IGO Store Owner` was removed from POS/session fallback display.

## Settings Cleanup

- Staff list no longer seeds fake staff in normal mode.
- Created staff remains stored in demo local storage/cookie flow.
- Debug staff seed behavior is kept only for `NEXT_PUBLIC_DEV_DEBUG=true`.

## Integration Connections Updated

- `Products/Inventory -> POS`: POS reads product records from `ego.pos.products`.
- `POS -> Products/Inventory`: Complete Sale updates stored stock.
- `Staff/Login -> POS cashier`: POS uses current authenticated session.
- `Sales -> Receipt`: Complete Sale writes receipt record.
- `Sales -> Audit Log`: Complete Sale writes POS audit entry.
- `Customer Display -> POS`: Customer Display now follows POS state instead of forced demo checkout.

## Remaining Limitations

- Wider modules such as Reports, Inventory, Purchasing, Promotions, Suppliers, and Customers still contain historical mock/demo datasets in their own mock-data files. They were not fully removed in this focused cleanup pass.
- Product create/edit still needs a full repository-backed save path for non-demo mode.
- POS sale persistence is demo-storage based in demo mode. Real database sale persistence remains through existing `/api/pos/sales` path when demo mode is off.
- QR account selection and receipt print templates still need a full real-data verification pass after demo cleanup.

## Verification

- `npm run typecheck`: PASS
- `npm run build`: PASS
- Browser UI smoke test: NOT COMPLETED
  - In-app Browser runtime failed with Windows sandbox permission error.
  - `next start` worked in foreground, but background server attempts did not accept HTTP connections on `127.0.0.1:3001` in this tool session.
  - No browser-click PASS is claimed in this report.

Build note:
- First build attempts timed out or hit `.next` file lock from a previous run.
- `.next` was safely removed after checking the resolved path is inside the workspace.
- Final `npm run build` completed successfully.

## Files Changed

- `app/(dashboard)/pos/page.tsx`
- `components/layout/language-toggle.tsx`
- `features/pos/components/customer-display-client.tsx`
- `features/pos/components/pos-page-client.tsx`
- `features/pos/pos-service.ts`
- `features/products/components/product-list-client.tsx`
- `features/settings/components/settings-form.tsx`
- `lib/auth/options.ts`
- `lib/auth/session.ts`
