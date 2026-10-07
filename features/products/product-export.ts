import { PRODUCT_IMPORT_COLUMNS, PRODUCT_IMPORT_TEMPLATE_CSV } from "@/features/products/product-import";
import { unitRole, type UnitRole } from "@/features/products/unit-hierarchy";

export const PRODUCT_EXPORT_MAX_ROWS = 5000;

const IMPORT_HEADER = PRODUCT_IMPORT_TEMPLATE_CSV.replace(/^\uFEFF/, "").split("\n")[0] ?? "";

export const PRODUCT_EXPORT_EXTRA_HEADERS = [
  "Name EN",
  "Piece Enabled",
  "On Hand Warehouse",
  "On Hand",
  "Image Path",
] as const;

const CUSTOM_FIELDS = ["Name", "Enabled", "Qty in Base", "Barcode", "Cost", "Selling Price", "Rounding", "Image Path"] as const;

export type ProductExportUnit = {
  allowManualUnitSelect?: boolean;
  barcode?: string;
  conversionQty?: number;
  costPriceLak?: number | null;
  imageUrl?: string;
  roundingLak?: number;
  sellingPriceLak?: number | null;
  status?: string;
  unitName: string;
};

export type ProductExportStock = {
  quantity: number;
  warehouseName: string;
};

export type ProductExportSource = {
  brandName?: string;
  categoryName?: string;
  createdAt?: string;
  id?: string;
  imageUrl?: string;
  minStock?: number;
  nameEn?: string;
  nameLo?: string;
  onHandQuantity?: number | null;
  onHandWarehouse?: string;
  productBarcode?: string;
  productCode?: string;
  sku?: string;
  status?: string;
  stock?: ProductExportStock[];
  supplierName?: string;
  units?: ProductExportUnit[];
  updatedAt?: string;
};

export type ProductExportTable = {
  customUnitCount: number;
  headers: string[];
  rows: string[][];
};

export function productExportFilename(scope: "all" | "filtered" | "selected", format: "csv" | "xlsx", date = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(date);
  const suffix = scope === "all" ? "" : `-${scope}`;
  return `ego-products${suffix}-${day}.${format}`;
}

export function buildProductExportTable(products: ProductExportSource[]): ProductExportTable {
  const grouped = products.map(groupUnits);
  const customUnitCount = grouped.reduce((max, product) => Math.max(max, product.custom.length), 0);
  const headers = [
    ...importHeaders(),
    ...PRODUCT_EXPORT_EXTRA_HEADERS,
    ...customHeaders(customUnitCount),
  ];
  return {
    customUnitCount,
    headers,
    rows: grouped.map((product) => productRow(product, customUnitCount)),
  };
}

export function buildProductExportCsv(products: ProductExportSource[]) {
  const table = buildProductExportTable(products);
  const lines = [table.headers.join(","), ...table.rows.map((row) => row.map(csvCell).join(","))];
  return `\uFEFF${lines.join("\n")}\n`;
}

export function productExportUnitRows(products: ProductExportSource[]) {
  return products.flatMap((product) => {
    const grouped = groupUnits(product);
    return [...grouped.standard, ...grouped.custom].map((unit) => ({
      barcode: clean(unit.barcode),
      conversionQty: numberText(unit.conversionQty),
      cost: moneyText(unit.costPriceLak),
      enabled: unit.enabled ? "yes" : "no",
      imagePath: safeImagePath(unit.imageUrl),
      productName: grouped.productName,
      role: unit.role,
      roundingLak: numberText(unit.roundingLak),
      sellingPrice: moneyText(unit.sellingPriceLak),
      sku: clean(product.sku),
      status: unit.status,
      unitName: unit.unitName,
    }));
  });
}

export function productExportStockRows(products: ProductExportSource[]) {
  return products.flatMap((product) => (product.stock ?? []).map((row) => ({
    productName: displayName(product),
    quantity: numberText(row.quantity),
    sku: clean(product.sku),
    warehouseName: clean(row.warehouseName),
  })));
}

export function redactProductExportCosts(products: ProductExportSource[]) {
  return products.map((product) => ({
    ...product,
    units: (product.units ?? []).map((unit) => ({ ...unit, costPriceLak: null })),
  }));
}

function importHeaders() {
  const headers = IMPORT_HEADER.split(",");
  if (headers.length !== PRODUCT_IMPORT_COLUMNS.length) {
    throw new Error("Product export columns do not match the import template.");
  }
  return headers;
}

function customHeaders(count: number) {
  const headers: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    for (const field of CUSTOM_FIELDS) headers.push(`Custom Unit ${index} ${field}`);
  }
  return headers;
}

type GroupedUnit = ProductExportUnit & { enabled: boolean; role: UnitRole; status: string };

function groupUnits(product: ProductExportSource) {
  const ordered = [...(product.units ?? [])];
  const used = new Set<number>();
  const standard: GroupedUnit[] = [];
  for (const role of ["piece", "pack", "box"] as const) {
    const index = ordered.findIndex((unit, unitIndex) => !used.has(unitIndex) && unitRole(unit.unitName) === role);
    if (index >= 0) {
      used.add(index);
      standard.push(presentUnit(ordered[index]!, role));
    }
  }
  const custom = ordered
    .map((unit, index) => ({ index, unit }))
    .filter((item) => !used.has(item.index))
    .map((item) => presentUnit(item.unit, unitRole(item.unit.unitName) === "custom" ? "custom" : unitRole(item.unit.unitName)));
  const piece = standard.find((unit) => unit.role === "piece");
  return {
    custom,
    product,
    productName: displayName(product),
    standard,
    piece: piece ?? (ordered.length === 0 && product.productBarcode
      ? presentUnit({
          barcode: product.productBarcode,
          conversionQty: 1,
          status: "active",
          unitName: "Piece",
        }, "piece")
      : undefined),
  };
}

function presentUnit(unit: ProductExportUnit, role: UnitRole): GroupedUnit {
  const status = unit.status === "inactive" ? "inactive" : "active";
  return {
    ...unit,
    enabled: status !== "inactive" && unit.allowManualUnitSelect !== false,
    role,
    status,
  };
}

function productRow(grouped: ReturnType<typeof groupUnits>, customUnitCount: number) {
  const piece = grouped.standard.find((unit) => unit.role === "piece") ?? grouped.piece;
  const pack = grouped.standard.find((unit) => unit.role === "pack");
  const box = grouped.standard.find((unit) => unit.role === "box");
  const product = grouped.product;
  const core = [
    grouped.productName,
    clean(product.sku),
    clean(product.categoryName),
    clean(product.brandName),
    clean(product.supplierName),
    clean(product.status),
    clean(piece?.barcode),
    moneyText(piece?.costPriceLak),
    moneyText(piece?.sellingPriceLak),
    numberText(piece?.roundingLak),
    pack ? (pack.enabled ? "yes" : "no") : "no",
    pack ? numberText(pack.conversionQty) : "",
    clean(pack?.barcode),
    moneyText(pack?.costPriceLak),
    moneyText(pack?.sellingPriceLak),
    pack ? numberText(pack.roundingLak) : "",
    box ? (box.enabled ? "yes" : "no") : "no",
    box ? numberText(box.conversionQty) : "",
    clean(box?.barcode),
    moneyText(box?.costPriceLak),
    moneyText(box?.sellingPriceLak),
    box ? numberText(box.roundingLak) : "",
    "",
    "",
    numberText(product.minStock),
    clean(product.nameEn),
    piece?.enabled ? "yes" : "no",
    clean(product.onHandWarehouse),
    product.onHandQuantity == null ? "" : numberText(product.onHandQuantity),
    safeImagePath(product.imageUrl),
  ];
  const custom: string[] = [];
  for (let index = 0; index < customUnitCount; index += 1) {
    const unit = grouped.custom[index];
    custom.push(
      clean(unit?.unitName),
      unit ? (unit.enabled ? "yes" : "no") : "",
      unit ? numberText(unit.conversionQty) : "",
      clean(unit?.barcode),
      moneyText(unit?.costPriceLak),
      moneyText(unit?.sellingPriceLak),
      unit ? numberText(unit.roundingLak) : "",
      safeImagePath(unit?.imageUrl),
    );
  }
  return [...core, ...custom];
}

export function safeImagePath(value?: string) {
  const path = clean(value);
  if (!path) return "";
  if (/^https?:\/\//i.test(path) || /^data:/i.test(path) || /x-amz-|signature=|expires=/i.test(path)) return "";
  return path;
}

function displayName(product: ProductExportSource) {
  return clean(product.nameLo) || clean(product.nameEn);
}

function clean(value?: string | null) {
  return String(value ?? "").trim();
}

function numberText(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return String(Number(value));
}

function moneyText(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return String(Math.round(Number(value)));
}

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export const PRODUCT_EXPORT_FIELDS = [
  "productName",
  "nameEn",
  "sku",
  "productCode",
  "status",
  "createdAt",
  "updatedAt",
  "category",
  "brand",
  "supplier",
  "unitName",
  "unitEnabled",
  "qtyInBase",
  "sellingPrice",
  "cost",
  "rounding",
  "barcode",
  "onHand",
  "reorderLevel",
  "productImage",
  "unitImage",
] as const;

export type ProductExportField = (typeof PRODUCT_EXPORT_FIELDS)[number];

export const DEFAULT_PRODUCT_EXPORT_FIELDS: ProductExportField[] = [
  "productName",
  "sku",
  "category",
  "brand",
  "status",
  "unitName",
  "sellingPrice",
  "barcode",
  "onHand",
];

export const PRODUCT_EXPORT_PRESETS: Record<"basic" | "full" | "inventory", ProductExportField[]> = {
  basic: ["productName", "sku", "category", "unitName", "sellingPrice", "barcode"],
  inventory: ["productName", "sku", "unitName", "onHand", "reorderLevel"],
  full: [...PRODUCT_EXPORT_FIELDS],
};

const UNIT_FIELDS = new Set<ProductExportField>(["unitName", "unitEnabled", "qtyInBase", "sellingPrice", "cost", "rounding", "barcode", "unitImage"]);
const UNIT_NAME_TRIGGERS = new Set<ProductExportField>(["unitEnabled", "qtyInBase", "sellingPrice", "cost", "rounding", "barcode", "unitImage"]);
const PRODUCT_FIELDS = new Set<ProductExportField>(PRODUCT_EXPORT_FIELDS.filter((field) => !UNIT_FIELDS.has(field)));

export const PRODUCT_EXPORT_EMBED_LIMIT = 120;

export function normalizeProductExportFields(fields?: readonly string[], allowCost = true): ProductExportField[] {
  const requested = new Set((fields && fields.length > 0 ? fields : DEFAULT_PRODUCT_EXPORT_FIELDS).filter((field): field is ProductExportField => PRODUCT_EXPORT_FIELDS.includes(field as ProductExportField)));
  if ([...requested].some((field) => UNIT_NAME_TRIGGERS.has(field))) requested.add("unitName");
  if (!allowCost) requested.delete("cost");
  return PRODUCT_EXPORT_FIELDS.filter((field) => requested.has(field));
}

export function detailedExportUsesUnits(fields: readonly ProductExportField[]) {
  return fields.some((field) => UNIT_FIELDS.has(field));
}

export type DetailedExportSheet = {
  headers: string[];
  rows: string[][];
};

export type DetailedProductExport = {
  csv: string;
  headers: string[];
  imageCount: number;
  productCount: number;
  productsSheet: DetailedExportSheet | null;
  rows: string[][];
  stockSheet: DetailedExportSheet | null;
  unitCount: number;
  unitsSheet: DetailedExportSheet | null;
};

export function buildDetailedProductExport(products: ProductExportSource[], requested?: readonly string[], allowCost = true): DetailedProductExport {
  const fields = normalizeProductExportFields(requested, allowCost);
  const unitMode = detailedExportUsesUnits(fields);
  const productColumns = productColumnsFor(fields);
  const unitColumns = unitColumnsFor(fields);
  const identityColumns = unitMode
    ? [productColumn("productName"), productColumn("sku")].filter((column) => !productColumns.some((existing) => existing.header === column.header))
    : [];
  const csvProductColumns = [...identityColumns, ...productColumns];
  const csvHeaders = [...csvProductColumns.map((column) => column.header), ...unitColumns.map((column) => column.header)];
  const rows: string[][] = [];
  let unitCount = 0;
  let imageCount = 0;
  const productRows: string[][] = [];
  const unitRows: string[][] = [];
  const stockRows: string[][] = [];

  for (const product of products) {
    const grouped = groupUnits(product);
    const units = [...grouped.standard, ...grouped.custom];
    unitCount += units.length;
    if (fields.includes("productImage") && safeImagePath(product.imageUrl)) imageCount += 1;
    if (fields.includes("unitImage")) imageCount += units.filter((unit) => safeImagePath(unit.imageUrl)).length;
    productRows.push(productColumns.map((column) => column.value(product, grouped)));
    const exportUnits = unitMode ? (units.length > 0 ? units : [undefined]) : [undefined];
    if (!unitMode) {
      rows.push(csvProductColumns.map((column) => column.value(product, grouped)));
    }
    for (const unit of exportUnits) {
      if (!unitMode) break;
      const row = [
        ...csvProductColumns.map((column) => column.value(product, grouped)),
        ...unitColumns.map((column) => column.value(product, grouped, unit)),
      ];
      rows.push(row);
      unitRows.push([
        grouped.productName,
        clean(product.sku),
        ...unitColumns.map((column) => column.value(product, grouped, unit)),
      ]);
    }
    if (fields.includes("onHand")) {
      for (const stock of product.stock ?? []) {
        stockRows.push([grouped.productName, clean(product.sku), clean(stock.warehouseName), numberText(stock.quantity)]);
      }
    }
  }

  const lines = [csvHeaders.join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return {
    csv: `\uFEFF${lines.join("\n")}\n`,
    headers: csvHeaders,
    imageCount,
    productCount: products.length,
    productsSheet: productColumns.length > 0 ? { headers: productColumns.map((column) => column.header), rows: productRows } : null,
    rows,
    stockSheet: fields.includes("onHand") ? { headers: ["Product Name", "SKU", "Warehouse", "On Hand"], rows: stockRows } : null,
    unitCount,
    unitsSheet: unitMode ? { headers: ["Product Name", "SKU", ...unitColumns.map((column) => column.header)], rows: unitRows } : null,
  };
}

export function orderExportSources<T extends { id?: string }>(products: T[], ids: readonly string[]) {
  const rank = new Map(ids.map((id, index) => [id, index]));
  return [...products].sort((left, right) => (rank.get(left.id ?? "") ?? ids.length) - (rank.get(right.id ?? "") ?? ids.length));
}

type ExportColumn = {
  header: string;
  value: (product: ProductExportSource, grouped: ReturnType<typeof groupUnits>, unit?: GroupedUnit) => string;
};

function productColumnsFor(fields: readonly ProductExportField[]): ExportColumn[] {
  const columns: ExportColumn[] = [];
  for (const field of fields) {
    if (!PRODUCT_FIELDS.has(field)) continue;
    if (field === "onHand") {
      columns.push({ header: "On Hand Warehouse", value: (product) => clean(product.onHandWarehouse) });
      columns.push({ header: "On Hand", value: (product) => product.onHandQuantity == null ? "" : numberText(product.onHandQuantity) });
      continue;
    }
    columns.push(productColumn(field));
  }
  return columns;
}

function unitColumnsFor(fields: readonly ProductExportField[]): ExportColumn[] {
  return fields.filter((field) => UNIT_FIELDS.has(field)).map((field) => unitColumn(field));
}

function productColumn(field: ProductExportField): ExportColumn {
  const columns: Record<string, ExportColumn> = {
    brand: { header: "Brand", value: (product) => clean(product.brandName) },
    category: { header: "Category", value: (product) => clean(product.categoryName) },
    createdAt: { header: "Created Date", value: (product) => exportDate(product.createdAt) },
    nameEn: { header: "Name EN", value: (product) => clean(product.nameEn) },
    productCode: { header: "Product Code", value: (product) => clean(product.productCode) },
    productImage: { header: "Product Image Path", value: (product) => safeImagePath(product.imageUrl) || "No Image" },
    productName: { header: "Product Name", value: (_product, grouped) => grouped.productName },
    reorderLevel: { header: "Reorder Level", value: (product) => numberText(product.minStock) },
    sku: { header: "SKU", value: (product) => clean(product.sku) },
    status: { header: "Status", value: (product) => clean(product.status) },
    supplier: { header: "Supplier", value: (product) => clean(product.supplierName) },
    updatedAt: { header: "Updated Date", value: (product) => exportDate(product.updatedAt) },
  };
  return columns[field] ?? { header: field, value: () => "" };
}

function unitColumn(field: ProductExportField): ExportColumn {
  const columns: Record<string, ExportColumn> = {
    barcode: { header: "Barcode", value: (_product, _grouped, unit) => clean(unit?.barcode) },
    cost: { header: "Cost", value: (_product, _grouped, unit) => moneyText(unit?.costPriceLak) },
    qtyInBase: { header: "Qty in Base", value: (_product, _grouped, unit) => unit ? numberText(unit.conversionQty) : "" },
    rounding: { header: "Rounding", value: (_product, _grouped, unit) => unit ? numberText(unit.roundingLak) : "" },
    sellingPrice: { header: "Selling Price", value: (_product, _grouped, unit) => moneyText(unit?.sellingPriceLak) },
    unitEnabled: { header: "Unit Enabled", value: (_product, _grouped, unit) => unit ? (unit.enabled ? "yes" : "no") : "" },
    unitImage: { header: "Unit Image Path", value: (_product, _grouped, unit) => safeImagePath(unit?.imageUrl) || (unit ? "No Image" : "") },
    unitName: { header: "Unit Name", value: (_product, _grouped, unit) => clean(unit?.unitName) },
  };
  return columns[field] ?? { header: field, value: () => "" };
}

function exportDate(value?: string) {
  const text = clean(value);
  if (!text) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Bangkok", year: "numeric" }).format(parsed);
}
