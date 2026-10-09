import { classifyEmbeddedImages, type EmbeddedImageAnchor } from "@/features/products/product-import-images";
import {
  PRODUCT_IMPORT_COLUMNS,
  resolveProductImportColumns,
  type ProductImportColumn,
  type ProductImportColumnChoice,
  type ProductImportMappedColumn,
} from "@/features/products/product-import";

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

export type LargeImportPreview = {
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
  mapped: {
    page: number;
    pageCount: number;
    rows: Array<{
      barcode: string;
      cost: string | null;
      match: { productName: string; unit: string } | null;
      name: string;
      price: string | null;
      rowNumber: number;
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

export function buildLargeImportPreview(input: {
  catalog: PreviewCatalogItem[];
  choices?: ProductImportColumnChoice[];
  filter?: PreviewFilter;
  images?: EmbeddedImageAnchor[];
  mappedPage?: number;
  page?: number;
  pageSize?: PreviewPageSize;
  rows: string[][];
  sheetName: string;
}): LargeImportPreview {
  const pageSize = normalizePreviewPageSize(input.pageSize ?? 20);
  const filter = input.filter ?? "all";
  const table = input.rows.map((cells, index) => ({ cells, lineNumber: index + 1 }));
  const columns = resolveProductImportColumns(table, input.choices);
  const columnIndex = new Map<ProductImportColumn, number>();
  for (const column of columns) {
    if (column.status === "mapped" && column.choice && column.choice !== "ignore") columnIndex.set(column.choice, column.index);
  }
  const sourceRows = table.slice(1).filter((row) => row.cells.some((cell) => cell.trim() !== "")).map((row) => ({
    rowNumber: row.lineNumber,
    values: Object.fromEntries(PRODUCT_IMPORT_COLUMNS.map((column) => {
      const index = columnIndex.get(column);
      return [column, index === undefined ? "" : (row.cells[index] ?? "").trim()];
    })) as Partial<Record<ProductImportColumn, string>>,
  }));
  const images = classifyEmbeddedImages(input.images ?? [], sourceRows.map((row) => row.rowNumber));
  const imageByRow = new Map<number, { review: boolean; thumb: string | null }>();
  let imageMatched = 0;
  let imageNeedsReview = 0;
  for (const image of images) {
    if (image.status === "mapped") imageMatched += 1;
    else imageNeedsReview += 1;
    if (image.rowNumber === null) continue;
    const current = imageByRow.get(image.rowNumber) ?? { review: false, thumb: null };
    if (image.status === "review") current.review = true;
    if (image.status === "mapped" && image.dataUrl && imageByteLength(image.dataUrl) <= PREVIEW_THUMB_MAX_BYTES) current.thumb = image.dataUrl;
    if (image.status === "review") current.thumb = null;
    imageByRow.set(image.rowNumber, current);
  }

  const classified = classifyRows(sourceRows, input.catalog, imageByRow);
  const counts = {
    duplicate: classified.filter((row) => row.status === "duplicate").length,
    imageMatched,
    imageNeedsReview,
    incomplete: classified.filter((row) => row.status === "incomplete").length,
    needsReview: classified.filter((row) => row.status === "needs_review").length,
    newProducts: classified.filter((row) => row.status === "new").length,
    totalRows: classified.length,
  };
  const excelRows = input.rows.slice(1).map((cells, index) => ({
    cells: cells.map(clipCell),
    rowNumber: index + 2,
    thumb: imageByRow.get(index + 2)?.thumb ?? null,
  }));
  const visible = classified.filter((row) => filter === "all" || row.status === filter);
  const excelPage = slicePage(excelRows, input.page ?? 0, pageSize);
  const mappedPage = slicePage(visible, input.mappedPage ?? 0, pageSize);
  const preview: LargeImportPreview = {
    columns,
    counts,
    excel: {
      headers: (input.rows[0] ?? []).map(clipCell),
      page: excelPage.page,
      pageCount: excelPage.pageCount,
      rows: excelPage.rows,
    },
    mapped: {
      page: mappedPage.page,
      pageCount: mappedPage.pageCount,
      rows: mappedPage.rows.map((row) => ({ ...row, thumb: imageByRow.get(row.rowNumber)?.thumb ?? null })),
    },
    sheetName: input.sheetName,
  };
  if (Buffer.byteLength(JSON.stringify(preview)) > PREVIEW_RESPONSE_MAX_BYTES) {
    throw new Error("preview_limit");
  }
  return preview;
}

function classifyRows(
  rows: Array<{ rowNumber: number; values: Partial<Record<ProductImportColumn, string>> }>,
  catalog: PreviewCatalogItem[],
  imageByRow: Map<number, { review: boolean; thumb: string | null }>,
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
    const stock = blankToNull(row.values.opening_stock);
    const skuKey = sku.trim().toLowerCase();
    if (skuKey) skuSeen.set(skuKey, (skuSeen.get(skuKey) ?? 0) + 1);
    for (const value of [barcode, packBarcode, boxBarcode]) {
      const key = value.trim().toLowerCase();
      if (!key) continue;
      const list = barcodeSeen.get(key) ?? [];
      list.push(row.rowNumber);
      barcodeSeen.set(key, list);
    }
    return { barcode, boxBarcode, cost, name, packBarcode, price, rowNumber: row.rowNumber, sku, stock };
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
    let status: PreviewRowStatus = "new";
    if (existing || inFileSku || inFileBarcode || sameRowConflict) status = "duplicate";
    else if (!row.name.trim() || invalidBarcode || imageReview) status = "needs_review";
    else if (row.price === null || row.stock === null) status = "incomplete";
    return {
      barcode: row.barcode,
      cost: row.cost,
      match: existing ? { productName: existing.productName, unit: existing.unit } : null,
      name: row.name,
      price: row.price,
      rowNumber: row.rowNumber,
      sku: row.sku,
      status,
      stock: row.stock,
      unit: "Piece",
    };
  });
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

function imageByteLength(dataUrl: string) {
  const encoded = dataUrl.split(",")[1] ?? "";
  return Math.floor(encoded.length * 3 / 4);
}
