import { prisma } from "@/lib/db/prisma";
import { mapPrismaCategory, mapPrismaProduct } from "@/features/products/dto-mapper";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

function productInventoryScopeWhere(scope: BranchScope) {
  if (scope.isOwner) {
    return {};
  }

  return {
    OR: [
      { balances: { some: { warehouseId: { in: scope.warehouseIds } } } },
      { balances: { none: {} } },
    ],
  };
}

export async function getPrismaProducts(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const products = await db.product.findMany({
    include: {
      balances: true,
      barcodeHistory: { orderBy: { createdAt: "desc" }, take: 20 },
      brand: true,
      category: true,
      inventoryLots: { orderBy: { expiryDate: "asc" }, take: 1 },
      priceHistory: { orderBy: { createdAt: "desc" }, take: 20 },
      supplier: true,
      units: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    where: {
      companyId: scope.companyId,
      ...branchWhere,
      ...productInventoryScopeWhere(scope),
    },
  });

  return products.map(mapPrismaProduct);
}

export async function getPrismaProductById(productId: string, tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const product = await db.product.findFirst({
    include: {
      balances: true,
      barcodeHistory: { orderBy: { createdAt: "desc" }, take: 50 },
      brand: true,
      category: true,
      inventoryLots: { orderBy: { expiryDate: "asc" }, take: 1 },
      priceHistory: { orderBy: { createdAt: "desc" }, take: 50 },
      supplier: true,
      units: { orderBy: { sortOrder: "asc" } },
    },
    where: {
      companyId: scope.companyId,
      id: productId,
      ...branchWhere,
      ...productInventoryScopeWhere(scope),
    },
  });

  return product ? mapPrismaProduct(product) : null;
}

export async function getPrismaCategories(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const categories = await db.category.findMany({
    include: { _count: { select: { products: true } }, parent: true },
    orderBy: [{ nameEn: "asc" }, { nameLo: "asc" }],
    where: { companyId: scope.companyId, ...branchOwnedWhere(scope) },
  });

  return categories.map(mapPrismaCategory);
}

export async function getPrismaProductImages() {
  return [];
}

export type ProductBarcodeLookupResult = {
  matchedBarcode: string;
  matchedUnitId?: string;
  matchedUnitName?: string;
  productCode?: string;
  productId: string;
  productName: string;
  sku: string;
};

export async function findPrismaProductByBarcode(barcode: string, tenant: TenantContext): Promise<ProductBarcodeLookupResult | null> {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) {
    return null;
  }

  const scope = await resolveTenantScope(tenant);
  const product = await db.product.findFirst({
    include: {
      units: {
        orderBy: { sortOrder: "asc" },
        select: {
          barcode: true,
          id: true,
          unitName: true,
        },
      },
    },
    where: {
      companyId: scope.companyId,
      OR: [
        { barcode: normalized },
        { units: { some: { barcode: normalized } } },
      ],
    },
  });

  if (!product) {
    return null;
  }

  const matchedUnit = product.units.find((unit: Record<string, any>) => unit.barcode === normalized);
  return {
    matchedBarcode: normalized,
    matchedUnitId: matchedUnit?.id,
    matchedUnitName: matchedUnit?.unitName,
    productCode: product.productCode ?? undefined,
    productId: product.id,
    productName: product.nameEn || product.nameLo || "Existing product",
    sku: product.sku ?? "",
  };
}

export type ProductWriteInput = {
  barcode?: string;
  brandId?: string;
  categoryId?: string;
  costPriceLak?: number;
  description?: string;
  imageUrl?: string;
  minStock?: number;
  nameEn?: string;
  nameLo: string;
  productCode?: string;
  sellingPriceLak?: number;
  sku?: string;
  status?: string;
  stockDisplayMode?: "base_unit_only" | "breakdown";
  supplierId?: string;
  tags?: string[];
  units?: ProductUnitWriteInput[];
};

function normalizeBarcode(value: unknown) {
  return optionalString(value);
}

export type ProductUnitWriteInput = {
  addAmountLak?: number;
  allowManualUnitSelect?: boolean;
  barcode?: string;
  conversionQty: number;
  costPriceLak?: number;
  id?: string;
  imageUrl?: string;
  isBaseUnit?: boolean;
  isDefaultSaleUnit?: boolean;
  isPurchaseUnit?: boolean;
  markupPercent?: number;
  pricingMode?: "manual" | "cost_plus_percent" | "cost_plus_amount";
  roundingLak?: number;
  sellingPriceLak: number;
  sortOrder?: number;
  status?: "active" | "inactive";
  unitName: string;
};

export type BulkPriceUpdateInput = {
  adjustmentMode: "increase_percent" | "decrease_percent" | "increase_amount" | "decrease_amount" | "set_exact";
  adjustmentValue: number;
  categoryId?: string;
  fields: {
    costPrice?: boolean;
    sellingPrice?: boolean;
    studentPrice?: boolean;
  };
  productIds?: string[];
  roundingLak?: number;
  target: "all" | "category" | "selected";
};

function normalizedProductUnits(input: ProductUnitWriteInput[] | undefined, fallback: {
  barcode?: string;
  costPriceLak?: number;
  sellingPriceLak?: number;
}) {
  const units = (input ?? [])
    .filter((unit) => stringValue(unit.unitName).length > 0)
    .map((unit) => ({
      addAmountLak: unit.addAmountLak === undefined ? undefined : numberValue(unit.addAmountLak),
      barcode: optionalString(unit.barcode),
      conversionQty: Math.max(numberValue(unit.conversionQty, 1), 1),
      costPriceLak: unit.costPriceLak === undefined ? undefined : numberValue(unit.costPriceLak),
      id: optionalString(unit.id),
      imageUrl: optionalString(unit.imageUrl),
      allowManualUnitSelect: unit.allowManualUnitSelect ?? true,
      isBaseUnit: Boolean(unit.isBaseUnit),
      isDefaultSaleUnit: Boolean(unit.isDefaultSaleUnit),
      isPurchaseUnit: Boolean(unit.isPurchaseUnit),
      markupPercent: unit.markupPercent === undefined ? undefined : numberValue(unit.markupPercent),
      pricingMode: unit.pricingMode === "cost_plus_percent" || unit.pricingMode === "cost_plus_amount" ? unit.pricingMode : "manual" as const,
      roundingLak: [0, 500, 1000, 5000].includes(numberValue(unit.roundingLak)) ? numberValue(unit.roundingLak) : 0,
      sellingPriceLak: numberValue(unit.sellingPriceLak, fallback.sellingPriceLak ?? 0),
      sortOrder: Math.max(Math.floor(numberValue(unit.sortOrder)), 0),
      status: unit.status === "inactive" ? "inactive" as const : "active" as const,
      unitName: stringValue(unit.unitName, "Piece"),
    }));

  const source = units.length > 0
    ? units
    : [{
        barcode: optionalString(fallback.barcode),
        addAmountLak: undefined,
        conversionQty: 1,
        costPriceLak: fallback.costPriceLak === undefined ? undefined : numberValue(fallback.costPriceLak),
        id: undefined,
        imageUrl: undefined,
        allowManualUnitSelect: true,
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        isPurchaseUnit: true,
        markupPercent: undefined,
        pricingMode: "manual" as const,
        roundingLak: 0,
        sellingPriceLak: numberValue(fallback.sellingPriceLak),
        sortOrder: 0,
        status: "active" as const,
        unitName: "Piece",
      }];
  const baseIndex = source.findIndex((unit) => unit.isBaseUnit);
  const defaultSaleIndex = source.findIndex((unit) => unit.isDefaultSaleUnit);

  return source.map((unit, index) => ({
    ...unit,
    conversionQty: baseIndex >= 0 ? index === baseIndex ? 1 : unit.conversionQty : index === 0 ? 1 : unit.conversionQty,
    isBaseUnit: baseIndex >= 0 ? index === baseIndex : index === 0,
    isDefaultSaleUnit: defaultSaleIndex >= 0 ? index === defaultSaleIndex : (baseIndex >= 0 ? index === baseIndex : index === 0),
    isPurchaseUnit: unit.isPurchaseUnit || (baseIndex >= 0 ? index === baseIndex : index === 0),
  }));
}

function assertNonNegative(value: unknown, label: string) {
  if (value !== undefined && numberValue(value) < 0) {
    throw new Error(`${label} must be greater than or equal to zero.`);
  }
}

function assertPositive(value: unknown, label: string) {
  if (numberValue(value) <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function assertValidProductWriteInput(input: Partial<ProductWriteInput>) {
  assertNonNegative(input.costPriceLak, "Cost price");
  assertNonNegative(input.sellingPriceLak, "Selling price");
  assertNonNegative(input.minStock, "Minimum stock");

  for (const [index, unit] of (input.units ?? []).entries()) {
    assertPositive(unit.conversionQty, `Unit ${index + 1} conversion quantity`);
    assertNonNegative(unit.addAmountLak, `Unit ${index + 1} add amount`);
    assertNonNegative(unit.costPriceLak, `Unit ${index + 1} cost price`);
    assertNonNegative(unit.markupPercent, `Unit ${index + 1} markup percent`);
    assertNonNegative(unit.roundingLak, `Unit ${index + 1} rounding`);
    assertNonNegative(unit.sellingPriceLak, `Unit ${index + 1} selling price`);
  }
}

function applyPriceAdjustment(value: number, input: BulkPriceUpdateInput) {
  const adjustment = numberValue(input.adjustmentValue);
  const rawValue = input.adjustmentMode === "increase_percent"
    ? value + value * (adjustment / 100)
    : input.adjustmentMode === "decrease_percent"
      ? value - value * (adjustment / 100)
      : input.adjustmentMode === "increase_amount"
        ? value + adjustment
        : input.adjustmentMode === "decrease_amount"
          ? value - adjustment
          : adjustment;
  const rounding = [0, 500, 1000, 5000].includes(numberValue(input.roundingLak)) ? numberValue(input.roundingLak) : 0;
  const rounded = rounding > 0 ? Math.round(rawValue / rounding) * rounding : Math.round(rawValue);
  return Math.max(0, rounded);
}

async function assertCategoryInBranch(client: any, scope: Awaited<ReturnType<typeof resolveTenantScope>>, categoryId: string) {
  await client.category.findFirstOrThrow({
    where: {
      companyId: scope.companyId,
      id: categoryId,
      ...branchOwnedWhere(scope),
    },
  });
}

async function assertSupplierInBranch(client: any, scope: Awaited<ReturnType<typeof resolveTenantScope>>, supplierId: string) {
  await client.supplier.findFirstOrThrow({
    where: {
      companyId: scope.companyId,
      id: supplierId,
      ...branchOwnedWhere(scope),
    },
  });
}

async function assertProductBranchReferences(
  client: any,
  scope: Awaited<ReturnType<typeof resolveTenantScope>>,
  input: Partial<ProductWriteInput>,
) {
  const categoryId = optionalString(input.categoryId);
  const supplierId = optionalString(input.supplierId);

  if (categoryId) {
    await assertCategoryInBranch(client, scope, categoryId);
  }

  if (supplierId) {
    await assertSupplierInBranch(client, scope, supplierId);
  }
}

async function assertUniqueBarcodes(
  client: any,
  scope: Awaited<ReturnType<typeof resolveTenantScope>>,
  input: Partial<ProductWriteInput>,
  productId?: string,
) {
  const productBarcode = normalizeBarcode(input.barcode);
  const unitBarcodes = ((input.units ?? []).map((unit) => normalizeBarcode(unit.barcode))).filter(Boolean) as string[];
  const uniqueUnitBarcodes = Array.from(new Set(unitBarcodes));

  if (uniqueUnitBarcodes.length !== unitBarcodes.length) {
    throw new Error("Barcode already exists.");
  }

  const lookupBarcodes = Array.from(new Set([productBarcode, ...uniqueUnitBarcodes].filter(Boolean) as string[]));

  for (const barcode of lookupBarcodes) {
    const productConflict = await client.product.findFirst({
      where: {
        barcode,
        companyId: scope.companyId,
        ...(productId ? { NOT: { id: productId } } : {}),
      },
    });
    if (productConflict) {
      throw new Error("Barcode already exists.");
    }

    const unitConflict = await client.productUnit.findFirst({
      where: {
        barcode,
        product: {
          companyId: scope.companyId,
          ...(productId ? { NOT: { id: productId } } : {}),
        },
      },
    });
    if (unitConflict) {
      throw new Error("Barcode already exists.");
    }
  }
}

function isPersistedUnitId(unitId: string | undefined) {
  return Boolean(unitId && !unitId.startsWith("unit-"));
}

function unitReferenceCount(unit: Record<string, any>) {
  return (
    (unit._count?.movements ?? 0) +
    (unit._count?.purchaseItems ?? 0) +
    (unit._count?.goodsReceiptItems ?? 0) +
    (unit._count?.saleItems ?? 0)
  );
}

export async function createPrismaProduct(input: ProductWriteInput, tenant: TenantContext) {
  assertValidProductWriteInput(input);
  return withTenantTransaction({
    action: "create",
    module: "products",
    newData: input,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      await assertProductBranchReferences(tx, scope, input);
      await assertUniqueBarcodes(tx, scope, input);
      const units = normalizedProductUnits(input.units, {
        barcode: input.barcode,
        costPriceLak: input.costPriceLak,
        sellingPriceLak: input.sellingPriceLak,
      });

      return tx.product.create({
        data: {
          barcode: optionalString(input.barcode),
          branchId: scope.branchId,
          brandId: optionalString(input.brandId),
          categoryId: optionalString(input.categoryId),
          companyId: tenant.companyId,
          costPriceLak: numberValue(input.costPriceLak),
          description: optionalString(input.description),
          imageUrl: optionalString(input.imageUrl),
          minStock: numberValue(input.minStock),
          nameEn: optionalString(input.nameEn),
          nameLo: stringValue(input.nameLo),
          productCode: optionalString(input.productCode),
          sellingPriceLak: numberValue(input.sellingPriceLak),
          sku: optionalString(input.sku),
          status: input.status ?? "active",
          stockDisplayMode: input.stockDisplayMode ?? "base_unit_only",
          supplierId: optionalString(input.supplierId),
          tags: input.tags ?? [],
          units: {
            create: units.map(({ id: _id, ...unit }) => unit),
          },
        },
        include: { brand: true, category: true, supplier: true, units: { orderBy: { sortOrder: "asc" } } },
      });
    },
  });
}

export async function updatePrismaProduct(productId: string, input: Partial<ProductWriteInput>, tenant: TenantContext) {
  assertValidProductWriteInput(input);
  return withTenantTransaction({
    action: "update",
    module: "products",
    newData: { productId, ...input },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.product.findFirstOrThrow({
        include: { units: true },
        where: { companyId: tenant.companyId, id: productId, ...branchOwnedWhere(scope) },
      });
      await assertProductBranchReferences(tx, scope, input);
      await assertUniqueBarcodes(tx, scope, input, existing.id);
      await tx.product.update({
        data: {
          barcode: input.barcode === undefined ? undefined : optionalString(input.barcode),
          brandId: input.brandId === undefined ? undefined : optionalString(input.brandId),
          categoryId: input.categoryId === undefined ? undefined : optionalString(input.categoryId),
          costPriceLak: input.costPriceLak === undefined ? undefined : numberValue(input.costPriceLak),
          description: input.description === undefined ? undefined : optionalString(input.description),
          imageUrl: input.imageUrl === undefined ? undefined : optionalString(input.imageUrl),
          minStock: input.minStock === undefined ? undefined : numberValue(input.minStock),
          nameEn: input.nameEn === undefined ? undefined : optionalString(input.nameEn),
          nameLo: input.nameLo === undefined ? undefined : stringValue(input.nameLo),
          productCode: input.productCode === undefined ? undefined : optionalString(input.productCode),
          sellingPriceLak: input.sellingPriceLak === undefined ? undefined : numberValue(input.sellingPriceLak),
          sku: input.sku === undefined ? undefined : optionalString(input.sku),
          status: input.status,
          stockDisplayMode: input.stockDisplayMode,
          supplierId: input.supplierId === undefined ? undefined : optionalString(input.supplierId),
          tags: input.tags,
        },
        where: { id: existing.id },
      });

      if (input.units !== undefined) {
        const units = normalizedProductUnits(input.units, {
          barcode: input.barcode ?? existing.barcode,
          costPriceLak: input.costPriceLak ?? Number(existing.costPriceLak),
          sellingPriceLak: input.sellingPriceLak ?? Number(existing.sellingPriceLak),
        });
        const existingUnits = await tx.productUnit.findMany({
          include: {
            _count: {
              select: {
                goodsReceiptItems: true,
                movements: true,
                purchaseItems: true,
                saleItems: true,
              },
            },
          },
          where: { productId: existing.id },
        });
        const existingById = new Map(existingUnits.map((unit: Record<string, any>) => [unit.id, unit]));
        const incomingPersistedIds = new Set<string>();

        for (const unit of units) {
          const existingUnit = unit.id ? existingById.get(unit.id) as Record<string, any> | undefined : undefined;
          const data = {
            addAmountLak: unit.addAmountLak,
            barcode: unit.barcode,
            conversionQty: unit.conversionQty,
            costPriceLak: unit.costPriceLak,
            imageUrl: unit.imageUrl,
            isBaseUnit: unit.isBaseUnit,
            isDefaultSaleUnit: unit.isDefaultSaleUnit,
            isPurchaseUnit: unit.isPurchaseUnit,
            allowManualUnitSelect: unit.allowManualUnitSelect,
            markupPercent: unit.markupPercent,
            pricingMode: unit.pricingMode,
            roundingLak: unit.roundingLak,
            sellingPriceLak: unit.sellingPriceLak,
            sortOrder: unit.sortOrder,
            status: unit.status,
            unitName: unit.unitName,
          };

          if (isPersistedUnitId(unit.id) && existingById.has(unit.id)) {
            incomingPersistedIds.add(unit.id!);
            await tx.productUnit.update({ data, where: { id: unit.id } });
            if (existingUnit && Number(existingUnit.sellingPriceLak) !== Number(unit.sellingPriceLak)) {
              await tx.productPriceHistory.create({
                data: {
                  changeType: "unit_price",
                  changedBy: tenant.userId,
                  companyId: tenant.companyId,
                  newPrice: unit.sellingPriceLak,
                  oldPrice: Number(existingUnit.sellingPriceLak),
                  productId: existing.id,
                  unitId: unit.id,
                  unitName: unit.unitName,
                },
              });
            }
            if (existingUnit && normalizeBarcode(existingUnit.barcode) !== normalizeBarcode(unit.barcode)) {
              await tx.productBarcodeHistory.create({
                data: {
                  changedBy: tenant.userId,
                  companyId: tenant.companyId,
                  newBarcode: normalizeBarcode(unit.barcode),
                  oldBarcode: normalizeBarcode(existingUnit.barcode),
                  productId: existing.id,
                  unitId: unit.id,
                  unitName: unit.unitName,
                },
              });
            }
          } else {
            await tx.productUnit.create({ data: { ...data, productId: existing.id } });
          }
        }

        for (const unit of existingUnits) {
          if (!incomingPersistedIds.has(unit.id) && unitReferenceCount(unit) === 0) {
            await tx.productUnit.delete({ where: { id: unit.id } });
          }
        }
      }

      if (input.sellingPriceLak !== undefined && Number(existing.sellingPriceLak) !== numberValue(input.sellingPriceLak)) {
        await tx.productPriceHistory.create({
          data: {
            changeType: "product_price",
            changedBy: tenant.userId,
            companyId: tenant.companyId,
            newPrice: numberValue(input.sellingPriceLak),
            oldPrice: Number(existing.sellingPriceLak),
            productId: existing.id,
          },
        });
      }

      if (input.barcode !== undefined && normalizeBarcode(existing.barcode) !== normalizeBarcode(input.barcode)) {
        await tx.productBarcodeHistory.create({
          data: {
            changedBy: tenant.userId,
            companyId: tenant.companyId,
            newBarcode: normalizeBarcode(input.barcode),
            oldBarcode: normalizeBarcode(existing.barcode),
            productId: existing.id,
          },
        });
      }

      return tx.product.findUniqueOrThrow({
        include: { brand: true, category: true, supplier: true, units: { orderBy: { sortOrder: "asc" } } },
        where: { id: existing.id },
      });
    },
  });
}

export async function duplicatePrismaProduct(productId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "duplicate",
    module: "products",
    newData: { productId },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.product.findFirstOrThrow({
        include: { units: { orderBy: { sortOrder: "asc" } } },
        where: { companyId: tenant.companyId, id: productId, ...branchOwnedWhere(scope) },
      });
      const timestamp = Date.now().toString().slice(-6);

      return tx.product.create({
        data: {
          barcode: null,
          branchId: scope.branchId,
          brandId: existing.brandId,
          categoryId: existing.categoryId,
          companyId: tenant.companyId,
          costPriceLak: existing.costPriceLak,
          description: existing.description,
          imageUrl: existing.imageUrl,
          minStock: existing.minStock,
          nameEn: existing.nameEn ? `${existing.nameEn} Copy` : null,
          nameLo: `${existing.nameLo} Copy`,
          productCode: `COPY-${timestamp}`,
          sellingPriceLak: existing.sellingPriceLak,
          sku: `COPY-${timestamp}`,
          status: "draft",
          stockDisplayMode: existing.stockDisplayMode,
          supplierId: existing.supplierId,
          tags: existing.tags,
          units: {
            create: existing.units.map((unit: Record<string, any>) => ({
              addAmountLak: unit.addAmountLak,
              allowManualUnitSelect: unit.allowManualUnitSelect,
              barcode: null,
              conversionQty: unit.conversionQty,
              costPriceLak: unit.costPriceLak,
              imageUrl: unit.imageUrl,
              isBaseUnit: unit.isBaseUnit,
              isDefaultSaleUnit: unit.isDefaultSaleUnit,
              isPurchaseUnit: unit.isPurchaseUnit,
              markupPercent: unit.markupPercent,
              pricingMode: unit.pricingMode,
              roundingLak: unit.roundingLak,
              sellingPriceLak: unit.sellingPriceLak,
              sortOrder: unit.sortOrder,
              status: unit.status,
              unitName: unit.unitName,
            })),
          },
        },
        include: { brand: true, category: true, supplier: true, units: { orderBy: { sortOrder: "asc" } } },
      });
    },
  });
}

export async function bulkUpdatePrismaProductPrices(input: BulkPriceUpdateInput, tenant: TenantContext) {
  return withTenantTransaction({
    action: "bulk_price_update",
    module: "products",
    newData: input,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const where: Record<string, any> = {
        companyId: tenant.companyId,
        ...branchOwnedWhere(scope),
      };

      if (input.target === "category") {
        where.categoryId = optionalString(input.categoryId);
      }

      if (input.target === "selected") {
        where.id = { in: input.productIds ?? [] };
      }

      const products = await tx.product.findMany({
        include: { units: true },
        where,
      });

      for (const product of products) {
        const productData: Record<string, number> = {};
        if (input.fields.costPrice) {
          const oldPrice = Number(product.costPriceLak);
          const newPrice = applyPriceAdjustment(oldPrice, input);
          productData.costPriceLak = newPrice;
          if (oldPrice !== newPrice) {
            await tx.productPriceHistory.create({
              data: {
                changeType: "cost_price",
                changedBy: tenant.userId,
                companyId: tenant.companyId,
                newPrice,
                oldPrice,
                productId: product.id,
              },
            });
          }
        }
        if (input.fields.sellingPrice) {
          const oldPrice = Number(product.sellingPriceLak);
          const newPrice = applyPriceAdjustment(oldPrice, input);
          productData.sellingPriceLak = newPrice;
          if (oldPrice !== newPrice) {
            await tx.productPriceHistory.create({
              data: {
                changeType: "selling_price",
                changedBy: tenant.userId,
                companyId: tenant.companyId,
                newPrice,
                oldPrice,
                productId: product.id,
              },
            });
          }
        }
        if (Object.keys(productData).length > 0) {
          await tx.product.update({ data: productData, where: { id: product.id } });
        }

        for (const unit of product.units) {
          const unitData: Record<string, number> = {};
          if (input.fields.costPrice && unit.costPriceLak != null) {
            const oldPrice = Number(unit.costPriceLak);
            const newPrice = applyPriceAdjustment(oldPrice, input);
            unitData.costPriceLak = newPrice;
            if (oldPrice !== newPrice) {
              await tx.productPriceHistory.create({
                data: {
                  changeType: "unit_cost_price",
                  changedBy: tenant.userId,
                  companyId: tenant.companyId,
                  newPrice,
                  oldPrice,
                  productId: product.id,
                  unitId: unit.id,
                  unitName: unit.unitName,
                },
              });
            }
          }
          if (input.fields.sellingPrice) {
            const oldPrice = Number(unit.sellingPriceLak);
            const newPrice = applyPriceAdjustment(oldPrice, input);
            unitData.sellingPriceLak = newPrice;
            if (oldPrice !== newPrice) {
              await tx.productPriceHistory.create({
                data: {
                  changeType: "unit_selling_price",
                  changedBy: tenant.userId,
                  companyId: tenant.companyId,
                  newPrice,
                  oldPrice,
                  productId: product.id,
                  unitId: unit.id,
                  unitName: unit.unitName,
                },
              });
            }
          }
          if (Object.keys(unitData).length > 0) {
            await tx.productUnit.update({ data: unitData, where: { id: unit.id } });
          }
        }
      }

      return { updatedProducts: products.length };
    },
  });
}

export async function archivePrismaProduct(productId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "archive",
    module: "products",
    newData: { productId, isActive: false, status: "deleted" },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.product.findFirstOrThrow({
        where: { companyId: tenant.companyId, id: productId, ...branchOwnedWhere(scope) },
      });
      return tx.product.update({
        data: { isActive: false, status: "deleted" },
        where: { id: existing.id },
      });
    },
  });
}

export async function deletePrismaProduct(productId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "delete",
    module: "products",
    oldData: { productId },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.product.findFirstOrThrow({
        include: {
          _count: {
            select: {
              adjustments: true,
              balances: true,
              goodsReceiptItems: true,
              inventoryLots: true,
              movements: true,
              purchaseItems: true,
              saleItems: true,
            },
          },
        },
        where: { companyId: tenant.companyId, id: productId, ...branchOwnedWhere(scope) },
      });
      const referenceCount = Object.values(existing._count as Record<string, number>).reduce(
        (total, count) => total + count,
        0,
      );

      if (referenceCount > 0) {
        return tx.product.update({
          data: { isActive: false, status: "deleted" },
          where: { id: existing.id },
        });
      }

      return tx.product.delete({ where: { id: existing.id } });
    },
  });
}

export async function upsertPrismaCategory(input: {
  id?: string;
  nameEn?: string;
  nameLo: string;
  parentId?: string;
}, tenant: TenantContext) {
  return withTenantTransaction({
    action: input.id ? "update" : "create",
    module: "categories",
    newData: input,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const parentId = optionalString(input.parentId);
      if (input.id) {
        const existing = await tx.category.findFirstOrThrow({
          where: { companyId: tenant.companyId, id: input.id, ...branchOwnedWhere(scope) },
        });
        if (parentId) {
          await assertCategoryInBranch(tx, scope, parentId);
        }
        return tx.category.update({
          data: {
            nameEn: optionalString(input.nameEn),
            nameLo: stringValue(input.nameLo),
            parentId,
          },
          where: { id: existing.id },
        });
      }

      if (parentId) {
        await assertCategoryInBranch(tx, scope, parentId);
      }

      return tx.category.create({
          data: {
            branchId: scope.branchId,
            companyId: tenant.companyId,
            nameEn: optionalString(input.nameEn),
            nameLo: stringValue(input.nameLo),
            parentId,
          },
        });
    },
  });
}

export async function deletePrismaCategory(categoryId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "delete",
    module: "categories",
    oldData: { categoryId },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.category.findFirstOrThrow({
        include: {
          _count: { select: { children: true, products: true, promotionCategories: true } },
        },
        where: { companyId: tenant.companyId, id: categoryId, ...branchOwnedWhere(scope) },
      });

      if (existing._count.children > 0) {
        throw new Error("Category cannot be deleted while it has child categories.");
      }

      if (existing._count.products > 0 || existing._count.promotionCategories > 0) {
        throw new Error("Category cannot be deleted while products or promotions reference it.");
      }

      return tx.category.delete({ where: { id: existing.id } });
    },
  });
}
