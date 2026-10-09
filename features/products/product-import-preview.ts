import { PRODUCT_IMPORT_LARGE_MAX_BYTES } from "@/features/products/product-import-large";
import { assignEmbeddedImages, type EmbeddedImageAnchor } from "@/features/products/product-import-images";
import { downscalePreviewImage } from "@/features/products/product-import-preview-image";
import {
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_IMPORT_MAX_CHARS,
  applyProductImportChoices,
  inferHeaderlessProductColumns,
  productImportHeaderScore,
  promoteLargePreviewColumns,
  refinePreviewItemNumberColumns,
  resolveProductImportColumns,
  type ProductImportColumn,
  type ProductImportColumnChoice,
  type ProductImportMappedColumn,
} from "@/features/products/product-import";
import {
  columnLetterFromIndex,
  matchEgoTemplate,
  resolveLetterMap,
  sanitizeImportLetters,
  sanitizeImportMethod,
  type ImportLetterMap,
  type ImportMethod,
  type ImportPreviewNotice,
} from "@/features/products/product-import-methods";

export const PREVIEW_PAGE_SIZES = [20, 50, 100] as const;
export type PreviewPageSize = (typeof PREVIEW_PAGE_SIZES)[number];
export const PREVIEW_PAGE_SIZE_STORAGE_KEY = "ego-import-preview-page-size";
export const PREVIEW_RESPONSE_MAX_BYTES = 180_000;
export const PREVIEW_CELL_MAX_CHARS = 120;
export const PREVIEW_THUMB_MAX_BYTES = 24_576;

export type PreviewFilter = "all" | "duplicate" | "incomplete" | "needs_review" | "new";
export type PreviewRowStatus = "duplicate" | "incomplete" | "needs_review" | "new";

export type PreviewCatalogItem = {
  barcode: string;
  productName: string;
  sku: string;
  unit: string;
};

export type PreviewEdit = {
  field: "box_barcode" | "category" | "notes" | "opening_stock" | "opening_stock_unit" | "pack_barcode" | "piece_barcode" | "piece_cost" | "piece_selling_price" | "product_name" | "sku";
  rowNumber: number;
  value: string;
};

export const PREVIEW_EDIT_LIMIT = 200;

export type LargeImportPreview = {
  categories: string[];
  columns: ProductImportMappedColumn[];
  counts: {
    duplicate: number;
    imageMatched: number;
    imageNeedsReview: number;
    incomplete: number;
    needsReview: number;
    newProducts: number;
    totalRows: number;
  };
  excel: {
    headers: string[];
    page: number;
    pageCount: number;
    rows: Array<{ cells: string[]; rowNumber: number; thumb: string | null }>;
  };
  letterSummary: Array<{ destination: string; source: string }>;
  method: ImportMethod;
  notices: ImportPreviewNotice[];
  mapped: {
    page: number;
    pageCount: number;
    pageSize: number;
    rows: Array<{
      barcode: string;
      category: string | null;
      cost: string | null;
      issue: string;
      match: { productName: string; unit: string } | null;
      name: string;
      note: string;
      price: string | null;
      rowNumber: number;
      sequence: number;
      sku: string;
      status: PreviewRowStatus;
      stock: string | null;
      thumb: string | null;
      unit: string;
    }>;
  };
  sheetName: string;
};

const BARCODE_OK = /^[0-9A-Za-z._-]{4,32}$/;

export function normalizePreviewPageSize(value: unknown): PreviewPageSize {
  const parsed = Number(value);
  return PREVIEW_PAGE_SIZES.includes(parsed as PreviewPageSize) ? parsed as PreviewPageSize : 20;
}

export function readStoredPreviewPageSize(storage: { getItem(key: string): string | null }) {
  return normalizePreviewPageSize(storage.getItem(PREVIEW_PAGE_SIZE_STORAGE_KEY));
}

export const IMPORT_IMAGES_STORAGE_KEY = "ego-pos-import-images";

export function readImportImagesPreference(storage: { getItem(key: string): string | null }) {
  return storage.getItem(IMPORT_IMAGES_STORAGE_KEY) !== "0";
}

export function detectPreviewHeaderIndex(rows: string[][]) {
  let bestIndex = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, 8);
  for (let index = 0; index < limit; index += 1) {
    const score = productImportHeaderScore(rows[index] ?? []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestScore >= 1 ? bestIndex : -1;
}

export type ImportSurface = "rejected" | "unified-parse" | "unified-upload";

export function chooseImportSurface(fileName: string, size: number): ImportSurface {
  const extension = fileName.trim().toLowerCase().split(".").pop() ?? "";
  if (!Number.isInteger(size) || size < 1) return "rejected";
  if (extension === "xlsx") return size > PRODUCT_IMPORT_LARGE_MAX_BYTES ? "rejected" : "unified-upload";
  if (extension === "csv" || extension === "tsv" || extension === "xls" || extension === "ods") {
    return size > PRODUCT_IMPORT_MAX_CHARS ? "rejected" : "unified-parse";
  }
  return "rejected";
}

export function previewSourceRowNumbers(rows: string[][]) {
  const headerIndex = detectPreviewHeaderIndex(rows);
  return rows.flatMap((cells, index) => index > headerIndex && cells.some((cell) => cell.trim() !== "") ? [index + 1] : []);
}

export function buildLargeImportPreview(input: {
  catalog: PreviewCatalogItem[];
  categories?: string[];
  choices?: ProductImportColumnChoice[];
  edits?: PreviewEdit[];
  filter?: PreviewFilter;
  images?: EmbeddedImageAnchor[];
  letters?: ImportLetterMap;
  mappedPage?: number;
  method?: ImportMethod;
  page?: number;
  pageSize?: PreviewPageSize;
  rows: string[][];
  sheetName: string;
}): LargeImportPreview {
  const pageSize = normalizePreviewPageSize(input.pageSize ?? 20);
  const filter = input.filter ?? "all";
  const requestedMethod = sanitizeImportMethod(input.method);
  const exactTemplate = requestedMethod === "letters" ? null : matchEgoTemplate(input.rows);
  const method: ImportMethod = requestedMethod === "auto" && exactTemplate ? "template" : requestedMethod;
  const detectedHeader = detectPreviewHeaderIndex(input.rows);
  const template = method === "template" ? exactTemplate : null;
  const letters = method === "letters" ? resolveLetterMap(sanitizeImportLetters(input.letters)) : null;
  const headerIndex = template ? template.headerIndex : detectedHeader;
  const noteIndex = template?.noteIndex ?? letters?.noteIndex ?? null;
  const table = input.rows.map((cells, index) => ({ cells, lineNumber: index + 1 }));
  const columns = columnsForMethod(input.rows, table, headerIndex, method, template?.choices, letters?.choices, input.choices);
  const columnIndex = new Map<ProductImportColumn, number>();
  for (const column of columns) {
    if (column.status === "mapped" && column.choice && column.choice !== "ignore") columnIndex.set(column.choice, column.index);
  }
  const noteByRow = new Map<number, string>();
  const edits = (input.edits ?? []).slice(0, PREVIEW_EDIT_LIMIT);
  const sourceRows = table.slice(headerIndex + 1).filter((row) => row.cells.some((cell) => cell.trim() !== "")).map((row) => {
    const values = Object.fromEntries(PRODUCT_IMPORT_COLUMNS.map((column) => {
      const index = columnIndex.get(column);
      return [column, index === undefined ? "" : (row.cells[index] ?? "").trim()];
    })) as Partial<Record<ProductImportColumn, string>>;
    if (noteIndex !== null && !noteByRow.has(row.lineNumber)) {
      const note = (row.cells[noteIndex] ?? "").trim();
      if (note) noteByRow.set(row.lineNumber, note.slice(0, PREVIEW_CELL_MAX_CHARS));
    }
    for (const edit of edits) {
      if (edit.rowNumber !== row.lineNumber) continue;
      if (edit.field === "notes") noteByRow.set(row.lineNumber, edit.value.slice(0, PREVIEW_CELL_MAX_CHARS));
      else values[edit.field] = edit.value.trim().slice(0, PREVIEW_CELL_MAX_CHARS);
    }
    return { rowNumber: row.lineNumber, values };
  });
  const images = assignEmbeddedImages(input.images ?? [], sourceRows.map((row) => row.rowNumber));
  const imageByRow = new Map<number, { review: boolean; thumb: string | null }>();
  let imageMatched = 0;
  let imageNeedsReview = 0;
  for (const image of images) {
    const thumb = image.status === "mapped" && image.source?.byteLength ? downscalePreviewImage(image.source) : null;
    const review = image.status === "review" || (image.status === "mapped" && image.source?.byteLength ? !thumb : false);
    if (review) imageNeedsReview += 1;
    else imageMatched += 1;
    if (image.rowNumber === null) continue;
    const current = imageByRow.get(image.rowNumber) ?? { review: false, thumb: null };
    if (review) {
      current.review = true;
      current.thumb = null;
    } else if (thumb) current.thumb = thumb;
    imageByRow.set(image.rowNumber, current);
  }

  const classified = classifyRows(sourceRows, input.catalog, input.categories ?? [], imageByRow, noteByRow, method);
  const counts = {
    duplicate: classified.filter((row) => row.status === "duplicate").length,
    imageMatched,
    imageNeedsReview,
    incomplete: classified.filter((row) => row.status === "incomplete").length,
    needsReview: classified.filter((row) => row.status === "needs_review").length,
    newProducts: classified.filter((row) => row.status === "new").length,
    totalRows: classified.length,
  };
  const excelRows = input.rows.slice(headerIndex + 1).map((cells, index) => ({
    cells: cells.map(clipCell),
    rowNumber: headerIndex + index + 2,
    thumb: imageByRow.get(headerIndex + index + 2)?.thumb ?? null,
  }));
  const visible = classified.filter((row) => filter === "all" || row.status === filter);
  const excelPage = slicePage(excelRows, input.page ?? 0, pageSize);
  const mappedPage = slicePage(visible, input.mappedPage ?? 0, pageSize);
  const notices = [
    ...(template || method !== "template" ? [] : [{ code: "template_mismatch" as const, detail: "EGO POS template", sample: (input.rows[0] ?? []).slice(0, 11).join(" | ") }]),
    ...(letters?.notices ?? []),
    ...(method === "auto" ? criticalFieldNotices(columns) : []),
  ];
  const preview: LargeImportPreview = {
    categories: (input.categories ?? []).slice(0, 200),
    columns,
    counts,
    letterSummary: letters?.summary ?? [],
    method,
    notices,
    excel: {
      headers: (headerIndex < 0 ? [] : input.rows[headerIndex] ?? []).map(clipCell),
      page: excelPage.page,
      pageCount: excelPage.pageCount,
      rows: excelPage.rows,
    },
    mapped: {
      page: mappedPage.page,
      pageCount: mappedPage.pageCount,
      pageSize,
      rows: mappedPage.rows.map((row, index) => ({ ...row, sequence: mappedPage.page * pageSize + index + 1, thumb: imageByRow.get(row.rowNumber)?.thumb ?? null })),
    },
    sheetName: input.sheetName,
  };
  return fitPreviewPayload(preview);
}

function fitPreviewPayload(preview: LargeImportPreview): LargeImportPreview {
  if (Buffer.byteLength(JSON.stringify(preview)) <= PREVIEW_RESPONSE_MAX_BYTES) return preview;
  const counts = { ...preview.counts };
  const rows = preview.mapped.rows.map((row) => ({ ...row }));
  for (const row of rows) {
    if (!row.thumb) continue;
    row.thumb = null;
    if (!row.issue.includes("Image needs review")) row.issue = [row.issue, "Image needs review"].filter(Boolean).join(". ");
    if (row.status === "new") {
      counts.newProducts -= 1;
      counts.needsReview += 1;
      row.status = "needs_review";
    } else if (row.status === "incomplete") {
      counts.incomplete -= 1;
      counts.needsReview += 1;
      row.status = "needs_review";
    }
    counts.imageMatched = Math.max(0, counts.imageMatched - 1);
    counts.imageNeedsReview += 1;
  }
  const fitted: LargeImportPreview = {
    ...preview,
    counts,
    excel: { ...preview.excel, rows: preview.excel.rows.map((row) => ({ ...row, thumb: null })) },
    mapped: { ...preview.mapped, rows },
  };
  if (Buffer.byteLength(JSON.stringify(fitted)) > PREVIEW_RESPONSE_MAX_BYTES) throw new Error("preview_limit");
  return fitted;
}

function columnsForMethod(
  rows: string[][],
  table: Array<{ cells: string[]; lineNumber: number }>,
  headerIndex: number,
  method: ImportMethod,
  templateChoices: ProductImportColumnChoice[] | undefined,
  letterChoices: ProductImportColumnChoice[] | undefined,
  autoChoices: ProductImportColumnChoice[] | undefined,
) {
  if (method === "template" && !templateChoices) return blankReviewColumns(rows, headerIndex);
  if (method === "template" && templateChoices) return headerIndex < 0
    ? applyProductImportChoices(inferHeaderlessProductColumns(rows), templateChoices)
    : resolveProductImportColumns(table.slice(headerIndex), templateChoices);
  if (method === "letters") {
    const explicit = letterChoices?.length ? letterChoices : [{ field: null, index: 0 }];
    return headerIndex < 0
      ? applyProductImportChoices(inferHeaderlessProductColumns(rows), explicit)
      : resolveProductImportColumns(table.slice(headerIndex), explicit);
  }
  const resolved = headerIndex < 0 ? inferHeaderlessProductColumns(rows) : resolveProductImportColumns(table.slice(headerIndex), autoChoices);
  const chosen = headerIndex < 0 && autoChoices?.length ? applyProductImportChoices(resolved, autoChoices) : resolved;
  const promoted = headerIndex >= 0 && !autoChoices?.length ? promoteLargePreviewColumns(chosen) : chosen;
  return headerIndex >= 0 && !autoChoices?.length ? refinePreviewItemNumberColumns(rows.slice(headerIndex + 1), promoted) : promoted;
}

function blankReviewColumns(rows: string[][], headerIndex: number): ProductImportMappedColumn[] {
  const body = headerIndex < 0 ? rows : rows.slice(headerIndex);
  const width = body.reduce((max, row) => Math.max(max, row.length), 0);
  return Array.from({ length: width }, (_, index) => {
    const samples: string[] = [];
    for (const row of body.slice(headerIndex < 0 ? 0 : 1)) {
      const value = (row[index] ?? "").trim();
      if (!value) continue;
      samples.push(value.slice(0, 80));
      if (samples.length === 3) break;
    }
    return {
      choice: null,
      header: headerIndex < 0 ? "" : (rows[headerIndex]?.[index] ?? ""),
      index,
      sample: samples[0] ?? "",
      samples,
      status: "review" as const,
      suggestion: null,
    };
  });
}

function criticalFieldNotices(columns: ProductImportMappedColumn[]): ImportPreviewNotice[] {
  const mapped = new Set(columns.filter((column) => column.status === "mapped" && column.choice).map((column) => column.choice));
  return (["product_name", "piece_barcode", "sku"] as const).flatMap((field) => {
    if (mapped.has(field)) return [];
    const sources = columns.filter((column) => column.status !== "ignored" && column.status !== "mapped" && ((column.samples?.length ?? 0) > 0 || column.sample));
    return [{
      code: "missing_field" as const,
      detail: field,
      sample: sources.slice(0, 4).map((column) => `${columnLetterFromIndex(column.index)}:${column.header || "blank"}=${(column.samples?.length ? column.samples : [column.sample]).filter(Boolean).slice(0, 3).join(",")}`).join(" | "),
    }];
  });
}

function classifyRows(
  rows: Array<{ rowNumber: number; values: Partial<Record<ProductImportColumn, string>> }>,
  catalog: PreviewCatalogItem[],
  categories: string[],
  imageByRow: Map<number, { review: boolean; thumb: string | null }>,
  noteByRow: Map<number, string>,
  method: ImportMethod,
) {
  const skuSeen = new Map<string, number>();
  const barcodeSeen = new Map<string, number[]>();
  const prepared = rows.map((row) => {
    const name = row.values.product_name ?? "";
    const sku = row.values.sku ?? "";
    const barcode = row.values.piece_barcode ?? "";
    const packBarcode = row.values.pack_barcode ?? "";
    const boxBarcode = row.values.box_barcode ?? "";
    const cost = blankToNull(row.values.piece_cost);
    const price = blankToNull(row.values.piece_selling_price);
    const quantity = previewQuantity(row.values.opening_stock ?? "");
    const stock = quantity.stock;
    const unitChoice = previewUnit(row.values.opening_stock_unit ?? "");
    const category = matchCategory(row.values.category ?? "", categories);
    const skuKey = sku.trim().toLowerCase();
    if (skuKey) skuSeen.set(skuKey, (skuSeen.get(skuKey) ?? 0) + 1);
    for (const value of [barcode, packBarcode, boxBarcode]) {
      const key = value.trim().toLowerCase();
      if (!key) continue;
      const list = barcodeSeen.get(key) ?? [];
      list.push(row.rowNumber);
      barcodeSeen.set(key, list);
    }
    return { barcode, boxBarcode, category, cost, name, packBarcode, packNote: quantity.note, price, rowNumber: row.rowNumber, sku, stock, unitChoice, unitText: (row.values.opening_stock_unit ?? "").trim() };
  });
  const catalogSkus = new Map(catalog.filter((item) => item.sku.trim()).map((item) => [item.sku.trim().toLowerCase(), item]));
  const catalogBarcodes = new Map(catalog.filter((item) => item.barcode.trim()).map((item) => [item.barcode.trim().toLowerCase(), item]));

  return prepared.map((row) => {
    const barcodes = [row.barcode, row.packBarcode, row.boxBarcode].map((value) => value.trim()).filter(Boolean);
    const invalidBarcode = barcodes.some((value) => !BARCODE_OK.test(value));
    const sameRowConflict = new Set(barcodes.map((value) => value.toLowerCase())).size !== barcodes.length;
    const inFileSku = (skuSeen.get(row.sku.trim().toLowerCase()) ?? 0) > 1;
    const inFileBarcode = barcodes.some((value) => (barcodeSeen.get(value.toLowerCase()) ?? []).length > 1);
    const existing = catalogSkus.get(row.sku.trim().toLowerCase()) ?? barcodes.map((value) => catalogBarcodes.get(value.toLowerCase())).find(Boolean) ?? null;
    const imageReview = imageByRow.get(row.rowNumber)?.review === true;
    const unitReview = Boolean(row.unitText) && !row.unitChoice;
    const categoryReview = Boolean(row.category.source) && !row.category.matched;
    const numberNotes = method === "auto" ? [] : [
      row.stock && !isPreviewNumber(row.stock) ? "Quantity needs review" : "",
      row.cost && !isPreviewNumber(row.cost) ? "Cost needs review" : "",
      row.price && !isPreviewNumber(row.price) ? "Price needs review" : "",
    ].filter(Boolean);
    let status: PreviewRowStatus = "new";
    if (existing || inFileSku || inFileBarcode || sameRowConflict) status = "duplicate";
    else if (!row.name.trim() || invalidBarcode || imageReview || unitReview || numberNotes.length > 0) status = "needs_review";
    else if (row.price === null || row.stock === null) status = "incomplete";
    const unit = row.unitChoice ?? "Piece";
    const barcode = unit === "Pack" ? row.packBarcode : unit === "Box" ? row.boxBarcode : row.barcode;
    const issues = [
      status === "duplicate" && existing ? `Duplicate ${existing.productName} / ${existing.unit}` : "",
      status === "duplicate" && !existing ? "Duplicate in this sheet" : "",
      status === "incomplete" ? "Not ready for POS" : "",
      !row.name.trim() ? "Product name is missing" : "",
      invalidBarcode ? "Barcode needs review" : "",
      imageReview ? "Image needs review" : "",
      unitReview ? "Unit needs review" : "",
      categoryReview ? "Category was not matched" : "",
      row.packNote,
      ...numberNotes,
    ].filter(Boolean);
    return {
      barcode,
      category: row.category.matched,
      cost: row.cost,
      issue: issues.join(". "),
      match: existing ? { productName: existing.productName, unit: existing.unit } : null,
      name: row.name,
      note: noteByRow.get(row.rowNumber) ?? "",
      price: row.price,
      rowNumber: row.rowNumber,
      sku: row.sku,
      status,
      stock: row.stock,
      unit: unitReview ? "" : unit,
    };
  });
}

function isPreviewNumber(value: string) {
  return /^-?\d+(\.\d+)?$/.test(value.replace(/,/g, "").trim());
}

function previewQuantity(value: string) {
  const text = value.trim();
  if (!text) return { note: "", stock: null as string | null };
  if (/\d/.test(text) && /[×x*]/i.test(text)) return { note: "Quantity left blank", stock: null };
  return { note: "", stock: text };
}

function previewUnit(value: string) {
  const key = value.trim().toLowerCase();
  if (!key) return "Piece" as const;
  if (["piece", "pcs", "pc", "ຊິ້ນ", "ชิ้น", "base"].includes(key)) return "Piece" as const;
  if (["pack", "ແພັກ", "แพ็ค", "แพค"].includes(key)) return "Pack" as const;
  if (["box", "ກ່ອງ", "กล่อง"].includes(key)) return "Box" as const;
  return null;
}

function matchCategory(value: string, categories: string[]) {
  const text = value.trim();
  if (!text) return { matched: null as string | null, source: "" };
  const found = categories.find((category) => category.trim().toLowerCase() === text.toLowerCase());
  return { matched: found ?? null, source: text };
}

function blankToNull(value: string | undefined) {
  const text = (value ?? "").trim();
  return text ? text : null;
}

function clipCell(value: string) {
  return value.length > PREVIEW_CELL_MAX_CHARS ? value.slice(0, PREVIEW_CELL_MAX_CHARS) : value;
}

function slicePage<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);
  return { page: safePage, pageCount, rows: rows.slice(safePage * pageSize, safePage * pageSize + pageSize) };
}
