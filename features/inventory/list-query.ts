import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import {
  mapPrismaInventoryBalance,
  mapPrismaStockMovement,
  mapPrismaWarehouse,
} from "@/features/inventory/dto-mapper";
import type { InventoryItem, StockMovement, Warehouse } from "@/features/inventory/types";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

export const DEFAULT_INVENTORY_PAGE_SIZE = 100;
export const INVENTORY_LIST_PAGE_SIZES = [25, 50, 100, 200] as const;

export type InventoryStockFilter = "all" | "out_of_stock" | "low_stock" | "near_expiry" | "dead_stock" | "fast_moving";

export type InventoryListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  stockFilter?: InventoryStockFilter;
  warehouseId?: string;
};

export type InventoryListSummary = {
  alertCenter: number;
  deadStock: number;
  fastMoving: number;
  inventoryValue: number;
  lowStock: number;
  nearExpiry: number;
  outOfStock: number;
  totalProducts: number;
  totalQuantity: number;
};

export type InventoryListPage = {
  items: InventoryItem[];
  movements: StockMovement[];
  page: number;
  pageSize: number;
  previewItems: InventoryItem[];
  summary: InventoryListSummary;
  totalCount: number;
  totalPages: number;
  warehouses: Warehouse[];
};

export const inventoryProductSelect = {
  id: true,
  barcode: true,
  costPriceLak: true,
  imageUrl: true,
  minStock: true,
  nameEn: true,
  nameLo: true,
  productCode: true,
  sku: true,
  supplierId: true,
  category: { select: { nameEn: true, nameLo: true } },
  inventoryLots: {
    orderBy: { expiryDate: "asc" as const },
    select: { expiryDate: true, receivedAt: true },
    take: 1,
  },
  supplier: { select: { companyName: true, name: true } },
  units: {
    select: {
      barcode: true,
      conversionQty: true,
      costPriceLak: true,
      id: true,
      imageUrl: true,
      isBaseUnit: true,
      isPurchaseUnit: true,
      status: true,
      unitName: true,
    },
  },
};

export async function loadLastSaleByProduct(
  client: any,
  scope: BranchScope,
  productIds: string[],
): Promise<Map<string, Date>> {
  const lastSaleByProduct = new Map<string, Date>();
  if (productIds.length === 0) return lastSaleByProduct;

  const rows = await client.$queryRaw<Array<{ last_sale_at: Date; product_id: string }>>`
    SELECT DISTINCT ON (si.product_id)
      si.product_id,
      s.created_at AS last_sale_at
    FROM sale_items si
    INNER JOIN sales s ON s.id = si.sale_id
    WHERE si.product_id = ANY(${productIds})
      AND s.company_id = ${scope.companyId}
      AND s.branch_id = ${scope.branchId}
      AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
    ORDER BY si.product_id, s.created_at DESC
  `;

  for (const row of rows) {
    lastSaleByProduct.set(row.product_id, row.last_sale_at);
  }
  return lastSaleByProduct;
}

export function attachInventorySalesMetrics(
  balances: Record<string, any>[],
  lastSaleByProduct: Map<string, Date>,
  sold30ByProduct: Map<string, number>,
) {
  const nowMs = Date.now();
  return balances.map((balance) => {
    const item = mapPrismaInventoryBalance(balance);
    const lastSale = lastSaleByProduct.get(balance.productId);
    const daysWithoutSale = lastSale
      ? Math.max(0, Math.floor((nowMs - lastSale.getTime()) / 86_400_000))
      : item.quantity > 0
        ? 999
        : 0;
    return {
      ...item,
      daysWithoutSale,
      unitsSold30Days: sold30ByProduct.get(balance.productId) ?? 0,
    };
  });
}

export function matchesInventoryStockFilter(item: InventoryItem, filter: InventoryStockFilter) {
  if (filter === "out_of_stock") return item.quantity <= 0;
  if (filter === "low_stock") return item.quantity > 0 && item.quantity <= item.minStock;
  if (filter === "near_expiry") {
    if (!item.expiryDate) return false;
    const days = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
    return days <= 30;
  }
  if (filter === "dead_stock") return item.daysWithoutSale >= 30;
  if (filter === "fast_moving") return (item.unitsSold30Days ?? 0) > 0 || item.daysWithoutSale <= 7;
  return true;
}

export function summarizeInventoryItems(items: InventoryItem[]): InventoryListSummary {
  const outOfStock = items.filter((item) => item.quantity <= 0).length;
  const lowStock = items.filter((item) => item.quantity > 0 && item.quantity <= item.minStock).length;
  const deadStock = items.filter((item) => item.daysWithoutSale >= 30).length;
  const nearExpiry = items.filter((item) => {
    if (!item.expiryDate) return false;
    return Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) <= 30;
  }).length;
  const fastMoving = items.filter((item) => (item.unitsSold30Days ?? 0) > 0 || item.daysWithoutSale <= 7).length;
  return {
    alertCenter: outOfStock + lowStock + nearExpiry + deadStock,
    deadStock,
    fastMoving,
    inventoryValue: items.reduce((sum, item) => sum + (item.inventoryValueLak ?? 0), 0),
    lowStock,
    nearExpiry,
    outOfStock,
    totalProducts: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

function asNumber(value: unknown) {
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  if (typeof value === "object" && value != null && "toString" in value) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asIdRows(rows: Array<{ id?: unknown }> | null | undefined): string[] {
  return (rows ?? []).map((row) => String(row.id ?? "")).filter(Boolean);
}

function searchPattern(search: string) {
  return search ? `%${search.replace(/[%_\\]/g, "\\$&")}%` : "";
}

type InventoryListSummaryRow = {
  dead_stock: unknown;
  fast_moving: unknown;
  inventory_value: unknown;
  low_stock: unknown;
  near_expiry: unknown;
  out_of_stock: unknown;
  total_count: unknown;
  total_quantity: unknown;
};

type InventoryIdRow = { id: string };

type InventorySqlInput = {
  now: Date;
  pageSize: number;
  search: string;
  skip: number;
  stockFilter: InventoryStockFilter;
  thirtyDaysAgo: Date;
  warehouseIds: string[];
};

async function loadInventoryListSummary(
  client: any,
  scope: BranchScope,
  input: InventorySqlInput,
) {
  const pattern = searchPattern(input.search);
  const rows = await client.$queryRaw<InventoryListSummaryRow[]>`
    WITH last_sale AS (
      SELECT DISTINCT ON (si.product_id)
        si.product_id,
        s.created_at AS last_sale_at
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE s.company_id = ${scope.companyId}
        AND s.branch_id = ${scope.branchId}
        AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
      ORDER BY si.product_id, s.created_at DESC
    ),
    sold_30 AS (
      SELECT si.product_id, SUM(si.quantity) AS qty
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE s.company_id = ${scope.companyId}
        AND s.branch_id = ${scope.branchId}
        AND s.created_at >= ${input.thirtyDaysAgo}
        AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
      GROUP BY si.product_id
    ),
    scoped AS (
      SELECT
        b.id,
        b.quantity,
        p.min_stock,
        p.cost_price_lak,
        lot.expiry_date,
        CASE
          WHEN ls.last_sale_at IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${input.now} - ls.last_sale_at)) / 86400))
          WHEN b.quantity > 0 THEN 999
          ELSE 0
        END AS days_without_sale,
        COALESCE(s30.qty, 0) AS sold_30
      FROM inventory_balances b
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN last_sale ls ON ls.product_id = b.product_id
      LEFT JOIN sold_30 s30 ON s30.product_id = b.product_id
      LEFT JOIN LATERAL (
        SELECT l.expiry_date
        FROM inventory_lots l
        WHERE l.company_id = b.company_id
          AND l.product_id = b.product_id
        ORDER BY l.expiry_date ASC
        LIMIT 1
      ) lot ON true
      WHERE b.company_id = ${scope.companyId}
        AND b.warehouse_id = ANY(${input.warehouseIds})
        AND (
          ${input.search} = ''
          OR p.name_lo ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.name_en, '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.barcode, '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.sku, '') ILIKE ${pattern} ESCAPE '\\'
        )
    )
    SELECT
      COUNT(*)::int AS total_count,
      COALESCE(SUM(quantity), 0)::text AS total_quantity,
      COALESCE(SUM(quantity * cost_price_lak), 0)::text AS inventory_value,
      COUNT(*) FILTER (WHERE quantity <= 0)::int AS out_of_stock,
      COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= min_stock)::int AS low_stock,
      COUNT(*) FILTER (
        WHERE expiry_date IS NOT NULL
          AND CEIL(EXTRACT(EPOCH FROM (expiry_date - ${input.now})) / 86400.0) <= 30
      )::int AS near_expiry,
      COUNT(*) FILTER (WHERE days_without_sale >= 30)::int AS dead_stock,
      COUNT(*) FILTER (WHERE sold_30 > 0 OR days_without_sale <= 7)::int AS fast_moving
    FROM scoped
    WHERE
      ${input.stockFilter} = 'all'
      OR (${input.stockFilter} = 'out_of_stock' AND quantity <= 0)
      OR (${input.stockFilter} = 'low_stock' AND quantity > 0 AND quantity <= min_stock)
      OR (
        ${input.stockFilter} = 'near_expiry'
        AND expiry_date IS NOT NULL
        AND CEIL(EXTRACT(EPOCH FROM (expiry_date - ${input.now})) / 86400.0) <= 30
      )
      OR (${input.stockFilter} = 'dead_stock' AND days_without_sale >= 30)
      OR (${input.stockFilter} = 'fast_moving' AND (sold_30 > 0 OR days_without_sale <= 7))
  `;
  return rows[0];
}

async function loadInventoryPageIds(
  client: any,
  scope: BranchScope,
  input: InventorySqlInput,
) {
  const pattern = searchPattern(input.search);
  return client.$queryRaw<InventoryIdRow[]>`
    WITH last_sale AS (
      SELECT DISTINCT ON (si.product_id)
        si.product_id,
        s.created_at AS last_sale_at
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE s.company_id = ${scope.companyId}
        AND s.branch_id = ${scope.branchId}
        AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
      ORDER BY si.product_id, s.created_at DESC
    ),
    sold_30 AS (
      SELECT si.product_id, SUM(si.quantity) AS qty
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE s.company_id = ${scope.companyId}
        AND s.branch_id = ${scope.branchId}
        AND s.created_at >= ${input.thirtyDaysAgo}
        AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
      GROUP BY si.product_id
    ),
    scoped AS (
      SELECT
        b.id,
        b.quantity,
        b.updated_at,
        p.min_stock,
        lot.expiry_date,
        CASE
          WHEN ls.last_sale_at IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${input.now} - ls.last_sale_at)) / 86400))
          WHEN b.quantity > 0 THEN 999
          ELSE 0
        END AS days_without_sale,
        COALESCE(s30.qty, 0) AS sold_30
      FROM inventory_balances b
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN last_sale ls ON ls.product_id = b.product_id
      LEFT JOIN sold_30 s30 ON s30.product_id = b.product_id
      LEFT JOIN LATERAL (
        SELECT l.expiry_date
        FROM inventory_lots l
        WHERE l.company_id = b.company_id
          AND l.product_id = b.product_id
        ORDER BY l.expiry_date ASC
        LIMIT 1
      ) lot ON true
      WHERE b.company_id = ${scope.companyId}
        AND b.warehouse_id = ANY(${input.warehouseIds})
        AND (
          ${input.search} = ''
          OR p.name_lo ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.name_en, '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.barcode, '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.sku, '') ILIKE ${pattern} ESCAPE '\\'
        )
    )
    SELECT id
    FROM scoped
    WHERE
      ${input.stockFilter} = 'all'
      OR (${input.stockFilter} = 'out_of_stock' AND quantity <= 0)
      OR (${input.stockFilter} = 'low_stock' AND quantity > 0 AND quantity <= min_stock)
      OR (
        ${input.stockFilter} = 'near_expiry'
        AND expiry_date IS NOT NULL
        AND CEIL(EXTRACT(EPOCH FROM (expiry_date - ${input.now})) / 86400.0) <= 30
      )
      OR (${input.stockFilter} = 'dead_stock' AND days_without_sale >= 30)
      OR (${input.stockFilter} = 'fast_moving' AND (sold_30 > 0 OR days_without_sale <= 7))
    ORDER BY updated_at DESC, id DESC
    OFFSET ${input.skip}
    LIMIT ${input.pageSize}
  `;
}

async function loadInventoryPreviewIds(
  client: any,
  scope: BranchScope,
  input: InventorySqlInput,
) {
  const pattern = searchPattern(input.search);
  return client.$queryRaw<InventoryIdRow[]>`
    WITH last_sale AS (
      SELECT DISTINCT ON (si.product_id)
        si.product_id,
        s.created_at AS last_sale_at
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE s.company_id = ${scope.companyId}
        AND s.branch_id = ${scope.branchId}
        AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
      ORDER BY si.product_id, s.created_at DESC
    ),
    sold_30 AS (
      SELECT si.product_id, SUM(si.quantity) AS qty
      FROM sale_items si
      INNER JOIN sales s ON s.id = si.sale_id
      WHERE s.company_id = ${scope.companyId}
        AND s.branch_id = ${scope.branchId}
        AND s.created_at >= ${input.thirtyDaysAgo}
        AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'refunded')
      GROUP BY si.product_id
    ),
    scoped AS (
      SELECT
        b.id,
        b.quantity,
        b.updated_at,
        p.min_stock,
        lot.expiry_date,
        CASE
          WHEN ls.last_sale_at IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${input.now} - ls.last_sale_at)) / 86400))
          WHEN b.quantity > 0 THEN 999
          ELSE 0
        END AS days_without_sale,
        COALESCE(s30.qty, 0) AS sold_30
      FROM inventory_balances b
      INNER JOIN products p ON p.id = b.product_id
      LEFT JOIN last_sale ls ON ls.product_id = b.product_id
      LEFT JOIN sold_30 s30 ON s30.product_id = b.product_id
      LEFT JOIN LATERAL (
        SELECT l.expiry_date
        FROM inventory_lots l
        WHERE l.company_id = b.company_id
          AND l.product_id = b.product_id
        ORDER BY l.expiry_date ASC
        LIMIT 1
      ) lot ON true
      WHERE b.company_id = ${scope.companyId}
        AND b.warehouse_id = ANY(${input.warehouseIds})
        AND (
          ${input.search} = ''
          OR p.name_lo ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.name_en, '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.barcode, '') ILIKE ${pattern} ESCAPE '\\'
          OR COALESCE(p.sku, '') ILIKE ${pattern} ESCAPE '\\'
        )
    )
    SELECT id FROM (
      (SELECT id, updated_at FROM scoped WHERE quantity <= 0 ORDER BY updated_at DESC, id DESC LIMIT 20)
      UNION ALL
      (SELECT id, updated_at FROM scoped WHERE quantity > 0 AND quantity <= min_stock ORDER BY updated_at DESC, id DESC LIMIT 20)
      UNION ALL
      (SELECT id, updated_at FROM scoped WHERE days_without_sale >= 30 ORDER BY updated_at DESC, id DESC LIMIT 20)
      UNION ALL
      (
        SELECT id, updated_at FROM scoped
        WHERE expiry_date IS NOT NULL
          AND CEIL(EXTRACT(EPOCH FROM (expiry_date - ${input.now})) / 86400.0) <= 30
        ORDER BY updated_at DESC, id DESC
        LIMIT 20
      )
      UNION ALL
      (SELECT id, updated_at FROM scoped WHERE sold_30 > 0 OR days_without_sale <= 7 ORDER BY updated_at DESC, id DESC LIMIT 9)
    ) preview
  `;
}

export async function getPrismaInventoryListPage(
  tenant: TenantContext,
  input: InventoryListQuery = {},
  client: any,
): Promise<InventoryListPage> {
  const pageSize = INVENTORY_LIST_PAGE_SIZES.includes(input.pageSize as (typeof INVENTORY_LIST_PAGE_SIZES)[number])
    ? Number(input.pageSize)
    : DEFAULT_INVENTORY_PAGE_SIZE;
  const page = Math.max(1, Number(input.page) || 1);
  const stockFilter = input.stockFilter ?? "all";
  const search = input.search?.trim() ?? "";
  const scope = await resolveTenantScope(tenant, client);
  const warehouseIds = input.warehouseId && input.warehouseId !== "all" ? [input.warehouseId] : scope.warehouseIds;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const now = new Date();
  const skip = (page - 1) * pageSize;

  const emptySummary: InventoryListSummary = {
    alertCenter: 0,
    deadStock: 0,
    fastMoving: 0,
    inventoryValue: 0,
    lowStock: 0,
    nearExpiry: 0,
    outOfStock: 0,
    totalProducts: 0,
    totalQuantity: 0,
  };

  const sqlInput: InventorySqlInput = {
    now,
    pageSize,
    search,
    skip,
    stockFilter,
    thirtyDaysAgo,
    warehouseIds,
  };
  const [warehouses, movements, summaryRow, pageIdRows, previewIdRows] = await Promise.all([
    client.warehouse.findMany({
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    }),
    client.stockMovement.findMany({
      include: {
        product: { select: { nameEn: true, nameLo: true, sku: true } },
        unit: { select: { unitName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      where: { companyId: scope.companyId, warehouseId: { in: warehouseIds } },
    }),
    warehouseIds.length ? loadInventoryListSummary(client, scope, sqlInput) : Promise.resolve(null),
    warehouseIds.length ? loadInventoryPageIds(client, scope, sqlInput) : Promise.resolve([]),
    warehouseIds.length ? loadInventoryPreviewIds(client, scope, sqlInput) : Promise.resolve([]),
  ]);

  const pageIds = asIdRows(pageIdRows);
  const previewIds = asIdRows(previewIdRows);
  const totalCount = asNumber(summaryRow?.total_count);
  const outOfStock = asNumber(summaryRow?.out_of_stock);
  const lowStock = asNumber(summaryRow?.low_stock);
  const deadStock = asNumber(summaryRow?.dead_stock);
  const summary: InventoryListSummary = summaryRow
    ? {
        alertCenter: outOfStock + lowStock + deadStock,
        deadStock,
        fastMoving: asNumber(summaryRow.fast_moving),
        inventoryValue: asNumber(summaryRow.inventory_value),
        lowStock,
        nearExpiry: asNumber(summaryRow.near_expiry),
        outOfStock,
        totalProducts: totalCount,
        totalQuantity: asNumber(summaryRow.total_quantity),
      }
    : emptySummary;

  const hydrateIds = [...new Set([...pageIds, ...previewIds])];
  const balances = hydrateIds.length
    ? await client.inventoryBalance.findMany({
        include: { product: { select: inventoryProductSelect } },
        where: { id: { in: hydrateIds } },
      })
    : [];
  const productIds: string[] = Array.from(
    new Set((balances as Array<{ productId: string }>).map((row) => row.productId)),
  );
  const [lastSaleByProduct, sold30Days] = productIds.length
    ? await Promise.all([
        loadLastSaleByProduct(client, scope, productIds),
        client.saleItem.groupBy({
          by: ["productId"],
          _sum: { quantity: true },
          where: {
            productId: { in: productIds },
            sale: {
              branchId: scope.branchId,
              companyId: scope.companyId,
              createdAt: { gte: thirtyDaysAgo },
              saleStatus: { in: [...REPORT_SALE_STATUSES] },
            },
          },
        }),
      ])
    : [new Map<string, Date>(), [] as Array<{ productId: string; _sum: { quantity: unknown } }>];
  const sold30ByProduct = new Map<string, number>(
    sold30Days.map((row: { _sum: { quantity: unknown }; productId: string }) => [row.productId, asNumber(row._sum.quantity)]),
  );
  const byId = new Map<string, Record<string, any>>(balances.map((row: { id: string }) => [row.id, row]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((row): row is Record<string, any> => Boolean(row));
  const previewRows = previewIds.map((id) => byId.get(id)).filter((row): row is Record<string, any> => Boolean(row));

  return {
    items: attachInventorySalesMetrics(ordered, lastSaleByProduct, sold30ByProduct),
    movements: movements.map(mapPrismaStockMovement),
    page,
    pageSize,
    previewItems: attachInventorySalesMetrics(previewRows, lastSaleByProduct, sold30ByProduct),
    summary,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    warehouses: warehouses.map(mapPrismaWarehouse),
  };
}
