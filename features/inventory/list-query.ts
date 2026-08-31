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
  const searchFilter = search
    ? {
        product: {
          OR: [
            { nameLo: { contains: search, mode: "insensitive" as const } },
            { nameEn: { contains: search, mode: "insensitive" as const } },
            { barcode: { contains: search, mode: "insensitive" as const } },
            { sku: { contains: search, mode: "insensitive" as const } },
          ],
        },
      }
    : {};
  const balanceWhere = {
    companyId: scope.companyId,
    warehouseId: { in: warehouseIds },
    ...searchFilter,
  };

  const [warehouses, summaryRows, movements] = await Promise.all([
    client.warehouse.findMany({
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    }),
    client.inventoryBalance.findMany({
      select: {
        id: true,
        productId: true,
        quantity: true,
        product: {
          select: {
            costPriceLak: true,
            minStock: true,
            inventoryLots: { orderBy: { expiryDate: "asc" }, select: { expiryDate: true }, take: 1 },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      where: balanceWhere,
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
  ]);

  const summaryProductIds = Array.from(
    new Set((summaryRows as Array<{ productId: string }>).map((row) => row.productId)),
  );
  const [lastSaleByProduct, sold30Days] = summaryProductIds.length
    ? await Promise.all([
        loadLastSaleByProduct(client, scope, summaryProductIds),
        client.saleItem.groupBy({
          by: ["productId"],
          _sum: { quantity: true },
          where: {
            productId: { in: summaryProductIds },
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
    sold30Days.map((row: { _sum: { quantity: unknown }; productId: string }) => [row.productId, Number(row._sum.quantity ?? 0)]),
  );

  type RankedInventoryRow = {
    daysWithoutSale: number;
    expiryDate?: string;
    id: string;
    inventoryValueLak: number;
    minStock: number;
    quantity: number;
    unitsSold30Days: number;
  };

  const nowMs = Date.now();
  const ranked: RankedInventoryRow[] = summaryRows.map((row: {
    id: string;
    productId: string;
    quantity: unknown;
    product: { costPriceLak: unknown; minStock: unknown; inventoryLots?: Array<{ expiryDate?: Date }> };
  }) => {
    const quantity = Number(row.quantity ?? 0);
    const lastSale = lastSaleByProduct.get(row.productId);
    const daysWithoutSale = lastSale
      ? Math.max(0, Math.floor((nowMs - lastSale.getTime()) / 86_400_000))
      : quantity > 0
        ? 999
        : 0;
    const expiryDate = row.product?.inventoryLots?.[0]?.expiryDate
      ? new Date(row.product.inventoryLots[0].expiryDate).toISOString().slice(0, 10)
      : undefined;
    return {
      daysWithoutSale,
      expiryDate,
      id: row.id,
      inventoryValueLak: quantity * Number(row.product?.costPriceLak ?? 0),
      minStock: Number(row.product?.minStock ?? 0),
      quantity,
      unitsSold30Days: sold30ByProduct.get(row.productId) ?? 0,
    };
  });
  const visibleIds = ranked.filter((item) => matchesInventoryStockFilter(item as InventoryItem, stockFilter)).map((item) => item.id);
  const summarySource = ranked.filter((item) => visibleIds.includes(item.id));
  const skip = (page - 1) * pageSize;
  const pageIds = visibleIds.slice(skip, skip + pageSize);
  const previewIds = [
    ...ranked.filter((item) => item.quantity <= 0).slice(0, 20),
    ...ranked.filter((item) => item.quantity > 0 && item.quantity <= item.minStock).slice(0, 20),
    ...ranked.filter((item) => item.daysWithoutSale >= 30).slice(0, 20),
    ...ranked.filter((item) => item.expiryDate && Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) <= 30).slice(0, 20),
    ...ranked.filter((item) => item.unitsSold30Days > 0 || item.daysWithoutSale <= 7).slice(0, 9),
  ].map((item) => item.id);
  const hydrateIds = [...new Set([...pageIds, ...previewIds])];
  const balances = hydrateIds.length
    ? await client.inventoryBalance.findMany({
        include: { product: { select: inventoryProductSelect } },
        where: { id: { in: hydrateIds } },
      })
    : [];
  const byId = new Map<string, Record<string, any>>(balances.map((row: { id: string }) => [row.id, row]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((row): row is Record<string, any> => Boolean(row));
  const previewRows = previewIds.map((id) => byId.get(id)).filter((row): row is Record<string, any> => Boolean(row));
  const items = attachInventorySalesMetrics(ordered, lastSaleByProduct, sold30ByProduct);
  const previewItems = attachInventorySalesMetrics(previewRows, lastSaleByProduct, sold30ByProduct);

  return {
    items,
    movements: movements.map(mapPrismaStockMovement),
    page,
    pageSize,
    previewItems,
    summary: {
      alertCenter:
        summarySource.filter((item) => item.quantity <= 0).length +
        summarySource.filter((item) => item.quantity > 0 && item.quantity <= item.minStock).length +
        summarySource.filter((item) => item.daysWithoutSale >= 30).length,
      deadStock: summarySource.filter((item) => item.daysWithoutSale >= 30).length,
      fastMoving: summarySource.filter((item) => item.unitsSold30Days > 0 || item.daysWithoutSale <= 7).length,
      inventoryValue: summarySource.reduce((sum, item) => sum + item.inventoryValueLak, 0),
      lowStock: summarySource.filter((item) => item.quantity > 0 && item.quantity <= item.minStock).length,
      nearExpiry: summarySource.filter((item) => {
        if (!item.expiryDate) return false;
        return Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000) <= 30;
      }).length,
      outOfStock: summarySource.filter((item) => item.quantity <= 0).length,
      totalProducts: summarySource.length,
      totalQuantity: summarySource.reduce((sum, item) => sum + item.quantity, 0),
    },
    totalCount: visibleIds.length,
    totalPages: Math.max(1, Math.ceil(visibleIds.length / pageSize)),
    warehouses: warehouses.map(mapPrismaWarehouse),
  };
}
