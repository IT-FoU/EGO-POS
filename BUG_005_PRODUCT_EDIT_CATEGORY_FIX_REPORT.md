# BUG-005 Product Edit Layout + Category Actions Fix Report

Date: 2026-06-21

Status: Code/build completed. UI PASS not claimed until user verifies.

## 1. Layout Root Cause

The product edit page used the same `ProductForm` component, but several edit-mode cards and wrappers lacked `min-w-0`, `max-w-full`, and overflow containment.

The widest sections were:

- Product Units table
- Product Images section
- Edit mode general/pricing/stock/unit cards
- Sticky edit header action buttons

On laptop widths, these sections could force the page wider than the viewport, especially around the barcode/category/brand/status area and unit table.

## 2. Layout Fix

Updated shared ProductForm/edit wrappers to contain width:

- Product form root now uses `w-full min-w-0 max-w-full overflow-x-hidden`.
- Main form grid now uses `min-w-0 max-w-full overflow-x-hidden`.
- Edit header action buttons now wrap.
- Create/edit cards now include `min-w-0 max-w-full overflow-hidden`.
- Product Images grid now uses `minmax(0, ...)` tracks.
- ProductEditClient wraps the edit form in a full-width, no-horizontal-overflow container.

Expected result:

- `/products/new` keeps its current layout.
- `/products/[id]/edit` aligns with create-page containment behavior.
- No page-level horizontal overflow from product edit cards.
- Wide Product Units table remains scrollable inside its own container.

## 3. Category Buttons Root Cause

The Category buttons in ProductForm were still connected to server category actions:

- `upsertCategoryAction`
- `deleteCategoryAction`

But Products/POS demo product data now uses the Phase A.0 central demo repository. This caused category UI actions to appear visible but not update the demo category source used by create/edit flows.

## 4. Category Action Fix

Added central demo category storage:

- Stable key: `ego.pos.categories`
- Repository: `demoCategoryRepository`

Implemented:

- Add category opens the existing modal and saves to `demoCategoryRepository`.
- New category appears immediately in ProductForm dropdown.
- Edit category updates repository category data.
- Edit category also updates `categoryName` for existing products using that `categoryId`.
- Delete category asks confirmation through the existing delete modal.
- Delete category is blocked when products still use it.
- Category field buttons are disabled when no category is selected.
- CategoryField updates its selected value when the category list changes.

No direct localStorage was added outside central storage helpers.

## 5. Integration Result

Product create/edit:

- Share `demoCategoryRepository`.
- Use the same category list in the form.

Products list:

- Now seeds/reads categories from `demoCategoryRepository`.
- Category filter can reflect newly created categories after repository update/reload.

POS:

- POS reads product category names from `demoProductsRepository`.
- When category rename updates product `categoryName`, POS category row reflects the updated product category after reload/focus.

## 6. Files Changed

Updated:

- `lib/demo/storage-keys.ts`
- `lib/demo/repositories.ts`
- `features/products/components/product-form.tsx`
- `features/products/components/product-edit-client.tsx`
- `features/products/components/product-list-client.tsx`

Created:

- `BUG_005_PRODUCT_EDIT_CATEGORY_FIX_REPORT.md`

## 7. Manual Test Steps

Layout:

1. Open `/products/new`.
2. Confirm layout still fits laptop width.
3. Create a product.
4. Open `/products/[id]/edit`.
5. Confirm no page-level horizontal scroll.
6. Confirm Product Units table scrolls only inside its own table area if needed.
7. Confirm barcode/category/brand/status fields stay inside the page container.

Category add:

1. Open `/products/new` or `/products/[id]/edit`.
2. Click `+` beside Category.
3. Enter a new category name.
4. Click Save.
5. Confirm new category appears in dropdown immediately.

Category edit:

1. Select a category in ProductForm.
2. Click edit icon.
3. Rename category.
4. Save.
5. Confirm dropdown shows new name.
6. Save product and check Products list/POS category text.

Category delete:

1. Select an unused category.
2. Click delete icon.
3. Confirm delete.
4. Confirm it disappears from dropdown.
5. Select a category used by a product.
6. Click delete and confirm.
7. Confirm clear warning appears and category is not deleted.

## 8. Verification Commands

`npm run typecheck`

- PASS

`npm run build`

- First run compiled and type-checked, then failed on Windows/OneDrive `.next` chunk lock:
  - `EBUSY: resource busy or locked`
- Cleared `.next` safely inside workspace.
- Second run: PASS

## 9. Remaining Limitations

- UI PASS requires user manual verification.
- `/products/categories` page still uses existing server category actions and was not changed because this task scoped category selector action buttons only.
- Category names are stored as the same text for Lao and English in the demo category modal for now.
- Localization polish was intentionally not done in this bug fix.
