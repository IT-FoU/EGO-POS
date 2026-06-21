# BUG-004A Payment Key Crash Fix Report

## Bug

Clicking the POS payment / complete sale area could crash with:

`Encountered two children with the same key: product-1781976529757`

## Root Cause

There were duplicate product IDs in `localStorage["ego.pos.products"]`, and POS render keys relied too heavily on product IDs:

- Product creation used `product-${Date.now()}`, which can collide if records are duplicated or saved quickly.
- POS product grid and favorite row used `product.id` directly as React keys.
- Cart rendering used `product.id + unitId`, which still fails if duplicate product records share the same id.
- ReceiptPreview used `key={item.id}`, so duplicate cart/product lines could crash receipt rendering.

## Files Changed

- `features/products/components/product-form.tsx`
- `features/pos/components/pos-page-client.tsx`

## Key Strategy Fixed

- New Product IDs now use timestamp + random suffix and check against existing local products.
- POS product/favorite rendering uses `productKey(product, index)`.
- POS cart rendering uses `cartLineKey(item, index)`.
- ReceiptPreview rendering uses `cartLineKey(item, index)`.
- ReceiptPreview now safely shows an empty receipt item state if needed.

## Duplicate Product Cleanup

On POS load:

1. Reads `localStorage["ego.pos.products"]`.
2. Removes unsafe duplicate product IDs by regenerating unique IDs.
3. Detects duplicate identity by SKU, barcode, product code, and name.
4. Regenerates unit IDs under the cleaned product ID.
5. Saves the cleaned list back to `localStorage["ego.pos.products"]`.

## Payment Button Result

- POS payment button text changed from `Complete Sale` to `Pay`.
- Clicking Pay uses the existing Complete Sale handler.
- The key crash path in cart/receipt/product rendering has been fixed in code.

Actual UI click verification is not claimed in this report.

## Complete Sale Renamed To Pay

- The POS button no longer displays `Complete Sale`.
- It now displays `Pay`.
- Lao label still needs full i18n dictionary verification in the separate language bug phase.

## Manual Test Steps

Use these exact steps to confirm:

1. Open `/products/new`.
2. Create a product with opening stock greater than `0`.
3. Open `/pos`.
4. Add the product to cart.
5. Add the same product again.
6. Confirm quantity merges instead of creating duplicate visual lines.
7. Select payment method.
8. Click `Pay`.
9. Confirm app does not crash.
10. Confirm receipt preview opens or success message appears.
11. Confirm cart clears.
12. Confirm stock decreases.

Additional duplicate cleanup test:

1. Manually duplicate a product object in `localStorage["ego.pos.products"]` with the same `id`.
2. Reload `/pos`.
3. Confirm page does not crash.
4. Confirm storage is rewritten with unique product IDs.

## Verification Commands

- `npm run typecheck`: PASS
- `npm run build`: PASS

## Actual UI Verification Status

NOT CLAIMED.

The available browser/node runtime is still blocked in this environment, so I could not perform a real click-through test on `/pos`.

