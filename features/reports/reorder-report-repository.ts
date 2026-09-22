/**
 * R8 Reorder repository — Need Reorder + Already Ordered from inventory + PO + manual rows.
 */
import { prisma } from "@/lib/db/prisma";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import {
  availableBaseQty,
  classifyReorderReason,
  emptyNeedReorderSummary,
  hasReorderThreshold,
  qtyNum,
  remainingOrderedQty,
  REORDER_PAGE_SIZE,
  REORDER_SCAN_LIMIT,
  R8_ACTIVE_PO_STATUSES,
  type NeedReorderSummary,
  type ReorderReason,
} from "@/features/reports/reorder-report-math";
import type { ReorderTableQuery } from "@/features/reports/reorder-report-query";
import type { TenantContext } from "@/lib/db/write-context";
import { assertWarehouseInScope, branchOwnedWhere, resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
import { createPurchaseOrder } from "@/features/purchasing/prisma-repository";
import type { PurchaseOrderInput } from "@/features/purchasing/dto";

const db = prisma as any;

export type ReorderUnitOption = {
  barcode: string | null;
  conversionQty: number;
  costPriceLak: number | null;
  id: string;
  isBaseUnit: boolean;
  unitName: string;
};

export type NeedReorderRow = {
  available: number;
  barcode: string | null;
  categoryName: string;
  isManual: boolean;
  manualItemId: string | null;
  minStock: number;
  onHand: number;
  preferredSupplierId: string | null;
  preferredSupplierName: string | null;
  productId: string;
  productName: string;
  reason: ReorderReason;
  reserved: number;
  units: ReorderUnitOption[];
  warehouseId: string;
  warehouseName: string;
};

export type AlreadyOrderedRow = {
  barcode: string | null;
  orderedAt: string;
  orderedQty: number;
  poId: string;
  poNo: string;
  poStatus: string;
  productId: string;
  productName: string;
  purchaseItemId: string;
  receivedQty: number;
  remainingQty: number;
  supplierId: string;
  supplierName: string;
  unitName: string;
  warehouseId: string;
  warehouseName: string;
};

export type ReorderPageResult = {
  alreadyOrderedCount: number;
  alreadyRows: AlreadyOrderedRow[];
  filterOptions: ReportFilterOptions & { warehouses: Array<{ id: string; label: string }> };
  needRows: NeedReorderRow[];
  page: number;
  pageCount: number;
  pageSize: number;
  query: ReorderTableQuery;
  summary: NeedReorderSummary;
  suppliers: Array<{ id: string; name: string }>;
};

function clientOf(client?: any) {
  return client ?? db;
}

function productLabel(product: { nameEn?: string | null; nameLo?: string | null }) {
  return String(product.nameEn || product.nameLo || "Product");
}

function clampQuery(scope: BranchScope, query: ReorderTableQuery): ReorderTableQuery {
  const next = { ...query };
  if (!scope.isOwner) {
    next.branchId = scope.branchId;
  } else if (next.branchId && !scope.branchIds.includes(next.branchId)) {
    next.branchId = scope.branchId;
  }
  return next;
}

async function loadWarehouses(scope: BranchScope, query: ReorderTableQuery, client: any) {
  const where: Record<string, unknown> = { companyId: scope.companyId, id: { in: scope.warehouseIds } };
  if (query.branchId) where.branchId = query.branchId;
  if (query.warehouseId && scope.warehouseIds.includes(query.warehouseId)) where.id = query.warehouseId;
  return client.warehouse.findMany({
    orderBy: { name: "asc" },
    select: { branchId: true, id: true, name: true },
    where,
  }) as Promise<Array<{ branchId: string; id: string; name: string }>>;
}

export async function loadReorderPage(
  tenant: TenantContext,
  query: ReorderTableQuery,
  client?: any,
  options?: { allRows?: boolean },
): Promise<ReorderPageResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const clamped = clampQuery(scope, query);
  const warehouses = await loadWarehouses(scope, clamped, dbClient);
  const warehouseIds = warehouses.map((row) => row.id);
  const warehouseName = new Map(warehouses.map((row) => [row.id, row.name]));
  const warehouseBranchIds = [...new Set(warehouses.map((row) => row.branchId))];

  const [filterOptions, suppliers] = await Promise.all([
    getReportFilterOptions(tenant, dbClient),
    dbClient.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { companyId: scope.companyId, status: "active", ...branchOwnedWhere(scope) },
    }),
  ]);

  const productWhere: Record<string, unknown> = {
    companyId: scope.companyId,
    isActive: true,
    status: "active",
    branchId: { in: warehouseBranchIds.length ? warehouseBranchIds : scope.branchIds },
  };
  if (clamped.categoryId) productWhere.categoryId = clamped.categoryId;
  if (clamped.productSearch) {
    const q = clamped.productSearch;
    productWhere.OR = [
      { nameEn: { contains: q, mode: "insensitive" } },
      { nameLo: { contains: q, mode: "insensitive" } },
      { barcode: { contains: q, mode: "insensitive" } },
    ];
  }
  if (clamped.barcode) {
    productWhere.OR = [
      { barcode: { contains: clamped.barcode, mode: "insensitive" } },
      { units: { some: { barcode: { contains: clamped.barcode, mode: "insensitive" } } } },
    ];
  }

  const products = await dbClient.product.findMany({
    include: {
      category: { select: { nameEn: true, nameLo: true } },
      productSuppliers: {
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
        take: 3,
      },
      supplier: { select: { id: true, name: true } },
      units: {
        orderBy: [{ isBaseUnit: "desc" }, { sortOrder: "asc" }],
        select: {
          barcode: true,
          conversionQty: true,
          costPriceLak: true,
          id: true,
          isBaseUnit: true,
          status: true,
          unitName: true,
        },
        where: { status: "active" },
      },
    },
    orderBy: [{ nameEn: "asc" }, { nameLo: "asc" }],
    take: REORDER_SCAN_LIMIT,
    where: productWhere,
  });

  const productIds = (products as Array<{ id: string }>).map((row) => String(row.id));

  const [balances, reservations, manualItems, activePoItems] = await Promise.all([
    productIds.length && warehouseIds.length
      ? dbClient.inventoryBalance.findMany({
          select: { productId: true, quantity: true, warehouseId: true },
          where: { productId: { in: productIds }, warehouseId: { in: warehouseIds } },
        })
      : [],
    productIds.length && warehouseIds.length
      ? dbClient.stockReservation.findMany({
          select: { baseQuantity: true, productId: true, warehouseId: true },
          where: {
            companyId: scope.companyId,
            productId: { in: productIds },
            status: "ACTIVE",
            warehouseId: { in: warehouseIds },
          },
        })
      : [],
    productIds.length && warehouseIds.length
      ? dbClient.reorderManualItem.findMany({
          select: { id: true, productId: true, warehouseId: true },
          where: { companyId: scope.companyId, productId: { in: productIds }, warehouseId: { in: warehouseIds } },
        })
      : [],
    productIds.length && warehouseIds.length
      ? dbClient.purchaseItem.findMany({
          include: {
            product: { select: { barcode: true, nameEn: true, nameLo: true } },
            purchase: {
              include: {
                supplier: { select: { id: true, name: true } },
                warehouse: { select: { id: true, name: true } },
              },
            },
            unit: { select: { unitName: true } },
          },
          where: {
            productId: { in: productIds },
            purchase: {
              companyId: scope.companyId,
              status: { in: [...R8_ACTIVE_PO_STATUSES] },
              warehouseId: { in: warehouseIds },
            },
          },
        })
      : [],
  ]);

  const onHandMap = new Map<string, number>();
  for (const row of balances as Array<{ productId: string; quantity: unknown; warehouseId: string }>) {
    onHandMap.set(`${row.productId}:${row.warehouseId}`, qtyNum(row.quantity));
  }
  const reservedMap = new Map<string, number>();
  for (const row of reservations as Array<{ baseQuantity: unknown; productId: string; warehouseId: string }>) {
    const key = `${row.productId}:${row.warehouseId}`;
    reservedMap.set(key, (reservedMap.get(key) ?? 0) + qtyNum(row.baseQuantity));
  }
  const manualMap = new Map<string, string>();
  for (const row of manualItems as Array<{ id: string; productId: string; warehouseId: string }>) {
    manualMap.set(`${row.productId}:${row.warehouseId}`, row.id);
  }
  const activeProductWarehouses = new Set<string>();
  for (const item of activePoItems as Array<{ productId: string; purchase: { warehouseId: string } }>) {
    activeProductWarehouses.add(`${item.productId}:${item.purchase.warehouseId}`);
  }

  const needRows: NeedReorderRow[] = [];
  for (const product of products as Array<Record<string, any>>) {
    for (const warehouse of warehouses) {
      if (clamped.warehouseId && warehouse.id !== clamped.warehouseId) continue;
      const key = `${product.id}:${warehouse.id}`;
      if (activeProductWarehouses.has(key)) continue;

      const onHand = onHandMap.get(key) ?? 0;
      const reserved = reservedMap.get(key) ?? 0;
      const available = availableBaseQty(onHand, reserved);
      const minStock = qtyNum(product.minStock);
      const isManual = manualMap.has(key);
      const reason = classifyReorderReason({ available, isManual, minStock });
      if (!reason) continue;

      if (clamped.reason !== "all" && reason !== clamped.reason) continue;
      if (clamped.stockStatus === "out_of_stock" && available > 0) continue;
      if (clamped.stockStatus === "low_stock" && (available <= 0 || reason === "added_manually")) continue;

      const preferred =
        product.productSuppliers?.[0]?.supplier ??
        (product.supplierId && product.supplier ? product.supplier : null);
      if (clamped.supplierId && preferred?.id !== clamped.supplierId) continue;
      if (clamped.hasSupplier === "yes" && !preferred?.id) continue;
      if (clamped.hasSupplier === "no" && preferred?.id) continue;

      const barcode = product.barcode ? String(product.barcode) : null;
      if (clamped.hasBarcode === "yes" && !barcode) continue;
      if (clamped.hasBarcode === "no" && barcode) continue;

      needRows.push({
        available,
        barcode,
        categoryName: String(product.category?.nameEn || product.category?.nameLo || "—"),
        isManual,
        manualItemId: manualMap.get(key) ?? null,
        minStock,
        onHand,
        preferredSupplierId: preferred?.id ? String(preferred.id) : null,
        preferredSupplierName: preferred?.name ? String(preferred.name) : null,
        productId: String(product.id),
        productName: productLabel(product),
        reason,
        reserved,
        units: (product.units as Array<Record<string, any>>).map((unit) => ({
          barcode: unit.barcode ? String(unit.barcode) : null,
          conversionQty: qtyNum(unit.conversionQty) || 1,
          costPriceLak: unit.costPriceLak == null ? null : qtyNum(unit.costPriceLak),
          id: String(unit.id),
          isBaseUnit: Boolean(unit.isBaseUnit),
          unitName: String(unit.unitName || "Unit"),
        })),
        warehouseId: warehouse.id,
        warehouseName: warehouseName.get(warehouse.id) || warehouse.name,
      });
    }
  }

  const alreadyRows: AlreadyOrderedRow[] = (activePoItems as Array<Record<string, any>>)
    .filter((item) => {
      if (clamped.warehouseId && item.purchase?.warehouseId !== clamped.warehouseId) return false;
      if (clamped.supplierId && item.purchase?.supplierId !== clamped.supplierId) return false;
      if (clamped.poStatus && String(item.purchase?.status) !== clamped.poStatus) return false;
      if (clamped.productSearch) {
        const hay = `${item.product?.nameEn ?? ""} ${item.product?.nameLo ?? ""} ${item.product?.barcode ?? ""}`.toLowerCase();
        if (!hay.includes(clamped.productSearch.toLowerCase())) return false;
      }
      if (clamped.barcode) {
        const code = String(item.product?.barcode ?? "");
        if (!code.toLowerCase().includes(clamped.barcode.toLowerCase())) return false;
      }
      return true;
    })
    .map((item) => {
      const orderedQty = qtyNum(item.quantity);
      const receivedQty = qtyNum(item.receivedQuantity);
      return {
        barcode: item.product?.barcode ? String(item.product.barcode) : null,
        orderedAt:
          item.purchase?.purchaseDate instanceof Date
            ? item.purchase.purchaseDate.toISOString()
            : String(item.purchase?.purchaseDate ?? ""),
        orderedQty,
        poId: String(item.purchase?.id ?? ""),
        poNo: String(item.purchase?.purchaseNo ?? ""),
        poStatus: String(item.purchase?.status ?? ""),
        productId: String(item.productId),
        productName: productLabel(item.product ?? {}),
        purchaseItemId: String(item.id),
        receivedQty,
        remainingQty: remainingOrderedQty(orderedQty, receivedQty),
        supplierId: String(item.purchase?.supplierId ?? item.purchase?.supplier?.id ?? ""),
        supplierName: String(item.purchase?.supplier?.name ?? "—"),
        unitName: String(item.unit?.unitName ?? "—"),
        warehouseId: String(item.purchase?.warehouseId ?? ""),
        warehouseName: String(item.purchase?.warehouse?.name ?? "—"),
      };
    })
    .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt));

  const pageSize = REORDER_PAGE_SIZE;
  const sourceRows = clamped.tab === "already" ? alreadyRows : needRows;
  const pageCount = Math.max(1, Math.ceil(sourceRows.length / pageSize));
  const page = Math.min(clamped.page, pageCount);
  const start = options?.allRows ? 0 : (page - 1) * pageSize;
  const sliced = options?.allRows ? sourceRows : sourceRows.slice(start, start + pageSize);

  const summary = emptyNeedReorderSummary();
  summary.needReorder = needRows.length;
  summary.alreadyOrdered = alreadyRows.length;
  for (const row of needRows) {
    if (row.available <= 0) summary.outOfStock += 1;
    else if (row.reason === "reached_reorder_level" || row.reason === "only_1_2_left") summary.lowStock += 1;
  }

  return {
    alreadyOrderedCount: alreadyRows.length,
    alreadyRows: clamped.tab === "already" ? (sliced as AlreadyOrderedRow[]) : alreadyRows.slice(0, 0),
    filterOptions: {
      ...filterOptions,
      warehouses: warehouses.map((row) => ({ id: row.id, label: row.name })),
    },
    needRows: clamped.tab === "need" ? (sliced as NeedReorderRow[]) : needRows.slice(0, 0),
    page,
    pageCount,
    pageSize,
    query: clamped,
    summary,
    suppliers: (suppliers as Array<{ id: string; name: string }>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
    })),
  };
}

/** Full already-ordered rows for export/tab switch without re-scan when allRows. */
export async function loadReorderExportData(tenant: TenantContext, query: ReorderTableQuery, client?: any) {
  return loadReorderPage(tenant, query, client, { allRows: true });
}

export async function addManualReorderItem(
  tenant: TenantContext,
  input: { note?: string | null; productId: string; warehouseId: string },
  userId?: string | null,
  client?: any,
) {
  const dbClient = clientOf(client);
  const scope = await assertWarehouseInScope(dbClient, tenant, input.warehouseId);
  await dbClient.product.findFirstOrThrow({
    where: { companyId: tenant.companyId, id: input.productId, ...branchOwnedWhere(scope) },
  });

  const active = await dbClient.purchaseItem.findFirst({
    select: {
      id: true,
      purchase: { select: { id: true, purchaseNo: true, status: true } },
    },
    where: {
      productId: input.productId,
      purchase: {
        companyId: tenant.companyId,
        status: { in: [...R8_ACTIVE_PO_STATUSES] },
        warehouseId: input.warehouseId,
      },
    },
  });
  if (active) {
    return {
      alreadyOrdered: true as const,
      poId: String(active.purchase.id),
      poNo: String(active.purchase.purchaseNo),
      poStatus: String(active.purchase.status),
    };
  }

  const existing = await dbClient.reorderManualItem.findUnique({
    where: {
      companyId_warehouseId_productId: {
        companyId: tenant.companyId,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    },
  });
  if (existing) {
    return { alreadyOrdered: false as const, duplicate: true as const, id: String(existing.id) };
  }

  const created = await dbClient.reorderManualItem.create({
    data: {
      addedBy: userId || null,
      companyId: tenant.companyId,
      note: input.note?.trim() || null,
      productId: input.productId,
      warehouseId: input.warehouseId,
    },
  });
  return { alreadyOrdered: false as const, duplicate: false as const, id: String(created.id) };
}

export async function removeManualReorderItem(
  tenant: TenantContext,
  input: { productId: string; warehouseId: string },
  client?: any,
) {
  const dbClient = clientOf(client);
  await assertWarehouseInScope(dbClient, tenant, input.warehouseId);
  await dbClient.reorderManualItem.deleteMany({
    where: {
      companyId: tenant.companyId,
      productId: input.productId,
      warehouseId: input.warehouseId,
    },
  });
  return { removed: true as const };
}

export type CreateReorderPoLine = {
  productId: string;
  quantity: number;
  supplierId: string;
  unitCost: number;
  unitId?: string | null;
  warehouseId: string;
};

export async function createReorderPurchaseOrders(
  tenant: TenantContext,
  lines: CreateReorderPoLine[],
) {
  if (!lines.length) throw new Error("Select at least one product with Order Qty, Unit, and Supplier.");
  for (const line of lines) {
    if (!(qtyNum(line.quantity) > 0)) throw new Error("Order Qty must be greater than zero for selected products.");
    if (!line.supplierId) throw new Error("Supplier is required for each selected product.");
    if (!line.warehouseId) throw new Error("Warehouse is required.");
  }

  const bySupplierWarehouse = new Map<string, CreateReorderPoLine[]>();
  for (const line of lines) {
    const key = `${line.supplierId}:${line.warehouseId}`;
    const list = bySupplierWarehouse.get(key) ?? [];
    list.push(line);
    bySupplierWarehouse.set(key, list);
  }

  const created: Array<{ id: string; purchaseNo: string; status: string; supplierId: string }> = [];
  for (const group of bySupplierWarehouse.values()) {
    const first = group[0]!;
    const input: PurchaseOrderInput = {
      currency: "LAK",
      exchangeRate: 1,
      items: group.map((line) => ({
        productId: line.productId,
        quantity: qtyNum(line.quantity),
        unitCost: qtyNum(line.unitCost),
        unitId: line.unitId || null,
      })),
      paidAmount: 0,
      supplierId: first.supplierId,
      warehouseId: first.warehouseId,
    };
    const po = await createPurchaseOrder(input, tenant);
    created.push({
      id: String(po.id),
      purchaseNo: String(po.purchaseNo),
      status: String(po.status),
      supplierId: first.supplierId,
    });

    // Drop manual rows for products now on draft PO (they move to Already Ordered).
    await db.reorderManualItem.deleteMany({
      where: {
        companyId: tenant.companyId,
        productId: { in: group.map((line) => line.productId) },
        warehouseId: first.warehouseId,
      },
    });
  }

  return { purchaseOrders: created };
}

export function hasConfiguredReorderThreshold(minStock: unknown) {
  return hasReorderThreshold(minStock);
}
