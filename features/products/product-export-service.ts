import { allowsFine, FINE } from "@/features/access-control/fine-permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { mapPrismaProduct } from "@/features/products/dto-mapper";
import { resolveProductListFilter, type ProductListQuery } from "@/features/products/list-query";
import {
  buildDetailedProductExport,
  buildProductExportCsv,
  buildProductExportTable,
  normalizeProductExportFields,
  orderExportSources,
  PRODUCT_EXPORT_MAX_ROWS,
  productExportFilename,
  productExportUnitRows,
  redactProductExportCosts,
  type ProductExportField,
  type ProductExportSource,
} from "@/features/products/product-export";
import { loadExportThumbnails } from "@/features/products/product-export-images";
import { buildDetailedProductExportXlsx, buildProductExportXlsx } from "@/features/products/product-export-xlsx";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export type ProductExportRequest = {
  fields?: ProductExportField[];
  format: "csv" | "xlsx";
  layout?: "detailed" | "import";
  productIds?: string[];
  query?: ProductListQuery;
  scope: "all" | "filtered" | "selected";
};

export type ProductExportPreview = {
  fields: ProductExportField[];
  filename: string;
  format: "csv" | "xlsx";
  headers: string[];
  imageCount: number;
  layout: "detailed" | "import";
  productCount: number;
  sampleRows: string[][];
  scope: "all" | "filtered" | "selected";
  scopeCount: number;
  unitCount: number;
};

export async function buildProductExportPreview(input: ProductExportRequest, tenant: TenantContext): Promise<ProductExportPreview> {
  const prepared = await prepareExport(input, tenant);
  const sample = prepared.rows.slice(0, 5);
  return {
    fields: prepared.fields,
    filename: prepared.filename,
    format: prepared.format,
    headers: prepared.headers,
    imageCount: prepared.imageCount,
    layout: prepared.layout,
    productCount: prepared.sources.length,
    sampleRows: sample,
    scope: prepared.scopeName,
    scopeCount: prepared.scopeCount,
    unitCount: prepared.unitCount,
  };
}

export async function buildProductExportFile(input: ProductExportRequest, tenant: TenantContext) {
  const prepared = await prepareExport(input, tenant);
  if (prepared.sources.length === 0) throw new Error("No products to export.");
  const filename = prepared.filename;
  if (prepared.format === "xlsx") {
    const buffer = prepared.layout === "detailed"
      ? await buildDetailedProductExportXlsx(prepared.sources, prepared.fields, await loadExportThumbnails(prepared.sources, prepared.fields), prepared.allowCost)
      : await buildProductExportXlsx(prepared.sources);
    return {
      base64: buffer.toString("base64"),
      filename,
      imageCount: prepared.imageCount,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      productCount: prepared.sources.length,
      unitCount: prepared.unitCount,
    };
  }
  const csv = prepared.layout === "detailed"
    ? buildDetailedProductExport(prepared.sources, prepared.fields, prepared.allowCost).csv
    : buildProductExportCsv(prepared.sources);
  return {
    base64: Buffer.from(csv, "utf8").toString("base64"),
    filename,
    imageCount: prepared.imageCount,
    mime: "text/csv;charset=utf-8",
    productCount: prepared.sources.length,
    unitCount: prepared.unitCount,
  };
}

async function prepareExport(input: ProductExportRequest, tenant: TenantContext) {
  const format: "csv" | "xlsx" = input.format === "xlsx" ? "xlsx" : "csv";
  const scopeName: "all" | "filtered" | "selected" = input.scope === "all" || input.scope === "selected" ? input.scope : "filtered";
  const layout: "detailed" | "import" = input.layout === "detailed" ? "detailed" : "import";
  const loaded = await loadProductExportSources(input, tenant);
  const keys = await getUserPermissionKeys(tenant);
  const allowCost = allowsFine(keys, FINE.productsViewCost);
  const sources = allowCost ? loaded : redactProductExportCosts(loaded);
  const fields = layout === "detailed" ? normalizeProductExportFields(input.fields, allowCost) : [];
  const detailed = layout === "detailed" ? buildDetailedProductExport(sources, fields, allowCost) : null;
  const importTable = layout === "import" ? buildProductExportTable(sources) : null;
  return {
    allowCost,
    fields,
    filename: productExportFilename(scopeName, format),
    format,
    headers: detailed?.headers ?? importTable?.headers ?? [],
    imageCount: detailed?.imageCount ?? sources.filter((product: ProductExportSource) => Boolean(product.imageUrl)).length,
    layout,
    rows: detailed?.rows ?? importTable?.rows ?? [],
    scopeCount: scopeName === "selected" ? new Set(input.productIds ?? []).size : sources.length,
    scopeName,
    sources,
    unitCount: detailed?.unitCount ?? productExportUnitRows(sources).length,
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
  const ordered = input.scope === "selected" ? orderExportSources(products, requestedIds) : products;
  const activeWarehouse = resolved.scope.warehouseId
    ? await db.warehouse.findFirst({
        select: { name: true },
        where: { companyId: resolved.scope.companyId, id: resolved.scope.warehouseId },
      })
    : null;
  const activeWarehouseName = String(activeWarehouse?.name ?? "");
  return ordered.map((product: Record<string, any>) => toExportSource(product, activeWarehouseName));
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
    createdAt: mapped.createdAt,
    id: mapped.id,
    imageUrl: mapped.imageUrl,
    minStock: mapped.minStock,
    nameEn: mapped.nameEn,
    nameLo: mapped.nameLo,
    productCode: mapped.productCode,
    onHandQuantity: activeWarehouseName ? Number(active?.quantity ?? 0) : null,
    onHandWarehouse: activeWarehouseName,
    productBarcode: mapped.barcode,
    sku: mapped.sku,
    status: mapped.status,
    stock,
    supplierName: mapped.supplierName,
    updatedAt: mapped.updatedAt,
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
