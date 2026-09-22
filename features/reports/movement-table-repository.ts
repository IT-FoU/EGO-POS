import { prisma } from "@/lib/db/prisma";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
import {
  matchesMovementKind,
  moneyLak,
  movementDelta,
  MOVEMENT_TABLE_PAGE_SIZE,
  MOVEMENT_TABLE_SCAN_LIMIT,
  qtyInFromDelta,
  qtyNum,
  qtyOutFromDelta,
  resolveMovementKind,
  summarizeMovementRows,
  type MovementReportSummary,
  type MovementReportKind,
} from "@/features/reports/movement-table-math";
import {
  resolveMovementTableRange,
  type MovementTableQuery,
} from "@/features/reports/movement-table-query";

const db = prisma as any;

export type MovementTableLoadOptions = { allRows?: boolean };

export type MovementTableRow = {
  actorName: string;
  afterQty: number;
  balanceAfter: number;
  beforeQty: number;
  categoryName: string;
  createdAt: string;
  drillHref?: string;
  hasCost: boolean;
  id: string;
  kind: Exclude<MovementReportKind, "all">;
  movementType: string;
  movementValueLak: number;
  netQty: number;
  note: string;
  productId: string;
  productName: string;
  qtyIn: number;
  qtyOut: number;
  referenceId: string;
  referenceLabel: string;
  referenceType: string;
  sku: string;
  unitCostLak: number;
  unitLabel: string;
  warehouseId: string;
  warehouseName: string;
};

export type MovementTableResult = {
  filterOptions: ReportFilterOptions & {
    actors: Array<{ id: string; label: string }>;
    referenceTypes: Array<{ id: string; label: string }>;
  };
  page: number;
  pageCount: number;
  pageSize: number;
  query: MovementTableQuery;
  range: { dateFrom?: Date | string; dateTo?: Date | string };
  rows: MovementTableRow[];
  showCost: boolean;
  summary: MovementReportSummary;
  totalRow: { movementValueLak: number; netQty: number; qtyIn: number; qtyOut: number; rowCount: number };
};

function clientOf(client?: any) {
  return client ?? db;
}

function productLabel(product: { nameEn?: string | null; nameLo?: string | null }) {
  return String(product.nameEn || product.nameLo || "Product");
}

function clampQuery(scope: BranchScope, query: MovementTableQuery): MovementTableQuery {
  const next = { ...query };
  if (!scope.isOwner) {
    next.branchId = scope.branchId;
  } else if (next.branchId && !scope.branchIds.includes(next.branchId)) {
    next.branchId = scope.branchId;
  }
  return next;
}

function compareRows(left: MovementTableRow, right: MovementTableRow, sort?: string, dir: "asc" | "desc" = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const value = (row: MovementTableRow) => {
    switch (sort) {
      case "product":
        return row.productName;
      case "sku":
        return row.sku;
      case "warehouse":
        return row.warehouseName;
      case "kind":
        return row.kind;
      case "qtyIn":
        return row.qtyIn;
      case "qtyOut":
        return row.qtyOut;
      case "netQty":
        return row.netQty;
      case "balanceAfter":
        return row.balanceAfter;
      case "value":
        return row.movementValueLak;
      case "createdAt":
      default:
        return row.createdAt;
    }
  };
  const a = value(left);
  const b = value(right);
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" }) * sign;
}

function drillHrefFor(row: {
  kind: string;
  productId: string;
  referenceId: string;
  referenceType: string;
}) {
  if (row.referenceId && (row.referenceType === "sale" || row.referenceType === "sale_exchange" || row.kind === "sale" || row.kind === "refund" || row.kind === "void_restore" || row.kind === "exchange_out")) {
    return `/reports/sales/daily?saleId=${encodeURIComponent(row.referenceId)}`;
  }
  if (row.productId) return `/products/${row.productId}/edit`;
  return undefined;
}

export async function loadStockMovementTable(
  tenant: TenantContext,
  query: MovementTableQuery,
  client?: any,
  options?: MovementTableLoadOptions,
): Promise<MovementTableResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const clamped = clampQuery(scope, query);
  const range = resolveMovementTableRange(clamped);

  const warehouses = await dbClient.warehouse.findMany({
    select: { branchId: true, id: true, name: true },
    where: {
      companyId: scope.companyId,
      ...(clamped.branchId ? { branchId: clamped.branchId } : { branchId: { in: scope.branchIds } }),
      ...(clamped.warehouseId ? { id: clamped.warehouseId } : {}),
    },
  });
  const warehouseIds = (warehouses as Array<{ id: string }>).map((row) => String(row.id));
  const warehouseName = new Map((warehouses as Array<{ id: string; name: string }>).map((row) => [String(row.id), String(row.name)]));

  const productWhere: Record<string, unknown> = {
    companyId: scope.companyId,
    isActive: true,
  };
  if (clamped.categoryId) productWhere.categoryId = clamped.categoryId;
  if (clamped.productId) productWhere.id = clamped.productId;
  if (clamped.productQuery || clamped.skuQuery) {
    const q = clamped.productQuery || "";
    const sku = clamped.skuQuery || "";
    productWhere.OR = [
      ...(q
        ? [
            { nameEn: { contains: q, mode: "insensitive" } },
            { nameLo: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { barcode: { contains: q, mode: "insensitive" } },
          ]
        : []),
      ...(sku
        ? [
            { sku: { contains: sku, mode: "insensitive" } },
            { barcode: { contains: sku, mode: "insensitive" } },
          ]
        : []),
    ];
  }

  const products = await dbClient.product.findMany({
    select: {
      barcode: true,
      category: { select: { nameEn: true, nameLo: true } },
      costPriceLak: true,
      id: true,
      nameEn: true,
      nameLo: true,
      sku: true,
      units: { select: { costPriceLak: true, isBaseUnit: true, unitName: true }, where: { status: "active" } },
    },
    take: 5000,
    where: productWhere,
  });
  const productById = new Map((products as Array<Record<string, any>>).map((row) => [String(row.id), row]));
  const productIds = [...productById.keys()];

  const createdAtFilter: Record<string, Date> = {};
  if (range.dateFrom instanceof Date) createdAtFilter.gte = range.dateFrom;
  else if (typeof range.dateFrom === "string" && range.dateFrom) createdAtFilter.gte = new Date(range.dateFrom);
  if (range.dateTo instanceof Date) createdAtFilter.lte = range.dateTo;
  else if (typeof range.dateTo === "string" && range.dateTo) createdAtFilter.lte = new Date(range.dateTo);

  const movementWhere: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(warehouseIds.length ? { warehouseId: { in: warehouseIds } } : { warehouseId: "__none__" }),
    ...(productIds.length ? { productId: { in: productIds } } : { productId: "__none__" }),
    ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
    ...(clamped.referenceType ? { referenceType: clamped.referenceType } : {}),
    ...(clamped.actorId ? { createdBy: clamped.actorId } : {}),
  };

  const rawMovements = await dbClient.stockMovement.findMany({
    include: { unit: { select: { unitName: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MOVEMENT_TABLE_SCAN_LIMIT,
    where: movementWhere,
  });

  const actorIds = [
    ...new Set(
      (rawMovements as Array<{ createdBy?: string | null }>)
        .map((row) => String(row.createdBy ?? ""))
        .filter(Boolean),
    ),
  ];
  const actors = actorIds.length
    ? await dbClient.user.findMany({
        select: { fullName: true, id: true, username: true },
        where: { id: { in: actorIds } },
      })
    : [];
  const actorName = new Map(
    (actors as Array<{ fullName?: string | null; id: string; username?: string | null }>).map((row) => [
      String(row.id),
      String(row.fullName || row.username || row.id),
    ]),
  );

  const mapped: MovementTableRow[] = [];
  for (const row of rawMovements as Array<Record<string, any>>) {
    const product = productById.get(String(row.productId));
    if (!product) continue;
    const beforeQty = qtyNum(row.beforeQty);
    const afterQty = qtyNum(row.afterQty);
    const delta = movementDelta(beforeQty, afterQty);
    const kind = resolveMovementKind({
      afterQty,
      beforeQty,
      movementType: String(row.movementType ?? ""),
      note: row.note,
      referenceType: row.referenceType,
    });
    if (!matchesMovementKind(kind, clamped.movementKind)) continue;

    const baseUnit = (product.units as Array<Record<string, any>> | undefined)?.find((unit) => unit.isBaseUnit);
    const rawCost = baseUnit?.costPriceLak ?? product.costPriceLak;
    const costPresent = rawCost != null && Number.isFinite(Number(rawCost)) && Number(rawCost) > 0;
    const unitCostLak = costPresent ? moneyLak(rawCost) : 0;
    const qtyIn = qtyInFromDelta(delta);
    const qtyOut = qtyOutFromDelta(delta);
    const netQty = delta;
    const movementValueLak = costPresent ? moneyLak(Math.abs(netQty) * unitCostLak) * (netQty >= 0 ? 1 : -1) : 0;

    const referenceType = String(row.referenceType ?? "");
    const referenceId = String(row.referenceId ?? "");
    mapped.push({
      actorName: actorName.get(String(row.createdBy ?? "")) || String(row.createdBy ?? "—"),
      afterQty,
      balanceAfter: afterQty,
      beforeQty,
      categoryName: String(product.category?.nameEn || product.category?.nameLo || "—"),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      drillHref: drillHrefFor({
        kind,
        productId: String(product.id),
        referenceId,
        referenceType,
      }),
      hasCost: costPresent,
      id: String(row.id),
      kind,
      movementType: String(row.movementType ?? ""),
      movementValueLak,
      netQty,
      note: String(row.note ?? ""),
      productId: String(product.id),
      productName: productLabel(product),
      qtyIn,
      qtyOut,
      referenceId,
      referenceLabel: referenceType && referenceId ? `${referenceType}:${referenceId.slice(0, 8)}` : referenceType || referenceId || "—",
      referenceType,
      sku: String(product.sku ?? ""),
      unitCostLak: costPresent ? unitCostLak : 0,
      unitLabel: String(row.unit?.unitName ?? baseUnit?.unitName ?? "Base"),
      warehouseId: String(row.warehouseId),
      warehouseName: warehouseName.get(String(row.warehouseId)) || String(row.warehouseId),
    });
  }

  mapped.sort((a, b) => compareRows(a, b, clamped.sort || "createdAt", clamped.dir));
  const summary = summarizeMovementRows(mapped);
  const pageSize = MOVEMENT_TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(mapped.length / pageSize));
  const page = Math.min(Math.max(1, clamped.page), pageCount);
  const rows = options?.allRows ? mapped : mapped.slice((page - 1) * pageSize, page * pageSize);

  const filterOptions = await getReportFilterOptions(tenant, dbClient);
  const referenceTypes = [
    ...new Set(mapped.map((row) => row.referenceType).filter(Boolean)),
  ].map((id) => ({ id, label: id }));

  return {
    filterOptions: {
      ...filterOptions,
      actors: (actors as Array<{ fullName?: string | null; id: string; username?: string | null }>).map((row) => ({
        id: String(row.id),
        label: String(row.fullName || row.username || row.id),
      })),
      referenceTypes,
      warehouses: (warehouses as Array<{ id: string; name: string }>).map((row) => ({
        id: String(row.id),
        label: String(row.name),
      })),
    },
    page,
    pageCount,
    pageSize,
    query: clamped,
    range,
    rows,
    showCost: true,
    summary,
    totalRow: {
      movementValueLak: summary.valueInLak - summary.valueOutLak,
      netQty: summary.netMovement,
      qtyIn: summary.totalQtyIn,
      qtyOut: summary.totalQtyOut,
      rowCount: mapped.length,
    },
  };
}
