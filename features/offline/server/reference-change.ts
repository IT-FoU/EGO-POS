/**
 * Reference change emission (Phase 5.1) — pure payload builders + in-transaction
 * OfflineServerChange emitter.
 *
 * Whenever POS-relevant Mini Mart reference data changes through an existing
 * online write path, we emit an `OfflineServerChange` row in the SAME tenant
 * transaction (atomic with the business write + audit). Each change carries the
 * company + branch/warehouse scope, entity kind + id, a strictly-newer per-entity
 * version, a payload (or tombstone), and the auto-increment `seq` ordering cursor.
 *
 * Payload builders are pure (testable) and mirror the Phase 5 reference payload
 * shapes so bootstrap and delta hydrate an identical replica. No secrets, tokens,
 * passwords, admin data, or reports are ever emitted.
 */

import {
  ReferenceEntityType,
  type CategoryPayload,
  type CustomerPayload,
  type ProductPayload,
  type ProductUnitPayload,
  type PromotionPayload,
  type SettingsPayload,
  type StockLevelPayload,
  type StockLotPayload,
} from "../replica/reference-types";
import type { ReferenceEntityTypeValue } from "../replica/reference-types";
import { newOperationId } from "../operations/envelope";

export interface ReferenceChangeInput {
  entityType: ReferenceEntityTypeValue;
  entityId: string;
  deleted: boolean;
  branchId: string | null;
  warehouseId: string | null;
  payload: unknown;
}

/** Minimal transaction surface used by the emitter (enables deterministic tests). */
export interface ReferenceChangeTx {
  offlineServerChange: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
  /** Present in production (Prisma tx); used by the default atomic allocator. */
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

export interface EmittedChange {
  entityType: string;
  entityId: string;
  version: number;
  deleted: boolean;
  scopeKey: string;
}

/**
 * Canonical scope key for per-entity versioning: company + branch + warehouse +
 * entity kind + entity id. Branch/warehouse use "*" when not applicable so the
 * key is never null and can carry a single UNIQUE constraint. Warehouse is part
 * of the identity, so the same product in two warehouses has independent
 * versions and never overwrites the other.
 */
/**
 * Composite local key for a stock-level reference record: product + warehouse.
 * Ensures the same product in different warehouses is stored/synced separately.
 */
export function stockLevelEntityId(productId: string, warehouseId: string): string {
  return `${productId}::${warehouseId}`;
}

export function referenceScopeKey(companyId: string, change: {
  branchId: string | null;
  warehouseId: string | null;
  entityType: string;
  entityId: string;
}): string {
  const branch = change.branchId ?? "*";
  const warehouse = change.warehouseId ?? "*";
  return `${companyId}::${branch}::${warehouse}::${change.entityType}::${change.entityId}`;
}

/**
 * Allocates strictly-increasing, per-scope-unique reference versions.
 * Production uses a single atomic SQL upsert-increment; tests use an in-memory
 * atomic counter with identical semantics.
 */
export interface RevisionAllocator {
  next(companyId: string, scopeKey: string): Promise<number>;
}

/** In-memory atomic counter (tests). Increment is a single synchronous op. */
export class MemoryRevisionAllocator implements RevisionAllocator {
  private readonly counters = new Map<string, number>();
  async next(companyId: string, scopeKey: string): Promise<number> {
    const key = `${companyId}::${scopeKey}`;
    const version = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, version);
    return version;
  }
}

/**
 * Production allocator: `INSERT ... ON CONFLICT (scope_key) DO UPDATE SET
 * version = version + 1 RETURNING version` — a single atomic statement, so two
 * concurrent transactions serialize on the row and can never share a version.
 */
export function prismaRevisionAllocator(tx: ReferenceChangeTx): RevisionAllocator {
  return {
    async next(companyId: string, scopeKey: string): Promise<number> {
      if (!tx.$queryRawUnsafe) {
        throw new Error("prismaRevisionAllocator requires a Prisma transaction with $queryRawUnsafe");
      }
      const rows = await tx.$queryRawUnsafe<Array<{ version: number | bigint }>>(
        `INSERT INTO "offline_reference_revisions" ("id", "company_id", "scope_key", "version", "updated_at")
         VALUES ($1, $2, $3, 1, now())
         ON CONFLICT ("scope_key")
         DO UPDATE SET "version" = "offline_reference_revisions"."version" + 1, "updated_at" = now()
         RETURNING "version"`,
        newOperationId(),
        companyId,
        scopeKey,
      );
      return Number(rows[0]?.version ?? 1);
    },
  };
}

/**
 * Emit reference changes inside an existing transaction. Each change gets a
 * per-scope atomic version from {@link RevisionAllocator}, so concurrent writes
 * to the same scoped entity always receive distinct, ordered versions and a
 * stale older event can never resurrect a deleted entity. The `seq` ordering
 * cursor (auto-increment) is used only for pagination, never as the version.
 */
export async function emitReferenceChanges(
  tx: ReferenceChangeTx,
  companyId: string,
  changes: ReferenceChangeInput[],
  allocator: RevisionAllocator = prismaRevisionAllocator(tx),
): Promise<EmittedChange[]> {
  const emitted: EmittedChange[] = [];
  for (const change of changes) {
    const scopeKey = referenceScopeKey(companyId, change);
    const version = await allocator.next(companyId, scopeKey);
    await tx.offlineServerChange.create({
      data: {
        companyId,
        branchId: change.branchId,
        warehouseId: change.warehouseId,
        entityType: change.entityType,
        entityId: change.entityId,
        version,
        deleted: change.deleted,
        payload: change.deleted ? null : (change.payload as unknown as object),
      },
    });
    emitted.push({
      entityType: change.entityType,
      entityId: change.entityId,
      version,
      deleted: change.deleted,
      scopeKey,
    });
  }
  return emitted;
}

// ---- pure helpers ----

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function tombstone(
  entityType: ReferenceEntityTypeValue,
  entityId: string,
  scope: { branchId: string | null; warehouseId?: string | null },
): ReferenceChangeInput {
  return {
    entityType,
    entityId,
    deleted: true,
    branchId: scope.branchId,
    warehouseId: scope.warehouseId ?? null,
    payload: null,
  };
}

/** Build a ProductPayload from a raw product row (with units + category). */
export function productPayloadFromRow(row: Record<string, any>): ProductPayload {
  const rawUnits: Record<string, any>[] = Array.isArray(row.units) ? row.units : [];
  const units: ProductUnitPayload[] = rawUnits
    .slice()
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
    .map((unit) => ({
      unitId: str(unit.id),
      name: str(unit.unitName),
      factor: num(unit.conversionQty) || 1,
      priceLak: num(unit.sellingPriceLak),
      barcode: unit.barcode ? str(unit.barcode) : null,
    }));
  const activeUnits = rawUnits.filter((unit) => unit.status !== "inactive");
  const defaultSaleUnit =
    activeUnits.find((unit) => unit.isDefaultSaleUnit) ??
    activeUnits.find((unit) => unit.isBaseUnit) ??
    activeUnits[0];
  const retailPriceLak = num(defaultSaleUnit?.sellingPriceLak ?? row.sellingPriceLak);
  const barcodes = [row.barcode, ...units.map((u) => u.barcode)].filter(
    (b): b is string => typeof b === "string" && b.length > 0,
  );
  return {
    id: str(row.id),
    name: str(row.nameEn || row.nameLo),
    sku: row.sku ? str(row.sku) : null,
    categoryId: row.categoryId ?? null,
    retailPriceLak,
    barcodes: [...new Set(barcodes)],
    units,
    stockDisplayMode: row.stockDisplayMode ?? null,
    imageUrl: row.imageUrl ?? null,
    isActive: row.isActive !== false && row.status !== "deleted",
  };
}

export function categoryPayloadFromRow(row: Record<string, any>): CategoryPayload {
  return {
    id: str(row.id),
    name: str(row.nameEn || row.nameLo),
    parentId: row.parentId ?? null,
  };
}

export function customerPayloadFromRow(row: Record<string, any>): CustomerPayload {
  return {
    id: str(row.id),
    code: str(row.customerCode ?? row.code),
    name: str(row.fullName ?? row.name),
    phone: row.phone ? str(row.phone) : null,
    membershipLevelId: row.membershipLevelId ?? null,
    discountPercent: num(row.discountPercent),
    pointsBalance: num(row.pointsBalance),
  };
}

export function promotionPayloadFromRow(row: Record<string, any>): PromotionPayload {
  return {
    id: str(row.id),
    name: str(row.promotionName),
    version: 1,
    type: str(row.promotionType || "percentage"),
    status: str(row.status || "active"),
    effectiveFrom: toIso(row.startDate),
    effectiveTo: toIso(row.endDate),
    rules: {
      discountPercent: row.discountPercent == null ? null : num(row.discountPercent),
      discountAmountLak: row.discountAmountLak == null ? null : num(row.discountAmountLak),
      comboPriceLak: row.comboPriceLak == null ? null : num(row.comboPriceLak),
      buyQuantity: row.buyQuantity == null ? null : num(row.buyQuantity),
      getQuantity: row.getQuantity == null ? null : num(row.getQuantity),
      priority: num(row.priority),
    },
  };
}

export function settingsPayloadFromRow(
  company: Record<string, any> | null,
  settings: Record<string, any> | null,
): SettingsPayload {
  const vatEnabled = settings?.vatEnabled === true;
  return {
    taxRatePercent: vatEnabled ? num(settings?.vatRate) : 0,
    taxInclusive: settings?.taxInclusive === true,
    receiptPrefix: str(settings?.receiptPrefix),
    receiptHeader: settings?.receiptHeader ?? null,
    receiptFooter: settings?.receiptFooter ?? null,
    loyaltyEnabled: settings?.loyaltyEnabled === true,
    loyaltySpendPerPointLak:
      settings?.loyaltySpendPerPointLak == null ? null : num(settings.loyaltySpendPerPointLak),
    baseCurrency: str(company?.baseCurrency || "LAK"),
  };
}

export function stockLevelPayloadFromRow(
  productId: string,
  warehouseId: string,
  available: number,
  lots: StockLotPayload[] = [],
): StockLevelPayload {
  return {
    productId,
    warehouseId,
    available: num(available),
    lots,
    terminalAllocatedQty: null,
  };
}

export { ReferenceEntityType };
