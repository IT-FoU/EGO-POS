# Printer Architecture Requirement

## Purpose

EGO POS must support the current GO BOX dedicated sticker barcode printer while remaining compatible with future printer types, brands, label sizes, and output modes.

This is an architecture requirement. It should guide the later Settings, Products, POS receipt, Reports, Purchasing, and Inventory printing implementations.

## Core Rule

Printer type must be configurable per branch and per print job.

Do not lock the system to one printer brand.

Use generic printer profiles first. Add brand-specific profiles later only where needed.

## Current Hardware Priority

GO BOX has a dedicated sticker barcode printer.

Primary label printing must support sticker barcode printers for product barcode labels.

## Supported Printer Types

1. Sticker / barcode label printer
2. Receipt thermal printer
   - 58mm
   - 80mm
3. A4 document printer
   - Reports
   - Purchase orders
   - Documents
   - Sheet label printing
4. Price tag / shelf label printer

## Supported Sticker / Barcode Printer Profiles

- Generic thermal label printer
- Xprinter
- Zebra
- TSC
- Godex

## Supported Connection Types

- USB
- LAN / IP printer
- Bluetooth
- Windows installed printer
- Browser print dialog fallback

## Supported Label Sizes

- 40x30 mm
- 50x30 mm
- 60x40 mm
- 70x50 mm
- 100x50 mm
- Custom width/height

## Template Output Modes

- Direct thermal label print
- Browser print preview
- PDF export
- A4 sticker sheet layout

## Required Future Data Model

### PrinterProfile

- `printerProfileId`
- `companyId`
- `branchId`
- `name`
- `printerType`
- `brandProfile`
- `connectionType`
- `ipAddress`
- `windowsPrinterName`
- `paperWidthMm`
- `paperHeightMm`
- `defaultForJobTypes`
- `active`

### LabelTemplate

- `labelTemplateId`
- `companyId`
- `branchId`
- `name`
- `labelWidthMm`
- `labelHeightMm`
- `outputMode`
- `templateJson`
- `active`

### PrintJob

- `printJobId`
- `companyId`
- `branchId`
- `printerProfileId`
- `labelTemplateId`
- `jobType`
- `sourceModule`
- `sourceRecordId`
- `status`
- `requestedBy`
- `createdAt`
- `completedAt`
- `errorMessage`

## Print Job Types

- Product barcode label
- Product unit barcode label
- Shelf price tag
- POS receipt
- Refund receipt
- Daily close report
- Inventory report
- Purchase order
- Goods receiving slip
- Supplier document
- A4 sticker sheet

## Module Integration

### Products

- Print product barcode labels.
- Print unit-specific barcode labels.
- Print shelf labels using product/unit price.

### POS

- Print 58mm/80mm receipts.
- Reprint receipts.
- Print refund receipts.

### Inventory

- Print stock labels after stock-in or receiving.
- Print expiry/lot labels if needed.

### Purchasing

- Print purchase orders.
- Print receiving slips.

### Reports

- Print reports.
- Export reports to PDF.
- Use A4 printer or browser print fallback.

### Settings

- Manage printer profiles.
- Manage label sizes.
- Manage default printer per branch and print job type.
- Test print.

## Permission Requirements

- `settings.printer.manage`
- `print.barcodeLabel`
- `print.shelfLabel`
- `print.receipt`
- `print.report`
- `print.purchaseOrder`
- `print.document`

## Audit Log Events

- Printer profile created
- Printer profile edited
- Printer profile disabled
- Printer profile deleted
- Label template created
- Label template edited
- Print job created
- Print job completed
- Print job failed
- Test print executed

## Implementation Notes

- Browser-only printing should start with print preview and PDF export.
- Direct USB/Bluetooth/LAN thermal printing may require a local print bridge, native helper, or OS print integration.
- Brand-specific command languages such as ZPL, TSPL, EPL, or ESC/POS should be isolated behind printer profile adapters.
- A4 sticker sheet layout must remain separate from direct thermal label print layout.

## Status

Requirement captured. Implementation not started.
