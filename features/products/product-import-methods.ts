import type { ProductImportColumn, ProductImportColumnChoice } from "@/features/products/product-import";

export type ImportMethod = "auto" | "letters" | "template";

export const EGO_TEMPLATE_HEADERS = [
  "No.",
  "Product Image",
  "Product Name",
  "Barcode",
  "SKU",
  "Category",
  "Unit",
  "Quantity",
  "Cost Price",
  "Selling Price",
  "Notes / Issues",
] as const;

export const IMPORT_DESTINATION_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;

export const IMPORT_LETTER_FIELDS = [
  { destination: "B", field: "image", labelKey: "importPreviewColImage" },
  { destination: "C", field: "product_name", labelKey: "importPreviewColName" },
  { destination: "D", field: "piece_barcode", labelKey: "importPreviewColBarcode" },
  { destination: "E", field: "sku", labelKey: "importPreviewColSku" },
  { destination: "F", field: "category", labelKey: "importPreviewColCategory" },
  { destination: "G", field: "opening_stock_unit", labelKey: "importPreviewColUnit" },
  { destination: "H", field: "opening_stock", labelKey: "importPreviewColQuantity" },
  { destination: "I", field: "piece_cost", labelKey: "importPreviewColCost" },
  { destination: "J", field: "piece_selling_price", labelKey: "importPreviewColPrice" },
  { destination: "K", field: "notes", labelKey: "importPreviewColNotes" },
] as const;

export type ImportLetterField = (typeof IMPORT_LETTER_FIELDS)[number]["field"];
export type ImportLetterMap = Partial<Record<ImportLetterField, string>>;

export type ImportPreviewNotice = {
  code: "duplicate_source" | "invalid_letter" | "missing_field" | "missing_product_name" | "template_mismatch";
  detail: string;
  sample: string;
};

export type LetterPlan = {
  choices: ProductImportColumnChoice[];
  noteIndex: number | null;
  notices: ImportPreviewNotice[];
  summary: Array<{ destination: ImportLetterField; source: string }>;
};

const TEMPLATE_FIELDS: Array<ProductImportColumn | "ignore" | "image" | "notes"> = [
  "ignore",
  "image",
  "product_name",
  "piece_barcode",
  "sku",
  "category",
  "opening_stock_unit",
  "opening_stock",
  "piece_cost",
  "piece_selling_price",
  "notes",
];

export function columnIndexFromLetter(letter: string) {
  const text = letter.trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(text)) return null;
  let value = 0;
  for (const char of text) value = value * 26 + (char.charCodeAt(0) - 64);
  if (value < 1 || value > 16384) return null;
  return value - 1;
}

export function columnLetterFromIndex(index: number) {
  let value = index + 1;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

export function matchEgoTemplate(rows: string[][]) {
  const limit = Math.min(rows.length, 8);
  for (let index = 0; index < limit; index += 1) {
    const cells = rows[index] ?? [];
    if (cells.slice(EGO_TEMPLATE_HEADERS.length).some((cell) => cell.trim() !== "")) continue;
    const headers = EGO_TEMPLATE_HEADERS.map((_, column) => (cells[column] ?? "").trim());
    if (!headers.every((header, column) => header === EGO_TEMPLATE_HEADERS[column])) continue;
    const choices: ProductImportColumnChoice[] = [];
    let noteIndex: number | null = null;
    TEMPLATE_FIELDS.forEach((field, column) => {
      if (field === "notes") noteIndex = column;
      else if (field === "image") choices.push({ field: "ignore", index: column });
      else choices.push({ field, index: column });
    });
    return { choices, headerIndex: index, noteIndex };
  }
  return null;
}

export function resolveLetterMap(letters: ImportLetterMap): LetterPlan {
  const parsed: Array<{ field: ImportLetterField; index: number; source: string }> = [];
  const notices: ImportPreviewNotice[] = [];
  for (const item of IMPORT_LETTER_FIELDS) {
    const raw = String(letters[item.field] ?? "").trim();
    if (!raw) continue;
    const index = columnIndexFromLetter(raw);
    if (index === null) {
      notices.push({ code: "invalid_letter", detail: `${item.field} ${raw}`, sample: "" });
      continue;
    }
    parsed.push({ field: item.field, index, source: columnLetterFromIndex(index) });
  }
  const grouped = new Map<number, typeof parsed>();
  for (const item of parsed) {
    const list = grouped.get(item.index) ?? [];
    list.push(item);
    grouped.set(item.index, list);
  }
  const choices: ProductImportColumnChoice[] = [];
  const summary: LetterPlan["summary"] = [];
  let noteIndex: number | null = null;
  const mapped = new Set<ImportLetterField>();
  for (const items of grouped.values()) {
    const first = items[0];
    if (!first) continue;
    if (items.length > 1) {
      notices.push({
        code: "duplicate_source",
        detail: items.map((item) => item.field).join(","),
        sample: first.source,
      });
      continue;
    }
    mapped.add(first.field);
    summary.push({ destination: first.field, source: first.source });
    if (first.field === "notes") noteIndex = first.index;
    else if (first.field === "image") choices.push({ field: "ignore", index: first.index });
    else choices.push({ field: first.field, index: first.index });
  }
  if (!mapped.has("product_name")) notices.push({ code: "missing_product_name", detail: "product_name", sample: "" });
  if (!mapped.has("piece_barcode") && !mapped.has("sku")) notices.push({ code: "missing_field", detail: "piece_barcode,sku", sample: "" });
  return { choices, noteIndex, notices, summary };
}

export function sanitizeImportMethod(value: unknown): ImportMethod {
  return value === "letters" || value === "template" ? value : "auto";
}

export function sanitizeImportLetters(value: unknown): ImportLetterMap {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const letters: ImportLetterMap = {};
  for (const item of IMPORT_LETTER_FIELDS) {
    const text = String(source[item.field] ?? "").trim().toUpperCase().slice(0, 3);
    if (text) letters[item.field] = text;
  }
  return letters;
}
