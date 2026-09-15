import type { Category, Product, ProductStatus, ProductUnit } from "@/features/products/types";

type PrismaProduct = Record<string, any>;
type PrismaCategory = Record<string, any>;

function toNumber(value: unknown) {
  return value == null ? 0 : Number(value);
}

export function mapPrismaProductUnit(unit: Record<string, any>): ProductUnit {
  return {
    allowManualUnitSelect: unit.allowManualUnitSelect ?? true,
    addAmountLak: unit.addAmountLak == null ? undefined : toNumber(unit.addAmountLak),
    barcode: unit.barcode ?? "",
    conversionQty: toNumber(unit.conversionQty),
    costPriceLak: unit.costPriceLak == null ? undefined : toNumber(unit.costPriceLak),
    id: unit.id,
    imageUrl: unit.imageUrl ?? undefined,
    isBaseUnit: Boolean(unit.isBaseUnit),
    isDefaultSaleUnit: Boolean(unit.isDefaultSaleUnit),
    isPurchaseUnit: Boolean(unit.isPurchaseUnit),
    markupPercent: unit.markupPercent == null ? undefined : toNumber(unit.markupPercent),
    pricingMode: unit.pricingMode ?? "manual",
    roundingLak: toNumber(unit.roundingLak),
    sellingPriceLak: toNumber(unit.sellingPriceLak),
    sortOrder: toNumber(unit.sortOrder),
    status: unit.status ?? "active",
    unitName: unit.unitName ?? "",
  };
}

export function mapPrismaProduct(product: PrismaProduct): Product {
  const balances = Array.isArray(product.balances) ? product.balances : [];
  const lots = Array.isArray(product.inventoryLots) ? product.inventoryLots : [];
  const nearestExpiry = lots
    .map((lot: Record<string, any>) => lot.expiryDate)
    .filter(Boolean)
    .sort((left: Date, right: Date) => Number(left) - Number(right))[0];

  return {
    barcode: product.barcode ?? "",
    barcodeHistory: (product.barcodeHistory ?? []).map((entry: Record<string, any>) => ({
      changedBy: entry.changedBy ?? undefined,
      createdAt: entry.createdAt?.toISOString?.() ?? "",
      newBarcode: entry.newBarcode ?? undefined,
      oldBarcode: entry.oldBarcode ?? undefined,
      unitName: entry.unitName ?? undefined,
    })),
    brandId: product.brandId ?? undefined,
    brandName: product.brand?.name ?? "",
    categoryId: product.categoryId ?? "",
    categoryName: product.category?.nameEn ?? product.category?.nameLo ?? "",
    costPriceLak: toNumber(product.costPriceLak),
    currentStock: balances.reduce((total: number, balance: Record<string, any>) => total + toNumber(balance.quantity), 0),
    description: product.description ?? undefined,
    expiryDate: nearestExpiry?.toISOString?.().slice(0, 10) ?? undefined,
    id: product.id,
    imageUrl: product.imageUrl ?? undefined,
    minStock: toNumber(product.minStock),
    nameEn: product.nameEn ?? "",
    nameLo: product.nameLo,
    productCode: product.productCode ?? undefined,
    priceHistory: (product.priceHistory ?? []).map((entry: Record<string, any>) => ({
      changeType: entry.changeType ?? "",
      changedBy: entry.changedBy ?? undefined,
      createdAt: entry.createdAt?.toISOString?.() ?? "",
      newPrice: toNumber(entry.newPrice),
      oldPrice: toNumber(entry.oldPrice),
      unitName: entry.unitName ?? undefined,
    })),
    sellingPriceLak: toNumber(product.sellingPriceLak),
    sku: product.sku ?? "",
    status: (product.status ?? "active") as ProductStatus,
    stockDisplayMode: product.stockDisplayMode ?? "base_unit_only",
    supplierId: product.supplierId ?? undefined,
    supplierIds: Array.isArray(product.productSuppliers)
      ? product.productSuppliers.map((row: Record<string, any>) => String(row.supplierId))
      : product.supplierId
        ? [String(product.supplierId)]
        : [],
    productSuppliers: Array.isArray(product.productSuppliers)
      ? product.productSuppliers.map((row: Record<string, any>) => ({
          isPreferred: Boolean(row.isPreferred),
          supplierId: String(row.supplierId),
          supplierName: row.supplier?.companyName ?? row.supplier?.name ?? "",
        }))
      : product.supplierId
        ? [{
            isPreferred: true,
            supplierId: String(product.supplierId),
            supplierName: product.supplier?.companyName ?? product.supplier?.name ?? "",
          }]
        : [],
    supplierName: product.supplier?.companyName ?? product.supplier?.name ?? "",
    tags: Array.isArray(product.tags) ? product.tags.map(String) : [],
    units: (product.units ?? []).map(mapPrismaProductUnit),
    updatedAt: product.updatedAt?.toISOString?.().slice(0, 10) ?? "",
  };
}

export function mapPrismaCategory(category: PrismaCategory): Category {
  return {
    id: category.id,
    nameEn: category.nameEn ?? "",
    nameLo: category.nameLo,
    parentName: category.parent?.nameEn ?? category.parent?.nameLo ?? undefined,
    parentNameEn: category.parent?.nameEn ?? "",
    parentNameLo: category.parent?.nameLo ?? "",
    productCount: category._count?.products ?? 0,
    status: category.isActive === false ? "inactive" : "active",
  };
}
