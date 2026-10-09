export const PRODUCT_IMPORT_MAX_ROWS = 500;
export const PRODUCT_IMPORT_MAX_CHARS = 1_500_000;
export const PRODUCT_IMPORT_BATCH_SIZE = 10;

export const PRODUCT_IMPORT_COLUMNS = [
  "product_name",
  "sku",
  "category",
  "brand",
  "supplier",
  "status",
  "piece_barcode",
  "piece_cost",
  "piece_selling_price",
  "piece_rounding",
  "pack_enabled",
  "pack_qty",
  "pack_barcode",
  "pack_cost",
  "pack_selling_price",
  "pack_rounding",
  "box_enabled",
  "box_qty",
  "box_barcode",
  "box_cost",
  "box_selling_price",
  "box_rounding",
  "opening_stock",
  "opening_stock_unit",
  "reorder_level",
] as const;

export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number];

const HEADER_LABELS: Record<ProductImportColumn, string> = {
  product_name: "Product Name",
  sku: "SKU",
  category: "Category",
  brand: "Brand",
  supplier: "Supplier",
  status: "Status",
  piece_barcode: "Piece Barcode",
  piece_cost: "Piece Cost",
  piece_selling_price: "Piece Selling Price",
  piece_rounding: "Piece Rounding",
  pack_enabled: "Pack Enabled",
  pack_qty: "Pack Qty in Base",
  pack_barcode: "Pack Barcode",
  pack_cost: "Pack Cost",
  pack_selling_price: "Pack Selling Price",
  pack_rounding: "Pack Rounding",
  box_enabled: "Box Enabled",
  box_qty: "Box Qty in Base",
  box_barcode: "Box Barcode",
  box_cost: "Box Cost",
  box_selling_price: "Box Selling Price",
  box_rounding: "Box Rounding",
  opening_stock: "Opening Stock",
  opening_stock_unit: "Opening Stock Unit",
  reorder_level: "Reorder Level",
};

const HEADER_ALIASES: Record<string, ProductImportColumn> = {
  ...Object.fromEntries(PRODUCT_IMPORT_COLUMNS.map((column) => [column, column])),
  pack_qty_in_base: "pack_qty",
  box_qty_in_base: "box_qty",
  min_stock: "reorder_level",
  name: "product_name",
  name_en: "product_name",
  product_name_en: "product_name",
  english_name: "product_name",
  item_name: "product_name",
  ຊື່ສິນຄ້າ: "product_name",
  ຊື່ສິນຄ້າພາສາອັງກິດ: "product_name",
  ชื่อสินค้า: "product_name",
  ชื่อสินค้าภาษาอังกฤษ: "product_name",
  ชื่อภาษาอังกฤษ: "product_name",
  supplier_product_code: "sku",
  product_code: "sku",
  item_code: "sku",
  supplier_code: "sku",
  ລະຫັດສິນຄ້າ: "sku",
  รหัสสินค้า: "sku",
  barcode: "piece_barcode",
  barcode_no: "piece_barcode",
  ean: "piece_barcode",
  ean_13: "piece_barcode",
  ean13: "piece_barcode",
  upc: "piece_barcode",
  upc_a: "piece_barcode",
  upca: "piece_barcode",
  main_barcode: "piece_barcode",
  product_barcode: "piece_barcode",
  barcode_ຫຼັກ: "piece_barcode",
  ບາໂຄດ: "piece_barcode",
  ບາໂຄດຫຼັກ: "piece_barcode",
  บาร์โค้ด: "piece_barcode",
  บาร์โค้ดหลัก: "piece_barcode",
  cost: "piece_cost",
  cost_price: "piece_cost",
  unit_cost: "piece_cost",
  ລາຄາທຶນ: "piece_cost",
  ຕົ້ນທຶນ: "piece_cost",
  ราคาทุน: "piece_cost",
  ต้นทุน: "piece_cost",
  selling_price: "piece_selling_price",
  sale_price: "piece_selling_price",
  retail_price: "piece_selling_price",
  ລາຄາຂາຍ: "piece_selling_price",
  ราคาขาย: "piece_selling_price",
  quantity: "opening_stock",
  stock: "opening_stock",
  qty_on_hand: "opening_stock",
  ຈຳນວນ: "opening_stock",
  ຈໍານວນ: "opening_stock",
  ສະຕັອກ: "opening_stock",
  จำนวน: "opening_stock",
  สต็อก: "opening_stock",
  product_category: "category",
  ປະເພດສິນຄ້າ: "category",
  ປະເພດ: "category",
  ประเภทสินค้า: "category",
  ประเภท: "category",
  ຍີ່ຫໍ້: "brand",
  ยี่ห้อ: "brand",
  vendor: "supplier",
  ຜູ້ສະໜອງ: "supplier",
  ผู้จำหน่าย: "supplier",
  ผู้จัดจำหน่าย: "supplier",
};

const IGNORE_HEADER_ALIASES = new Set([
  "image",
  "product_image",
  "picture",
  "photo",
  "embedded_image",
  "image_url",
  "ຮູບ",
  "ຮູບພາບ",
  "ຮູບສິນຄ້າ",
  "รูป",
  "รูปภาพ",
  "รูปสินค้า",
  "no",
  "no.",
  "#",
  "row",
  "row_no",
  "line",
  "line_no",
  "sequence",
  "seq",
  "stt",
  "ลำดับ",
  "ลำดับที่",
  "ລຳດັບ",
  "ລໍາດັບ",
  "序号",
]);

export type ProductImportColumnChoice = {
  field: ProductImportColumn | "ignore" | null;
  index: number;
};

export type ProductImportMappedColumn = {
  choice: ProductImportColumn | "ignore" | null;
  header: string;
  index: number;
  sample: string;
  status: "mapped" | "review" | "ignored" | "conflict";
  suggestion: ProductImportColumn | "ignore" | null;
};

const ROUNDING_VALUES = new Set([0, 500, 1000, 5000]);
const YES_VALUES = new Set(["yes", "y", "true", "1", "on", "ແມ່ນ", "ໃຊ້", "ເປີດ"]);
const NO_VALUES = new Set(["no", "n", "false", "0", "off", "ບໍ່", "ບໍ່ໃຊ້", "ປິດ"]);
const STATUS_VALUES: Record<string, "active" | "inactive" | "draft"> = {
  active: "active",
  inactive: "inactive",
  draft: "draft",
  ໃຊ້ງານ: "active",
  ຢຸດໃຊ້: "inactive",
  ຮ່າງ: "draft",
};

export type ProductImportIssue = {
  code: string;
  detail?: string;
  field?: string;
  level: "error" | "warning";
};

export type ProductImportUnitDraft = {
  barcode?: string;
  conversionQty: number;
  costPriceLak: number;
  isBaseUnit: boolean;
  isDefaultSaleUnit: boolean;
  isPurchaseUnit: boolean;
  pricingMode: "manual";
  roundingLak: number;
  sellingPriceLak: number;
  sortOrder: number;
  status: "active";
  unitName: "Piece" | "Pack" | "Box";
};

export type ProductImportDraft = {
  barcode?: string;
  brandId?: string;
  categoryId?: string;
  costPriceLak: number;
  initialStock?: { note: string; quantity: number; unitName: "Piece" | "Pack" | "Box" };
  minStock: number;
  nameEn: string;
  nameLo: string;
  sellingPriceLak: number;
  sku?: string;
  status: "active" | "inactive" | "draft";
  supplierId?: string;
  supplierIds?: string[];
  units: ProductImportUnitDraft[];
};

export type ProductImportPreviewRow = {
  issues: ProductImportIssue[];
  productName: string;
  rowNumber: number;
  sku: string;
  state: "valid" | "warning" | "error";
  status: string;
  units: string;
};

export type ProductImportEvaluatedRow = ProductImportPreviewRow & {
  draft: ProductImportDraft | null;
  trackedBarcodes: Array<{ barcode: string; unit: string }>;
};

export type ProductImportCatalog = {
  barcodes: string[];
  brands: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; nameEn: string; nameLo: string }>;
  skus: string[];
  suppliers: Array<{ companyName: string; id: string; name: string }>;
};

export type ProductImportParseResult = {
  fileIssues: ProductImportIssue[];
  rows: Array<{ rowNumber: number; values: Partial<Record<ProductImportColumn, string>> }>;
  skippedBlankRows: number;
};

export type ProductImportGridRow = {
  cells: string[];
  lineNumber: number;
};

export type ProductImportEvaluation = {
  errorCount: number;
  fileIssues: ProductImportIssue[];
  rows: ProductImportEvaluatedRow[];
  validCount: number;
  warningCount: number;
};

const SAMPLE_ROW = [
  "Sample Water 500ml",
  "EXAMPLE-REPLACE-ME",
  "",
  "",
  "",
  "active",
  "EXAMPLE-PIECE",
  "4000",
  "5000",
  "0",
  "yes",
  "6",
  "EXAMPLE-PACK",
  "22000",
  "28000",
  "0",
  "yes",
  "24",
  "EXAMPLE-BOX",
  "90000",
  "110000",
  "0",
  "0",
  "Piece",
  "10",
];

export const PRODUCT_IMPORT_TEMPLATE_CSV = `\uFEFF${[
  PRODUCT_IMPORT_COLUMNS.map((column) => HEADER_LABELS[column]).join(","),
  SAMPLE_ROW.map(csvCell).join(","),
].join("\n")}\n`;

export function emptyProductImportCatalog(): ProductImportCatalog {
  return { barcodes: [], brands: [], categories: [], skus: [], suppliers: [] };
}

export function buildProductImportCsv(dataRows: string[][]) {
  return [
    PRODUCT_IMPORT_COLUMNS.map((column) => HEADER_LABELS[column]).join(","),
    ...dataRows.map((row) => row.map((value) => csvCell(value)).join(",")),
  ].join("\n") + "\n";
}

export function parseProductImportCsv(csvText: string): ProductImportParseResult {
  return parseProductImportDelimited(csvText, ",");
}

export function parseProductImportDelimited(text: string, delimiter: "," | "\t"): ProductImportParseResult {
  if (text.length > PRODUCT_IMPORT_MAX_CHARS) {
    return { fileIssues: [{ code: "file_too_large", level: "error" }], rows: [], skippedBlankRows: 0 };
  }

  const table = parseDelimitedTable(text.replace(/^\uFEFF/, ""), delimiter);
  return mapProductImportGrid(table.rows, table.skippedBlankRows);
}

export function productImportDelimitedGrid(text: string, delimiter: "," | "\t") {
  return parseDelimitedTable(text.replace(/^\uFEFF/, ""), delimiter);
}

export function resolveProductImportColumns(
  table: ProductImportGridRow[],
  choices?: ProductImportColumnChoice[],
): ProductImportMappedColumn[] {
  const width = table.reduce((max, row) => Math.max(max, row.cells.length), 0);
  const samples = Array.from({ length: width }, (_, index) => {
    for (const row of table.slice(1, 6)) {
      const value = (row.cells[index] ?? "").trim();
      if (value) return value.slice(0, 80);
    }
    return "";
  });
  const suggested = Array.from({ length: width }, (_, index) => {
    const header = table[0]?.cells[index] ?? "";
    return suggestProductImportColumn(header, index, samples[index] ?? "");
  });
  if (!choices?.length) return markProductImportConflicts(suggested);
  const byIndex = new Map(choices.map((choice) => [choice.index, choice.field]));
  const chosen = suggested.map((column) => {
    if (!byIndex.has(column.index)) return { ...column, choice: null, status: "review" as const };
    const field = byIndex.get(column.index);
    if (field === "ignore") return { ...column, choice: "ignore" as const, status: "ignored" as const };
    if (!field) return { ...column, choice: null, status: "review" as const };
    return { ...column, choice: field, status: "mapped" as const };
  });
  return markProductImportConflicts(chosen);
}

export function mapProductImportGrid(
  table: ProductImportGridRow[],
  skippedBlankRows = 0,
  choices?: ProductImportColumnChoice[],
): ProductImportParseResult {
  if (table.length === 0) {
    return { fileIssues: [{ code: "empty_file", level: "error" }], rows: [], skippedBlankRows };
  }

  const columns = resolveProductImportColumns(table, choices);
  const columnIndex = new Map<ProductImportColumn, number>();
  const fileIssues: ProductImportIssue[] = [];
  const seenUnknown = new Set<string>();

  for (const column of columns) {
    const header = column.header.trim();
    if (column.status === "mapped" && column.choice && column.choice !== "ignore") {
      columnIndex.set(column.choice, column.index);
      continue;
    }
    if (column.status === "conflict" && header) {
      fileIssues.push({ code: "duplicate_header", detail: header, level: "warning" });
      continue;
    }
    if (!header || seenUnknown.has(header)) continue;
    if (column.status === "ignored" || column.status === "review") {
      seenUnknown.add(header);
      fileIssues.push({ code: "unknown_column", detail: header, level: "warning" });
    }
  }

  if (!columnIndex.has("product_name")) {
    return { fileIssues: [...fileIssues, { code: "missing_header", level: "error" }], rows: [], skippedBlankRows };
  }

  const dataRows = table.slice(1).filter((row) => row.cells.some((cell) => cell.trim() !== ""));
  if (dataRows.length === 0) {
    return { fileIssues: [...fileIssues, { code: "empty_file", level: "error" }], rows: [], skippedBlankRows };
  }
  if (dataRows.length > PRODUCT_IMPORT_MAX_ROWS) {
    return {
      fileIssues: [...fileIssues, { code: "too_many_rows", detail: String(PRODUCT_IMPORT_MAX_ROWS), level: "error" }],
      rows: [],
      skippedBlankRows,
    };
  }

  return {
    fileIssues,
    rows: dataRows.map((row) => ({
      rowNumber: row.lineNumber,
      values: Object.fromEntries(
        PRODUCT_IMPORT_COLUMNS.map((column) => {
          const index = columnIndex.get(column);
          return [column, index === undefined ? "" : (row.cells[index] ?? "").trim()];
        }),
      ) as Partial<Record<ProductImportColumn, string>>,
    })),
    skippedBlankRows,
  };
}

export function evaluateProductImport(parsed: ProductImportParseResult, catalog: ProductImportCatalog): ProductImportEvaluation {
  const blockingFileIssue = parsed.fileIssues.some((issue) => issue.level === "error");
  if (blockingFileIssue) {
    return { errorCount: 0, fileIssues: parsed.fileIssues, rows: [], validCount: 0, warningCount: 0 };
  }

  const rows = parsed.rows.map((row) => evaluateRow(row, catalog));
  applyInFileDuplicates(rows);

  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  for (const row of rows) {
    const hasError = row.issues.some((issue) => issue.level === "error");
    const hasWarning = row.issues.some((issue) => issue.level === "warning");
    if (hasError) {
      row.state = "error";
      row.draft = null;
      errorCount += 1;
    } else if (hasWarning) {
      row.state = "warning";
      warningCount += 1;
    } else {
      row.state = "valid";
      validCount += 1;
    }
  }

  return { errorCount, fileIssues: parsed.fileIssues, rows, validCount, warningCount };
}

export function publicProductImportPreview(evaluation: ProductImportEvaluation) {
  return {
    errorCount: evaluation.errorCount,
    fileIssues: evaluation.fileIssues,
    rows: evaluation.rows.map(({ draft: _draft, trackedBarcodes: _trackedBarcodes, ...row }) => row),
    validCount: evaluation.validCount,
    warningCount: evaluation.warningCount,
  };
}

function evaluateRow(
  row: ProductImportParseResult["rows"][number],
  catalog: ProductImportCatalog,
): ProductImportEvaluatedRow {
  const values = row.values;
  const issues: ProductImportIssue[] = [];
  const productName = values.product_name ?? "";
  const sku = values.sku ?? "";
  if (!productName) issues.push({ code: "missing_name", level: "error" });

  const statusText = values.status ?? "";
  const status = statusText ? STATUS_VALUES[statusText.trim().toLowerCase()] ?? STATUS_VALUES[statusText.trim()] : "active";
  if (statusText && !status) issues.push({ code: "invalid_status", detail: statusText, field: "status", level: "error" });

  const pieceCost = readMoney(values.piece_cost ?? "", "piece_cost", issues);
  const piecePrice = readMoney(values.piece_selling_price ?? "", "piece_selling_price", issues);
  const pieceRounding = readRounding(values.piece_rounding ?? "", "piece_rounding", issues);
  const pieceBarcode = cleanBarcode(values.piece_barcode ?? "");

  const pack = readSellUnit("pack", values, issues);
  const box = readSellUnit("box", values, issues);
  const reorder = readMoney(values.reorder_level ?? "", "reorder_level", issues);
  const opening = readOpeningStock(values.opening_stock ?? "", issues);
  const openingUnit = resolveOpeningUnit(values.opening_stock_unit ?? "", opening, pack.enabled, box.enabled, issues);

  const category = matchNamed(values.category ?? "", catalog.categories.map((item) => ({
    id: item.id,
    labels: [item.nameEn, item.nameLo],
  })));
  if (category.error) issues.push({ code: category.error === "ambiguous" ? "ambiguous_category" : "category_not_found", detail: values.category, level: "error" });

  const brand = matchNamed(values.brand ?? "", catalog.brands.map((item) => ({ id: item.id, labels: [item.name] })));
  if (brand.error) issues.push({ code: brand.error === "ambiguous" ? "ambiguous_brand" : "brand_not_found", detail: values.brand, level: "error" });

  const supplier = matchNamed(values.supplier ?? "", catalog.suppliers.map((item) => ({
    id: item.id,
    labels: [item.name, item.companyName],
  })));
  if (supplier.error) issues.push({ code: supplier.error === "ambiguous" ? "ambiguous_supplier" : "supplier_not_found", detail: values.supplier, level: "error" });

  const trackedBarcodes = [
    pieceBarcode ? { barcode: pieceBarcode, unit: "Piece" } : null,
    pack.enabled && pack.barcode ? { barcode: pack.barcode, unit: "Pack" } : null,
    box.enabled && box.barcode ? { barcode: box.barcode, unit: "Box" } : null,
  ].filter((item): item is { barcode: string; unit: string } => Boolean(item));
  const knownSkus = new Set(catalog.skus.map((item) => item.trim()).filter(Boolean));
  const knownBarcodes = new Set(catalog.barcodes.map((item) => item.trim()).filter(Boolean));
  if (sku.trim() && knownSkus.has(sku.trim())) {
    issues.push({ code: "sku_exists", detail: sku.trim(), level: "error" });
  }
  const reportedBarcodes = new Set<string>();
  for (const item of trackedBarcodes) {
    if (!knownBarcodes.has(item.barcode) || reportedBarcodes.has(item.barcode)) continue;
    reportedBarcodes.add(item.barcode);
    issues.push({ code: "barcode_exists", detail: item.barcode, level: "error" });
  }

  const enabledUnits = ["Piece", pack.enabled ? "Pack" : "", box.enabled ? "Box" : ""].filter(Boolean);
  const hasError = issues.some((issue) => issue.level === "error") || !status;
  const units: ProductImportUnitDraft[] = [];
  if (!hasError && status) {
    units.push(unitDraft("Piece", 1, pieceCost ?? 0, piecePrice ?? 0, pieceRounding ?? 0, pieceBarcode, 0, true));
    if (pack.enabled && pack.qty !== null && pack.cost !== null && pack.price !== null && pack.rounding !== null) {
      units.push(unitDraft("Pack", pack.qty, pack.cost, pack.price, pack.rounding, pack.barcode, 1, false));
    }
    if (box.enabled && box.qty !== null && box.cost !== null && box.price !== null && box.rounding !== null) {
      units.push(unitDraft("Box", box.qty, box.cost, box.price, box.rounding, box.barcode, 2, false));
    }
  }

  const draft: ProductImportDraft | null = !hasError && status && productName ? {
    barcode: pieceBarcode || undefined,
    brandId: brand.id,
    categoryId: category.id,
    costPriceLak: pieceCost ?? 0,
    minStock: reorder ?? 0,
    nameEn: productName,
    nameLo: productName,
    sellingPriceLak: piecePrice ?? 0,
    sku: sku || undefined,
    status,
    supplierId: supplier.id,
    supplierIds: supplier.id ? [supplier.id] : undefined,
    units,
    ...(opening > 0 && openingUnit ? {
      initialStock: {
        note: "Opening stock from product import",
        quantity: opening,
        unitName: openingUnit,
      },
    } : {}),
  } : null;

  return {
    draft,
    issues,
    productName,
    rowNumber: row.rowNumber,
    sku,
    state: "valid",
    status: status ?? statusText,
    trackedBarcodes,
    units: enabledUnits.join(", "),
  };
}

function applyInFileDuplicates(rows: ProductImportEvaluatedRow[]) {
  const skuRows = new Map<string, number[]>();
  const barcodeRows = new Map<string, Array<{ barcode: string; rowNumber: number; unit: string }>>();

  for (const row of rows) {
    const skuKey = row.sku.trim().toLowerCase();
    if (skuKey) {
      const list = skuRows.get(skuKey) ?? [];
      list.push(row.rowNumber);
      skuRows.set(skuKey, list);
    }
    for (const item of row.trackedBarcodes) {
      const key = item.barcode.trim().toLowerCase();
      if (!key) continue;
      const list = barcodeRows.get(key) ?? [];
      list.push({ barcode: item.barcode.trim(), rowNumber: row.rowNumber, unit: item.unit });
      barcodeRows.set(key, list);
    }
  }

  for (const row of rows) {
    const skuKey = row.sku.trim().toLowerCase();
    const skuHits = skuKey ? skuRows.get(skuKey) ?? [] : [];
    if (skuHits.length > 1) {
      row.issues.push({ code: "duplicate_sku_file", detail: row.sku.trim(), level: "error" });
    }
  }

  for (const [key, hits] of barcodeRows) {
    const rowNumbers = Array.from(new Set(hits.map((hit) => hit.rowNumber)));
    if (rowNumbers.length > 1) {
      for (const rowNumber of rowNumbers) {
        const row = rows.find((item) => item.rowNumber === rowNumber);
        const detail = hits.find((hit) => hit.rowNumber === rowNumber)?.barcode ?? key;
        row?.issues.push({ code: "duplicate_barcode_file", detail, level: "error" });
      }
    }
    for (const rowNumber of rowNumbers) {
      const sameRow = hits.filter((hit) => hit.rowNumber === rowNumber);
      if (sameRow.length > 1) {
        const row = rows.find((item) => item.rowNumber === rowNumber);
        row?.issues.push({ code: "duplicate_barcode_row", detail: sameRow[0]?.barcode ?? key, level: "error" });
      }
    }
  }
}

function readSellUnit(
  role: "pack" | "box",
  values: Partial<Record<ProductImportColumn, string>>,
  issues: ProductImportIssue[],
) {
  const prefix = role;
  const enabledRaw = values[`${prefix}_enabled`] ?? "";
  const flag = parseEnable(enabledRaw);
  const qtyRaw = values[`${prefix}_qty`] ?? "";
  const barcode = cleanBarcode(values[`${prefix}_barcode`] ?? "");
  const costRaw = values[`${prefix}_cost`] ?? "";
  const priceRaw = values[`${prefix}_selling_price`] ?? "";
  const roundingRaw = values[`${prefix}_rounding`] ?? "";
  const filled = [qtyRaw, barcode, costRaw, priceRaw, roundingRaw].some((value) => value.trim() !== "");

  if (flag === "invalid") {
    issues.push({ code: "invalid_enable", field: `${prefix}_enabled`, level: "error" });
  }
  const enabled = flag === "yes";
  if (!enabled) {
    if (filled && flag !== "invalid") {
      issues.push({ code: "ignored_disabled_unit", detail: role === "pack" ? "Pack" : "Box", level: "warning" });
    }
    return { barcode: "", cost: null as number | null, enabled: false, price: null as number | null, qty: null as number | null, rounding: null as number | null };
  }

  const qty = readConversion(qtyRaw, `${prefix}_qty`, issues);
  const cost = readMoney(costRaw, `${prefix}_cost`, issues);
  const price = readMoney(priceRaw, `${prefix}_selling_price`, issues);
  const rounding = readRounding(roundingRaw, `${prefix}_rounding`, issues);
  return { barcode, cost, enabled: true, price, qty, rounding };
}

function readOpeningStock(raw: string, issues: ProductImportIssue[]) {
  if (!raw.trim()) return 0;
  const parsed = parseLooseNumber(raw);
  if (parsed === null) {
    issues.push({ code: "invalid_number", field: "opening_stock", level: "error" });
    return 0;
  }
  if (parsed < 0) {
    issues.push({ code: "negative_number", field: "opening_stock", level: "error" });
    return 0;
  }
  return parsed;
}

function resolveOpeningUnit(
  raw: string,
  quantity: number,
  packEnabled: boolean,
  boxEnabled: boolean,
  issues: ProductImportIssue[],
) {
  if (quantity <= 0) return null;
  const key = raw.trim().toLowerCase();
  const unit = !key || key === "piece" || key === "pcs" || key === "pc"
    ? "Piece"
    : key === "pack"
      ? "Pack"
      : key === "box"
        ? "Box"
        : null;
  if (!unit) {
    issues.push({ code: "invalid_opening_unit", detail: raw.trim(), level: "error" });
    return null;
  }
  if ((unit === "Pack" && !packEnabled) || (unit === "Box" && !boxEnabled)) {
    issues.push({ code: "opening_unit_disabled", detail: unit, level: "error" });
    return null;
  }
  return unit;
}

function readMoney(raw: string, field: string, issues: ProductImportIssue[]) {
  if (!raw.trim()) return 0;
  const parsed = parseLooseNumber(raw);
  if (parsed === null) {
    issues.push({ code: "invalid_number", field, level: "error" });
    return null;
  }
  if (parsed < 0) {
    issues.push({ code: "negative_number", field, level: "error" });
    return null;
  }
  return Math.round(parsed);
}

function readRounding(raw: string, field: string, issues: ProductImportIssue[]) {
  if (!raw.trim()) return 0;
  const parsed = parseLooseNumber(raw);
  if (parsed === null) {
    issues.push({ code: "invalid_number", field, level: "error" });
    return null;
  }
  const rounded = Math.round(parsed);
  if (!ROUNDING_VALUES.has(rounded)) {
    issues.push({ code: "invalid_rounding", field, level: "error" });
    return null;
  }
  return rounded;
}

function readConversion(raw: string, field: string, issues: ProductImportIssue[]) {
  if (!raw.trim()) {
    issues.push({ code: "invalid_conversion", field, level: "error" });
    return null;
  }
  const parsed = parseLooseNumber(raw);
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) {
    issues.push({ code: parsed !== null && parsed < 0 ? "negative_number" : "invalid_conversion", field, level: "error" });
    return null;
  }
  return parsed;
}

function parseEnable(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value) return "blank" as const;
  if (YES_VALUES.has(value) || YES_VALUES.has(raw.trim())) return "yes" as const;
  if (NO_VALUES.has(value) || NO_VALUES.has(raw.trim())) return "no" as const;
  return "invalid" as const;
}

function parseLooseNumber(raw: string) {
  const text = raw.trim().replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanBarcode(raw: string) {
  return raw.trim();
}

function matchNamed(raw: string, items: Array<{ id: string; labels: string[] }>) {
  const key = raw.trim().toLowerCase();
  if (!key) return { id: undefined as string | undefined, error: undefined as "not_found" | "ambiguous" | undefined };
  const hits = items.filter((item) => item.labels.some((label) => label.trim().toLowerCase() === key));
  const unique = Array.from(new Set(hits.map((item) => item.id)));
  if (unique.length === 1) return { id: unique[0], error: undefined };
  if (unique.length === 0) return { id: undefined, error: "not_found" as const };
  return { id: undefined, error: "ambiguous" as const };
}

function unitDraft(
  unitName: "Piece" | "Pack" | "Box",
  conversionQty: number,
  costPriceLak: number,
  sellingPriceLak: number,
  roundingLak: number,
  barcode: string,
  sortOrder: number,
  base: boolean,
): ProductImportUnitDraft {
  return {
    barcode: barcode || undefined,
    conversionQty,
    costPriceLak,
    isBaseUnit: base,
    isDefaultSaleUnit: base,
    isPurchaseUnit: base,
    pricingMode: "manual",
    roundingLak,
    sellingPriceLak,
    sortOrder,
    status: "active",
    unitName,
  };
}

function suggestProductImportColumn(header: string, index: number, sample: string): ProductImportMappedColumn {
  const key = normalizeHeader(header);
  const { aliases, ignore } = normalizedAliasTables();
  if (!key) {
    return { choice: null, header, index, sample, status: "review", suggestion: null };
  }
  if (key === "item_no") {
    if (/^\d{1,6}$/.test(sample.trim())) return { choice: "ignore", header, index, sample, status: "ignored", suggestion: "ignore" };
    if (sample.trim()) return { choice: "sku", header, index, sample, status: "mapped", suggestion: "sku" };
    return { choice: null, header, index, sample, status: "review", suggestion: null };
  }
  if (ignore.has(key)) {
    return { choice: "ignore", header, index, sample, status: "ignored", suggestion: "ignore" };
  }
  const exact = aliases.get(key);
  if (exact && !isWeakNameColumn(key, exact, sample)) {
    return { choice: exact, header, index, sample, status: "mapped", suggestion: exact };
  }
  const heuristic = heuristicProductImportField(key);
  if (heuristic && isWeakNameColumn(key, heuristic, sample)) {
    return { choice: null, header, index, sample, status: "review", suggestion: null };
  }
  return { choice: null, header, index, sample, status: "review", suggestion: heuristic };
}

const WEAK_NAME_HEADERS = new Set(["name", "item", "number", "no"]);

function isWeakNameColumn(key: string, field: ProductImportColumn | "ignore", sample: string) {
  return field === "product_name" && WEAK_NAME_HEADERS.has(key) && /^\d{1,6}$/.test(sample.trim());
}

const PREVIEW_UNIT_HEADERS = new Set(["unit", "ຫົວໜ່ວຍ", "หน่วย"].map((header) => normalizeHeader(header)));
const EXPLICIT_UNIT_SAMPLES = new Set(["piece", "pcs", "pc", "ຊິ້ນ", "ชิ้น", "base", "pack", "ແພັກ", "แพ็ค", "แพค", "box", "ກ່ອງ", "กล่อง"]);

export function promoteLargePreviewColumns(columns: ProductImportMappedColumn[]) {
  const seen = new Set(columns.filter((column) => column.status === "mapped" && column.choice && column.choice !== "ignore").map((column) => column.choice));
  return columns.map((column) => {
    if (column.status !== "review" || column.choice) return column;
    const key = normalizeHeader(column.header);
    if (!PREVIEW_UNIT_HEADERS.has(key)) return column;
    const sample = column.sample.trim().toLowerCase();
    if (sample && !EXPLICIT_UNIT_SAMPLES.has(sample)) return column;
    if (seen.has("opening_stock_unit")) return { ...column, choice: "opening_stock_unit" as const, status: "conflict" as const, suggestion: "opening_stock_unit" as const };
    seen.add("opening_stock_unit");
    return { ...column, choice: "opening_stock_unit" as const, status: "mapped" as const, suggestion: "opening_stock_unit" as const };
  });
}

export function productImportHeaderScore(cells: string[]) {
  const { aliases, ignore } = normalizedAliasTables();
  let score = 0;
  for (const cell of cells) {
    const key = normalizeHeader(cell);
    if (key && (aliases.has(key) || ignore.has(key) || key === "item_no")) score += 1;
  }
  return score;
}

function heuristicProductImportField(key: string): ProductImportColumn | "ignore" | null {
  const { aliases, ignore } = normalizedAliasTables();
  const fields = new Set<ProductImportColumn | "ignore">();
  for (const [alias, field] of aliases) {
    if (alias.length < 4 || alias === key || !headerContainsAlias(key, alias)) continue;
    fields.add(field);
  }
  for (const alias of ignore) {
    if (alias.length < 4 || alias === key || !headerContainsAlias(key, alias)) continue;
    fields.add("ignore");
  }
  if (fields.size !== 1) return null;
  return [...fields][0] ?? null;
}

let normalizedAliases: Map<string, ProductImportColumn> | null = null;
let normalizedIgnore: Set<string> | null = null;

function normalizedAliasTables() {
  if (!normalizedAliases || !normalizedIgnore) {
    normalizedAliases = new Map(Object.entries(HEADER_ALIASES).map(([alias, field]) => [normalizeHeader(alias), field]));
    normalizedIgnore = new Set([...IGNORE_HEADER_ALIASES].map((alias) => normalizeHeader(alias)));
  }
  return { aliases: normalizedAliases, ignore: normalizedIgnore };
}

function headerContainsAlias(key: string, alias: string) {
  return key.startsWith(`${alias}_`) || key.endsWith(`_${alias}`) || key.includes(`_${alias}_`);
}

function markProductImportConflicts(columns: ProductImportMappedColumn[]) {
  const seen = new Set<ProductImportColumn>();
  return columns.map((column) => {
    if (column.status !== "mapped" || !column.choice || column.choice === "ignore") return column;
    if (seen.has(column.choice)) return { ...column, status: "conflict" as const };
    seen.add(column.choice);
    return column;
  });
}

const HEADERLESS_SEQUENCE = /^\d{1,6}$/;
const HEADERLESS_BARCODE = /^[0-9]{4,32}$/;
const HEADERLESS_SKU = /^(?=.*[A-Za-z])(?=.*\d)[0-9A-Za-z._-]{2,32}$/;

export function inferHeaderlessProductColumns(rows: string[][]): ProductImportMappedColumn[] {
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: width }, (_, index) => {
    const samples = columnSamples(rows, index);
    const decision = decideHeaderlessColumn(samples);
    return {
      choice: decision.choice,
      header: "",
      index,
      sample: samples[0] ?? "",
      status: decision.status,
      suggestion: decision.choice,
    };
  });
  return markProductImportConflicts(columns);
}

export function refinePreviewItemNumberColumns(rows: string[][], columns: ProductImportMappedColumn[]) {
  const refined = columns.map((column) => {
    if (normalizeHeader(column.header) !== "item_no") return column;
    const samples = columnSamples(rows, column.index);
    if (samples.length === 0) return { ...column, choice: null, status: "review" as const, suggestion: null };
    if (samples.every((value) => HEADERLESS_SEQUENCE.test(value))) {
      return { ...column, choice: "ignore" as const, status: "ignored" as const, suggestion: "ignore" as const };
    }
    return { ...column, choice: "sku" as const, status: "mapped" as const, suggestion: "sku" as const };
  });
  return markProductImportConflicts(refined);
}

export function applyProductImportChoices(columns: ProductImportMappedColumn[], choices: ProductImportColumnChoice[]) {
  const byIndex = new Map(choices.map((choice) => [choice.index, choice.field]));
  const chosen = columns.map((column) => {
    if (!byIndex.has(column.index)) return { ...column, choice: null, status: "review" as const };
    const field = byIndex.get(column.index);
    if (field === "ignore") return { ...column, choice: "ignore" as const, status: "ignored" as const };
    if (!field) return { ...column, choice: null, status: "review" as const };
    return { ...column, choice: field, status: "mapped" as const };
  });
  return markProductImportConflicts(chosen);
}

function columnSamples(rows: string[][], index: number) {
  const samples: string[] = [];
  for (const row of rows) {
    const value = (row[index] ?? "").trim();
    if (!value) continue;
    samples.push(value);
    if (samples.length === 8) break;
  }
  return samples;
}

function decideHeaderlessColumn(samples: string[]): { choice: ProductImportColumn | "ignore" | null; status: "ignored" | "mapped" | "review" } {
  if (samples.length === 0) return { choice: null, status: "review" };
  if (samples.every((value) => HEADERLESS_SEQUENCE.test(value))) {
    return samples.some((value) => value.length <= 3) ? { choice: "ignore", status: "ignored" } : { choice: null, status: "review" };
  }
  if (samples.every((value) => HEADERLESS_BARCODE.test(value))) return { choice: "piece_barcode", status: "mapped" };
  if (samples.every((value) => HEADERLESS_SKU.test(value))) return { choice: "sku", status: "mapped" };
  if (samples.every((value) => /\p{L}/u.test(value))) return { choice: "product_name", status: "mapped" };
  return { choice: null, status: "review" };
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function parseDelimitedTable(text: string, delimiter: "," | "\t") {
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: ProductImportGridRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let lineNumber = 1;
  let rowStart = 1;
  let skippedBlankRows = 0;

  function finishRow() {
    cells.push(cell);
    if (cells.some((value) => value.trim() !== "")) {
      rows.push({ cells, lineNumber: rowStart });
    } else {
      skippedBlankRows += 1;
    }
    cells = [];
    cell = "";
    rowStart = lineNumber + 1;
  }

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? "";
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") lineNumber += 1;
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (char === "\n") {
      finishRow();
      lineNumber += 1;
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || cells.length > 0) finishRow();
  return { rows, skippedBlankRows };
}
