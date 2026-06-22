import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, optionalString, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import { assertWarehouseInScope, branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { applyAtomicStockDelta } from "@/features/inventory/stock-concurrency";
import { getPrismaInventorySnapshot } from "@/features/inventory/prisma-repository";
import { getPrismaProducts } from "@/features/products/prisma-repository";
import {
  mapPrismaPurchaseOrder,
  mapPrismaPurchasingSupplier,
  mapPrismaSupplierPayable,
} from "@/features/purchasing/dto-mapper";
import {
  parsePurchaseOrderInput,
  parsePurchaseStatusInput,
  parseReceiveGoodsInput,
  parseSupplierPaymentInput,
  type PurchaseOrderInput,
  type PurchaseStatusInput,
  type ReceiveGoodsInput,
  type SupplierPaymentInput,
} from "@/features/purchasing/dto";
import { assertTransition, isPurchaseStatus, isReceivableStatus } from "@/features/purchasing/purchase-status";
import type { PurchaseStatus } from "@/features/purchasing/types";
import { resolvePurchaseNo } from "@/features/purchasing/purchase-no";

const db = prisma as any;

export async function getPrismaPurchasingSnapshot(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const [suppliers, purchaseOrders, payables, products, inventory] = await Promise.all([
    db.supplier.findMany({ orderBy: { name: "asc" }, where: { companyId: scope.companyId, ...branchWhere } }),
    db.purchase.findMany({
      include: {
        items: { include: { product: true, unit: true } },
        supplier: true,
        warehouse: true,
      },
      orderBy: { purchaseDate: "desc" },
      where: { companyId: scope.companyId, warehouseId: { in: scope.warehouseIds } },
    }),
    db.supplierPayable.findMany({
      include: { purchase: true, supplier: true },
      orderBy: { dueDate: "asc" },
      where: {
        companyId: scope.companyId,
        OR: [
          { purchaseId: null },
          { purchase: { warehouseId: { in: scope.warehouseIds } } },
        ],
      },
    }),
    getPrismaProducts(scope),
    getPrismaInventorySnapshot(scope),
  ]);

  return {
    inventoryItems: inventory.items,
    payables: payables.map(mapPrismaSupplierPayable),
    products,
    purchaseOrders: purchaseOrders.map(mapPrismaPurchaseOrder),
    suppliers: suppliers.map(mapPrismaPurchasingSupplier),
    warehouses: inventory.warehouses,
  };
}

export async function createPurchaseOrder(input: PurchaseOrderInput, tenant: TenantContext) {
  const data = parsePurchaseOrderInput(input);
  const subtotal = data.items.reduce((total, item) => total + numberValue(item.quantity) * numberValue(item.unitCost), 0);
  const paidAmount = numberValue(data.paidAmount);
  if (!Number.isFinite(subtotal) || subtotal < 0) {
    throw new Error("Purchase order subtotal is invalid.");
  }
  if (paidAmount > subtotal) {
    throw new Error("Paid amount cannot exceed purchase order total.");
  }
  return withTenantTransaction({
    action: "create",
    module: "purchasing",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await assertWarehouseInScope(tx, tenant, data.warehouseId);
      await tx.supplier.findFirstOrThrow({
        where: { companyId: tenant.companyId, id: data.supplierId, ...branchOwnedWhere(scope) },
      });
      for (const item of data.items) {
        await tx.product.findFirstOrThrow({
          where: { companyId: tenant.companyId, id: item.productId, ...branchOwnedWhere(scope) },
        });
        if (item.unitId) {
          await tx.productUnit.findFirstOrThrow({
            where: { id: item.unitId, productId: item.productId },
          });
        }
      }
      const purchaseNo = await resolvePurchaseNo(tx, tenant.companyId, data.purchaseNo);
      return tx.purchase.create({
        data: {
          balanceAmount: Math.max(subtotal - paidAmount, 0),
          companyId: tenant.companyId,
          currency: data.currency ?? "LAK",
          exchangeRate: numberValue(data.exchangeRate, 1),
          items: {
            create: data.items.map((item) => ({
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
              lotNumber: optionalString(item.lotNumber),
              productId: item.productId,
              quantity: numberValue(item.quantity),
              totalCost: numberValue(item.quantity) * numberValue(item.unitCost),
              unitCost: numberValue(item.unitCost),
              unitId: optionalString(item.unitId),
            })),
          },
          paidAmount,
          purchaseNo,
          status: "draft",
          subtotal,
          supplierId: data.supplierId,
          totalAmount: subtotal,
          warehouseId: data.warehouseId,
        },
        include: { items: true },
      });
    },
  });
}

export async function receiveGoods(input: ReceiveGoodsInput, tenant: TenantContext) {
  const data = parseReceiveGoodsInput(input);
  return withTenantTransaction({
    action: "receive",
    module: "purchasing",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await assertWarehouseInScope(tx, tenant, data.warehouseId);
      const purchase = await tx.purchase.findFirstOrThrow({
        include: { items: true, supplier: true },
        where: {
          companyId: tenant.companyId,
          id: data.purchaseId,
          warehouseId: data.warehouseId,
          supplier: branchOwnedWhere(scope),
        },
      });

      if (purchase.warehouseId !== data.warehouseId) {
        throw new Error("Goods receipt warehouse must match the purchase warehouse.");
      }

      const currentStatus: PurchaseStatus = isPurchaseStatus(purchase.status) ? purchase.status : "draft";
      if (!isReceivableStatus(currentStatus)) {
        throw new Error(
          `Purchase order must be Ordered or Partial Received before receiving goods (current: ${currentStatus}).`,
        );
      }

      const purchaseItemsById = new Map<string, Record<string, any>>(
        purchase.items.map((item: Record<string, any>) => [item.id, item]),
      );
      const runningReceivedByPurchaseItem = new Map<string, number>();
      const receiptItems = data.items.map((item) => {
        const quantity = numberValue(item.quantity);
        const productMatches = purchase.items.filter((purchaseItem: Record<string, any>) => purchaseItem.productId === item.productId);
        const purchaseItem = item.purchaseItemId
          ? purchaseItemsById.get(item.purchaseItemId)
          : productMatches.length === 1
            ? productMatches[0]
            : undefined;

        if (quantity <= 0) {
          throw new Error(`Receipt quantity must be greater than zero for product ${item.productId}.`);
        }

        if (!purchaseItem) {
          throw new Error(`Receipt item for product ${item.productId} must match one purchase order item.`);
        }

        if (purchaseItem && purchaseItem.productId !== item.productId) {
          throw new Error(`Receipt product ${item.productId} does not match purchase item ${item.purchaseItemId}.`);
        }

        const orderedQty = Number(purchaseItem.quantity ?? 0);
        const alreadyReceivedQty = Number(purchaseItem.receivedQuantity ?? 0);
        const runningQty = runningReceivedByPurchaseItem.get(purchaseItem.id) ?? 0;
        if (alreadyReceivedQty + runningQty + quantity > orderedQty) {
          throw new Error(`Receipt quantity exceeds remaining quantity for product ${item.productId}.`);
        }
        runningReceivedByPurchaseItem.set(purchaseItem.id, runningQty + quantity);

        return {
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : purchaseItem?.expiryDate,
          lotNumber: optionalString(item.lotNumber) ?? purchaseItem?.lotNumber,
          productId: item.productId,
          purchaseItem,
          purchaseItemId: purchaseItem.id,
          quantity,
          unitId: optionalString(item.unitId) ?? purchaseItem?.unitId,
        };
      });

      // Resolve unit -> base-unit conversion factors so received pack/carton quantities
      // increase base stock correctly. Units without a unitId are treated as base units.
      const unitIds = [
        ...new Set(receiptItems.map((item) => item.unitId).filter((id: unknown): id is string => Boolean(id))),
      ];
      const unitsById = new Map<string, Record<string, any>>();
      if (unitIds.length > 0) {
        const units = await tx.productUnit.findMany({ where: { id: { in: unitIds } } });
        for (const unit of units) {
          unitsById.set(unit.id, unit);
        }
      }
      const baseQuantityFor = (item: { productId: string; quantity: number; unitId?: string }) => {
        if (!item.unitId) {
          return item.quantity;
        }
        const unit = unitsById.get(item.unitId);
        if (!unit) {
          throw new Error(`Receipt unit ${item.unitId} was not found for product ${item.productId}.`);
        }
        if (unit.productId !== item.productId) {
          throw new Error(`Receipt unit ${item.unitId} does not belong to product ${item.productId}.`);
        }
        const conversionQty = numberValue(unit.conversionQty, 1);
        if (conversionQty <= 0) {
          throw new Error(`Invalid unit conversion factor for product ${item.productId}.`);
        }
        return item.quantity * conversionQty;
      };

      const receipt = await tx.goodsReceipt.create({
        data: {
          companyId: tenant.companyId,
          items: {
            create: receiptItems.map((item) => ({
              expiryDate: item.expiryDate,
              lotNumber: item.lotNumber,
              productId: item.productId,
              purchaseItemId: item.purchaseItemId,
              quantity: item.quantity,
              unitId: item.unitId,
            })),
          },
          note: optionalString(data.note),
          purchaseId: data.purchaseId,
          receiptNo: stringValue(data.receiptNo),
          receivedBy: tenant.userId,
          status: data.status ?? "received",
          warehouseId: data.warehouseId,
        },
        include: { items: true },
      });

      for (const item of receiptItems) {
        const baseQuantity = baseQuantityFor(item);
        const balance = await applyAtomicStockDelta(tx, {
          companyId: tenant.companyId,
          productId: item.productId,
          quantityDelta: baseQuantity,
          warehouseId: data.warehouseId,
        });

        await tx.inventoryLot.create({
          data: {
            companyId: tenant.companyId,
            expiryDate: item.expiryDate,
            lotNumber: item.lotNumber,
            productId: item.productId,
            quantity: baseQuantity,
            receivedAt: new Date(),
            warehouseId: data.warehouseId,
          },
        });

        await tx.stockMovement.create({
          data: {
            afterQty: balance.afterQty,
            beforeQty: balance.beforeQty,
            companyId: tenant.companyId,
            createdBy: tenant.userId,
            expiryDate: item.expiryDate,
            lotNumber: item.lotNumber,
            movementType: "purchase",
            note: `Goods receipt ${receipt.receiptNo}`,
            productId: item.productId,
            quantity: baseQuantity,
            referenceId: receipt.id,
            referenceType: "goods_receipt",
            unitId: item.unitId,
            warehouseId: data.warehouseId,
          },
        });

        if (item.purchaseItemId) {
          const purchaseItem = item.purchaseItem;
          if (!purchaseItem) {
            throw new Error(`Purchase item ${item.purchaseItemId} does not belong to purchase ${data.purchaseId}.`);
          }

          const updateResult = await tx.purchaseItem.updateMany({
            data: {
              receivedQuantity: {
                increment: item.quantity,
              },
            },
            where: {
              id: item.purchaseItemId,
              receivedQuantity: {
                lte: Number(purchaseItem.quantity ?? 0) - item.quantity,
              },
            },
          });

          if (updateResult.count !== 1) {
            throw new Error(`Receipt quantity exceeds remaining quantity for product ${item.productId}.`);
          }
        }
      }

      const updatedItems = await tx.purchaseItem.findMany({
        where: { purchaseId: data.purchaseId },
      });
      const hasAnyReceived = updatedItems.some((item: Record<string, any>) => Number(item.receivedQuantity ?? 0) > 0);
      const isFullyReceived = updatedItems.length > 0 && updatedItems.every(
        (item: Record<string, any>) => Number(item.receivedQuantity ?? 0) >= Number(item.quantity ?? 0),
      );

      await tx.purchase.update({
        data: {
          status: isFullyReceived ? "received" : hasAnyReceived ? "partial" : purchase.status,
        },
        where: { id: data.purchaseId },
      });

      return receipt;
    },
  });
}

export async function createSupplierPayment(input: SupplierPaymentInput, tenant: TenantContext) {
  const data = parseSupplierPaymentInput(input);
  return withTenantTransaction({
    action: "payment",
    module: "purchasing",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const purchase = await tx.purchase.findFirstOrThrow({
        where: {
          companyId: tenant.companyId,
          id: data.purchaseId,
          warehouseId: { in: scope.warehouseIds },
        },
      });
      const amount = numberValue(data.amount);

      const payment = await tx.purchasePayment.create({
        data: {
          amount,
          note: optionalString(data.note),
          paymentMethod: data.paymentMethod ?? "cash",
          purchaseId: purchase.id,
        },
      });

      const paidAmount = Number(purchase.paidAmount ?? 0) + amount;
      const balanceAmount = Math.max(Number(purchase.totalAmount ?? 0) - paidAmount, 0);
      await tx.purchase.update({
        data: { balanceAmount, paidAmount },
        where: { id: purchase.id },
      });
      await tx.supplierPayable.updateMany({
        data: {
          balanceAmount,
          paidAmount,
          status: balanceAmount <= 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid",
        },
        where: { purchaseId: purchase.id },
      });

      return payment;
    },
  });
}

export async function updatePurchaseOrderStatus(input: PurchaseStatusInput, tenant: TenantContext) {
  const data = parsePurchaseStatusInput(input);
  const nextStatus = data.status as PurchaseStatus;
  return withTenantTransaction({
    action: "status",
    module: "purchasing",
    newData: data,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const purchase = await tx.purchase.findFirstOrThrow({
        where: {
          companyId: tenant.companyId,
          id: data.purchaseId,
          warehouseId: { in: scope.warehouseIds },
        },
      });

      const currentStatus: PurchaseStatus = isPurchaseStatus(purchase.status) ? purchase.status : "draft";
      assertTransition(currentStatus, nextStatus);

      return tx.purchase.update({
        data: { status: nextStatus },
        include: { items: true },
        where: { id: data.purchaseId },
      });
    },
  });
}
