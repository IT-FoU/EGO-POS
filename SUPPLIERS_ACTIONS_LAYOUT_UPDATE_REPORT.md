# Suppliers Actions + Detail Layout Update Report

Date: 19 Jun 2026

## Layout Overflow Fixes

- Supplier detail page now uses `min-w-0`, `max-w-full`, and page-level `overflow-x-hidden`.
- Purchase Orders History, Receiving History, and Payment History cards now keep horizontal scroll inside the table container only.
- Main history tables were shortened for notebook screens.
- Long details were moved into View Detail modals.
- Summary card numbers use non-wrapping text so amounts display like `65,000,000 LAK` instead of breaking mid-number.

## New Summary Card Actions

Clickable supplier summary cards now open modal/list views:

- Active suppliers
- Total credit limit
- Outstanding balance
- Total purchases
- Total paid
- Average monthly purchase
- Last purchase date
- Suppliers with debt
- Credit exceeded
- Documents

Some modal values are placeholders until Purchasing/AP and document storage are fully integrated.

## History View Modals

Added detail modals for:

- Purchase Order rows
- Receiving rows
- Payment rows

The modals show compact operational details and include placeholder actions for future Purchasing/AP navigation.

## Products Supplied Section

Added Products Supplied card to supplier detail page.

Current status: UI placeholder / future integration.

Planned relationship:

- One supplier can supply many products.
- One product can have many suppliers.
- Relationship must reference `productId`.
- Do not duplicate Product module data.

Displayed placeholder fields:

- Product code / barcode
- Product name
- Supplier SKU
- Last purchase cost
- MOQ
- Lead time days
- Preferred
- Action

## Supplier Rating Changes

Added supplier rating block:

- Auto rating
- Manual rating override
- Final rating
- Rating explanation
- Last rating update

Current status: partially UI-only.

Auto rating is currently heuristic/demo-ready. Final calculation should use:

- Delivery reliability
- Product quality
- Credit behavior
- Return/damage rate
- Payment/debt behavior

## Quick Actions

Added supplier detail quick actions:

- Create Purchase Order
- Receive Goods
- Record Payment
- Supplier Ledger
- Edit Supplier
- Deactivate / Activate Supplier

Connected:

- Create Purchase Order routes to `/purchasing/new?supplierId=...`.
- Receive Goods routes to `/purchasing/receiving`.
- Edit Supplier uses the existing supplier detail route.

Placeholders:

- Record Payment
- Supplier Ledger final AP source
- Deactivate / Activate direct action shortcut

## Supplier Ledger Status

Added Supplier Ledger UI.

Current status: UI placeholder.

Ledger currently combines available purchase order, receiving, and payment snapshots for display. Final implementation must use a real AP ledger/source of truth and include:

- PO
- Goods received
- Payment
- Credit note
- Debit note
- Adjustment

## What Remains UI Only

- Products supplied relationship.
- Supplier documents.
- Supplier ledger as final source of truth.
- Auto rating calculation from real supplier performance metrics.
- Record payment modal/write.
- Summary modal AP invoice rows.

## What Needs Purchasing Integration Later

- Supplier outstanding must be driven by AP invoices/payables.
- Purchasing must increase supplier outstanding for credit purchases.
- Supplier payments must reduce outstanding.
- Goods receiving must link supplier documents/invoices.
- Purchase/receiving/payment detail buttons should route to exact records.
- Reports and Dashboard must read supplier debt from the same ledger.

## Build / Typecheck Result

- `npm run typecheck`: PASS
- `npm run build`: PASS

Note: the first build attempt hit a Windows/OneDrive `.next` file lock (`EBUSY`) on an unrelated generated chunk. After a safe workspace `.next` cleanup attempt, the rerun completed successfully.
