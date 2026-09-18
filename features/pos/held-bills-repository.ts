import { slimHeldSnapshot } from "@/features/pos/held-cart";
import { assertPosActionAllowed, buildPosPolicyForTenant } from "@/features/pos/pos-permission-guard";
import type { PosPermissionPolicy } from "@/features/pos/permissions";
import {
  HOLD_RESERVING_STATUSES,
  HOLD_STATUS_ACTIVE,
  HOLD_STATUS_CANCELLED,
  aggregateBaseDemand,
  assertSufficientAvailable,
  availableBaseQty,
  lockProductsDeterministically,
  resolveHoldSaleUnit,
  sellQtyToBaseQuantity,
  type ReservationDemand,
} from "@/features/pos/stock-reservation";
import type { HeldBillCartSnapshot, HeldSale, PosCartItem } from "@/features/pos/types";
import { prisma } from "@/lib/db/prisma";
import { numberValue, type TenantContext, withTenantTransaction } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

type HoldBillInput = {
  cashSessionId?: string | null;
  snapshot: HeldBillCartSnapshot;
};

type HeldBillRow = Record<string, any>;

function amount(value: unknown) {
  return numberValue(value);
}

function createHoldReference() {
  return `HOLD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function assertHoldOwnership(policy: PosPermissionPolicy, bill: HeldBillRow, tenant: TenantContext) {
  if (policy.role === "Cashier" && String(bill.cashierId) !== String(tenant.userId)) {
    throw new Error("You can only access your own held bills.");
  }
}

function toHeldSale(bill: HeldBillRow, cashierName?: string | null): HeldSale {
  const snapshot = slimHeldSnapshot(bill.cartSnapshot as HeldBillCartSnapshot | null);
  const items = snapshot?.cartItems ?? [];
  return {
    cashierId: String(bill.cashierId ?? ""),
    cashierName: cashierName ?? undefined,
    createdAt: new Date(bill.createdAt).toISOString(),
    id: String(bill.id),
    itemCount: items.reduce((total, item) => total + Math.max(0, amount(item.quantity)), 0),
    items,
    reserved: true,
    resumedAt: bill.resumedAt ? new Date(bill.resumedAt).toISOString() : null,
    saleNo: String(bill.holdNo),
    snapshot,
    status: String(bill.status ?? HOLD_STATUS_ACTIVE),
    totalLak: amount(bill.grandTotal),
  };
}

function normaliseSnapshot(input: HeldBillCartSnapshot) {
  const cartItems = Array.isArray(input.cartItems) ? input.cartItems : [];
  if (cartItems.length === 0) {
    throw new Error("Cart is empty. Add items before holding a bill.");
  }

  const subtotal = cartItems.reduce((total, item) => {
    const quantity = amount(item.quantity);
    const unitPrice = amount(item.priceLak);
    if (quantity <= 0 || unitPrice < 0) {
      throw new Error("Held bill contains an invalid quantity or price.");
    }
    return total + quantity * unitPrice;
  }, 0);
  const discountTotal = Math.min(
    subtotal,
    Math.max(0, amount(input.discountAmount)) + Math.max(0, amount(input.membershipDiscountLak)),
  );
  const taxTotal = Math.max(0, amount(input.taxAmount));
  const grandTotal = Math.max(0, subtotal - discountTotal + taxTotal);

  const snapshot = slimHeldSnapshot({
    ...input,
    appliedPromotions: Array.isArray(input.appliedPromotions) ? input.appliedPromotions : [],
    cardAmount: amount(input.cardAmount),
    cashAmount: amount(input.cashAmount),
    cartItems,
    discountAmount: Math.max(0, amount(input.discountAmount)),
    discountPercent: Math.max(0, amount(input.discountPercent)),
    membershipDiscountLak: Math.max(0, amount(input.membershipDiscountLak)),
    qrAmount: amount(input.qrAmount),
    redeemPoints: Math.max(0, amount(input.redeemPoints)),
    taxAmount: taxTotal,
    taxEnabled: Boolean(input.taxEnabled),
    taxRatePercent: Math.max(0, amount(input.taxRatePercent)),
    transferAmount: amount(input.transferAmount),
  });
  if (!snapshot) {
    throw new Error("Cart is empty. Add items before holding a bill.");
  }

  return {
    cartItems: snapshot.cartItems,
    discountTotal,
    grandTotal,
    snapshot,
    subtotal,
    taxTotal,
  };
}

async function loadProductsForItems(tx: any, tenant: TenantContext, items: PosCartItem[]) {
  const scope = await resolveTenantScope(tenant, tx);
  const ids = Array.from(new Set(items.map((item) => item.id).filter(Boolean)));
  const products = await tx.product.findMany({
    include: { units: true },
    where: { branchId: scope.branchId, companyId: tenant.companyId, id: { in: ids }, isActive: true },
  });
  const productsById = new Map<string, HeldBillRow>(
    products.map((product: HeldBillRow) => [String(product.id), product]),
  );
  return { productsById, scope };
}

function buildReservationDemands(items: PosCartItem[], productsById: Map<string, HeldBillRow>): ReservationDemand[] {
  const demands: ReservationDemand[] = [];
  for (const item of items) {
    const product = productsById.get(item.id);
    if (!product) {
      throw new Error("A held bill product was not found or is inactive.");
    }
    const unit = resolveHoldSaleUnit(product, item.unitId);
    const conversionQty = Math.max(amount(unit.conversionQty), 1);
    const baseQuantity = sellQtyToBaseQuantity(item.quantity, conversionQty);
    demands.push({
      baseQuantity,
      productId: String(product.id),
      productUnitId: String(unit.id),
      sellQuantity: amount(item.quantity),
    });
  }
  return demands;
}

async function validateCustomer(tx: any, tenant: TenantContext, customerId: string | undefined) {
  if (!customerId) return null;
  const scope = await resolveTenantScope(tenant, tx);
  const customer = await tx.customer.findFirst({
    select: { id: true },
    where: { branchId: scope.branchId, companyId: tenant.companyId, id: customerId, status: "active" },
  });
  if (!customer) {
    throw new Error("The selected customer is unavailable for this branch.");
  }
  return String(customer.id);
}

async function resolveCashSessionId(tx: any, tenant: TenantContext, requestedSessionId: string | null | undefined) {
  if (!requestedSessionId) return null;
  const scope = await resolveTenantScope(tenant, tx);
  const session = await tx.cashSession.findFirst({
    select: { id: true },
    where: {
      branchId: scope.branchId,
      cashierId: tenant.userId,
      closedAt: null,
      companyId: tenant.companyId,
      id: requestedSessionId,
    },
  });
  if (!session) {
    throw new Error("The active cash session is unavailable for this held bill.");
  }
  return String(session.id);
}

async function cashierNamesById(tx: any, cashierIds: string[]) {
  const ids = Array.from(new Set(cashierIds.filter(Boolean)));
  if (ids.length === 0) return new Map<string, string>();
  const users = await tx.user.findMany({
    select: { fullName: true, id: true, username: true },
    where: { id: { in: ids } },
  });
  return new Map<string, string>(
    users.map((user: HeldBillRow) => [
      String(user.id),
      String(user.fullName || user.username || user.id),
    ]),
  );
}

export async function listPrismaHeldBills(tenant: TenantContext) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "resume_bill");
  const scope = await resolveTenantScope(tenant);
  const bills = await db.holdBill.findMany({
    orderBy: { createdAt: "desc" },
    where: {
      branchId: scope.branchId,
      companyId: tenant.companyId,
      status: { in: [...HOLD_RESERVING_STATUSES] },
      ...(policy.role === "Cashier" ? { cashierId: tenant.userId } : {}),
    },
  });
  const names = await cashierNamesById(db, bills.map((bill: HeldBillRow) => String(bill.cashierId)));
  return bills.map((bill: HeldBillRow) => toHeldSale(bill, names.get(String(bill.cashierId))));
}

export async function createPrismaHeldBill(input: HoldBillInput, tenant: TenantContext) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "hold_bill");
  const normalized = normaliseSnapshot(input.snapshot);

  return withTenantTransaction({
    action: "POS_HELD_BILL_CREATED",
    module: "pos",
    newData: { itemCount: normalized.cartItems.length, totalLak: normalized.grandTotal },
    tenant,
    write: async (tx) => {
      const { productsById, scope } = await loadProductsForItems(tx, tenant, normalized.cartItems);
      if (!scope.warehouseId) {
        throw new Error("Warehouse scope is required to reserve held-bill stock.");
      }
      if (!scope.branchId) {
        throw new Error("Branch scope is required to reserve held-bill stock.");
      }

      const demands = buildReservationDemands(normalized.cartItems, productsById);
      const demandByProduct = aggregateBaseDemand(demands);
      await lockProductsDeterministically(tx, tenant.companyId, scope.warehouseId, demandByProduct.keys());

      for (const [productId, requested] of demandByProduct) {
        const product = productsById.get(productId);
        const label = String(product?.nameEn ?? product?.nameLo ?? productId);
        const available = await availableBaseQty(tx, {
          companyId: tenant.companyId,
          productId,
          warehouseId: scope.warehouseId,
        });
        assertSufficientAvailable(label, available, requested);
      }

      const customerId = await validateCustomer(tx, tenant, normalized.snapshot.customer?.id);
      const cashSessionId = await resolveCashSessionId(tx, tenant, input.cashSessionId);
      const holdNo = createHoldReference();

      const bill = await tx.holdBill.create({
        data: {
          branchId: scope.branchId,
          cartSnapshot: normalized.snapshot,
          cashSessionId,
          cashierId: tenant.userId,
          companyId: tenant.companyId,
          currency: "LAK",
          customerId,
          discountTotal: normalized.discountTotal,
          grandTotal: normalized.grandTotal,
          holdNo,
          memberId: normalized.snapshot.customer?.id ?? null,
          note: normalized.snapshot.note?.trim() || null,
          status: HOLD_STATUS_ACTIVE,
          subtotal: normalized.subtotal,
          taxTotal: normalized.taxTotal,
          warehouseId: scope.warehouseId,
        },
      });

      for (let index = 0; index < demands.length; index += 1) {
        const demand = demands[index];
        const item = normalized.cartItems[index];
        const holdItem = await tx.holdBillItem.create({
          data: {
            cartMetadata: { cartLineId: item.cartLineId ?? null, pricingNote: item.pricingNote ?? null },
            holdBillId: bill.id,
            lineTotal: amount(item.priceLak) * amount(item.quantity),
            productId: item.id,
            productUnitId: demand.productUnitId,
            quantity: amount(item.quantity),
            sellingPrice: amount(item.priceLak),
            unitPrice: amount(item.priceLak),
          },
        });
        await tx.stockReservation.create({
          data: {
            baseQuantity: demand.baseQuantity,
            branchId: scope.branchId,
            companyId: tenant.companyId,
            holdBillId: bill.id,
            holdBillItemId: holdItem.id,
            productId: demand.productId,
            productUnitId: demand.productUnitId,
            status: "ACTIVE",
            warehouseId: scope.warehouseId,
          },
        });
      }

      const names = await cashierNamesById(tx, [tenant.userId]);
      return toHeldSale(bill, names.get(tenant.userId));
    },
  });
}

async function getResumeWarnings(tx: any, tenant: TenantContext, bill: HeldBillRow, snapshot: HeldBillCartSnapshot) {
  const scope = await resolveTenantScope(tenant, tx);
  const warehouseId = String(bill.warehouseId ?? scope.warehouseId ?? "");
  const ids = Array.from(new Set(snapshot.cartItems.map((item) => item.id).filter(Boolean)));
  const products = await tx.product.findMany({
    include: { units: true },
    where: { branchId: scope.branchId, companyId: tenant.companyId, id: { in: ids } },
  });
  const productsById = new Map<string, HeldBillRow>(
    products.map((product: HeldBillRow) => [String(product.id), product]),
  );

  const warnings: string[] = [];
  for (const item of snapshot.cartItems) {
    const product = productsById.get(item.id);
    if (!product || !product.isActive) {
      warnings.push(`${item.nameEn || item.nameLo || "Product"} is no longer available.`);
      continue;
    }
    let unit: HeldBillRow;
    try {
      unit = resolveHoldSaleUnit(product, item.unitId);
    } catch {
      warnings.push(`${item.nameEn || item.nameLo || "Product"} unit is inactive.`);
      continue;
    }
    // Own reservation still ACTIVE — Available for this Hold excludes own rows.
    if (warehouseId) {
      const requested = sellQtyToBaseQuantity(item.quantity, Math.max(amount(unit.conversionQty), 1));
      const available = await availableBaseQty(tx, {
        companyId: tenant.companyId,
        excludeHoldBillId: String(bill.id),
        productId: String(product.id),
        warehouseId,
      });
      if (requested > available + 1e-9) {
        warnings.push(
          `${item.nameEn || item.nameLo || "Product"} may be short after other reservations (available ${available}, needed ${requested}).`,
        );
      }
    }
  }
  return warnings;
}

export async function resumePrismaHeldBill(heldBillId: string, tenant: TenantContext) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "resume_bill");

  return withTenantTransaction({
    action: "POS_HELD_BILL_RESUMED",
    module: "pos",
    newData: { heldBillId },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const bill = await tx.holdBill.findFirst({
        include: { reservations: { where: { status: "ACTIVE" } } },
        where: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          id: heldBillId,
          status: { in: [...HOLD_RESERVING_STATUSES] },
        },
      });
      if (!bill) {
        throw new Error("This held bill has already been completed or cancelled.");
      }
      assertHoldOwnership(policy, bill, tenant);

      const snapshot = bill.cartSnapshot as HeldBillCartSnapshot | null;
      if (!snapshot || !Array.isArray(snapshot.cartItems) || snapshot.cartItems.length === 0) {
        throw new Error("This held bill has no restorable cart data.");
      }

      // Resume is NOT terminal — keep status held and keep ACTIVE reservations.
      // Do not create additional reservation rows (unique holdBillItemId prevents duplicates).
      const availabilityWarnings = await getResumeWarnings(tx, tenant, bill, snapshot);
      const updated = await tx.holdBill.updateMany({
        data: { resumedAt: new Date(), resumedByUserId: tenant.userId },
        where: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          id: heldBillId,
          status: { in: [...HOLD_RESERVING_STATUSES] },
        },
      });
      if (updated.count !== 1) {
        throw new Error("This held bill has already been completed or cancelled.");
      }

      const refreshed = await tx.holdBill.findFirstOrThrow({ where: { id: heldBillId } });
      const names = await cashierNamesById(tx, [String(refreshed.cashierId)]);
      return {
        availabilityWarnings,
        sale: toHeldSale(refreshed, names.get(String(refreshed.cashierId))),
      };
    },
  });
}

export async function cancelPrismaHeldBill(heldBillId: string, reason: string | undefined, tenant: TenantContext) {
  const policy = await buildPosPolicyForTenant(tenant);
  // Cancel own/branch Holds uses resume_bill (Cashier has it); ownership enforced below.
  assertPosActionAllowed(policy, "resume_bill");

  return withTenantTransaction({
    action: "POS_HELD_BILL_CANCELLED",
    module: "pos",
    newData: { heldBillId, reason: reason?.trim() || null },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const bill = await tx.holdBill.findFirst({
        where: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          id: heldBillId,
          status: { in: [...HOLD_RESERVING_STATUSES] },
        },
      });
      if (!bill) {
        throw new Error("This held bill has already been completed or cancelled.");
      }
      assertHoldOwnership(policy, bill, tenant);

      const released = await tx.stockReservation.updateMany({
        data: { releasedAt: new Date(), status: "RELEASED" },
        where: { holdBillId: heldBillId, status: "ACTIVE" },
      });

      const updated = await tx.holdBill.updateMany({
        data: {
          cancelReason: reason?.trim() || null,
          cancelledAt: new Date(),
          cancelledByUserId: tenant.userId,
          status: HOLD_STATUS_CANCELLED,
        },
        where: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          id: heldBillId,
          status: { in: [...HOLD_RESERVING_STATUSES] },
        },
      });
      if (updated.count !== 1) {
        throw new Error("This held bill has already been completed or cancelled.");
      }

      return {
        heldBillId,
        releasedCount: released.count,
        status: "cancelled" as const,
      };
    },
  });
}
