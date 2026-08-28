export const LOT_ALLOCATION_SOURCE = {
  refundExchangeItem: "refund_exchange_item",
  saleItem: "sale_item",
} as const;

export type LotAllocationSourceType =
  (typeof LOT_ALLOCATION_SOURCE)[keyof typeof LOT_ALLOCATION_SOURCE];

export type FefoLotCandidate = {
  expiryDate: Date | null;
  id: string;
  quantity: number;
  receivedAt: Date | null;
  createdAt: Date;
};

export type LotAllocationResult = {
  expiryDate: Date | null;
  inventoryLotId: string;
  lotNumber: string | null;
  quantity: number;
};

type LotRow = {
  created_at: Date;
  expiry_date: Date | null;
  id: string;
  lot_number: string | null;
  quantity: unknown;
  received_at: Date | null;
};

function qty(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 1000) / 1000;
}

function assertPositiveQuantity(quantity: number, label: string) {
  if (!(quantity > 0) || !Number.isFinite(quantity)) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

export function inventoryLotLockKey(companyId: string, warehouseId: string, productId: string) {
  return `inventory-lot:${companyId}:${warehouseId}:${productId}`;
}

export function allocateFefoLots(lots: FefoLotCandidate[], requestedQty: number): Array<{ id: string; quantity: number }> {
  assertPositiveQuantity(requestedQty, "Requested lot quantity");
  const remainingLots = lots
    .map((lot) => ({ ...lot, quantity: qty(lot.quantity) }))
    .filter((lot) => lot.quantity > 0);
  const available = remainingLots.reduce((total, lot) => total + lot.quantity, 0);
  if (available + 1e-9 < requestedQty) {
    throw new Error(
      `Insufficient lot stock. Available ${qty(available)}, requested ${qty(requestedQty)}.`,
    );
  }

  const allocations: Array<{ id: string; quantity: number }> = [];
  let remaining = requestedQty;
  for (const lot of remainingLots) {
    if (remaining <= 1e-9) {
      break;
    }
    const take = Math.min(lot.quantity, remaining);
    allocations.push({ id: lot.id, quantity: qty(take) });
    remaining = qty(remaining - take);
  }
  if (remaining > 1e-9) {
    throw new Error(
      `Insufficient lot stock. Available ${qty(available)}, requested ${qty(requestedQty)}.`,
    );
  }
  return allocations;
}

export function primaryLotMovementFields(allocations: LotAllocationResult[]) {
  if (allocations.length === 1) {
    return {
      expiryDate: allocations[0].expiryDate,
      lotNumber: allocations[0].lotNumber,
    };
  }
  return {
    expiryDate: null as Date | null,
    lotNumber: null as string | null,
  };
}

async function lockProductLots(tx: any, companyId: string, warehouseId: string, productId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${inventoryLotLockKey(companyId, warehouseId, productId)}))`;
}

async function lockEligibleLots(tx: any, companyId: string, warehouseId: string, productId: string) {
  return tx.$queryRaw<LotRow[]>`
    SELECT id, quantity, lot_number, expiry_date, received_at, created_at
    FROM inventory_lots
    WHERE company_id = ${companyId}
      AND warehouse_id = ${warehouseId}
      AND product_id = ${productId}
      AND quantity > 0
    ORDER BY expiry_date ASC NULLS LAST,
             received_at ASC NULLS LAST,
             created_at ASC,
             id ASC
    FOR UPDATE
  `;
}

function sourceFields(sourceType: LotAllocationSourceType, sourceId: string) {
  if (sourceType === LOT_ALLOCATION_SOURCE.saleItem) {
    return {
      refundExchangeItemId: null as string | null,
      saleItemId: sourceId,
    };
  }
  return {
    refundExchangeItemId: sourceId,
    saleItemId: null as string | null,
  };
}

export async function consumeInventoryForSale(
  tx: any,
  input: {
    companyId: string;
    productId: string;
    quantity: number;
    sourceId: string;
    sourceType: LotAllocationSourceType;
    warehouseId: string;
  },
): Promise<LotAllocationResult[]> {
  const requestedQty = qty(input.quantity);
  assertPositiveQuantity(requestedQty, "Sale lot quantity");
  await lockProductLots(tx, input.companyId, input.warehouseId, input.productId);

  const lotRows = await tx.inventoryLot.count({
    where: {
      companyId: input.companyId,
      productId: input.productId,
      warehouseId: input.warehouseId,
    },
  });
  if (lotRows === 0) {
    return [];
  }

  const locked = await lockEligibleLots(tx, input.companyId, input.warehouseId, input.productId);
  const available = locked.reduce((total: number, lot: LotRow) => total + qty(lot.quantity), 0);
  let plan: Array<{ id: string; quantity: number }>;
  try {
    plan = allocateFefoLots(
      locked.map((lot: LotRow) => ({
        createdAt: lot.created_at,
        expiryDate: lot.expiry_date,
        id: lot.id,
        quantity: qty(lot.quantity),
        receivedAt: lot.received_at,
      })),
      requestedQty,
    );
  } catch {
    throw new Error(
      `Insufficient lot stock for product ${input.productId}. Available ${qty(available)}, requested ${requestedQty}.`,
    );
  }

  const source = sourceFields(input.sourceType, input.sourceId);
  const results: LotAllocationResult[] = [];

  for (const step of plan) {
    const lot = locked.find((row: LotRow) => row.id === step.id);
    if (!lot) {
      throw new Error(`Allocated lot ${step.id} was not locked for product ${input.productId}.`);
    }
    const updated = await tx.inventoryLot.updateMany({
      data: { quantity: { decrement: step.quantity } },
      where: {
        companyId: input.companyId,
        id: step.id,
        productId: input.productId,
        quantity: { gte: step.quantity },
        warehouseId: input.warehouseId,
      },
    });
    if (updated.count !== 1) {
      throw new Error(
        `Insufficient lot stock for product ${input.productId}. Available ${qty(available)}, requested ${requestedQty}.`,
      );
    }

    await tx.inventoryLotAllocation.create({
      data: {
        companyId: input.companyId,
        inventoryLotId: step.id,
        productId: input.productId,
        quantity: step.quantity,
        refundExchangeItemId: source.refundExchangeItemId,
        saleItemId: source.saleItemId,
        sourceId: input.sourceId,
        sourceType: input.sourceType,
        warehouseId: input.warehouseId,
      },
    });

    results.push({
      expiryDate: lot.expiry_date,
      inventoryLotId: step.id,
      lotNumber: lot.lot_number,
      quantity: step.quantity,
    });
  }

  return results;
}

export async function restoreInventoryForReturn(
  tx: any,
  input: {
    companyId: string;
    productId: string;
    quantity: number;
    sourceId: string;
    sourceType: LotAllocationSourceType;
    warehouseId: string;
  },
): Promise<LotAllocationResult[]> {
  const requestedQty = qty(input.quantity);
  assertPositiveQuantity(requestedQty, "Return lot quantity");
  await lockProductLots(tx, input.companyId, input.warehouseId, input.productId);

  const source = sourceFields(input.sourceType, input.sourceId);
  await tx.$executeRaw`
    SELECT id
    FROM inventory_lot_allocations
    WHERE source_type = ${input.sourceType}
      AND source_id = ${input.sourceId}
    FOR UPDATE
  `;

  const allocations = await tx.inventoryLotAllocation.findMany({
    include: {
      inventoryLot: {
        select: { expiryDate: true, lotNumber: true },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    where: {
      companyId: input.companyId,
      productId: input.productId,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      warehouseId: input.warehouseId,
      ...(source.saleItemId ? { saleItemId: source.saleItemId } : {}),
      ...(source.refundExchangeItemId ? { refundExchangeItemId: source.refundExchangeItemId } : {}),
    },
  });

  if (allocations.length === 0) {
    const lotRows = await tx.inventoryLot.count({
      where: {
        companyId: input.companyId,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    });
    if (lotRows === 0) {
      return [];
    }

    const restoredLot = await tx.inventoryLot.create({
      data: {
        companyId: input.companyId,
        lotNumber: `LEGACY-RESTORE-${input.sourceId}`,
        productId: input.productId,
        quantity: requestedQty,
        receivedAt: new Date(),
        warehouseId: input.warehouseId,
      },
    });
    return [
      {
        expiryDate: restoredLot.expiryDate ?? null,
        inventoryLotId: restoredLot.id,
        lotNumber: restoredLot.lotNumber ?? null,
        quantity: requestedQty,
      },
    ];
  }

  const unrestored = allocations.reduce(
    (total: number, row: Record<string, any>) => total + qty(row.quantity) - qty(row.restoredQuantity),
    0,
  );
  if (unrestored + 1e-9 < requestedQty) {
    throw new Error(
      `Cannot restore ${requestedQty} for ${input.sourceType} ${input.sourceId}; unrestored allocation is ${qty(unrestored)}.`,
    );
  }

  const results: LotAllocationResult[] = [];
  let remaining = requestedQty;
  for (const allocation of allocations) {
    if (remaining <= 1e-9) {
      break;
    }
    const openQty = qty(allocation.quantity) - qty(allocation.restoredQuantity);
    if (openQty <= 0) {
      continue;
    }
    const take = qty(Math.min(openQty, remaining));
    const lotUpdated = await tx.inventoryLot.updateMany({
      data: { quantity: { increment: take } },
      where: {
        companyId: input.companyId,
        id: allocation.inventoryLotId,
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    });
    if (lotUpdated.count !== 1) {
      throw new Error(`Original inventory lot ${allocation.inventoryLotId} is missing for restoration.`);
    }

    const allocationUpdated = await tx.inventoryLotAllocation.updateMany({
      data: { restoredQuantity: { increment: take } },
      where: {
        id: allocation.id,
        restoredQuantity: { lte: qty(allocation.quantity) - take },
      },
    });
    if (allocationUpdated.count !== 1) {
      throw new Error(
        `Cannot restore ${requestedQty} for ${input.sourceType} ${input.sourceId}; unrestored allocation is ${qty(unrestored)}.`,
      );
    }

    results.push({
      expiryDate: allocation.inventoryLot?.expiryDate ?? null,
      inventoryLotId: allocation.inventoryLotId,
      lotNumber: allocation.inventoryLot?.lotNumber ?? null,
      quantity: take,
    });
    remaining = qty(remaining - take);
  }

  if (remaining > 1e-9) {
    throw new Error(
      `Cannot restore ${requestedQty} for ${input.sourceType} ${input.sourceId}; unrestored allocation is ${qty(unrestored)}.`,
    );
  }

  return results;
}
