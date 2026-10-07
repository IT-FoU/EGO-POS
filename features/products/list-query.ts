import type { Product, ProductStatus } from "@/features/products/types";
import { mapPrismaProduct } from "@/features/products/dto-mapper";
import {
  parseProductSortMode,
  productListOrderBy,
  type ProductSortLocale,
  type ProductSortMode,
} from "@/features/products/product-sort";
import { branchOwnedWhere, resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

export const PRODUCT_LIST_PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PRODUCT_PAGE_SIZE = 100;

export type ProductInsightFilter =
  | "all"
  | "out_of_stock"
  | "low_stock"
  | "near_expiry"
  | "dead_stock"
  | "missing_barcode"
  | "new_products"
  | "no_image";

export type ProductListQuery = {
  brandId?: string;
  categoryId?: string;
  insight?: ProductInsightFilter;
  nameLocale?: ProductSortLocale;
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: ProductSortMode;
  status?: ProductStatus | "all";
  supplierId?: string;
};

export type ProductListSummary = {
  deadStock: number;
  lowStock: number;
  missingBarcode: number;
  missingImages: number;
  nearExpiry: number;
  outOfStock: number;
  total: number;
};

export type ProductListPage = {
  page: number;
  pageSize: number;
  products: Product[];
  summary: ProductListSummary;
  totalCount: number;
  totalPages: number;
};

export const productListInclude = {
  balances: { select: { quantity: true } },
  brand: { select: { id: true, name: true } },
  category: { select: { id: true, nameEn: true, nameLo: true } },
  inventoryLots: {
    orderBy: { expiryDate: "asc" as const },
    select: { expiryDate: true },
    take: 1,
  },
  productSuppliers: {
    select: {
      isPreferred: true,
      supplierId: true,
      supplier: { select: { companyName: true, name: true } },
    },
  },
  supplier: { select: { companyName: true, id: true, name: true } },
  units: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      allowManualUnitSelect: true,
      barcode: true,
      conversionQty: true,
      costPriceLak: true,
      id: true,
      imageUrl: true,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      isPurchaseUnit: true,
      sellingPriceLak: true,
      sortOrder: true,
      status: true,
      unitName: true,
    },
  },
};

function productInventoryScopeWhere(scope: BranchScope) {
  if (scope.isOwner) return {};
  return {
    OR: [
      { balances: { some: { warehouseId: { in: scope.warehouseIds } } } },
      { balances: { none: {} } },
    ],
  };
}

function likeContains(search: string) {
  const escaped = search.replace(/[%_\\]/g, "\\$&");
  return { contains: escaped, mode: "insensitive" as const };
}

export function normalizeProductListQuery(input: ProductListQuery = {}): Required<Pick<ProductListQuery, "page" | "pageSize">> & ProductListQuery {
  const pageSize = PRODUCT_LIST_PAGE_SIZES.includes(input.pageSize as (typeof PRODUCT_LIST_PAGE_SIZES)[number])
    ? Number(input.pageSize)
    : DEFAULT_PRODUCT_PAGE_SIZE;
  const page = Math.max(1, Number(input.page) || 1);
  return { ...input, page, pageSize };
}

export function buildProductListWhere(scope: BranchScope, query: ProductListQuery) {
  const search = query.search?.trim() ?? "";
  const insight = query.insight ?? "all";
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);
  const createdSince = new Date(now.getTime() - 30 * 86_400_000);
  const deadBefore = new Date(now.getTime() - 90 * 86_400_000);

  const insightWhere =
    insight === "out_of_stock"
      ? { balances: { none: { quantity: { gt: 0 } } } }
      : insight === "near_expiry"
          ? { inventoryLots: { some: { expiryDate: { gt: now, lte: in30Days } } } }
            : insight === "dead_stock"
            ? { updatedAt: { lte: deadBefore } }
            : insight === "new_products"
              ? { createdAt: { gte: createdSince } }
              : {};

  const searchWhere = search
    ? {
        OR: [
          { nameLo: likeContains(search) },
          { nameEn: likeContains(search) },
          { barcode: likeContains(search) },
          { sku: likeContains(search) },
          { productCode: likeContains(search) },
          { category: { OR: [{ nameEn: likeContains(search) }, { nameLo: likeContains(search) }] } },
          { brand: { name: likeContains(search) } },
          { supplier: { OR: [{ name: likeContains(search) }, { companyName: likeContains(search) }] } },
          { units: { some: { barcode: likeContains(search) } } },
        ],
      }
    : {};

  return {
    companyId: scope.companyId,
    ...branchOwnedWhere(scope),
    ...productInventoryScopeWhere(scope),
    ...(query.categoryId && query.categoryId !== "all" ? { categoryId: query.categoryId } : {}),
    ...(query.brandId && query.brandId !== "all" ? { brandId: query.brandId } : {}),
    ...(query.supplierId && query.supplierId !== "all"
      ? {
          productSuppliers: {
            some: {
              companyId: scope.companyId,
              supplierId: query.supplierId,
            },
          },
        }
      : {}),
    ...(query.status && query.status !== "all" ? { status: query.status } : {}),
    ...searchWhere,
    ...insightWhere,
  };
}

async function loadLowStockIds(scope: BranchScope, client: any) {
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT p.id
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS qty
      FROM inventory_balances
      WHERE company_id = ${scope.companyId}
      GROUP BY product_id
    ) stock ON stock.product_id = p.id
    WHERE p.company_id = ${scope.companyId}
      AND p.status <> 'deleted'
      AND (${scope.isOwner} OR p.branch_id = ${scope.branchId})
      AND (
        ${scope.isOwner}
        OR EXISTS (
          SELECT 1 FROM inventory_balances scoped
          WHERE scoped.product_id = p.id AND scoped.warehouse_id = ANY(${scope.warehouseIds})
        )
        OR NOT EXISTS (SELECT 1 FROM inventory_balances empty WHERE empty.product_id = p.id)
      )
      AND COALESCE(stock.qty, 0) > 0
      AND COALESCE(stock.qty, 0) <= p.min_stock
    ORDER BY p.updated_at DESC, p.id DESC
  `;
  return rows.map((row: { id: string }) => row.id);
}

/** Enabled-unit gaps. Keep in step with features/products/unit-coverage.ts. */
async function loadCoverageGapIds(scope: BranchScope, client: any, kind: "barcode" | "image") {
  const rows = kind === "image"
    ? await client.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM products p
      WHERE p.company_id = ${scope.companyId}
        AND p.status <> 'deleted'
        AND (${scope.isOwner} OR p.branch_id = ${scope.branchId})
        AND (
          ${scope.isOwner}
          OR EXISTS (
            SELECT 1 FROM inventory_balances scoped
            WHERE scoped.product_id = p.id AND scoped.warehouse_id = ANY(${scope.warehouseIds})
          )
          OR NOT EXISTS (SELECT 1 FROM inventory_balances empty WHERE empty.product_id = p.id)
        )
        AND (
          EXISTS (
            SELECT 1 FROM product_units pu
            WHERE pu.product_id = p.id
              AND pu.status = 'active'
              AND pu.allow_manual_unit_select = true
              AND btrim(COALESCE(pu.image_url, '')) = ''
          )
          OR (
            NOT EXISTS (SELECT 1 FROM product_units legacy_units WHERE legacy_units.product_id = p.id)
            AND btrim(COALESCE(p.image_url, '')) = ''
          )
        )
    `
    : await client.$queryRaw<Array<{ id: string }>>`
      SELECT p.id
      FROM products p
      WHERE p.company_id = ${scope.companyId}
        AND p.status <> 'deleted'
        AND (${scope.isOwner} OR p.branch_id = ${scope.branchId})
        AND (
          ${scope.isOwner}
          OR EXISTS (
            SELECT 1 FROM inventory_balances scoped
            WHERE scoped.product_id = p.id AND scoped.warehouse_id = ANY(${scope.warehouseIds})
          )
          OR NOT EXISTS (SELECT 1 FROM inventory_balances empty WHERE empty.product_id = p.id)
        )
        AND (
          EXISTS (
            SELECT 1 FROM product_units pu
            WHERE pu.product_id = p.id
              AND pu.status = 'active'
              AND pu.allow_manual_unit_select = true
              AND btrim(COALESCE(pu.barcode, '')) = ''
          )
          OR (
            NOT EXISTS (SELECT 1 FROM product_units legacy_units WHERE legacy_units.product_id = p.id)
            AND btrim(COALESCE(p.barcode, '')) = ''
          )
        )
    `;
  return rows.map((row: { id: string }) => row.id);
}

export async function resolveProductListFilter(tenant: TenantContext, input: ProductListQuery = {}, client: any) {
  const query = normalizeProductListQuery(input);
  const scope = await resolveTenantScope(tenant, client);
  const insight = query.insight ?? "all";
  const whereInsight = insight === "low_stock" || insight === "no_image" || insight === "missing_barcode" ? "all" : insight;
  const where = buildProductListWhere(scope, { ...query, insight: whereInsight });
  let insightIds: string[] | null = null;
  if (insight === "low_stock") {
    insightIds = await loadLowStockIds(scope, client);
  } else if (insight === "no_image" || insight === "missing_barcode") {
    insightIds = await loadCoverageGapIds(scope, client, insight === "no_image" ? "image" : "barcode");
  }
  return {
    empty: Boolean(insightIds && insightIds.length === 0),
    listWhere: insightIds ? { AND: [where, { id: { in: insightIds } }] } : where,
    orderBy: productListOrderBy(parseProductSortMode(query.sort), query.nameLocale === "lo" ? "lo" : "en"),
    query,
    scope,
  };
}

export async function getPrismaProductListPage(
  tenant: TenantContext,
  input: ProductListQuery = {},
  client: any,
): Promise<ProductListPage> {
  const resolved = await resolveProductListFilter(tenant, input, client);
  const { query } = resolved;
  const listWhere = resolved.listWhere;
  const skip = (query.page - 1) * query.pageSize;

  const [totalCount, products, summary] = await Promise.all([
    resolved.empty ? Promise.resolve(0) : client.product.count({ where: listWhere }),
    resolved.empty
      ? Promise.resolve([])
      : client.product.findMany({
          include: productListInclude,
          orderBy: resolved.orderBy,
          skip,
          take: query.pageSize,
          where: listWhere,
        }),
    loadProductListSummary(resolved.scope, client),
  ]);

  const ordered = products;

  return {
    page: query.page,
    pageSize: query.pageSize,
    products: ordered.map(mapPrismaProduct),
    summary,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / query.pageSize)),
  };
}

const MAX_FILTERED_SELECTION = 2000;

export async function getPrismaProductListIds(
  tenant: TenantContext,
  input: ProductListQuery = {},
  client: any,
): Promise<string[]> {
  const resolved = await resolveProductListFilter(tenant, input, client);
  if (resolved.empty) return [];
  const rows = await client.product.findMany({
    orderBy: resolved.orderBy,
    select: { id: true },
    take: MAX_FILTERED_SELECTION,
    where: resolved.listWhere,
  });
  return rows.map((row: { id: string }) => row.id);
}

async function loadProductListSummary(scope: BranchScope, client: any): Promise<ProductListSummary> {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 86_400_000);
  const deadBefore = new Date(now.getTime() - 90 * 86_400_000);
  const rows = await client.$queryRaw<Array<{
    dead_stock: number;
    low_stock: number;
    missing_barcode: number;
    missing_images: number;
    near_expiry: number;
    out_of_stock: number;
    total: number;
  }>>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE COALESCE(stock.qty, 0) <= 0)::int AS out_of_stock,
      COUNT(*) FILTER (WHERE COALESCE(stock.qty, 0) > 0 AND COALESCE(stock.qty, 0) <= p.min_stock)::int AS low_stock,
      COUNT(*) FILTER (
        WHERE lot.expiry_date IS NOT NULL
          AND lot.expiry_date > ${now}
          AND lot.expiry_date <= ${in30Days}
      )::int AS near_expiry,
      COUNT(*) FILTER (WHERE p.updated_at <= ${deadBefore})::int AS dead_stock,
      COUNT(*) FILTER (
        WHERE (
          EXISTS (
            SELECT 1 FROM product_units pu
            WHERE pu.product_id = p.id
              AND pu.status = 'active'
              AND pu.allow_manual_unit_select = true
              AND btrim(COALESCE(pu.barcode, '')) = ''
          )
          OR (
            NOT EXISTS (SELECT 1 FROM product_units legacy_units WHERE legacy_units.product_id = p.id)
            AND btrim(COALESCE(p.barcode, '')) = ''
          )
        )
      )::int AS missing_barcode,
      COUNT(*) FILTER (
        WHERE (
          EXISTS (
            SELECT 1 FROM product_units pu
            WHERE pu.product_id = p.id
              AND pu.status = 'active'
              AND pu.allow_manual_unit_select = true
              AND btrim(COALESCE(pu.image_url, '')) = ''
          )
          OR (
            NOT EXISTS (SELECT 1 FROM product_units legacy_units WHERE legacy_units.product_id = p.id)
            AND btrim(COALESCE(p.image_url, '')) = ''
          )
        )
      )::int AS missing_images
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(quantity) AS qty
      FROM inventory_balances
      WHERE company_id = ${scope.companyId}
      GROUP BY product_id
    ) stock ON stock.product_id = p.id
    LEFT JOIN LATERAL (
      SELECT expiry_date
      FROM inventory_lots
      WHERE company_id = ${scope.companyId} AND product_id = p.id AND expiry_date IS NOT NULL
      ORDER BY expiry_date ASC
      LIMIT 1
    ) lot ON true
    WHERE p.company_id = ${scope.companyId}
      AND p.status <> 'deleted'
      AND (${scope.isOwner} OR p.branch_id = ${scope.branchId})
      AND (
        ${scope.isOwner}
        OR EXISTS (
          SELECT 1 FROM inventory_balances scoped
          WHERE scoped.product_id = p.id AND scoped.warehouse_id = ANY(${scope.warehouseIds})
        )
        OR NOT EXISTS (SELECT 1 FROM inventory_balances empty WHERE empty.product_id = p.id)
      )
  `;
  const row = rows[0] ?? {
    dead_stock: 0,
    low_stock: 0,
    missing_barcode: 0,
    missing_images: 0,
    near_expiry: 0,
    out_of_stock: 0,
    total: 0,
  };
  return {
    deadStock: Number(row.dead_stock) || 0,
    lowStock: Number(row.low_stock) || 0,
    missingBarcode: Number(row.missing_barcode) || 0,
    missingImages: Number(row.missing_images) || 0,
    nearExpiry: Number(row.near_expiry) || 0,
    outOfStock: Number(row.out_of_stock) || 0,
    total: Number(row.total) || 0,
  };
}
