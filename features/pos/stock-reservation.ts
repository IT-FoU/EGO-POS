import { inventoryLotLockKey } from "@/features/inventory/lot-reconciliation";
import { lockInventoryMutationKey } from "@/features/inventory/stock-concurrency";
import { numberValue } from "@/lib/db/write-context";

export const HOLD_STATUS_ACTIVE = "held";
export const HOLD_STATUS_COMPLETED = "completed";
export const HOLD_STATUS_CANCELLED = "cancelled";

/** Hold statuses that keep stock reserved (Resume is not terminal). */
export const HOLD_RESERVING_STATUSES = [HOLD_STATUS_ACTIVE] as const;

export type ReservationDemand = {
  productId: string;
  productUnitId: string | null;
  baseQuantity: number;
  sellQuantity: number;
};

function amount(value: unknown) {
  return numberValue(value);
}

export function resolveHoldSaleUnit(product: Record<string, any>, unitId: string | undefined | null) {
  const units: Array<Record<string, any>> = product.units ?? [];
  if (unitId) {
    const found = units.find((unit) => String(unit.id) === String(unitId));
    if (!found) {
      throw new Error(`Sale unit ${unitId} was not found for product ${product.id}.`);
    }
    if (String(found.status) === "inactive") {
      throw new Error(`Sale unit ${unitId} is inactive for product ${product.id}.`);
    }
    return found;
  }
  const active = units.filter((unit) => String(unit.status) !== "inactive");
  const fallback =
    active.find((unit) => unit.isDefaultSaleUnit) ??
    active.find((unit) => unit.isBaseUnit) ??
    active[0];
  if (!fallback) {
    throw new Error(`Product ${product.id} has no active sale unit.`);
  }
  return fallback;
}

/** Canonical base qty using existing unit conversionQty (same as checkout). */
export function sellQtyToBaseQuantity(sellQuantity: number, conversionQty: number) {
  const qty = amount(sellQuantity);
  const conversion = Math.max(amount(conversionQty), 1);
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Held bill quantity must be greater than zero.");
  }
  return qty * conversion;
}

export function aggregateBaseDemand(demands: ReservationDemand[]) {
  const byProduct = new Map<string, number>();
  for (const demand of demands) {
    byProduct.set(demand.productId, (byProduct.get(demand.productId) ?? 0) + demand.baseQuantity);
  }
  return byProduct;
}

export async function lockProductsDeterministically(
  tx: any,
  companyId: string,
  warehouseId: string,
  productIds: Iterable<string>,
) {
  const sorted = Array.from(new Set(Array.from(productIds).map(String))).sort((a, b) => a.localeCompare(b));
  for (const productId of sorted) {
    await lockInventoryMutationKey(tx, inventoryLotLockKey(companyId, warehouseId, productId));
  }
  return sorted;
}

export async function sumActiveReservedBaseQty(
  tx: any,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    excludeHoldBillId?: string | null;
  },
) {
  const rows = await tx.stockReservation.findMany({
    select: { baseQuantity: true },
    where: {
      companyId: input.companyId,
      productId: input.productId,
      status: "ACTIVE",
      warehouseId: input.warehouseId,
      ...(input.excludeHoldBillId ? { holdBillId: { not: input.excludeHoldBillId } } : {}),
    },
  });
  return rows.reduce((total: number, row: { baseQuantity: unknown }) => total + amount(row.baseQuantity), 0);
}

export async function sumActiveReservedByProduct(
  tx: any,
  input: {
    companyId: string;
    warehouseId: string;
    productIds: string[];
    excludeHoldBillId?: string | null;
  },
) {
  const ids = Array.from(new Set(input.productIds.filter(Boolean)));
  const reserved = new Map<string, number>();
  for (const productId of ids) {
    reserved.set(productId, 0);
  }
  if (ids.length === 0) return reserved;

  const rows = await tx.stockReservation.findMany({
    select: { baseQuantity: true, productId: true },
    where: {
      companyId: input.companyId,
      productId: { in: ids },
      status: "ACTIVE",
      warehouseId: input.warehouseId,
      ...(input.excludeHoldBillId ? { holdBillId: { not: input.excludeHoldBillId } } : {}),
    },
  });
  for (const row of rows) {
    const productId = String(row.productId);
    reserved.set(productId, (reserved.get(productId) ?? 0) + amount(row.baseQuantity));
  }
  return reserved;
}

export async function readOnHandBaseQty(
  tx: any,
  input: { companyId: string; warehouseId: string; productId: string },
) {
  const balance = await tx.inventoryBalance.findUnique({
    select: { quantity: true },
    where: {
      warehouseId_productId: {
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    },
  });
  return amount(balance?.quantity);
}

export async function availableBaseQty(
  tx: any,
  input: {
    companyId: string;
    warehouseId: string;
    productId: string;
    excludeHoldBillId?: string | null;
  },
) {
  const onHand = await readOnHandBaseQty(tx, input);
  const reserved = await sumActiveReservedBaseQty(tx, input);
  return Math.max(0, onHand - reserved);
}

export function assertSufficientAvailable(
  productLabel: string,
  available: number,
  requested: number,
) {
  if (requested > available + 1e-9) {
    throw new Error(
      `Insufficient available stock for ${productLabel}. Available ${available}, requested ${requested}.`,
    );
  }
}
