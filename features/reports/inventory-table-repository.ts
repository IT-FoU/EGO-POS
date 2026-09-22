import { prisma } from "@/lib/db/prisma";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import {
  availableBaseQty,
  classifyInventoryStock,
  emptyInventorySummary,
  hasReorderThreshold,
  INVENTORY_TABLE_PAGE_SIZE,
  matchesInventoryStockStatus,
  moneyLak,
  qtyNum,
  stockValueLak,
  summarizeInventoryRows,
  type InventoryReportSummary,
  type InventoryStockClass,
} from "@/features/reports/inventory-table-math";
import type { InventoryTableQuery } from "@/features/reports/inventory-table-query";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

export type InventoryTableLoadOptions = { allRows?: boolean };

export type InventoryStockRow = {
  alreadyOrdered: boolean;
  available: number;
  baseUnit: string;
  categoryName: string;
  lastMovementAt?: string;
  lastReceivedAt?: string;
  lastSoldAt?: string;
  minStock: number;
  onHand: number;
  productId: string;
  productName: string;
  reorderNeeded: boolean;
  reserved: number;
  sku: string;
  status: InventoryStockClass;
  stockValueLak: number;
  supplierName: string;
  unitCostLak: number;
  warehouseId: string;
  warehouseName: string;
};

export type InventoryMovementDetail = {
  afterQty: number;
  beforeQty: number;
  createdAt: string;
  movementType: string;
  note: string;
  quantity: number;
  unitLabel: string;
};

export type InventoryOnHandResult = {
  detailMovements: InventoryMovementDetail[];
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: InventoryTableQuery;
  rows: InventoryStockRow[];
  selectedProduct?: InventoryStockRow;
  showCost: boolean;
  summary: InventoryReportSummary;
  totalRow: Pick<InventoryStockRow, "available" | "onHand" | "reserved" | "stockValueLak"> & { productCount: number };
};

export type InventoryLowStockResult = InventoryOnHandResult;

function clientOf(client?: any) {
  return client ?? db;
}

function productLabel(product: { nameEn?: string | null; nameLo?: string | null }) {
  return String(product.nameEn || product.nameLo || "Product");
}

function clampQuery(scope: BranchScope, query: InventoryTableQuery): InventoryTableQuery {
  const next = { ...query };
  if (!scope.isOwner) {
    next.branchId = scope.branchId;
  } else if (next.branchId && !scope.branchIds.includes(next.branchId)) {
    next.branchId = scope.branchId;
  }
  return next;
}

function compareRows(left: InventoryStockRow, right: InventoryStockRow, sort?: string, dir: "asc" | "desc" = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const value = (row: InventoryStockRow) => {
    switch (sort) {
      case "product":
        return row.productName;
      case "sku":
        return row.sku;
      case "category":
        return row.categoryName;
      case "onHand":
        return row.onHand;
      case "reserved":
        return row.reserved;
      case "available":
        return row.available;
      case "minStock":
        return row.minStock;
      case "status":
        return row.status;
      case "unitCost":
        return row.unitCostLak;
      case "stockValue":
        return row.stockValueLak;
      case "supplier":
        return row.supplierName;
      case "lastMovement":
        return row.lastMovementAt ?? "";
      case "lastReceived":
        return row.lastReceivedAt ?? "";
      case "lastSold":
        return row.lastSoldAt ?? "";
      default:
        return row.productName;
    }
  };
  const leftValue = value(left);
  const rightValue = value(right);
  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue).localeCompare(String(rightValue)) * sign;
  }
  return (Number(leftValue) - Number(rightValue)) * sign;
}

async function loadWarehouses(scope: BranchScope, query: InventoryTableQuery, client: any) {
  const where: Record<string, unknown> = { companyId: scope.companyId };
  const branchId = query.branchId ?? (scope.isOwner ? undefined : scope.branchId);
  if (branchId) where.branchId = branchId;
  else where.branchId = { in: scope.branchIds };
  if (query.warehouseId) where.id = query.warehouseId;
  const warehouses = await client.warehouse.findMany({
    orderBy: { name: "asc" },
    select: { branchId: true, id: true, name: true },
    where,
  });
  return warehouses as Array<{ branchId: string; id: string; name: string }>;
}

async function loadActiveProducts(scope: BranchScope, query: InventoryTableQuery, warehouseBranchIds: string[], client: any) {
  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    isActive: true,
    status: "active",
    branchId: query.branchId ?? { in: warehouseBranchIds.length ? warehouseBranchIds : scope.branchIds },
  };
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.supplierId) where.supplierId = query.supplierId;
  if (query.productId) where.id = query.productId;
  const search = query.productQuery || query.skuQuery;
  if (search) {
    where.OR = [
      { nameEn: { contains: search, mode: "insensitive" } },
      { nameLo: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search, mode: "insensitive" } },
      { productCode: { contains: search, mode: "insensitive" } },
      { units: { some: { barcode: { contains: search, mode: "insensitive" } } } },
    ];
  }
  return client.product.findMany({
    select: {
      barcode: true,
      category: { select: { nameEn: true, nameLo: true } },
      categoryId: true,
      costPriceLak: true,
      id: true,
      minStock: true,
      nameEn: true,
      nameLo: true,
      productCode: true,
      sku: true,
      supplier: { select: { companyName: true, name: true } },
      supplierId: true,
      units: {
        select: { costPriceLak: true, id: true, isBaseUnit: true, unitName: true },
        where: { status: "active" },
      },
    },
    take: 5000,
    where,
  });
}

async function loadBalances(productIds: string[], warehouseIds: string[], client: any) {
  if (!productIds.length || !warehouseIds.length) return [];
  return client.inventoryBalance.findMany({
    select: { productId: true, quantity: true, warehouseId: true },
    where: { productId: { in: productIds }, warehouseId: { in: warehouseIds } },
  });
}

async function loadReservations(productIds: string[], warehouseIds: string[], companyId: string, client: any) {
  if (!productIds.length || !warehouseIds.length) return [];
  return client.stockReservation.groupBy({
    _sum: { baseQuantity: true },
    by: ["productId", "warehouseId"],
    where: {
      companyId,
      productId: { in: productIds },
      status: "ACTIVE",
      warehouseId: { in: warehouseIds },
    },
  });
}

async function loadLatestMovements(productIds: string[], warehouseIds: string[], companyId: string, client: any) {
  if (!productIds.length || !warehouseIds.length) return new Map<string, string>();
  const rows = await client.$queryRawUnsafe(
    `
    SELECT DISTINCT ON (product_id, warehouse_id)
      product_id,
      warehouse_id,
      created_at
    FROM stock_movements
    WHERE company_id = $1
      AND product_id = ANY($2::text[])
      AND warehouse_id = ANY($3::text[])
    ORDER BY product_id, warehouse_id, created_at DESC
    `,
    companyId,
    productIds,
    warehouseIds,
  );
  const map = new Map<string, string>();
  for (const row of rows as Array<{ created_at: Date; product_id: string; warehouse_id: string }>) {
    map.set(`${row.product_id}:${row.warehouse_id}`, row.created_at.toISOString());
  }
  return map;
}

async function loadLatestReceived(productIds: string[], warehouseIds: string[], companyId: string, client: any) {
  if (!productIds.length || !warehouseIds.length) return new Map<string, string>();
  const rows = await client.$queryRawUnsafe(
    `
    SELECT product_id, warehouse_id, MAX(COALESCE(received_at, created_at)) AS received_at
    FROM inventory_lots
    WHERE company_id = $1
      AND product_id = ANY($2::text[])
      AND warehouse_id = ANY($3::text[])
    GROUP BY product_id, warehouse_id
    `,
    companyId,
    productIds,
    warehouseIds,
  );
  const map = new Map<string, string>();
  for (const row of rows as Array<{ product_id: string; received_at: Date; warehouse_id: string }>) {
    if (row.received_at) map.set(`${row.product_id}:${row.warehouse_id}`, row.received_at.toISOString());
  }
  return map;
}

async function loadLatestSold(productIds: string[], companyId: string, branchIds: string[], client: any) {
  if (!productIds.length) return new Map<string, string>();
  const rows = await client.$queryRawUnsafe(
    `
    SELECT si.product_id, MAX(s.created_at) AS last_sold_at
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.sale_id
    WHERE s.company_id = $1
      AND s.branch_id = ANY($2::text[])
      AND si.product_id = ANY($3::text[])
      AND s.sale_status <> 'cancelled'
    GROUP BY si.product_id
    `,
    companyId,
    branchIds,
    productIds,
  );
  const map = new Map<string, string>();
  for (const row of rows as Array<{ last_sold_at: Date; product_id: string }>) {
    if (row.last_sold_at) map.set(row.product_id, row.last_sold_at.toISOString());
  }
  return map;
}

async function loadAlreadyOrderedProductIds(productIds: string[], companyId: string, warehouseIds: string[], client: any) {
  if (!productIds.length || !warehouseIds.length) return new Set<string>();
  const items = await client.purchaseItem.findMany({
    select: { productId: true },
    where: {
      productId: { in: productIds },
      purchase: {
        companyId,
        status: { in: ["ordered", "partial"] },
        warehouseId: { in: warehouseIds },
      },
    },
  });
  return new Set((items as Array<{ productId: string }>).map((row) => String(row.productId)));
}

async function loadProductMovements(productId: string, warehouseIds: string[], companyId: string, client: any) {
  const movements = await client.stockMovement.findMany({
    include: { unit: { select: { unitName: true } } },
    orderBy: { createdAt: "desc" },
    take: 30,
    where: { companyId, productId, warehouseId: { in: warehouseIds } },
  });
  return (movements as Array<Record<string, any>>).map((row) => ({
    afterQty: qtyNum(row.afterQty),
    beforeQty: qtyNum(row.beforeQty),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    movementType: String(row.movementType ?? ""),
    note: String(row.note ?? ""),
    quantity: qtyNum(row.quantity),
    unitLabel: String(row.unit?.unitName ?? "Base"),
  }));
}

function enrichFilterOptions(
  base: ReportFilterOptions,
  warehouses: Array<{ id: string; name: string }>,
): ReportFilterOptions {
  return {
    ...base,
    warehouses: warehouses.map((row) => ({ id: row.id, label: row.name })),
  };
}

async function buildRows(
  tenant: TenantContext,
  query: InventoryTableQuery,
  client?: any,
  options?: InventoryTableLoadOptions & { lowStockOnly?: boolean },
): Promise<{
  detailMovements: InventoryMovementDetail[];
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: InventoryTableQuery;
  rows: InventoryStockRow[];
  selectedProduct?: InventoryStockRow;
  showCost: boolean;
  summary: InventoryReportSummary;
  totalRow: InventoryOnHandResult["totalRow"];
}> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const clamped = clampQuery(scope, query);
  const warehouses = await loadWarehouses(scope, clamped, dbClient);
  const warehouseIds = warehouses.map((row) => row.id);
  const warehouseBranchIds = [...new Set(warehouses.map((row) => row.branchId))];
  const warehouseName = new Map(warehouses.map((row) => [row.id, row.name]));

  const [products, filterOptions] = await Promise.all([
    loadActiveProducts(scope, clamped, warehouseBranchIds, dbClient),
    getReportFilterOptions(tenant, dbClient),
  ]);
  const productIds = (products as Array<{ id: string }>).map((row) => String(row.id));

  const [balances, reservations, lastMovements, lastReceived, lastSold, alreadyOrdered] = await Promise.all([
    loadBalances(productIds, warehouseIds, dbClient),
    loadReservations(productIds, warehouseIds, scope.companyId, dbClient),
    loadLatestMovements(productIds, warehouseIds, scope.companyId, dbClient),
    loadLatestReceived(productIds, warehouseIds, scope.companyId, dbClient),
    loadLatestSold(productIds, scope.companyId, warehouseBranchIds.length ? warehouseBranchIds : scope.branchIds, dbClient),
    loadAlreadyOrderedProductIds(productIds, scope.companyId, warehouseIds, dbClient),
  ]);

  const onHandMap = new Map<string, number>();
  for (const row of balances as Array<{ productId: string; quantity: unknown; warehouseId: string }>) {
    const key = `${row.productId}:${row.warehouseId}`;
    onHandMap.set(key, qtyNum(row.quantity));
  }
  const reservedMap = new Map<string, number>();
  for (const row of reservations as Array<{ _sum: { baseQuantity: unknown }; productId: string; warehouseId: string }>) {
    reservedMap.set(`${row.productId}:${row.warehouseId}`, qtyNum(row._sum.baseQuantity));
  }

  const aggregateByProduct = !clamped.warehouseId;
  const rows: InventoryStockRow[] = [];

  for (const product of products as Array<Record<string, any>>) {
    const baseUnit = (product.units ?? []).find((unit: any) => unit.isBaseUnit) ?? product.units?.[0];
    const unitCostLak = moneyLak(baseUnit?.costPriceLak ?? product.costPriceLak);
    const minStock = qtyNum(product.minStock);
    const supplierName = String(product.supplier?.companyName || product.supplier?.name || "");
    const categoryName = String(product.category?.nameEn || product.category?.nameLo || "");

    if (aggregateByProduct) {
      let onHand = 0;
      let reserved = 0;
      let lastMovementAt: string | undefined;
      let lastReceivedAt: string | undefined;
      let warehouseId = warehouses[0]?.id ?? "";
      let warehouseLabel = warehouses.length === 1 ? warehouses[0].name : "All Warehouses";
      for (const warehouse of warehouses) {
        const key = `${product.id}:${warehouse.id}`;
        onHand += onHandMap.get(key) ?? 0;
        reserved += reservedMap.get(key) ?? 0;
        const movementAt = lastMovements.get(key);
        if (movementAt && (!lastMovementAt || movementAt > lastMovementAt)) lastMovementAt = movementAt;
        const receivedAt = lastReceived.get(key);
        if (receivedAt && (!lastReceivedAt || receivedAt > lastReceivedAt)) lastReceivedAt = receivedAt;
      }
      // Include zero-balance active products so Out of Stock / No Reorder remain visible.
      const available = availableBaseQty(onHand, reserved);
      const status = classifyInventoryStock({ available, minStock });
      const ordered = alreadyOrdered.has(String(product.id));
      rows.push({
        alreadyOrdered: ordered,
        available,
        baseUnit: String(baseUnit?.unitName || "Piece"),
        categoryName,
        lastMovementAt,
        lastReceivedAt,
        lastSoldAt: lastSold.get(String(product.id)),
        minStock,
        onHand,
        productId: String(product.id),
        productName: productLabel(product),
        reorderNeeded: status === "low_stock" || status === "out_of_stock",
        reserved,
        sku: String(product.sku || product.productCode || ""),
        status,
        stockValueLak: stockValueLak(onHand, unitCostLak),
        supplierName,
        unitCostLak,
        warehouseId,
        warehouseName: warehouseLabel,
      });
      continue;
    }

    for (const warehouse of warehouses) {
      const key = `${product.id}:${warehouse.id}`;
      const onHand = onHandMap.get(key) ?? 0;
      const reserved = reservedMap.get(key) ?? 0;
      const available = availableBaseQty(onHand, reserved);
      const status = classifyInventoryStock({ available, minStock });
      const ordered = alreadyOrdered.has(String(product.id));
      rows.push({
        alreadyOrdered: ordered,
        available,
        baseUnit: String(baseUnit?.unitName || "Piece"),
        categoryName,
        lastMovementAt: lastMovements.get(key),
        lastReceivedAt: lastReceived.get(key),
        lastSoldAt: lastSold.get(String(product.id)),
        minStock,
        onHand,
        productId: String(product.id),
        productName: productLabel(product),
        reorderNeeded: status === "low_stock" || status === "out_of_stock",
        reserved,
        sku: String(product.sku || product.productCode || ""),
        status,
        stockValueLak: stockValueLak(onHand, unitCostLak),
        supplierName,
        unitCostLak,
        warehouseId: warehouse.id,
        warehouseName: warehouseName.get(warehouse.id) ?? warehouse.id,
      });
    }
  }

  let filtered = rows.filter((row) => {
    if (options?.lowStockOnly && clamped.status === "all") {
      // Default Low Stock report: Low + Out only. Other statuses require an explicit filter.
      return row.status === "low_stock" || row.status === "out_of_stock";
    }
    return matchesInventoryStockStatus(row, clamped.status);
  });

  filtered.sort((left, right) => {
    if (options?.lowStockOnly && !clamped.sort) {
      // Out of stock first, then low stock, then ascending available.
      const rank = (row: InventoryStockRow) => (row.status === "out_of_stock" ? 0 : row.status === "low_stock" ? 1 : 2);
      const byStatus = rank(left) - rank(right);
      if (byStatus !== 0) return byStatus;
      return left.available - right.available;
    }
    return compareRows(left, right, clamped.sort, clamped.dir);
  });

  const summary = summarizeInventoryRows(filtered);
  const pageSize = INVENTORY_TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(clamped.page, pageCount);
  const pageRows = options?.allRows ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize);

  let selectedProduct: InventoryStockRow | undefined;
  let detailMovements: InventoryMovementDetail[] = [];
  if (clamped.productId) {
    selectedProduct = filtered.find((row) => row.productId === clamped.productId) ?? rows.find((row) => row.productId === clamped.productId);
    if (selectedProduct) {
      detailMovements = await loadProductMovements(
        selectedProduct.productId,
        clamped.warehouseId ? [clamped.warehouseId] : warehouseIds,
        scope.companyId,
        dbClient,
      );
    }
  }

  return {
    detailMovements,
    filterOptions: enrichFilterOptions(filterOptions, warehouses),
    page,
    pageCount,
    pageSize,
    query: clamped,
    rows: pageRows,
    selectedProduct,
    showCost: true,
    summary: filtered.length ? summary : emptyInventorySummary(),
    totalRow: {
      available: summary.totalAvailable,
      onHand: summary.totalOnHand,
      productCount: summary.totalProducts,
      reserved: summary.totalReserved,
      stockValueLak: summary.totalStockValueLak,
    },
  };
}

export async function loadStockOnHandTable(
  tenant: TenantContext,
  query: InventoryTableQuery,
  client?: any,
  options?: InventoryTableLoadOptions,
) {
  return buildRows(tenant, query, client, options);
}

export async function loadLowStockTable(
  tenant: TenantContext,
  query: InventoryTableQuery,
  client?: any,
  options?: InventoryTableLoadOptions,
) {
  const defaults: InventoryTableQuery = {
    ...query,
    status: query.status === "all" ? "all" : query.status,
  };
  return buildRows(tenant, defaults, client, { ...options, lowStockOnly: true });
}
