import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, withTenantTransaction } from "@/lib/db/write-context";
import { assertWarehouseInScope, branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { inventoryLotLockKey } from "@/features/inventory/lot-reconciliation";
import {
  applyAtomicStockDelta,
  lockInventoryMutationKey,
  setAtomicStockCount,
} from "@/features/inventory/stock-concurrency";
import {
  InventoryCountConflictError,
  STOCK_RESERVED_FLOOR_MESSAGE,
} from "@/features/inventory/stock-count-errors";
import {
  mapPrismaProductToReceivableItem,
  mapPrismaStockMovement,
  mapPrismaWarehouse,
} from "@/features/inventory/dto-mapper";
import { readOnHandBaseQty, sumActiveReservedBaseQty } from "@/features/pos/stock-reservation";
import {
  attachInventorySalesMetrics,
  getPrismaInventoryListPage as loadPrismaInventoryListPage,
  inventoryProductSelect,
  loadLastSaleByProduct,
  type InventoryListQuery,
} from "@/features/inventory/list-query";
import type { InventoryItem, ProductLotRow, ProductStockSnapshot } from "@/features/inventory/types";
import {
  parseStockAdjustmentInput,
  parseStockCountInput,
  parseStockInInput,
  type StockAdjustmentInput,
  type StockCountInput,
  type StockInInput,
} from "@/features/inventory/dto";

const db = prisma as any;

export async function getPrismaInventoryListPage(tenant: TenantContext, input: InventoryListQuery = {}, client: any = db) {
  return loadPrismaInventoryListPage(tenant, input, client);
}

export async function getPrismaInventorySnapshot(tenant: TenantContext, client: any = db) {
  const scope = await resolveTenantScope(tenant, client);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [warehouses, balances, movements] = await Promise.all([
    client.warehouse.findMany({
      include: { branch: { select: { name: true } } },
      orderBy: { name: "asc" },
      where: { branchId: scope.branchId, companyId: scope.companyId },
    }),
    client.inventoryBalance.findMany({
      include: { product: { select: inventoryProductSelect } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      where: {
        companyId: scope.companyId,
        warehouseId: { in: scope.warehouseIds },
        product: { isActive: true, status: { not: "deleted" } },
      },
    }),
    client.stockMovement.findMany({
      include: {
        product: { select: { nameEn: true, nameLo: true, sku: true } },
        unit: { select: { unitName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      where: { companyId: scope.companyId, warehouseId: { in: scope.warehouseIds } },
    }),
  ]);

  const productIds = balances.map((balance: Record<string, any>) => balance.productId);
  const [lastSaleByProduct, sold30Days] = productIds.length
    ? await Promise.all([
        loadLastSaleByProduct(client, scope, productIds),
        client.saleItem.groupBy({
          by: ["productId"],
          _sum: { quantity: true },
          where: {
            productId: { in: productIds },
            sale: { branchId: scope.branchId, companyId: scope.companyId, createdAt: { gte: thirtyDaysAgo }, saleStatus: { in: [...REPORT_SALE_STATUSES] } },
          },
        }),
      ])
    : [new Map<string, Date>(), []];

  const sold30ByProduct = new Map<string, number>(
    sold30Days.map((row: Record<string, any>) => [row.productId, amount(row._sum.quantity)]),
  );

  return {
    items: attachInventorySalesMetrics(balances, lastSaleByProduct, sold30ByProduct),
    movements: movements.map(mapPrismaStockMovement),
    warehouses: warehouses.map(mapPrismaWarehouse),
  };
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getPrismaReceivableCatalogItems(tenant: TenantContext, client: any = db): Promise<InventoryItem[]> {
  const scope = await resolveTenantScope(tenant, client);
  const [products, balances] = await Promise.all([
    client.product.findMany({
      select: inventoryProductSelect,
      orderBy: { nameEn: "asc" },
      where: {
        companyId: scope.companyId,
        isActive: true,
        status: { not: "deleted" },
        ...branchOwnedWhere(scope),
      },
    }),
    client.inventoryBalance.findMany({
      select: { productId: true, warehouseId: true },
      where: { companyId: scope.companyId, warehouseId: { in: scope.warehouseIds } },
    }),
  ]);

  const existing = new Set(
    balances.map((row: { productId: string; warehouseId: string }) => `${row.productId}:${row.warehouseId}`),
  );
  const items: InventoryItem[] = [];

  for (const product of products) {
    for (const warehouseId of scope.warehouseIds) {
      if (existing.has(`${product.id}:${warehouseId}`)) continue;
      items.push(mapPrismaProductToReceivableItem(product, warehouseId));
    }
  }

  return items;
}

export function mergeQuickStockInCatalog(balanceItems: InventoryItem[], catalogItems: InventoryItem[]) {
  const productIds = new Set(balanceItems.map((item) => item.productId));
  const extras: InventoryItem[] = [];
  const seen = new Set<string>();

  for (const item of catalogItems) {
    if (productIds.has(item.productId) || seen.has(item.productId)) continue;
    seen.add(item.productId);
    extras.push(item);
  }

  return [...balanceItems, ...extras];
}

export function mergeStockInCatalog(balanceItems: InventoryItem[], catalogItems: InventoryItem[]) {
  const keys = new Set(balanceItems.map((item) => `${item.productId}:${item.warehouseId}`));
  return [...balanceItems, ...catalogItems.filter((item) => !keys.has(`${item.productId}:${item.warehouseId}`))];
}

async function assertProductReceivableInCompany(tx: any, tenant: TenantContext, productId: string) {
  const product = await tx.product.findFirst({
    select: { id: true, isActive: true, status: true },
    where: { companyId: tenant.companyId, id: productId },
  });

  if (!product) {
    throw new Error("Product was not found in this company.");
  }

  if (!product.isActive || product.status === "deleted") {
    throw new Error("Product is not available for receiving.");
  }

  return product;
}

export async function writeStockIn(tx: any, input: StockInInput, tenant: TenantContext) {
  const data = parseStockInInput(input);
  await assertWarehouseInScope(tx, tenant, data.warehouseId);
  await assertProductReceivableInCompany(tx, tenant, data.productId);
  const quantity = numberValue(data.quantity);

  if (quantity <= 0) {
    throw new Error("Stock-in quantity must be greater than zero.");
  }
  const unit = data.unitId
    ? await tx.productUnit.findFirstOrThrow({
        where: { id: data.unitId, productId: data.productId, status: "active" },
      })
    : await tx.productUnit.findFirst({
        where: { productId: data.productId, isBaseUnit: true },
      });
  const conversionQty = Math.max(numberValue(unit?.conversionQty, 1), 1);
  const baseQuantity = quantity * conversionQty;
  const isQuickStockIn = Boolean(
    data.stockInNo ||
      data.invoiceNo ||
      data.supplierId ||
      data.supplierName ||
      data.unitCostLak !== undefined ||
      data.photos?.length,
  );
  const requestedStockInNo = optionalString(data.stockInNo);
  if (isQuickStockIn && !requestedStockInNo) {
    await lockInventoryMutationKey(tx, `quick-stock-in-auto:${tenant.companyId}`);
  }
  const stockInNo = isQuickStockIn
    ? requestedStockInNo ?? (await generateStockInNumber(tx, tenant.companyId))
    : undefined;
  if (isQuickStockIn && stockInNo) {
    await lockInventoryMutationKey(tx, `quick-stock-in:${tenant.companyId}:${stockInNo}`);
    const duplicate = await tx.stockMovement.findFirst({
      where: { companyId: tenant.companyId, referenceId: stockInNo, referenceType: "quick_stock_in" },
    });
    if (duplicate) {
      throw new Error("Stock In Number already exists.");
    }
  }
  const paymentStatus = data.paymentStatus ?? "paid";
  const unitCostLak = numberValue(data.unitCostLak, numberValue(unit?.costPriceLak, 0));
  const totalCostLak = unitCostLak * quantity;

  if (data.supplierId) {
    const supplier = await tx.supplier.findFirst({
      where: { companyId: tenant.companyId, id: data.supplierId },
    });
    if (!supplier) {
      throw new Error("Supplier does not exist in this company.");
    }
  }

  const balance = await applyAtomicStockDelta(tx, {
    companyId: tenant.companyId,
    productId: data.productId,
    quantityDelta: baseQuantity,
    warehouseId: data.warehouseId,
  });

  const lotNumber = optionalString(data.lotNumber);
  const expiryDate = data.expiryDate ? new Date(data.expiryDate) : undefined;

  if (lotNumber || expiryDate) {
    const existingLot = await tx.inventoryLot.findFirst({
      where: {
        companyId: tenant.companyId,
        expiryDate,
        lotNumber,
        productId: data.productId,
        warehouseId: data.warehouseId,
      },
    });

    if (existingLot) {
      await tx.inventoryLot.update({
        data: {
          quantity: numberValue(existingLot.quantity) + baseQuantity,
          receivedAt: new Date(),
        },
        where: { id: existingLot.id },
      });
    } else {
      await tx.inventoryLot.create({
        data: {
          companyId: tenant.companyId,
          expiryDate,
          lotNumber,
          productId: data.productId,
          quantity: baseQuantity,
          receivedAt: new Date(),
          warehouseId: data.warehouseId,
        },
      });
    }
  }

  if (data.updateProductCost && unit?.id) {
    await tx.productUnit.update({
      data: { costPriceLak: unitCostLak },
      where: { id: unit.id },
    });
    if (unit.isBaseUnit) {
      await tx.product.update({
        data: { costPriceLak: unitCostLak },
        where: { id: data.productId },
      });
    }
  }

  const note = isQuickStockIn
    ? JSON.stringify({
        conversionQty,
        enteredQuantity: quantity,
        invoiceNo: optionalString(data.invoiceNo),
        note: optionalString(data.note),
        paymentStatus,
        photos: data.photos ?? [],
        supplierId: optionalString(data.supplierId),
        supplierName: optionalString(data.supplierName),
        totalCostLak,
        unitCostLak,
        unitName: unit?.unitName,
      })
    : optionalString(data.note);

  await tx.stockMovement.create({
    data: {
      afterQty: balance.afterQty,
      beforeQty: balance.beforeQty,
      companyId: tenant.companyId,
      createdBy: tenant.userId,
      expiryDate,
      lotNumber,
      movementType: "purchase",
      note,
      productId: data.productId,
      quantity: baseQuantity,
      referenceId: stockInNo,
      referenceType: isQuickStockIn ? "quick_stock_in" : "stock_in",
      unitId: optionalString(data.unitId ?? unit?.id),
      warehouseId: data.warehouseId,
    },
  });

  return balance;
}

export async function createStockIn(input: StockInInput, tenant: TenantContext) {
  return withTenantTransaction({
    action: "stock_in",
    module: "inventory",
    newData: parseStockInInput(input),
    tenant,
    write: (tx) => writeStockIn(tx, input, tenant),
  });
}

async function generateStockInNumber(tx: any, companyId: string) {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const prefix = `SI-${datePart}-`;
  const count = await tx.stockMovement.count({
    where: { companyId, referenceId: { startsWith: prefix }, referenceType: "quick_stock_in" },
  });

  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

async function assertNotBelowReserved(
  tx: any,
  input: { afterQty: number; companyId: string; productId: string; warehouseId: string },
) {
  const reserved = await sumActiveReservedBaseQty(tx, {
    companyId: input.companyId,
    productId: input.productId,
    warehouseId: input.warehouseId,
  });
  if (numberValue(input.afterQty) + 1e-9 < reserved) {
    throw new InventoryCountConflictError("INVENTORY_RESERVED_FLOOR", STOCK_RESERVED_FLOOR_MESSAGE);
  }
}

function lotStatus(quantity: number, expiryDate: Date | string | null | undefined): ProductLotRow["status"] {
  if (quantity <= 0) return "empty";
  if (expiryDate) {
    const expiry = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isFinite(expiry.getTime()) && expiry < today) return "expired";
  }
  return "active";
}

export async function getPrismaProductStockSnapshot(
  productId: string,
  tenant: TenantContext,
  client: any = db,
): Promise<ProductStockSnapshot> {
  const scope = await resolveTenantScope(tenant, client);
  const product = await client.product.findFirst({
    select: { id: true },
    where: { companyId: scope.companyId, id: productId, ...branchOwnedWhere(scope) },
  });
  if (!product) {
    throw new Error("Product was not found in this company.");
  }

  const warehouses = await client.warehouse.findMany({
    orderBy: { name: "asc" },
    where: { companyId: scope.companyId, id: { in: scope.warehouseIds } },
  });
  const warehouseIds = warehouses.map((warehouse: { id: string }) => warehouse.id);
  if (warehouseIds.length === 0) {
    return { movements: [], productId, warehouses: [] };
  }

  const [balances, lots, movements, reservedRows] = await Promise.all([
    client.inventoryBalance.findMany({
      where: { companyId: scope.companyId, productId, warehouseId: { in: warehouseIds } },
    }),
    client.inventoryLot.findMany({
      orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }, { createdAt: "asc" }],
      where: { companyId: scope.companyId, productId, warehouseId: { in: warehouseIds } },
    }),
    client.stockMovement.findMany({
      include: {
        product: { select: { nameEn: true, nameLo: true, sku: true } },
        unit: { select: { unitName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      where: { companyId: scope.companyId, productId, warehouseId: { in: warehouseIds } },
    }),
    client.stockReservation.groupBy({
      _sum: { baseQuantity: true },
      by: ["warehouseId"],
      where: {
        companyId: scope.companyId,
        productId,
        status: "ACTIVE",
        warehouseId: { in: warehouseIds },
      },
    }),
  ]);

  const onHandByWarehouse = new Map<string, number>(
    balances.map((row: { quantity: unknown; warehouseId: string }) => [row.warehouseId, numberValue(row.quantity)]),
  );
  const reservedByWarehouse = new Map<string, number>(
    reservedRows.map((row: { _sum: { baseQuantity: unknown }; warehouseId: string }) => [
      row.warehouseId,
      numberValue(row._sum.baseQuantity),
    ]),
  );
  const lotsByWarehouse = new Map<string, ProductLotRow[]>();
  for (const lot of lots) {
    const quantity = numberValue(lot.quantity);
    const row: ProductLotRow = {
      expiryDate: lot.expiryDate instanceof Date ? lot.expiryDate.toISOString().slice(0, 10) : null,
      id: String(lot.id),
      lotNumber: lot.lotNumber ?? null,
      quantity,
      receivedAt: lot.receivedAt instanceof Date ? lot.receivedAt.toISOString().slice(0, 10) : null,
      status: lotStatus(quantity, lot.expiryDate),
    };
    const current = lotsByWarehouse.get(lot.warehouseId) ?? [];
    current.push(row);
    lotsByWarehouse.set(lot.warehouseId, current);
  }

  return {
    movements: movements.map(mapPrismaStockMovement),
    productId,
    warehouses: warehouses.map((warehouse: { id: string; name: string }) => {
      const onHand = onHandByWarehouse.get(warehouse.id) ?? 0;
      const reserved = reservedByWarehouse.get(warehouse.id) ?? 0;
      return {
        available: Math.max(0, onHand - reserved),
        lots: lotsByWarehouse.get(warehouse.id) ?? [],
        onHand,
        reserved,
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
      };
    }),
  };
}

export async function createStockAdjustment(input: StockAdjustmentInput, tenant: TenantContext) {
  const data = parseStockAdjustmentInput(input);
  return withTenantTransaction({
    action: "adjustment",
    module: "inventory",
    newData: data,
    tenant,
    write: async (tx) => {
      await assertWarehouseInScope(tx, tenant, data.warehouseId);
      await assertProductReceivableInCompany(tx, tenant, data.productId);
      const quantity = numberValue(data.quantity);
      await lockInventoryMutationKey(
        tx,
        inventoryLotLockKey(tenant.companyId, data.warehouseId, data.productId),
      );
      const onHand = await readOnHandBaseQty(tx, {
        companyId: tenant.companyId,
        productId: data.productId,
        warehouseId: data.warehouseId,
      });
      await assertNotBelowReserved(tx, {
        afterQty: onHand + quantity,
        companyId: tenant.companyId,
        productId: data.productId,
        warehouseId: data.warehouseId,
      });
      const balance = await applyAtomicStockDelta(tx, {
        companyId: tenant.companyId,
        productId: data.productId,
        quantityDelta: quantity,
        warehouseId: data.warehouseId,
      });

      await tx.stockAdjustment.create({
        data: {
          adjustmentType: quantity >= 0 ? "increase" : "decrease",
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          productId: data.productId,
          quantity,
          reason: data.reason,
          warehouseId: data.warehouseId,
        },
      });

      await tx.stockMovement.create({
        data: {
          afterQty: balance.afterQty,
          beforeQty: balance.beforeQty,
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          movementType: "adjustment",
          note: optionalString(data.note),
          productId: data.productId,
          quantity,
          referenceType: "stock_adjustment",
          warehouseId: data.warehouseId,
        },
      });

      return balance;
    },
  });
}

export async function createStockCount(input: StockCountInput, tenant: TenantContext) {
  const data = parseStockCountInput(input);
  return withTenantTransaction({
    action: "count",
    module: "inventory",
    newData: data,
    tenant,
    write: async (tx) => {
      await assertWarehouseInScope(tx, tenant, data.warehouseId);
      await assertProductReceivableInCompany(tx, tenant, data.productId);
      await lockInventoryMutationKey(
        tx,
        inventoryLotLockKey(tenant.companyId, data.warehouseId, data.productId),
      );
      const unit = data.unitId
        ? await tx.productUnit.findFirstOrThrow({
            where: { id: data.unitId, productId: data.productId, status: "active" },
          })
        : null;
      const conversionQty = Math.max(numberValue(unit?.conversionQty, 1), 1);
      const countedBase = numberValue(data.countedQuantity) * conversionQty;
      await assertNotBelowReserved(tx, {
        afterQty: countedBase,
        companyId: tenant.companyId,
        productId: data.productId,
        warehouseId: data.warehouseId,
      });
      const balance = await setAtomicStockCount(tx, {
        companyId: tenant.companyId,
        countedQuantity: countedBase,
        expectedSystemQuantity: data.expectedSystemQuantity,
        productId: data.productId,
        warehouseId: data.warehouseId,
      });
      const quantity = balance.afterQty - balance.beforeQty;
      if (quantity === 0) {
        return balance;
      }
      await tx.stockMovement.create({
        data: {
          afterQty: balance.afterQty,
          beforeQty: balance.beforeQty,
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          movementType: "adjustment",
          note: optionalString(data.note),
          productId: data.productId,
          quantity,
          referenceType: "stock_count",
          warehouseId: data.warehouseId,
        },
      });
      return balance;
    },
  });
}

export async function adjustProductStockToActual(
  input: {
    countedQuantity: number;
    expectedSystemQuantity: number;
    productId: string;
    reason: string;
    unitId?: string | null;
    warehouseId: string;
  },
  tenant: TenantContext,
) {
  const reason = optionalString(input.reason);
  if (!reason) {
    throw new Error("Stock adjustment reason is required.");
  }
  return createStockCount(
    {
      countedQuantity: input.countedQuantity,
      expectedSystemQuantity: input.expectedSystemQuantity,
      note: reason,
      productId: input.productId,
      unitId: input.unitId,
      warehouseId: input.warehouseId,
    },
    tenant,
  );
}
