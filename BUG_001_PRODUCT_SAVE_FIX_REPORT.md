# BUG-001 Product Add Save Fix Report

## Bug

Product Add -> Save did not create a usable product in the current demo workflow.

## Root Cause

The Create Product form submitted to the server action path (`createProductAction`) only. In the current demo workflow, the Products list and POS product grid read from browser storage key `ego.pos.products`. Because the create form did not write to that storage key, a saved product did not appear in the Products list or POS grid, which made Save look broken to the user.

## Fix Applied

- Create Product mode now persists a new product directly to `ego.pos.products`.
- The saved product includes:
  - product name
  - barcode
  - SKU
  - product code
  - category
  - supplier/brand labels
  - cost price
  - selling price
  - opening stock as `currentStock`
  - low stock threshold
  - status
  - stock display mode
  - product units
  - main/unit image references
- After saving, the form routes back to `/products`.
- Edit Product behavior was not changed in this bug fix.

## Files Changed

- `features/products/components/product-form.tsx`

## Exact Reproduction Steps

Before fix:

1. Open `/products/new`.
2. Enter required product fields.
3. Click `Save`.
4. Return to `/products`.
5. Product does not appear in the list/POS storage-backed product flow.

## Exact Validation Steps

After fix:

1. Open `/products/new`.
2. Enter:
   - Product Name
   - SKU
   - Cost Price
   - Selling Price
   - Optional Opening Stock
3. Click `Save`.
4. App routes to `/products`.
5. New product is stored in `localStorage["ego.pos.products"]`.
6. Products list reads the stored product.
7. POS product grid can read the same stored product source.

## Verification

- `npm run typecheck`: PASS
- `npm run build`: PASS

## Scope Guard

Only BUG-001 was fixed. The following reported bugs were not addressed in this change:

- BUG-002 Language switch does not update all modules.
- BUG-003 IGO Store Owner still appears in POS.
- BUG-004 Complete Sale does not complete sale.
- BUG-005 Product Delete does not work.

