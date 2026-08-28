import type { InventoryItem, StockMovement, Warehouse } from "@/features/inventory/types";

type Row = Record<string, any>;

function toNumber(value: unknown) {
  return value == null ? 0 : Number(value);
}

function formatDate(value: unknown) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : undefined;
}

export function mapPrismaWarehouse(warehouse: Row): Warehouse {
  return {
    branchName: warehouse.branch?.name ?? "",
    id: warehouse.id,
    name: warehouse.name,
    type: warehouse.type,
  };
}

export function mapPrismaProductToReceivableItem(product: Row, warehouseId: string): InventoryItem {
  const baseUnit = product.units?.find((unit: Row) => unit.isBaseUnit) ?? product.units?.[0];
  const lot = product.inventoryLots?.[0];

  return {
    barcode: product.barcode ?? "",
    baseUnit: baseUnit?.unitName ?? "Piece",
    category: product.category?.nameEn ?? product.category?.nameLo ?? "",
    daysWithoutSale: 0,
    expiryDate: formatDate(lot?.expiryDate),
    expiryTrackingEnabled: Boolean(lot?.expiryDate),
    id: `catalog:${product.id}:${warehouseId}`,
    imageKey: product.imageUrl ?? "generic",
    inventoryValueLak: 0,
    lastMovementAt: "",
    lastPurchaseDate: undefined,
    minStock: toNumber(product.minStock),
    productCode: product.productCode ?? undefined,
    productNameEn: product.nameEn ?? "",
    productNameLo: product.nameLo ?? "",
    productId: product.id,
    quantity: 0,
    sku: product.sku ?? "",
    supplierId: product.supplierId ?? undefined,
    supplierName: product.supplier?.companyName ?? product.supplier?.name ?? undefined,
    unitsSold30Days: 0,
    units: (product.units ?? []).map((unit: Row) => ({
      barcode: unit.barcode ?? "",
      conversionQty: toNumber(unit.conversionQty),
      costPriceLak: unit.costPriceLak == null ? undefined : toNumber(unit.costPriceLak),
      id: unit.id,
      imageUrl: unit.imageUrl ?? undefined,
      isBaseUnit: Boolean(unit.isBaseUnit),
      isPurchaseUnit: Boolean(unit.isPurchaseUnit),
      status: unit.status ?? "active",
      unitName: unit.unitName ?? "",
    })),
    warehouseId,
  };
}

export function mapPrismaInventoryBalance(balance: Row): InventoryItem {
  const product = balance.product ?? {};
  const baseUnit = product.units?.find((unit: Row) => unit.isBaseUnit) ?? product.units?.[0];
  const lot = product.inventoryLots?.[0];

  return {
    barcode: product.barcode ?? "",
    baseUnit: baseUnit?.unitName ?? "Piece",
    category: product.category?.nameEn ?? product.category?.nameLo ?? "",
    daysWithoutSale: 0,
    expiryDate: formatDate(lot?.expiryDate),
    expiryTrackingEnabled: Boolean(lot?.expiryDate),
    id: balance.id,
    imageKey: product.imageUrl ?? "generic",
    inventoryValueLak: toNumber(balance.quantity) * toNumber(baseUnit?.costPriceLak ?? product.costPriceLak),
    lastMovementAt: balance.updatedAt?.toISOString?.().slice(0, 10) ?? "",
    lastPurchaseDate: formatDate(lot?.receivedAt),
    minStock: toNumber(product.minStock),
    productCode: product.productCode ?? undefined,
    productNameEn: product.nameEn ?? "",
    productNameLo: product.nameLo ?? "",
    productId: balance.productId,
    quantity: toNumber(balance.quantity),
    sku: product.sku ?? "",
    supplierId: product.supplierId ?? undefined,
    supplierName: product.supplier?.companyName ?? product.supplier?.name ?? undefined,
    unitsSold30Days: toNumber(product._count?.saleItems),
    units: (product.units ?? []).map((unit: Row) => ({
      barcode: unit.barcode ?? "",
      conversionQty: toNumber(unit.conversionQty),
      costPriceLak: unit.costPriceLak == null ? undefined : toNumber(unit.costPriceLak),
      id: unit.id,
      imageUrl: unit.imageUrl ?? undefined,
      isBaseUnit: Boolean(unit.isBaseUnit),
      isPurchaseUnit: Boolean(unit.isPurchaseUnit),
      status: unit.status ?? "active",
      unitName: unit.unitName ?? "",
    })),
    warehouseId: balance.warehouseId,
  };
}

export function mapPrismaStockMovement(movement: Row): StockMovement {
  const meta = parseMovementMeta(movement.note);
  const movementType =
    movement.referenceType === "quick_stock_in"
      ? "quick_stock_in"
      : movement.movementType === "purchase"
      ? "stock_in"
      : movement.movementType === "transfer_in" || movement.movementType === "transfer_out" || movement.movementType === "expired"
        ? movement.movementType
        : "adjustment";

  return {
    afterQty: toNumber(movement.afterQty),
    beforeQty: toNumber(movement.beforeQty),
    createdAt: movement.createdAt?.toISOString?.().replace("T", " ").slice(0, 16) ?? "",
    createdBy: movement.createdBy ?? "",
    enteredQuantity: meta.enteredQuantity,
    expiryDate: formatDate(movement.expiryDate),
    id: movement.id,
    invoiceNo: meta.invoiceNo,
    lotNumber: movement.lotNumber ?? undefined,
    movementType,
    note: meta.note ?? movement.note ?? "",
    paymentStatus: meta.paymentStatus,
    productId: movement.productId ?? undefined,
    productName: movement.product?.nameEn ?? movement.product?.nameLo ?? "",
    quantity: toNumber(movement.quantity),
    sku: movement.product?.sku ?? "",
    stockInNo: movement.referenceId ?? undefined,
    supplierName: meta.supplierName,
    totalCostLak: meta.totalCostLak,
    unitCostLak: meta.unitCostLak,
    unitName: movement.unit?.unitName ?? meta.unitName,
    warehouseId: movement.warehouseId,
  };
}

function parseMovementMeta(note: unknown) {
  if (typeof note !== "string" || !note.trim().startsWith("{")) {
    return {} as Record<string, any>;
  }
  try {
    return JSON.parse(note) as Record<string, any>;
  } catch {
    return {} as Record<string, any>;
  }
}
