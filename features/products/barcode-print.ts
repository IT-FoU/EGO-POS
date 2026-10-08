/**
 * Barcode labels use CODE 128 set B, which encodes ASCII 32–126.
 * POS still accepts any non-empty barcode. A saved value outside that range
 * is shown as not printable instead of drawing a broken symbol.
 * There is no EAN length rule.
 *
 * Labels are 50mm × 30mm, one label per page, for a common thermal label printer.
 */
export const BARCODE_LABEL_WIDTH_MM = 50;
export const BARCODE_LABEL_HEIGHT_MM = 30;
export const BARCODE_PRINT_MAX_QTY = 100;
export const BARCODE_PRINT_MAX_LABELS = 200;

const CODE128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

export type BarcodeModule = { ink: boolean; width: number };

export type BarcodePrintUnit = {
  allowManualUnitSelect?: boolean;
  barcode?: string | null;
  id?: string | null;
  labelReprintNeeded?: boolean;
  sellingPriceLak?: number | null;
  status?: string | null;
  unitName?: string | null;
};

export type BarcodePrintProduct = {
  barcode?: string | null;
  id: string;
  labelReprintNeeded?: boolean;
  nameEn?: string | null;
  nameLo?: string | null;
  sellingPriceLak?: number | null;
  sku?: string | null;
  units?: BarcodePrintUnit[] | null;
};

export type BarcodePrintChoice = {
  barcode: string;
  copies: number;
  encodable: boolean;
  missing: boolean;
  nameEn: string;
  nameLo: string;
  priceLak: number;
  productId: string;
  sku: string;
  unitName: string;
};

export function encodeCode128B(value: string): BarcodeModule[] | null {
  if (!value) return null;
  const symbols = [START_B];
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) return null;
    symbols.push(code - 32);
  }
  let checksum = symbols[0] ?? 0;
  for (let index = 1; index < symbols.length; index += 1) {
    checksum += (symbols[index] ?? 0) * index;
  }
  symbols.push(checksum % 103, STOP);
  const modules: BarcodeModule[] = [{ ink: false, width: 10 }];
  for (const symbol of symbols) {
    const pattern = CODE128[symbol];
    if (!pattern) return null;
    let ink = true;
    for (const digit of pattern) {
      modules.push({ ink, width: Number(digit) });
      ink = !ink;
    }
  }
  modules.push({ ink: false, width: 10 });
  return modules;
}

export function code128PatternTable() {
  return CODE128;
}

export function parsePrintQuantity(value: string) {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const qty = Number(text);
  if (!Number.isInteger(qty) || qty < 1 || qty > BARCODE_PRINT_MAX_QTY) return null;
  return qty;
}

export function barcodePrintUnits(product: BarcodePrintProduct): BarcodePrintChoice[] {
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
    .filter((unit) => (unit.status ?? "active") !== "inactive" && unit.allowManualUnitSelect !== false)
    .map((unit) => choice(shared, clean(unit.unitName) || "Unit", unit.barcode, unit.sellingPriceLak))
    .sort((left, right) => comparePrintUnitNames(left.unitName, right.unitName));
}

export const BARCODE_LABEL_PRESETS = [
  { heightMm: 25, id: "40x25", widthMm: 40 },
  { heightMm: BARCODE_LABEL_HEIGHT_MM, id: "50x30", widthMm: BARCODE_LABEL_WIDTH_MM },
  { heightMm: 40, id: "60x40", widthMm: 60 },
] as const;

export const BARCODE_LABEL_MM_MIN = 20;
export const BARCODE_LABEL_MM_MAX = 120;
export const BARCODE_NAME_MIN_FONT_PX = 8;
export const BARCODE_NAME_MAX_FONT_PX = 30;
export const BARCODE_PRICE_MIN_FONT_PX = 8;
export const BARCODE_PRICE_MAX_FONT_PX = 30;
export const BARCODE_SCALE_MAX = 5;

export type BarcodeLabelPresetId = (typeof BARCODE_LABEL_PRESETS)[number]["id"] | "custom";

export type BarcodeLabelFields = {
  barcodeGraphic: boolean;
  barcodeText: boolean;
  productName: boolean;
  sellingPrice: boolean;
  sku: boolean;
  unitName: boolean;
};

export const DEFAULT_BARCODE_LABEL_FIELDS: BarcodeLabelFields = {
  barcodeGraphic: true,
  barcodeText: true,
  productName: true,
  sellingPrice: false,
  sku: false,
  unitName: true,
};

export type BarcodeLabelLayout = {
  align: "center" | "left";
  barcodeScale: 1 | 2 | 3 | 4 | 5;
  nameFontPx: number;
  priceFontPx: number;
  spacingPx: number;
};

export const DEFAULT_BARCODE_LABEL_LAYOUT: BarcodeLabelLayout = {
  align: "center",
  barcodeScale: 2,
  nameFontPx: 12,
  priceFontPx: 11,
  spacingPx: 2,
};

export type BarcodeLabelOverride = {
  align?: "center" | "left";
  barcodeText?: boolean;
  displayName?: string;
  nameFontPx?: number;
  price?: boolean;
  productName?: boolean;
  sku?: boolean;
  unitName?: boolean;
};

export type BarcodeLabelView = {
  align: "center" | "left";
  barcode: string;
  displayName: string;
  fontPx: number;
  overflow: boolean;
  priceLak: number;
  showBarcode: boolean;
  showBarcodeText: boolean;
  showName: boolean;
  showPrice: boolean;
  showSku: boolean;
  showUnit: boolean;
  sku: string;
  spacingPx: number;
  unitName: string;
};

export function parseLabelMillimetres(value: string) {
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const mm = Number(text);
  if (!Number.isInteger(mm) || mm < BARCODE_LABEL_MM_MIN || mm > BARCODE_LABEL_MM_MAX) return null;
  return mm;
}

export function resolveBarcodeLabelSize(preset: BarcodeLabelPresetId, customWidth: string, customHeight: string) {
  if (preset !== "custom") {
    const match = BARCODE_LABEL_PRESETS.find((item) => item.id === preset) ?? BARCODE_LABEL_PRESETS[1]!;
    return { heightMm: match.heightMm, widthMm: match.widthMm };
  }
  return {
    heightMm: parseLabelMillimetres(customHeight) ?? BARCODE_LABEL_HEIGHT_MM,
    widthMm: parseLabelMillimetres(customWidth) ?? BARCODE_LABEL_WIDTH_MM,
  };
}

const PRINT_ROLE_ORDER = { piece: 0, pack: 1, box: 2, custom: 3 } as const;

export function unitPrintRole(unitName: string) {
  const value = unitName.trim().toLowerCase();
  if (value === "piece") return "piece";
  if (value === "pack") return "pack";
  if (value === "box") return "box";
  return "custom";
}

export function comparePrintUnitNames(left: string, right: string) {
  const diff = PRINT_ROLE_ORDER[unitPrintRole(left)] - PRINT_ROLE_ORDER[unitPrintRole(right)];
  if (diff !== 0) return diff;
  return left.localeCompare(right);
}

export function fitBarcodeLabelName(name: string, widthMm: number, fontPx: number, maxFontPx = BARCODE_NAME_MAX_FONT_PX) {
  const size = clamp(Math.round(fontPx), BARCODE_NAME_MIN_FONT_PX, maxFontPx);
  const lines = nameLines(name, widthMm, size);
  if (lines <= 3) return { fontPx: size, overflow: false };
  for (let next = size - 1; next >= BARCODE_NAME_MIN_FONT_PX; next -= 1) {
    if (nameLines(name, widthMm, next) <= 3) return { fontPx: next, overflow: false };
  }
  return { fontPx: BARCODE_NAME_MIN_FONT_PX, overflow: nameLines(name, widthMm, BARCODE_NAME_MIN_FONT_PX) > 3 };
}

export function resolveBarcodeLabelView(input: {
  fields: BarcodeLabelFields;
  layout: BarcodeLabelLayout;
  line: Pick<BarcodePrintChoice, "barcode" | "priceLak" | "sku" | "unitName">;
  localeName: string;
  override?: BarcodeLabelOverride;
}): BarcodeLabelView {
  const override = input.override ?? {};
  const displayName = clean(override.displayName) || input.localeName;
  const requestedFont = override.nameFontPx ?? input.layout.nameFontPx;
  return {
    align: override.align ?? input.layout.align,
    barcode: input.line.barcode,
    displayName,
    fontPx: requestedFont,
    overflow: false,
    priceLak: input.line.priceLak,
    showBarcode: input.fields.barcodeGraphic,
    showBarcodeText: override.barcodeText ?? input.fields.barcodeText,
    showName: override.productName ?? input.fields.productName,
    showPrice: override.price ?? input.fields.sellingPrice,
    showSku: (override.sku ?? input.fields.sku) && clean(input.line.sku).length > 0,
    showUnit: override.unitName ?? input.fields.unitName,
    sku: clean(input.line.sku),
    spacingPx: input.layout.spacingPx,
    unitName: input.line.unitName,
  };
}

export function applyLabelFit(view: BarcodeLabelView, widthMm: number): BarcodeLabelView {
  if (!view.showName) return { ...view, overflow: false };
  const fit = fitBarcodeLabelName(view.displayName, widthMm, view.fontPx);
  return { ...view, fontPx: fit.fontPx, overflow: fit.overflow };
}

export function buildBarcodePrintJob(lines: BarcodePrintChoice[]) {
  const blocked = lines.filter((line) => line.missing || !line.encodable || line.copies < 1);
  const printable = lines.filter((line) => !line.missing && line.encodable && line.copies >= 1);
  const total = printable.reduce((sum, line) => sum + line.copies, 0);
  return {
    blocked,
    overLimit: total > BARCODE_PRINT_MAX_LABELS,
    printable,
    total,
  };
}

function choice(
  shared: Pick<BarcodePrintChoice, "nameEn" | "nameLo" | "productId" | "sku">,
  unitName: string,
  barcodeValue: string | null | undefined,
  price: number | null | undefined,
): BarcodePrintChoice {
  const barcode = clean(barcodeValue);
  return {
    ...shared,
    barcode,
    copies: 1,
    encodable: Boolean(barcode) && encodeCode128B(barcode) !== null,
    missing: !barcode,
    priceLak: Number.isFinite(Number(price)) ? Math.round(Number(price)) : 0,
    unitName,
  };
}

function clean(value?: string | null) {
  return String(value ?? "").trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nameLines(name: string, widthMm: number, fontPx: number) {
  const text = name.trim();
  if (!text) return 1;
  const charsPerLine = Math.max(4, Math.floor((Math.max(widthMm, 20) - 4) / Math.max(1.4, fontPx * 0.22)));
  return Math.ceil(text.length / charsPerLine);
}
