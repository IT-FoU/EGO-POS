import { numberValue } from "@/lib/db/write-context";

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
  productId: string;
  warehouseId: string;
}): Promise<StockBalance> {
  const countedQuantity = numberValue(input.countedQuantity);

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
