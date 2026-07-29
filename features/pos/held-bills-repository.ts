import { assertPosActionAllowed, buildPosPolicyForTenant } from "@/features/pos/pos-permission-guard";
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
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createHoldReference() {
  return `HOLD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function toHeldSale(bill: HeldBillRow): HeldSale {
  const snapshot = bill.cartSnapshot as HeldBillCartSnapshot | null;
  const items = Array.isArray(snapshot?.cartItems) ? snapshot.cartItems : [];
  return {
    createdAt: new Date(bill.createdAt).toISOString(),
    id: String(bill.id),
    itemCount: items.reduce((total, item) => total + Math.max(0, amount(item.quantity)), 0),
    items,
    saleNo: String(bill.holdNo),
    snapshot: snapshot ?? undefined,
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
  const discountTotal = Math.min(subtotal, Math.max(0, amount(input.discountAmount)) + Math.max(0, amount(input.membershipDiscountLak)));
  const taxTotal = Math.max(0, amount(input.taxAmount));
  const grandTotal = Math.max(0, subtotal - discountTotal + taxTotal);

  return {
    cartItems,
    discountTotal,
    grandTotal,
    snapshot: {
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
    } satisfies HeldBillCartSnapshot,
    subtotal,
    taxTotal,
  };
}

async function validateSnapshotItems(tx: any, tenant: TenantContext, items: PosCartItem[]) {
  const scope = await resolveTenantScope(tenant, tx);
  const ids = Array.from(new Set(items.map((item) => item.id).filter(Boolean)));
  const products = await tx.product.findMany({
    include: { units: true },
    where: { branchId: scope.branchId, companyId: tenant.companyId, id: { in: ids }, isActive: true },
  });
  const productsById = new Map<string, HeldBillRow>(
    products.map((product: HeldBillRow) => [String(product.id), product]),
  );

  for (const item of items) {
    const product = productsById.get(item.id);
    if (!product) {
      throw new Error("A held bill product was not found or is inactive.");
    }
    if (item.unitId) {
      const unit = (product.units ?? []).find((candidate: HeldBillRow) => candidate.id === item.unitId);
      if (!unit || String(unit.status) === "inactive") {
        throw new Error(`The selected unit for ${product.nameEn ?? product.nameLo} is unavailable.`);
      }
    }
  }
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

export async function listPrismaHeldBills(tenant: TenantContext) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "resume_bill");
  const scope = await resolveTenantScope(tenant);
  const bills = await db.holdBill.findMany({
    orderBy: { createdAt: "desc" },
    where: { branchId: scope.branchId, companyId: tenant.companyId, status: "held" },
  });
  return bills.map(toHeldSale);
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
      const scope = await resolveTenantScope(tenant, tx);
      await validateSnapshotItems(tx, tenant, normalized.cartItems);
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
          subtotal: normalized.subtotal,
          taxTotal: normalized.taxTotal,
          warehouseId: scope.warehouseId ?? null,
          items: {
            create: normalized.cartItems.map((item) => ({
              cartMetadata: { cartLineId: item.cartLineId ?? null, pricingNote: item.pricingNote ?? null },
              lineTotal: amount(item.priceLak) * amount(item.quantity),
              productId: item.id,
              productUnitId: item.unitId ?? null,
              quantity: amount(item.quantity),
              sellingPrice: amount(item.priceLak),
              unitPrice: amount(item.priceLak),
            })),
          },
        },
      });
      return toHeldSale(bill);
    },
  });
}

function productAvailabilityWarning(product: HeldBillRow | undefined, item: PosCartItem, warehouseId: string | undefined) {
  if (!product) return `${item.nameEn || item.nameLo || "Product"} is no longer available.`;
  const unit = item.unitId ? (product.units ?? []).find((candidate: HeldBillRow) => candidate.id === item.unitId) : null;
  if (!product.isActive || (unit && String(unit.status) === "inactive")) {
    return `${item.nameEn || item.nameLo || "Product"} is inactive.`;
  }
  const requested = amount(item.quantity) * Math.max(amount(unit?.conversionQty ?? item.conversionQty), 1);
  const available = (product.balances ?? [])
    .filter((balance: HeldBillRow) => !warehouseId || balance.warehouseId === warehouseId)
    .reduce((total: number, balance: HeldBillRow) => total + amount(balance.quantity), 0);
  if (requested > available) {
    return `${item.nameEn || item.nameLo || "Product"} has insufficient current stock.`;
  }
  return null;
}

async function getResumeWarnings(tx: any, tenant: TenantContext, bill: HeldBillRow, snapshot: HeldBillCartSnapshot) {
  const scope = await resolveTenantScope(tenant, tx);
  const ids = Array.from(new Set(snapshot.cartItems.map((item) => item.id).filter(Boolean)));
  const products = await tx.product.findMany({
    include: { balances: true, units: true },
    where: { branchId: scope.branchId, companyId: tenant.companyId, id: { in: ids } },
  });
  const productsById = new Map<string, HeldBillRow>(
    products.map((product: HeldBillRow) => [String(product.id), product]),
  );
  return snapshot.cartItems
    .map((item) => productAvailabilityWarning(productsById.get(item.id), item, bill.warehouseId ?? scope.warehouseId))
    .filter((warning): warning is string => Boolean(warning));
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
        where: { branchId: scope.branchId, companyId: tenant.companyId, id: heldBillId, status: "held" },
      });
      if (!bill) {
        throw new Error("This held bill has already been resumed or cancelled.");
      }
      const snapshot = bill.cartSnapshot as HeldBillCartSnapshot | null;
      if (!snapshot || !Array.isArray(snapshot.cartItems) || snapshot.cartItems.length === 0) {
        throw new Error("This held bill has no restorable cart data.");
      }
      const availabilityWarnings = await getResumeWarnings(tx, tenant, bill, snapshot);
      const updated = await tx.holdBill.updateMany({
        data: { resumedAt: new Date(), resumedByUserId: tenant.userId, status: "resumed" },
        where: { branchId: scope.branchId, companyId: tenant.companyId, id: heldBillId, status: "held" },
      });
      if (updated.count !== 1) {
        throw new Error("This held bill has already been resumed or cancelled.");
      }
      return { availabilityWarnings, sale: toHeldSale(bill) };
    },
  });
}

export async function cancelPrismaHeldBill(heldBillId: string, reason: string | undefined, tenant: TenantContext) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "void_bill");

  return withTenantTransaction({
    action: "POS_HELD_BILL_CANCELLED",
    module: "pos",
    newData: { heldBillId, reason: reason?.trim() || null },
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const updated = await tx.holdBill.updateMany({
        data: {
          cancelReason: reason?.trim() || null,
          cancelledAt: new Date(),
          cancelledByUserId: tenant.userId,
          status: "cancelled",
        },
        where: { branchId: scope.branchId, companyId: tenant.companyId, id: heldBillId, status: "held" },
      });
      if (updated.count !== 1) {
        throw new Error("This held bill has already been resumed or cancelled.");
      }
      return { heldBillId, status: "cancelled" as const };
    },
  });
}
