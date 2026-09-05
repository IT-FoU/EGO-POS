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
    findFirst(args: {
      where: { companyId: string; entityType: string; entityId: string };
      orderBy: { version: "desc" };
      select: { version: true };
    }): Promise<{ version: number } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface EmittedChange {
  entityType: string;
  entityId: string;
  version: number;
  deleted: boolean;
}

/**
 * Emit reference changes inside an existing transaction. Each change gets a
 * strictly-newer per-entity version (max existing + 1), guaranteeing a stale
 * older upsert can never resurrect a deleted entity on the device.
 */
export async function emitReferenceChanges(
  tx: ReferenceChangeTx,
  companyId: string,
  changes: ReferenceChangeInput[],
): Promise<EmittedChange[]> {
  const emitted: EmittedChange[] = [];
  for (const change of changes) {
    const last = await tx.offlineServerChange.findFirst({
      where: { companyId, entityType: change.entityType, entityId: change.entityId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;
    await tx.offlineServerChange.create({
      data: {
        companyId,
        branchId: change.branchId,
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
