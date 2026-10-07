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
  sellingPriceLak?: number | null;
  status?: string | null;
  unitName?: string | null;
};

export type BarcodePrintProduct = {
  barcode?: string | null;
  id: string;
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
    .map((unit) => choice(shared, clean(unit.unitName) || "Unit", unit.barcode, unit.sellingPriceLak));
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
