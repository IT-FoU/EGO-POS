# EGO POS Printing Specification

## 1. Purpose

This document defines printing support for receipts, barcode labels, price labels, shelf labels, reports, purchase orders, and documents.

## 2. Printer Types

Receipt thermal printer:

- 58mm
- 80mm

Sticker / Barcode label printer:

- Xprinter
- Zebra
- TSC
- Godex
- Generic thermal label printer

A4 document printer:

- Reports
- Purchase orders
- Documents
- A4 sticker sheet layout

Price tag / shelf label printer:

- Product name + price
- Barcode optional
- Shelf label layouts

## 3. Connection Types

Supported profiles:

- USB
- LAN/IP printer
- Bluetooth
- Windows installed printer
- Browser print dialog fallback

Initial implementation should use generic printer profiles first. Brand-specific commands can be added later.

## 4. Printer Profile Fields

Printer profile:

- printerId
- companyId
- branchId
- name
- printerType
- brandProfile
- connectionType
- ipAddress
- port
- windowsPrinterName
- paperWidth
- paperHeight
- dpi
- active
- defaultForJobTypes

Job types:

- receipt
- barcode_label
- price_label
- shelf_label
- purchase_order
- goods_receiving
- report
- document

## 5. Label Sizes

Preset sizes:

- 40x30 mm
- 50x30 mm
- 60x40 mm
- 70x50 mm
- 100x50 mm

Custom:

- width mm
- height mm
- margin
- gap
- columns/rows for A4 sheet

## 6. Barcode Label Templates

Label can include:

- Product name
- SKU
- Barcode
- Barcode graphic
- Price
- Unit
- Company/store name
- Category
- Expiry date
- Lot number

Required workflow:

1. Select product(s).
2. Select unit.
3. Select label template.
4. Enter quantity of labels.
5. Preview.
6. Print/PDF/export.

## 7. Price Label Templates

Price label can include:

- Product name
- Price
- Unit
- Barcode optional
- Promotion price optional
- Member price optional

Required simple action:

- Print name + price only.
- Optional barcode toggle.

## 8. Receipt Printing

Receipt content:

- Logo
- Store name
- Address/phone
- Receipt number
- Date/time
- Cashier
- Items
- Discounts
- VAT
- Payment method
- QR if enabled
- Footer

Receipt settings drive receipt output.

## 9. Document Printing

Documents:

- Reports
- Purchase orders
- Goods receiving
- Supplier ledger
- Customer statement
- Stock count sheet

Output modes:

- Browser print preview
- PDF export
- A4 print

## 10. Print Job Flow

1. Module creates print request.
2. Print service resolves branch default printer for job type.
3. Template renderer creates output.
4. Output mode is selected.
5. Print job is logged.
6. Failure creates retryable error.

## 11. Audit Requirements

Log:

- Printed receipt
- Reprinted receipt
- Printed barcode labels
- Printed price labels
- Printed purchase order
- Printed report
- Printer settings changed

## 12. Future Brand-Specific Profiles

Generic output first:

- Browser print
- PDF
- Generic thermal layout

Later:

- Zebra ZPL
- TSC TSPL
- ESC/POS receipt commands
- Xprinter profile
- Godex profile
