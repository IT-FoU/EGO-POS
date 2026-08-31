import {
  InventoryCountConflictError,
  STOCK_COUNT_CHANGED_MESSAGE,
  STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE,
  stockCountQuantitiesMatch,
} from "@/features/inventory/stock-count-errors";
import { numberValue } from "@/lib/db/write-context";

export async function lockInventoryMutationKey(tx: any, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

type StockBalance = {
  afterQty: number;
  beforeQty: number;
};

type StockMutationInput = {
  companyId: string;
  productId: string;
  quantityDelta: number;
  warehouseId: string;
};

export async function applyAtomicStockDelta(tx: any, input: StockMutationInput): Promise<StockBalance> {
  const quantityDelta = numberValue(input.quantityDelta);

  if (quantityDelta === 0) {
    throw new Error("Stock movement quantity must not be zero.");
  }

  if (quantityDelta > 0) {
    await tx.inventoryBalance.upsert({
      create: {
        companyId: input.companyId,
        productId: input.productId,
        quantity: quantityDelta,
        warehouseId: input.warehouseId,
      },
      update: {
        quantity: { increment: quantityDelta },
      },
      where: {
        warehouseId_productId: {
          productId: input.productId,
          warehouseId: input.warehouseId,
        },
      },
    });

    const balance = await tx.inventoryBalance.findUniqueOrThrow({
      where: {
        warehouseId_productId: {
          productId: input.productId,
          warehouseId: input.warehouseId,
        },
      },
    });
    const afterQty = numberValue(balance.quantity);

    return {
      afterQty,
      beforeQty: afterQty - quantityDelta,
    };
  }

  const requestedQty = Math.abs(quantityDelta);
  const result = await tx.inventoryBalance.updateMany({
    data: {
      quantity: { decrement: requestedQty },
    },
    where: {
      companyId: input.companyId,
      productId: input.productId,
      quantity: { gte: requestedQty },
      warehouseId: input.warehouseId,
    },
  });

  if (result.count !== 1) {
    const current = await tx.inventoryBalance.findUnique({
      where: {
        warehouseId_productId: {
          productId: input.productId,
          warehouseId: input.warehouseId,
        },
      },
    });
    const availableQty = numberValue(current?.quantity);
    throw new Error(`Insufficient stock for product ${input.productId}. Available ${availableQty}, requested ${requestedQty}.`);
  }

  const balance = await tx.inventoryBalance.findUniqueOrThrow({
    where: {
      warehouseId_productId: {
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    },
  });
  const afterQty = numberValue(balance.quantity);

  return {
    afterQty,
    beforeQty: afterQty + requestedQty,
  };
}

export async function setAtomicStockCount(tx: any, input: {
  companyId: string;
  countedQuantity: number;
  expectedSystemQuantity: number;
  productId: string;
  warehouseId: string;
}): Promise<StockBalance> {
  const countedQuantity = numberValue(input.countedQuantity);
  const expectedSystemQuantity = numberValue(input.expectedSystemQuantity);

  if (countedQuantity < 0) {
    throw new Error("Counted stock quantity cannot be negative.");
  }

  await tx.$queryRaw`
    SELECT id
    FROM inventory_balances
    WHERE warehouse_id = ${input.warehouseId}
      AND product_id = ${input.productId}
      AND company_id = ${input.companyId}
    FOR UPDATE
  `;

  const current = await tx.inventoryBalance.findUnique({
    where: {
      warehouseId_productId: {
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    },
  });
  const beforeQty = numberValue(current?.quantity);

  if (!stockCountQuantitiesMatch(beforeQty, expectedSystemQuantity)) {
    throw new InventoryCountConflictError("INVENTORY_CHANGED", STOCK_COUNT_CHANGED_MESSAGE);
  }

  const activeLots = await tx.inventoryLot.count({
    where: {
      companyId: input.companyId,
      productId: input.productId,
      quantity: { gt: 0 },
      warehouseId: input.warehouseId,
    },
  });
  if (activeLots > 0) {
    throw new InventoryCountConflictError("INVENTORY_LOT_COUNT_UNSUPPORTED", STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE);
  }

  await tx.inventoryBalance.upsert({
    create: {
      companyId: input.companyId,
      productId: input.productId,
      quantity: countedQuantity,
      warehouseId: input.warehouseId,
    },
    update: {
      quantity: countedQuantity,
    },
    where: {
      warehouseId_productId: {
        productId: input.productId,
        warehouseId: input.warehouseId,
      },
    },
  });

  return {
    afterQty: countedQuantity,
    beforeQty,
  };
}
