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

export const SHELF_LABEL_PRESETS = [
  { heightMm: 30, id: "50x30", widthMm: 50 },
  { heightMm: 40, id: "60x40", widthMm: 60 },
  { heightMm: SHELF_LABEL_HEIGHT_MM, id: "70x40", widthMm: SHELF_LABEL_WIDTH_MM },
] as const;

export type ShelfLabelPresetId = (typeof SHELF_LABEL_PRESETS)[number]["id"] | "custom";
export type ShelfLayoutId = "balanced" | "compact" | "price";

export type ShelfLabelFields = {
  barcodeGraphic: boolean;
  barcodeText: boolean;
  productName: boolean;
  sellingPrice: boolean;
  sku: boolean;
  unitName: boolean;
};

export const DEFAULT_SHELF_LABEL_FIELDS: ShelfLabelFields = {
  barcodeGraphic: false,
  barcodeText: false,
  productName: true,
  sellingPrice: true,
  sku: false,
  unitName: true,
};

export type ShelfLabelStyle = {
  align: "center" | "left";
  barcodeScale: 1 | 2 | 3;
  layout: ShelfLayoutId;
  nameFontPx: number;
  priceFontPx: number;
  spacingPx: number;
  unitFontPx: number;
};

export type ShelfLabelOverride = {
  align?: "center" | "left";
  barcodeGraphic?: boolean;
  barcodeText?: boolean;
  displayName?: string;
  nameFontPx?: number;
  price?: boolean;
  priceFontPx?: number;
  productName?: boolean;
  sku?: boolean;
  unitFontPx?: number;
  unitName?: boolean;
};

export function shelfLayoutStyle(layout: ShelfLayoutId): ShelfLabelStyle {
  if (layout === "compact") {
    return { align: "center", barcodeScale: 1, layout, nameFontPx: 11, priceFontPx: 22, spacingPx: 1, unitFontPx: 9 };
  }
  if (layout === "balanced") {
    return { align: "left", barcodeScale: 1, layout, nameFontPx: 12, priceFontPx: 18, spacingPx: 2, unitFontPx: 10 };
  }
  return { align: "center", barcodeScale: 1, layout: "price", nameFontPx: 12, priceFontPx: 26, spacingPx: 2, unitFontPx: 11 };
}

export type ShelfLabelView = {
  align: "center" | "left";
  barcode: string;
  displayName: string;
  nameFontPx: number;
  priceFontPx: number;
  priceLak: number | null;
  showBarcode: boolean;
  showBarcodeText: boolean;
  showName: boolean;
  showNoBarcode: boolean;
  showPrice: boolean;
  showSku: boolean;
  showUnit: boolean;
  sku: string;
  spacingPx: number;
  unitFontPx: number;
  unitName: string;
};

export function resolveShelfLabelView(input: {
  fields: ShelfLabelFields;
  graphic: boolean;
  line: Pick<ShelfPrintChoice, "barcode" | "priceLak" | "sku" | "unitName">;
  localeName: string;
  override?: ShelfLabelOverride;
  style: ShelfLabelStyle;
}): ShelfLabelView {
  const override = input.override ?? {};
  const showGraphic = override.barcodeGraphic ?? input.fields.barcodeGraphic;
  const showText = override.barcodeText ?? input.fields.barcodeText;
  return {
    align: override.align ?? input.style.align,
    barcode: input.line.barcode,
    displayName: clean(override.displayName) || input.localeName,
    nameFontPx: override.nameFontPx ?? input.style.nameFontPx,
    priceFontPx: override.priceFontPx ?? input.style.priceFontPx,
    priceLak: input.line.priceLak,
    showBarcode: showGraphic && input.graphic,
    showBarcodeText: showText && input.line.barcode.length > 0,
    showName: override.productName ?? input.fields.productName,
    showNoBarcode: (showGraphic || showText) && input.line.barcode.length === 0,
    showPrice: override.price ?? input.fields.sellingPrice,
    showSku: (override.sku ?? input.fields.sku) && clean(input.line.sku).length > 0,
    showUnit: override.unitName ?? input.fields.unitName,
    sku: clean(input.line.sku),
    spacingPx: input.style.spacingPx,
    unitFontPx: override.unitFontPx ?? input.style.unitFontPx,
    unitName: input.line.unitName,
  };
}

export function resolveShelfLabelSize(preset: ShelfLabelPresetId, customWidth: string, customHeight: string) {
  if (preset !== "custom") {
    const match = SHELF_LABEL_PRESETS.find((item) => item.id === preset) ?? SHELF_LABEL_PRESETS[2]!;
    return { heightMm: match.heightMm, widthMm: match.widthMm };
  }
  const width = Number(customWidth);
  const height = Number(customHeight);
  return {
    heightMm: Number.isInteger(height) && height >= 20 && height <= 120 ? height : SHELF_LABEL_HEIGHT_MM,
    widthMm: Number.isInteger(width) && width >= 20 && width <= 120 ? width : SHELF_LABEL_WIDTH_MM,
  };
}

export type ShelfPrintChoice = {
  barcode: string;
  copies: number;
  graphic: boolean;
  labelReprintNeeded: boolean;
  missingPrice: boolean;
  nameEn: string;
  nameLo: string;
  priceLak: number | null;
  productId: string;
  sku: string;
  unitId: string;
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
    return [choice(shared, "Piece", "", product.barcode, product.sellingPriceLak, Boolean(product.labelReprintNeeded))];
  }
  return units
    .filter((unit) => isSellableCoverageUnit(unit))
    .map((unit) => choice(shared, clean(unit.unitName) || "Unit", clean(unit.id), unit.barcode, unit.sellingPriceLak, Boolean(unit.labelReprintNeeded)));
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
  unitId: string,
  barcodeValue: string | null | undefined,
  price: number | null | undefined,
  labelReprintNeeded: boolean,
): ShelfPrintChoice {
  const barcode = clean(barcodeValue);
  const priceLak = shelfSellingPrice(price);
  return {
    ...shared,
    barcode,
    copies: 1,
    graphic: Boolean(barcode) && encodeCode128B(barcode) !== null,
    labelReprintNeeded,
    missingPrice: priceLak === null,
    priceLak,
    unitId,
    unitName,
  };
}

function clean(value?: string | null) {
  return String(value ?? "").trim();
}
