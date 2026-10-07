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
  imageUrl?: string;
  minStock?: number;
  nameEn?: string;
  nameLo?: string;
  onHandQuantity?: number | null;
  onHandWarehouse?: string;
  productBarcode?: string;
  sku?: string;
  status?: string;
  stock?: ProductExportStock[];
  supplierName?: string;
  units?: ProductExportUnit[];
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
