import { prisma } from "@/lib/db/prisma";
import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import {
  addProductLineToBucket,
  computeProductLinesForSale,
  conversionQtyOf,
  qtyNum,
  summarizeProductLines,
  PRODUCT_TABLE_SCAN_LIMIT,
  type ProductLineInput,
  type ProductLineMetrics,
  type ProductRankMetric,
  type ProductReportSummary,
} from "@/features/reports/product-table-math";
import {
  resolveProductTableRange,
  selectProductTableRows,
  type ProductTableQuery,
} from "@/features/reports/product-table-query";
import { computeSaleReportMetrics, moneyLak, type SaleReportFacts } from "@/features/reports/sales-table-math";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

export type ProductTableLoadOptions = { allRows?: boolean };

function clientOf(client?: any) {
  return client ?? db;
}

function clampQuery(scope: BranchScope, query: ProductTableQuery): ProductTableQuery {
  const next = { ...query };
  if (!scope.isOwner) next.branchId = scope.branchId;
  else if (next.branchId && !scope.branchIds.includes(next.branchId)) next.branchId = scope.branchId;
  return next;
}

function buildSaleWhere(scope: BranchScope, query: ProductTableQuery) {
  const range = resolveProductTableRange(query);
  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    branchId: query.branchId ?? scope.branchId,
    saleStatus: query.status ? query.status : { in: [...REPORT_SALE_STATUSES, "cancelled"] },
  };
  if (range.dateFrom || range.dateTo) {
    where.createdAt = {
      ...(range.dateFrom ? { gte: range.dateFrom instanceof Date ? range.dateFrom : new Date(range.dateFrom) } : {}),
      ...(range.dateTo ? { lte: range.dateTo instanceof Date ? range.dateTo : new Date(range.dateTo) } : {}),
    };
  }
  if (query.cashierId) where.createdBy = query.cashierId;
  const itemSome: Record<string, unknown> = {};
  if (query.productId) itemSome.productId = query.productId;
  if (query.categoryId) itemSome.product = { categoryId: query.categoryId };
  if (query.productQuery) {
    const q = query.productQuery;
    itemSome.product = {
      ...((itemSome.product as object) ?? {}),
      OR: [
        { nameEn: { contains: q, mode: "insensitive" } },
        { nameLo: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        { productCode: { contains: q, mode: "insensitive" } },
      ],
    };
  }
  if (query.skuQuery) {
    const q = query.skuQuery;
    itemSome.OR = [
      { product: { sku: { contains: q, mode: "insensitive" } } },
      { product: { barcode: { contains: q, mode: "insensitive" } } },
      { product: { productCode: { contains: q, mode: "insensitive" } } },
      { unit: { barcode: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (Object.keys(itemSome).length > 0) {
    where.OR = [
      { items: { some: itemSome } },
      ...(query.productId ? [{ refunds: { some: { exchangeItems: { some: { productId: query.productId } } } } }] : []),
    ];
  }
  return where;
}

type LoadedProduct = {
  barcode: string | null;
  categoryId: string | null;
  categoryName: string;
  conversionByUnit: Map<string, number>;
  id: string;
  isActive: boolean;
  name: string;
  sku: string;
  status: string;
  unitLabelById: Map<string, string>;
};

function productName(row: { nameEn?: string | null; nameLo?: string | null }) {
  return String(row.nameEn || row.nameLo || "Product");
}

function mapSaleFact(row: Record<string, any>): SaleReportFacts {
  return {
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    createdBy: String(row.createdBy ?? ""),
    discountAmount: row.discountAmount,
    id: String(row.id),
    items: (row.items ?? []).map((item: Record<string, any>) => ({
      costPrice: item.costPrice,
      id: String(item.id),
      profitAmount: item.profitAmount,
      quantity: item.quantity,
    })),
    payments: [],
    profitAmount: row.profitAmount,
    receiptNo: row.receiptNo ? String(row.receiptNo) : null,
    refunds: row.refunds ?? [],
    saleNo: String(row.saleNo ?? ""),
    saleStatus: String(row.saleStatus ?? ""),
    totalAmount: row.totalAmount,
  };
}

function lineInputs(row: Record<string, any>, products: Map<string, LoadedProduct>): ProductLineInput[] {
  return (row.items ?? []).map((item: Record<string, any>) => {
    const product = products.get(String(item.productId));
    const unitId = item.unitId ? String(item.unitId) : "";
    const conversion = item.unit?.conversionQty ?? product?.conversionByUnit.get(unitId) ?? 1;
    return {
      conversionQty: conversionQtyOf(conversion),
      costPrice: item.costPrice,
      id: String(item.id),
      productId: String(item.productId),
      profitAmount: item.profitAmount,
      quantity: item.quantity,
      totalAmount: item.totalAmount,
      unitId: item.unitId,
    };
  });
}

const PRODUCT_SNAPSHOT_SELECT = {
  barcode: true,
  category: { select: { id: true, nameEn: true, nameLo: true } },
  categoryId: true,
  id: true,
  isActive: true,
  nameEn: true,
  nameLo: true,
  productCode: true,
  sku: true,
  status: true,
  units: { select: { barcode: true, conversionQty: true, id: true, isBaseUnit: true, unitName: true } },
} as const;

function rememberProduct(map: Map<string, LoadedProduct>, product: Record<string, any> | undefined | null) {
  if (!product?.id) return;
  const id = String(product.id);
  if (map.has(id)) return;
  const conversionByUnit = new Map<string, number>();
  const unitLabelById = new Map<string, string>();
  for (const unit of product.units ?? []) {
    conversionByUnit.set(String(unit.id), conversionQtyOf(unit.conversionQty));
    unitLabelById.set(String(unit.id), String(unit.unitName || "Unit"));
  }
  map.set(id, {
    barcode: product.barcode ? String(product.barcode) : null,
    categoryId: product.categoryId ? String(product.categoryId) : null,
    categoryName: product.category ? productName(product.category) : "",
    conversionByUnit,
    id,
    isActive: product.isActive !== false && product.status === "active",
    name: productName(product),
    sku: String(product.sku || product.productCode || ""),
    status: String(product.status ?? "active"),
    unitLabelById,
  });
}

function collectProducts(rows: Array<Record<string, any>>): Map<string, LoadedProduct> {
  const map = new Map<string, LoadedProduct>();
  for (const sale of rows) {
    for (const item of sale.items ?? []) rememberProduct(map, item.product);
  }
  return map;
}

async function attachMissingExchangeProducts(rows: Array<Record<string, any>>, products: Map<string, LoadedProduct>, client: any) {
  const missing = new Set<string>();
  for (const sale of rows) {
    for (const refund of sale.refunds ?? []) {
      for (const item of refund.exchangeItems ?? []) {
        const productId = String(item.productId ?? "");
        if (productId && !products.has(productId)) missing.add(productId);
      }
    }
  }
  if (missing.size === 0) return;
  const extra = await client.product.findMany({
    select: PRODUCT_SNAPSHOT_SELECT,
    where: { id: { in: [...missing] } },
  });
  for (const product of extra) rememberProduct(products, product);
}

function attachExchangeConversion(row: Record<string, any>, products: Map<string, LoadedProduct>) {
  for (const refund of row.refunds ?? []) {
    for (const item of refund.exchangeItems ?? []) {
      const product = products.get(String(item.productId));
      const unitId = item.unitId ? String(item.unitId) : "";
      item.conversionQty = item.unit?.conversionQty ?? product?.conversionByUnit.get(unitId) ?? 1;
    }
  }
}

async function loadSaleRows(scope: BranchScope, query: ProductTableQuery, client: any) {
  const where = buildSaleWhere(scope, query);
  const count = await client.sale.count({ where });
  if (count > PRODUCT_TABLE_SCAN_LIMIT) throw new Error("PRODUCT_TABLE_TOO_LARGE");
  return client.sale.findMany({
    orderBy: { createdAt: "desc" },
    where,
    select: {
      createdAt: true,
      createdBy: true,
      discountAmount: true,
      id: true,
      items: {
        select: {
          costPrice: true,
          id: true,
          product: { select: PRODUCT_SNAPSHOT_SELECT },
          productId: true,
          profitAmount: true,
          quantity: true,
          totalAmount: true,
          unit: { select: { barcode: true, conversionQty: true, id: true, unitName: true } },
          unitId: true,
        },
      },
      profitAmount: true,
      receiptNo: true,
      refunds: {
        select: {
          exchangeItems: {
            select: {
              costPrice: true,
              productId: true,
              quantity: true,
              totalAmount: true,
              unitId: true,
            },
          },
          items: { select: { amount: true, productId: true, quantity: true, saleItemId: true, unitId: true } },
          kind: true,
          paymentAmount: true,
          refundAmount: true,
          totalAmount: true,
        },
      },
      saleNo: true,
      saleStatus: true,
      totalAmount: true,
    },
  });
}

async function loadCashierNames(client: any, userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await client.user.findMany({
    select: { fullName: true, id: true, username: true },
    where: { id: { in: unique } },
  });
  return new Map<string, string>(users.map((user: { fullName?: string | null; id: string; username?: string | null }) => [
    user.id,
    String(user.fullName || user.username || "Cashier"),
  ]));
}

type ProductBucket = {
  barcode: string;
  baseQty: number;
  billIds: Set<string>;
  categoryId: string | null;
  categoryName: string;
  costLak: number;
  grossLak: number;
  lastSoldAt?: string;
  name: string;
  netLak: number;
  netQty: number;
  productId: string;
  profitLak: number;
  qtySold: number;
  refundLak: number;
  refundQty: number;
  sku: string;
  unitIds: Set<string>;
  unitLabels: Set<string>;
  voidLak: number;
  voidQty: number;
  zeroSale?: boolean;
};

function newBucket(product: LoadedProduct | undefined, productId: string): ProductBucket {
  return {
    barcode: product?.barcode ?? "",
    baseQty: 0,
    billIds: new Set<string>(),
    categoryId: product?.categoryId ?? null,
    categoryName: product?.categoryName || "",
    costLak: 0,
    grossLak: 0,
    name: product?.name ?? productId,
    netLak: 0,
    netQty: 0,
    productId,
    profitLak: 0,
    qtySold: 0,
    refundLak: 0,
    refundQty: 0,
    sku: product?.sku ?? "",
    unitIds: new Set<string>(),
    unitLabels: new Set<string>(),
    voidLak: 0,
    voidQty: 0,
  };
}

function unitLabelFor(bucket: ProductBucket, mixedLabel: string) {
  if (bucket.unitLabels.size === 1) return [...bucket.unitLabels][0];
  if (bucket.unitLabels.size > 1) return mixedLabel;
  return "";
}

function recognizedSale(row: ProductSalesRow) {
  return row.qtySold > 0 || row.bills > 0 || row.netLak !== 0 || row.refundQty > 0;
}

export type ProductSalesRow = {
  barcode: string;
  baseQty: number;
  bills: number;
  categoryId: string | null;
  categoryName: string;
  costLak: number;
  grossLak: number;
  lastSoldAt?: string;
  name: string;
  netLak: number;
  netQty: number;
  productId: string;
  profitLak: number;
  qtySold: number;
  refundLak: number;
  refundQty: number;
  sku: string;
  unitLabel: string;
  voidLak: number;
  voidQty: number;
  zeroSale?: boolean;
};

export type ProductSaleDetailRow = {
  cashierName: string;
  costLak: number;
  createdAt: string;
  grossLak: number;
  netLak: number;
  profitLak: number;
  qty: number;
  receipt: string;
  refundLak: number;
  saleId: string;
  status: string;
  unitLabel: string;
  voidLak: number;
};

export type ProductSalesTableResult = {
  detailRows: ProductSaleDetailRow[];
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: ProductTableQuery;
  rows: ProductSalesRow[];
  selectedProduct?: ProductSalesRow;
  showCostProfit: boolean;
  summary: ProductReportSummary;
  totalRow: ProductSalesRow;
};

function compareProductRows(left: ProductSalesRow, right: ProductSalesRow, sort?: string, dir: "asc" | "desc" = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const value = (row: ProductSalesRow) => {
    switch (sort) {
      case "product":
        return row.name;
      case "sku":
        return row.sku;
      case "category":
        return row.categoryName;
      case "qty":
        return row.qtySold;
      case "baseQty":
        return row.baseQty;
      case "refundQty":
        return row.refundQty;
      case "voidQty":
        return row.voidQty;
      case "netQty":
        return row.netQty;
      case "bills":
        return row.bills;
      case "gross":
        return row.grossLak;
      case "refund":
        return row.refundLak;
      case "void":
        return row.voidLak;
      case "net":
        return row.netLak;
      case "cost":
        return row.costLak;
      case "profit":
        return row.profitLak;
      default:
        return row.netLak;
    }
  };
  const leftValue = value(left);
  const rightValue = value(right);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue)) * sign;
  }
  return (Number(leftValue) - Number(rightValue)) * sign;
}

function metricValue(row: ProductSalesRow, metric: ProductRankMetric) {
  if (metric === "units") return row.baseQty;
  if (metric === "profit") return row.profitLak;
  if (metric === "bills") return row.bills;
  return row.netLak;
}

async function loadScoped(tenant: TenantContext, query: ProductTableQuery, client?: any) {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const clamped = clampQuery(scope, query);
  const [rows, filterOptions] = await Promise.all([
    loadSaleRows(scope, clamped, dbClient),
    getReportFilterOptions(tenant, dbClient),
  ]);
  const products = collectProducts(rows);
  await attachMissingExchangeProducts(rows, products, dbClient);
  const cashiers = await loadCashierNames(dbClient, rows.map((row: Record<string, any>) => String(row.createdBy ?? "")));
  const lines: ProductLineMetrics[] = [];
  const details: ProductSaleDetailRow[] = [];
  let r2Net = 0;
  let r2Gross = 0;
  let r2Refund = 0;
  let r2Void = 0;
  let r2Cost = 0;
  let r2Profit = 0;
  for (const row of rows) {
    attachExchangeConversion(row, products);
    const facts = mapSaleFact(row);
    const saleMetrics = computeSaleReportMetrics(facts);
    r2Net += saleMetrics.netLak;
    r2Gross += saleMetrics.grossLak;
    r2Refund += saleMetrics.refundLak;
    r2Void += saleMetrics.voidLak;
    r2Cost += saleMetrics.costLak;
    r2Profit += saleMetrics.profitLak;
    const computed = computeProductLinesForSale(facts, lineInputs(row, products));
    for (const line of computed) {
      if (clamped.productId && line.productId !== clamped.productId) continue;
      if (clamped.categoryId) {
        const product = products.get(line.productId);
        if (product?.categoryId !== clamped.categoryId) continue;
      }
      lines.push(line);
      const product = products.get(line.productId);
      const unitLabel = line.unitId ? product?.unitLabelById.get(line.unitId) ?? "" : "";
      if (clamped.productId) {
        details.push({
          cashierName: cashiers.get(facts.createdBy) ?? "Cashier",
          costLak: line.costLak,
          createdAt: facts.createdAt.toISOString(),
          grossLak: line.grossLak,
          netLak: line.netLak,
          profitLak: line.profitLak,
          qty: line.qtySold || line.voidQty,
          receipt: facts.receiptNo || facts.saleNo,
          refundLak: line.refundLak,
          saleId: facts.id,
          status: facts.saleStatus,
          unitLabel,
          voidLak: line.voidLak,
        });
      }
    }
  }
  const buckets = new Map<string, ProductBucket>();
  for (const line of lines) {
    const product = products.get(line.productId);
    const bucket = buckets.get(line.productId) ?? newBucket(product, line.productId);
    addProductLineToBucket(bucket, line);
    if (line.unitId) {
      bucket.unitIds.add(line.unitId);
      const label = product?.unitLabelById.get(line.unitId);
      if (label) bucket.unitLabels.add(label);
    }
    buckets.set(line.productId, bucket);
  }
  return { buckets, cashiers, clamped, details, filterOptions, lines, products, r2: { costLak: r2Cost, grossLak: r2Gross, netLak: r2Net, profitLak: r2Profit, refundLak: r2Refund, voidLak: r2Void }, rows, scope };
}

function toProductRow(bucket: ProductBucket, mixedLabel: string): ProductSalesRow {
  return {
    barcode: bucket.barcode,
    baseQty: qtyNum(bucket.baseQty),
    bills: bucket.billIds.size,
    categoryId: bucket.categoryId,
    categoryName: bucket.categoryName,
    costLak: moneyLak(bucket.costLak),
    grossLak: moneyLak(bucket.grossLak),
    lastSoldAt: bucket.lastSoldAt,
    name: bucket.name,
    netLak: moneyLak(bucket.netLak),
    netQty: qtyNum(bucket.netQty),
    productId: bucket.productId,
    profitLak: moneyLak(bucket.profitLak),
    qtySold: qtyNum(bucket.qtySold),
    refundLak: moneyLak(bucket.refundLak),
    refundQty: qtyNum(bucket.refundQty),
    sku: bucket.sku,
    unitLabel: unitLabelFor(bucket, mixedLabel),
    voidLak: moneyLak(bucket.voidLak),
    voidQty: qtyNum(bucket.voidQty),
    zeroSale: bucket.zeroSale,
  };
}

function emptyTotalRow(): ProductSalesRow {
  return {
    barcode: "",
    baseQty: 0,
    bills: 0,
    categoryId: null,
    categoryName: "",
    costLak: 0,
    grossLak: 0,
    name: "",
    netLak: 0,
    netQty: 0,
    productId: "total",
    profitLak: 0,
    qtySold: 0,
    refundLak: 0,
    refundQty: 0,
    sku: "",
    unitLabel: "",
    voidLak: 0,
    voidQty: 0,
  };
}

export async function loadProductSalesTable(
  tenant: TenantContext,
  query: ProductTableQuery,
  client?: any,
  options?: ProductTableLoadOptions,
): Promise<ProductSalesTableResult> {
  const loaded = await loadScoped(tenant, query, client);
  const mixedLabel = "Mixed";
  let productRows = [...loaded.buckets.values()].map((bucket) => toProductRow(bucket, mixedLabel));
  const selectedProduct = query.productId ? productRows.find((row) => row.productId === query.productId) : undefined;
  productRows = productRows.sort((left, right) => compareProductRows(left, right, loaded.clamped.sort, loaded.clamped.dir));
  const summary = summarizeProductLines(
    loaded.lines,
    productRows.filter((row) => row.qtySold > 0 || row.bills > 0 || row.voidQty > 0).length,
    new Set(productRows.map((row) => row.categoryId).filter(Boolean)).size,
  );
  const paged = selectProductTableRows(productRows, loaded.clamped.page, 50, options?.allRows === true);
  const totalRow = emptyTotalRow();
  totalRow.bills = summary.bills;
  totalRow.baseQty = summary.baseQty;
  totalRow.costLak = summary.costLak;
  totalRow.grossLak = summary.grossLak;
  totalRow.netLak = summary.netLak;
  totalRow.netQty = summary.netQty;
  totalRow.profitLak = summary.profitLak;
  totalRow.qtySold = summary.qtySold;
  totalRow.refundLak = summary.refundLak;
  totalRow.refundQty = summary.refundQty;
  totalRow.voidLak = summary.voidLak;
  totalRow.voidQty = summary.voidQty;
  return {
    detailRows: loaded.details.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    filterOptions: loaded.filterOptions,
    page: paged.page,
    pageCount: paged.pageCount,
    pageSize: 50,
    query: { ...loaded.clamped, page: paged.page },
    rows: paged.rows,
    selectedProduct,
    showCostProfit: true,
    summary,
    totalRow,
  };
}

export type CategorySalesRow = {
  bills: number;
  categoryId: string;
  categoryName: string;
  costLak: number;
  grossLak: number;
  netLak: number;
  products: number;
  profitLak: number;
  refundLak: number;
  unitsSold: number;
  voidLak: number;
};

export type CategorySalesTableResult = {
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: ProductTableQuery;
  rows: CategorySalesRow[];
  showCostProfit: boolean;
  summary: ProductReportSummary;
  totalRow: CategorySalesRow;
};

export async function loadCategorySalesTable(
  tenant: TenantContext,
  query: ProductTableQuery,
  client?: any,
  options?: ProductTableLoadOptions,
): Promise<CategorySalesTableResult> {
  const loaded = await loadScoped(tenant, { ...query, productId: undefined }, client);
  const categories = new Map<string, CategorySalesRow & { billIds: Set<string>; productIds: Set<string> }>();
  for (const [productId, bucket] of loaded.buckets) {
    const categoryId = bucket.categoryId || "uncategorized";
    const current = categories.get(categoryId) ?? {
      billIds: new Set<string>(),
      bills: 0,
      categoryId,
      categoryName: bucket.categoryName || "",
      costLak: 0,
      grossLak: 0,
      netLak: 0,
      productIds: new Set<string>(),
      products: 0,
      profitLak: 0,
      refundLak: 0,
      unitsSold: 0,
      voidLak: 0,
    };
    current.costLak += bucket.costLak;
    current.grossLak += bucket.grossLak;
    current.netLak += bucket.netLak;
    current.profitLak += bucket.profitLak;
    current.refundLak += bucket.refundLak;
    current.unitsSold += bucket.baseQty;
    current.voidLak += bucket.voidLak;
    current.productIds.add(productId);
    for (const billId of bucket.billIds) current.billIds.add(billId);
    categories.set(categoryId, current);
  }
  let rows = [...categories.values()].map((row) => ({
    bills: row.billIds.size,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    costLak: moneyLak(row.costLak),
    grossLak: moneyLak(row.grossLak),
    netLak: moneyLak(row.netLak),
    products: row.productIds.size,
    profitLak: moneyLak(row.profitLak),
    refundLak: moneyLak(row.refundLak),
    unitsSold: qtyNum(row.unitsSold),
    voidLak: moneyLak(row.voidLak),
  }));
  const sort = loaded.clamped.sort;
  const sign = loaded.clamped.dir === "asc" ? 1 : -1;
  rows = rows.sort((left, right) => {
    const pick = (row: CategorySalesRow) => {
      if (sort === "category") return row.categoryName;
      if (sort === "products") return row.products;
      if (sort === "units") return row.unitsSold;
      if (sort === "bills") return row.bills;
      if (sort === "gross") return row.grossLak;
      if (sort === "refund") return row.refundLak;
      if (sort === "void") return row.voidLak;
      if (sort === "cost") return row.costLak;
      if (sort === "profit") return row.profitLak;
      return row.netLak;
    };
    const leftValue = pick(left);
    const rightValue = pick(right);
    if (typeof leftValue === "string") return leftValue.localeCompare(String(rightValue)) * sign;
    return (Number(leftValue) - Number(rightValue)) * sign;
  });
  const summary = summarizeProductLines(
    loaded.lines,
    loaded.buckets.size,
    rows.length,
  );
  const paged = selectProductTableRows(rows, loaded.clamped.page, 50, options?.allRows === true);
  return {
    filterOptions: loaded.filterOptions,
    page: paged.page,
    pageCount: paged.pageCount,
    pageSize: 50,
    query: { ...loaded.clamped, page: paged.page },
    rows: paged.rows,
    showCostProfit: true,
    summary,
    totalRow: {
      bills: summary.bills,
      categoryId: "total",
      categoryName: "",
      costLak: summary.costLak,
      grossLak: summary.grossLak,
      netLak: summary.netLak,
      products: summary.productsSold,
      profitLak: summary.profitLak,
      refundLak: summary.refundLak,
      unitsSold: summary.baseQty,
      voidLak: summary.voidLak,
    },
  };
}

export type ProductPerformanceRow = ProductSalesRow & { rank: number };

export type ProductPerformanceResult = {
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: ProductTableQuery;
  rows: ProductPerformanceRow[];
  showCostProfit: boolean;
  summary: ProductReportSummary;
};

async function loadZeroSaleProducts(
  tenant: TenantContext,
  query: ProductTableQuery,
  soldIds: Set<string>,
  client: any,
  scope: BranchScope,
) {
  if (!query.includeZeroSales) return [] as ProductSalesRow[];
  const products = await client.product.findMany({
    select: {
      barcode: true,
      category: { select: { nameEn: true, nameLo: true } },
      categoryId: true,
      id: true,
      nameEn: true,
      nameLo: true,
      productCode: true,
      sku: true,
      units: { select: { isBaseUnit: true, unitName: true } },
    },
    where: {
      companyId: scope.companyId,
      isActive: true,
      status: "active",
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.productQuery
        ? {
            OR: [
              { nameEn: { contains: query.productQuery, mode: "insensitive" } },
              { nameLo: { contains: query.productQuery, mode: "insensitive" } },
              { sku: { contains: query.productQuery, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(soldIds.size ? { id: { notIn: [...soldIds] } } : {}),
    },
  });
  const leftover = products.filter((product: { id: string }) => !soldIds.has(product.id));
  const leftoverIds = leftover.map((product: { id: string }) => product.id);
  const lastSold = new Map<string, string>();
  if (leftoverIds.length > 0) {
    const history = await client.saleItem.findMany({
      select: { productId: true, sale: { select: { createdAt: true } } },
      where: {
        productId: { in: leftoverIds },
        sale: { companyId: scope.companyId, saleStatus: { in: [...REPORT_SALE_STATUSES] } },
      },
    });
    for (const row of history) {
      const at = row.sale.createdAt instanceof Date ? row.sale.createdAt.toISOString() : String(row.sale.createdAt);
      const current = lastSold.get(row.productId);
      if (!current || at > current) lastSold.set(row.productId, at);
    }
  }
  return leftover.map((product: any) => {
    const base = product.units?.find((unit: { isBaseUnit: boolean }) => unit.isBaseUnit);
    return {
      barcode: product.barcode ?? "",
      baseQty: 0,
      bills: 0,
      categoryId: product.categoryId,
      categoryName: product.category ? productName(product.category) : "",
      costLak: 0,
      grossLak: 0,
      lastSoldAt: lastSold.get(product.id),
      name: productName(product),
      netLak: 0,
      netQty: 0,
      productId: product.id,
      profitLak: 0,
      qtySold: 0,
      refundLak: 0,
      refundQty: 0,
      sku: String(product.sku || product.productCode || ""),
      unitLabel: base?.unitName ?? "",
      voidLak: 0,
      voidQty: 0,
      zeroSale: true,
    } satisfies ProductSalesRow;
  });
}

export async function loadProductPerformanceTable(
  tenant: TenantContext,
  query: ProductTableQuery,
  client?: any,
  options?: ProductTableLoadOptions,
): Promise<ProductPerformanceResult> {
  const loaded = await loadScoped(tenant, { ...query, productId: undefined }, client);
  const mixedLabel = "Mixed";
  const sold = [...loaded.buckets.values()].map((bucket) => toProductRow(bucket, mixedLabel));
  const recognized = sold.filter(recognizedSale);
  const zeros = await loadZeroSaleProducts(
    tenant,
    loaded.clamped,
    new Set(sold.map((row) => row.productId)),
    clientOf(client),
    loaded.scope,
  );
  const ranked = recognized.sort((left, right) => {
    const diff = metricValue(left, loaded.clamped.rankMetric) - metricValue(right, loaded.clamped.rankMetric);
    return loaded.clamped.view === "slow" ? diff : -diff;
  });
  const sliced = ranked.slice(0, loaded.clamped.topN);
  const withZeros = loaded.clamped.includeZeroSales && loaded.clamped.view === "slow"
    ? [...sliced, ...zeros]
    : loaded.clamped.includeZeroSales && loaded.clamped.view === "best"
      ? sliced
      : sliced;
  const rows: ProductPerformanceRow[] = withZeros.map((row, index) => ({
    ...row,
    rank: row.zeroSale ? 0 : index + 1,
  }));
  const summary = summarizeProductLines(loaded.lines, recognized.length, new Set(recognized.map((row) => row.categoryId).filter(Boolean)).size);
  const paged = selectProductTableRows(rows, loaded.clamped.page, 50, options?.allRows === true);
  return {
    filterOptions: loaded.filterOptions,
    page: paged.page,
    pageCount: paged.pageCount,
    pageSize: 50,
    query: { ...loaded.clamped, page: paged.page },
    rows: paged.rows,
    showCostProfit: true,
    summary,
  };
}

export function productReportR2Totals(lines: ProductLineMetrics[]) {
  return summarizeProductLines(lines);
}
