import { encodeCode128B, BARCODE_PRINT_MAX_LABELS, type BarcodePrintProduct } from "@/features/products/barcode-print";
import { isSellableCoverageUnit } from "@/features/products/unit-coverage";

/**
 * Shelf labels are price-first. They reuse the barcode print quantity cap
 * and CODE 128 renderer, and they do not invent prices or barcodes.
 * A missing barcode still prints. A missing selling price does not.
 * One label is 70mm × 40mm.
 */
export const SHELF_LABEL_WIDTH_MM = 70;
export const SHELF_LABEL_HEIGHT_MM = 40;

export type ShelfPrintChoice = {
  barcode: string;
  copies: number;
  graphic: boolean;
  missingPrice: boolean;
  nameEn: string;
  nameLo: string;
  priceLak: number | null;
  productId: string;
  sku: string;
  unitName: string;
};

export function shelfSellingPrice(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return null;
  return Math.round(price);
}

export function shelfPrintUnits(product: BarcodePrintProduct): ShelfPrintChoice[] {
  const shared = {
    nameEn: clean(product.nameEn),
    nameLo: clean(product.nameLo),
    productId: product.id,
    sku: clean(product.sku),
  };
  const units = product.units ?? [];
  if (units.length === 0) {
    return [choice(shared, "Piece", product.barcode, product.sellingPriceLak)];
  }
  return units
    .filter((unit) => isSellableCoverageUnit(unit))
    .map((unit) => choice(shared, clean(unit.unitName) || "Unit", unit.barcode, unit.sellingPriceLak));
}

export function buildShelfPrintJob(lines: ShelfPrintChoice[]) {
  const blocked = lines.filter((line) => line.missingPrice || line.priceLak === null || line.copies < 1);
  const printable = lines.filter((line) => !line.missingPrice && line.priceLak !== null && line.copies >= 1);
  const total = printable.reduce((sum, line) => sum + line.copies, 0);
  return {
    blocked,
    overLimit: total > BARCODE_PRINT_MAX_LABELS,
    printable,
    total,
  };
}

function choice(
  shared: Pick<ShelfPrintChoice, "nameEn" | "nameLo" | "productId" | "sku">,
  unitName: string,
  barcodeValue: string | null | undefined,
  price: number | null | undefined,
): ShelfPrintChoice {
  const barcode = clean(barcodeValue);
  const priceLak = shelfSellingPrice(price);
  return {
    ...shared,
    barcode,
    copies: 1,
    graphic: Boolean(barcode) && encodeCode128B(barcode) !== null,
    missingPrice: priceLak === null,
    priceLak,
    unitName,
  };
}

function clean(value?: string | null) {
  return String(value ?? "").trim();
}
