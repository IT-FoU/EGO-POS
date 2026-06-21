# Suppliers Module Phase A Update Report

Date: 19 Jun 2026

## What Was Added

- Supplier detail modal from the supplier list.
- Clickable supplier name opens the detail modal.
- View action opens the detail modal.
- Detail modal shows:
  - supplier code
  - company name
  - tax number
  - contact person
  - phone
  - email
  - address
  - credit limit
  - outstanding balance
  - payment terms
  - supplier rating
  - status
  - products supplied placeholder
  - purchase history placeholder
  - payment history placeholder
  - documents placeholder
- Supplier summary cards:
  - total purchases
  - total paid
  - outstanding balance
  - last purchase date
  - average monthly purchase
- Outstanding balance is clickable and opens an outstanding invoices modal.
- Outstanding invoices modal shows:
  - invoice number
  - purchase date
  - due date
  - original amount
  - paid amount
  - remaining amount
  - status
  - view purchase action
- Supplier documents UI placeholder:
  - tax certificate
  - business license
  - contract
  - bank account
  - other documents
- Supplier rating UI:
  - A, B, C, D
  - delivery reliability placeholder
  - product quality placeholder
  - credit behavior placeholder
- Supplier code suggestion:
  - `SUP-001`, `SUP-002`, `SUP-003`
  - manual override remains allowed.
- Supplier-product relationship placeholder:
  - linked products
  - preferred supplier
  - last purchase cost
  - supplier SKU/code
  - minimum order quantity
  - lead time days
- Search now supports:
  - supplier code
  - company name
  - contact person
  - phone
  - email
  - tax number
- Filters now support:
  - all statuses
  - active
  - inactive
  - has outstanding balance
  - credit limit exceeded
  - payment terms
- Supplier table now uses compact responsive columns:
  - supplier code
  - company name
  - contact person
  - phone
  - credit limit
  - outstanding
  - status
  - rating
  - actions

## What Remains UI Only

- Supplier documents upload/storage.
- Supplier-product relationship management.
- Supplier rating as a first-class database field.
- Delivery reliability, product quality, and credit behavior scoring.
- Outstanding invoices modal uses mock/demo placeholder rows until AP invoices are fully connected.

## What Is Connected

- Supplier list reads real/demo suppliers from the existing supplier service.
- Supplier create still writes through existing supplier action/repository.
- Payment terms now save through the existing `creditTerms` schema field.
- Purchase summary reads existing purchase/payment snapshots where available.
- Supplier status, credit limit, outstanding balance, and contact fields remain connected to existing supplier data.

## What Still Needs Purchasing Integration

- Supplier outstanding must be driven by supplier AP/invoice ledger.
- Purchasing must increase supplier outstanding after credit purchases.
- Supplier payments must reduce outstanding balance.
- Goods receiving should link supplier documents/invoices.
- Purchase order and goods receipt screens should link back to supplier profiles.
- Reports should aggregate supplier purchase/debt data from purchasing records.
- Dashboard should read supplier debt summary from the same source as reports.

## Duplicate Logic Risks

- Supplier outstanding currently exists on supplier records while payables also exist in schema. Final logic should choose ledger-driven outstanding as source of truth.
- Product supplier data must not duplicate Product module fields. Supplier-product relationship should reference `productId`.
- Supplier documents should not be stored in notes long-term.
- Supplier rating should not be inferred separately in multiple screens once persisted.

## GO / NO-GO For Real Supplier Management

NO-GO for full real supplier management.

Reason:

- Basic supplier profile creation/listing is connected.
- Phase A supplier UX is usable for review.
- Final supplier debt, invoice ledger, document upload, and supplier-product linking are not fully connected yet.

GO only after Purchasing/AP integration drives outstanding balances, supplier payments reduce payable balances, and supplier-product/document models are finalized.
