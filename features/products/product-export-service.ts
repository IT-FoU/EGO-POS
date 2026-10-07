import { allowsFine, FINE } from "@/features/access-control/fine-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { mapPrismaProduct } from "@/features/products/dto-mapper";
import { resolveProductListFilter, type ProductListQuery } from "@/features/products/list-query";
import {
  buildProductExportCsv,
  PRODUCT_EXPORT_MAX_ROWS,
  productExportFilename,
  redactProductExportCosts,
  type ProductExportSource,
} from "@/features/products/product-export";
import { buildProductExportXlsx } from "@/features/products/product-export-xlsx";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export type ProductExportRequest = {
  format: "csv" | "xlsx";
  productIds?: string[];
  query?: ProductListQuery;
  scope: "all" | "filtered" | "selected";
};

export async function buildProductExportFile(input: ProductExportRequest, tenant: TenantContext) {
  const format = input.format === "xlsx" ? "xlsx" : "csv";
  const scopeName = input.scope === "all" || input.scope === "selected" ? input.scope : "filtered";
  const loaded = await loadProductExportSources(input, tenant);
  if (loaded.length === 0) throw new Error("No products to export.");
  const keys = await getUserPermissionKeys(tenant);
  const sources = allowsFine(keys, FINE.productsViewCost) ? loaded : redactProductExportCosts(loaded);
  const filename = productExportFilename(scopeName, format);
  if (format === "xlsx") {
    const buffer = await buildProductExportXlsx(sources);
    return {
      base64: buffer.toString("base64"),
      filename,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      productCount: sources.length,
    };
  }
  return {
    base64: Buffer.from(buildProductExportCsv(sources), "utf8").toString("base64"),
    filename,
    mime: "text/csv;charset=utf-8",
    productCount: sources.length,
  };
}

async function loadProductExportSources(input: ProductExportRequest, tenant: TenantContext) {
  const requestedIds = Array.from(new Set((input.productIds ?? []).map((id) => id.trim()).filter(Boolean))).slice(0, PRODUCT_EXPORT_MAX_ROWS);
  if (input.scope === "selected" && requestedIds.length === 0) return [];
  const filterQuery = input.scope === "all"
    ? { insight: "all" as const, nameLocale: input.query?.nameLocale, search: "", sort: input.query?.sort, status: "all" as const }
    : input.query ?? {};
  const resolved = await resolveProductListFilter(tenant, filterQuery, db);
  if (input.scope !== "selected" && resolved.empty) return [];
  const where = input.scope === "selected"
    ? {
        companyId: resolved.scope.companyId,
        id: { in: requestedIds },
        ...branchOwnedWhere(resolved.scope),
      }
    : resolved.listWhere;
  const total = await db.product.count({ where });
  if (total > PRODUCT_EXPORT_MAX_ROWS) {
    throw new Error(`Export is limited to ${PRODUCT_EXPORT_MAX_ROWS} products.`);
  }
  const products = total === 0
    ? []
    : await db.product.findMany({
        include: exportInclude(resolved.scope),
        orderBy: resolved.orderBy,
        where,
      });
  const activeWarehouse = resolved.scope.warehouseId
    ? await db.warehouse.findFirst({
        select: { name: true },
        where: { companyId: resolved.scope.companyId, id: resolved.scope.warehouseId },
      })
    : null;
  const activeWarehouseName = String(activeWarehouse?.name ?? "");
  return products.map((product: Record<string, any>) => toExportSource(product, activeWarehouseName));
}

function exportInclude(scope: { isOwner: boolean; warehouseIds: string[] }) {
  return {
    balances: {
      select: {
        quantity: true,
        warehouse: { select: { name: true } },
        warehouseId: true,
      },
      ...(scope.isOwner ? {} : { where: { warehouseId: { in: scope.warehouseIds } } }),
    },
    brand: { select: { name: true } },
    category: { select: { nameEn: true, nameLo: true } },
    productSuppliers: {
      select: {
        isPreferred: true,
        supplier: { select: { companyName: true, name: true } },
        supplierId: true,
      },
    },
    supplier: { select: { companyName: true, name: true } },
    units: {
      orderBy: { sortOrder: "asc" as const },
      select: {
        allowManualUnitSelect: true,
        barcode: true,
        conversionQty: true,
        costPriceLak: true,
        imageUrl: true,
        roundingLak: true,
        sellingPriceLak: true,
        status: true,
        unitName: true,
      },
    },
  };
}

function toExportSource(product: Record<string, any>, activeWarehouseName: string): ProductExportSource {
  const mapped = mapPrismaProduct(product);
  const stock = (Array.isArray(product.balances) ? product.balances : [])
    .map((balance: Record<string, any>) => ({
      quantity: Number(balance.quantity ?? 0),
      warehouseName: String(balance.warehouse?.name ?? ""),
    }))
    .sort((left: { warehouseName: string }, right: { warehouseName: string }) => left.warehouseName.localeCompare(right.warehouseName));
  const active = activeWarehouseName
    ? stock.find((row: { warehouseName: string }) => row.warehouseName === activeWarehouseName)
    : undefined;
  return {
    brandName: mapped.brandName,
    categoryName: mapped.categoryName,
    imageUrl: mapped.imageUrl,
    minStock: mapped.minStock,
    nameEn: mapped.nameEn,
    nameLo: mapped.nameLo,
    onHandQuantity: activeWarehouseName ? Number(active?.quantity ?? 0) : null,
    onHandWarehouse: activeWarehouseName,
    productBarcode: mapped.barcode,
    sku: mapped.sku,
    status: mapped.status,
    stock,
    supplierName: mapped.supplierName,
    units: mapped.units.map((unit) => ({
      allowManualUnitSelect: unit.allowManualUnitSelect,
      barcode: unit.barcode,
      conversionQty: unit.conversionQty,
      costPriceLak: unit.costPriceLak,
      imageUrl: unit.imageUrl,
      roundingLak: unit.roundingLak,
      sellingPriceLak: unit.sellingPriceLak,
      status: unit.status,
      unitName: unit.unitName,
    })),
  };
}
