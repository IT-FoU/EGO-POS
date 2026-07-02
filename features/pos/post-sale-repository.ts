import { reverseSaleLoyalty } from "@/features/loyalty/loyalty-service";
import { computeCashRefundLak } from "@/features/cash-sessions/cash-session-calculator";
import { createApprovalRequest } from "@/features/approvals/approval-engine";
import { applyAtomicStockDelta } from "@/features/inventory/stock-concurrency";
import type {
  PosRecentSaleRecord,
  PosReceiptSnapshot,
  PostSaleMutationResult,
} from "@/features/pos/post-sale-types";
import type { StoreManagerPinApprovalResult } from "@/lib/auth/store-manager-approval";
import {
  assertPosActionAllowed,
  buildPosPolicyForTenant,
} from "@/features/pos/pos-permission-guard";
import { evaluatePosPermission, type PosPermissionAction } from "@/features/pos/permissions";
import type { PaymentMode } from "@/features/pos/types";
import { prisma } from "@/lib/db/prisma";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";

const db = prisma as any;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferPaymentMode(payments: Array<{ paymentMethod: string }>): PaymentMode {
  if (payments.length === 0) {
    return "cash";
  }
  const methods = new Set(payments.map((payment) => payment.paymentMethod));
  if (methods.size > 1) {
    return "mixed";
  }
  const method = payments[0]?.paymentMethod;
  if (method === "transfer") return "transfer";
  if (method === "qr") return "qr";
  if (method === "visa" || method === "mastercard") return "card";
  return "cash";
}

function mapDbSaleStatus(status: string, hasPartialRefund: boolean): PosRecentSaleRecord["status"] {
  if (status === "cancelled") return "voided";
  if (status === "refunded") return "refunded";
  if (hasPartialRefund) return "partial_refunded";
  return "paid";
}

async function resolveCashierName(tx: Record<string, any>, userId: string | null | undefined) {
  if (!userId) {
    return "Cashier";
  }
  const user = await tx.user.findFirst({
    select: { fullName: true, username: true },
    where: { id: userId },
  });
  return String(user?.fullName ?? user?.username ?? "Cashier");
}

function mapSaleRow(
  sale: Record<string, any>,
  cashierName: string,
  hasPartialRefund = false,
): PosRecentSaleRecord {
  const payments = sale.payments ?? [];
  const paidAmount = payments.reduce((total: number, payment: Record<string, any>) => total + amount(payment.amount), 0);
  return {
    branchId: String(sale.branchId),
    cashierName,
    changeAmount: amount(sale.changeAmount),
    createdAt: new Date(sale.createdAt).toISOString(),
    customerId: sale.customerId ? String(sale.customerId) : undefined,
    customerName: sale.customer?.fullName || "Guest",
    customerPhone: sale.customer?.phone ? String(sale.customer.phone) : undefined,
    discountAmount: amount(sale.discountAmount),
    discountPercent: amount(sale.discountPercent),
    id: String(sale.id),
    items: (sale.items ?? []).map((item: Record<string, any>) => ({
      conversionQty: amount(item.unit?.conversionQty) || 1,
      id: String(item.productId),
      nameEn: String(item.product?.nameEn ?? item.product?.nameLo ?? "Item"),
      nameLo: String(item.product?.nameLo ?? item.product?.nameEn ?? "Item"),
      priceLak: amount(item.sellingPrice),
      quantity: amount(item.quantity),
      unitId: item.unitId ? String(item.unitId) : undefined,
      unitName: item.unit?.unitName ? String(item.unit.unitName) : undefined,
    })),
    paidAmount,
    paymentMode: inferPaymentMode(payments),
    receiptNo: sale.receiptNo ? String(sale.receiptNo) : `RCPT-${sale.saleNo}`,
    saleNo: String(sale.saleNo),
    status: mapDbSaleStatus(String(sale.saleStatus), hasPartialRefund),
    subtotal: amount(sale.subtotal),
    taxAmount: amount(sale.taxAmount),
    timeline: [{ at: new Date(sale.createdAt).toISOString(), label: "Created", user: cashierName }],
    totalAmount: amount(sale.totalAmount),
    warehouseId: String(sale.warehouseId),
  };
}

const saleInclude = {
  customer: { select: { fullName: true, phone: true } },
  items: {
    include: {
      product: { select: { nameEn: true, nameLo: true } },
      unit: { select: { conversionQty: true, unitName: true } },
    },
  },
  payments: true,
  refunds: { select: { id: true, totalAmount: true } },
};

export async function listPrismaRecentSales(
  tenant: TenantContext,
  filters: { limit?: number; search?: string } = {},
) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "view_recent_sales");

  const scope = await resolveTenantScope(tenant);
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const search = String(filters.search ?? "").trim().toLowerCase();

  const sales = await db.sale.findMany({
    include: saleInclude,
    orderBy: { createdAt: "desc" },
    take: limit,
    where: {
      companyId: tenant.companyId,
      saleStatus: { in: ["completed", "cancelled", "refunded"] },
      ...branchOwnedWhere(scope),
    },
  });

  const rows: PosRecentSaleRecord[] = [];
  for (const sale of sales) {
    const cashierName = await resolveCashierName(db, sale.createdBy);
    const refundedTotal = (sale.refunds ?? []).reduce(
      (total: number, refund: Record<string, any>) => total + amount(refund.totalAmount),
      0,
    );
    const hasPartialRefund =
      String(sale.saleStatus) === "completed" && refundedTotal > 0 && refundedTotal < amount(sale.totalAmount);
    const record = mapSaleRow(sale, cashierName, hasPartialRefund);
    if (search) {
      const haystack = [
        record.saleNo,
        record.receiptNo,
        record.customerName,
        record.customerPhone,
        record.cashierName,
        record.paymentMode,
        ...record.items.map((item) => item.nameEn),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) {
        continue;
      }
    }
    rows.push(record);
  }
  return rows;
}

export async function getPrismaSaleById(tenant: TenantContext, saleId: string) {
  const scope = await resolveTenantScope(tenant);
  const sale = await db.sale.findFirst({
    include: saleInclude,
    where: {
      companyId: tenant.companyId,
      id: saleId,
      ...branchOwnedWhere(scope),
    },
  });
  if (!sale) {
    return null;
  }
  const cashierName = await resolveCashierName(db, sale.createdBy);
  const refundedTotal = (sale.refunds ?? []).reduce(
    (total: number, refund: Record<string, any>) => total + amount(refund.totalAmount),
    0,
  );
  const hasPartialRefund =
    String(sale.saleStatus) === "completed" && refundedTotal > 0 && refundedTotal < amount(sale.totalAmount);
  return mapSaleRow(sale, cashierName, hasPartialRefund);
}

export async function getPrismaSaleReceipt(
  tenant: TenantContext,
  saleId: string,
  context: { branchName: string; cashierName: string; showTaxOnReceipt: boolean },
) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "view_receipt");

  const sale = await getPrismaSaleById(tenant, saleId);
  if (!sale) {
    throw new Error("Sale was not found.");
  }

  const receipt: PosReceiptSnapshot = {
    branchName: context.branchName,
    cartItems: sale.items,
    cashierName: sale.cashierName || context.cashierName,
    changeAmount: sale.changeAmount,
    createdAt: sale.createdAt,
    customerName: sale.customerName,
    discountTotal: sale.discountAmount,
    paidAmount: sale.paidAmount,
    paymentMode: sale.paymentMode,
    receiptNo: sale.receiptNo,
    saleNo: sale.saleNo,
    showTaxOnReceipt: context.showTaxOnReceipt,
    subtotal: sale.subtotal,
    taxAmount: sale.taxAmount,
    totalAmount: sale.totalAmount,
  };
  return receipt;
}

export async function logPrismaReceiptReprint(tenant: TenantContext, saleId: string) {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "reprint_receipt");

  return withTenantTransaction({
    action: "reprint",
    module: "pos",
    newData: { saleId },
    tenant,
    write: async (tx) => {
      const sale = await loadMutableSale(tx, tenant, saleId);
      return { receiptNo: sale.receiptNo ?? `RCPT-${sale.saleNo}`, saleId: sale.id, saleNo: sale.saleNo };
    },
  });
}

async function loadMutableSale(tx: Record<string, any>, tenant: TenantContext, saleId: string) {
  const scope = await resolveTenantScope(tenant, tx);
  const sale = await tx.sale.findFirst({
    include: {
      ...saleInclude,
      payments: true,
    },
    where: {
      companyId: tenant.companyId,
      id: saleId,
      ...branchOwnedWhere(scope),
    },
  });
  if (!sale) {
    throw new Error("Sale was not found.");
  }
  return sale;
}

function assertSaleMutable(sale: Record<string, any>) {
  const status = String(sale.saleStatus);
  if (status === "cancelled") {
    throw new Error("Sale is already voided.");
  }
  if (status === "refunded") {
    throw new Error("Sale is already refunded.");
  }
  if (status !== "completed") {
    throw new Error(`Sale cannot be modified while status is ${status}.`);
  }
  if ((sale.refunds ?? []).length > 0) {
    throw new Error("Sale already has a refund record.");
  }
}

async function getBaseQuantity(item: Record<string, any>) {
  const conversion = amount(item.unit?.conversionQty) || 1;
  return amount(item.quantity) * conversion;
}

async function restoreSaleStock(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  note: string,
) {
  const runningQtyByProduct = new Map<string, number>();

  for (const item of sale.items ?? []) {
    const baseQuantity = await getBaseQuantity(item);
    const balance = await applyAtomicStockDelta(tx, {
      companyId: tenant.companyId,
      productId: String(item.productId),
      quantityDelta: baseQuantity,
      warehouseId: String(sale.warehouseId),
    });
    runningQtyByProduct.set(String(item.productId), balance.beforeQty);
  }

  for (const item of sale.items ?? []) {
    const productId = String(item.productId);
    const baseQuantity = await getBaseQuantity(item);
    const beforeQty = runningQtyByProduct.get(productId) ?? 0;
    const afterQty = beforeQty + baseQuantity;

    await tx.stockMovement.create({
      data: {
        afterQty,
        beforeQty,
        companyId: tenant.companyId,
        createdBy: tenant.userId,
        movementType: "return",
        note,
        productId,
        quantity: baseQuantity,
        referenceId: sale.id,
        referenceType: "sale",
        unitId: item.unitId,
        warehouseId: sale.warehouseId,
      },
    });

    runningQtyByProduct.set(productId, afterQty);
  }
}

async function reverseSalePromotions(tx: Record<string, any>, sale: Record<string, any>) {
  const usages = await tx.promotionUsage.findMany({ where: { saleId: sale.id } });
  for (const usage of usages) {
    const discountLak = amount(usage.discountAmountLak);
    await tx.promotion.update({
      data: {
        totalDiscountLak: { decrement: discountLak },
        usageCount: { decrement: 1 },
      },
      where: { id: usage.promotionId },
    });
    await tx.promotionUsage.delete({ where: { id: usage.id } });
  }
}

async function getNextRefundNo(tx: Record<string, any>, companyId: string) {
  const count = await tx.refund.count({ where: { companyId } });
  return `RFND-${Date.now()}-${count + 1}`;
}

async function assertPostSalePermission(
  tenant: TenantContext,
  action: Extract<PosPermissionAction, "void_bill" | "refund_bill">,
  amountLak: number,
) {
  const policy = await buildPosPolicyForTenant(tenant);
  const decision = evaluatePosPermission(policy, action, { amountLak });
  if (decision.allowed) {
    return { pendingApproval: false as const, policy };
  }
  if (decision.approvalRequired) {
    return { pendingApproval: true as const, policy, reason: decision.reason };
  }
  throw new PermissionDeniedError(`pos.${action}${decision.reason ? ` — ${decision.reason}` : ""}`);
}

export async function voidPrismaSale(
  tenant: TenantContext,
  input: { managerPinApproval?: StoreManagerPinApprovalResult | null; reason?: string; saleId: string },
): Promise<PostSaleMutationResult> {
  const saleId = String(input.saleId).trim();
  if (!saleId) {
    throw new Error("Sale id is required.");
  }

  const preview = await getPrismaSaleById(tenant, saleId);
  if (!preview) {
    throw new Error("Sale was not found.");
  }

  if (!input.managerPinApproval) {
    const permission = await assertPostSalePermission(tenant, "void_bill", preview.totalAmount);
    if (permission.pendingApproval) {
      const approval = await createApprovalRequest(
        {
          action: "void_sale",
          amountLak: preview.totalAmount,
          branchId: preview.branchId,
          module: "pos",
          payload: { reason: input.reason ?? null, saleId },
          reason: permission.reason ?? "Void sale requires approval.",
          referenceId: saleId,
          ruleKey: "refund",
        },
        tenant,
      );
      return { approvalId: approval.id, sale: preview, status: "pending_approval" };
    }
  }

  return withTenantTransaction({
    action: "void",
    module: "pos",
    newData: input,
    tenant,
    write: async (tx) => {
      const sale = await loadMutableSale(tx, tenant, saleId);
      assertSaleMutable(sale);
      await voidSaleCore(tx, tenant, sale, input.reason, input.managerPinApproval?.approvedById ?? null);
      const cashierName = await resolveCashierName(tx, sale.createdBy);
      return {
        sale: mapSaleRow(
          await tx.sale.findFirstOrThrow({ include: saleInclude, where: { id: sale.id } }),
          cashierName,
        ),
        status: "completed" as const,
      };
    },
  });
}

export async function refundPrismaSale(
  tenant: TenantContext,
  input: { managerPinApproval?: StoreManagerPinApprovalResult | null; reason?: string; saleId: string },
): Promise<PostSaleMutationResult> {
  const saleId = String(input.saleId).trim();
  if (!saleId) {
    throw new Error("Sale id is required.");
  }

  const preview = await getPrismaSaleById(tenant, saleId);
  if (!preview) {
    throw new Error("Sale was not found.");
  }

  if (!input.managerPinApproval) {
    const permission = await assertPostSalePermission(tenant, "refund_bill", preview.totalAmount);
    if (permission.pendingApproval) {
      const approval = await createApprovalRequest(
        {
          action: "refund_sale",
          amountLak: preview.totalAmount,
          branchId: preview.branchId,
          module: "pos",
          payload: { reason: input.reason ?? null, saleId },
          reason: permission.reason ?? "Refund requires approval.",
          referenceId: saleId,
          ruleKey: "refund",
        },
        tenant,
      );
      return { approvalId: approval.id, sale: preview, status: "pending_approval" };
    }
  }

  return withTenantTransaction({
    action: "refund",
    module: "pos",
    newData: input,
    tenant,
    write: async (tx) => {
      const sale = await loadMutableSale(tx, tenant, saleId);
      assertSaleMutable(sale);
      await refundSaleCore(tx, tenant, sale, input.reason, input.managerPinApproval?.approvedById ?? null);
      const cashierName = await resolveCashierName(tx, sale.createdBy);
      return {
        sale: mapSaleRow(
          await tx.sale.findFirstOrThrow({ include: saleInclude, where: { id: sale.id } }),
          cashierName,
        ),
        status: "completed" as const,
      };
    },
  });
}

export async function voidSaleCore(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  reason?: string | null,
  approvedBy?: string | null,
) {
  assertSaleMutable(sale);
  await restoreSaleStock(tx, tenant, sale, `Void sale ${sale.saleNo}`);
  await reverseSaleLoyalty(tx, sale);
  await reverseSalePromotions(tx, sale);

  await tx.sale.update({
    data: {
      paymentStatus: "voided",
      saleStatus: "cancelled",
    },
    where: { id: sale.id },
  });

  return tx.sale.findFirstOrThrow({ include: saleInclude, where: { id: sale.id } });
}

export async function refundSaleCore(
  tx: Record<string, any>,
  tenant: TenantContext,
  sale: Record<string, any>,
  reason?: string | null,
  approvedBy?: string | null,
) {
  assertSaleMutable(sale);
  const refundNo = await getNextRefundNo(tx, tenant.companyId);
  const totalAmount = amount(sale.totalAmount);

  await tx.refund.create({
    data: {
      approvedBy: approvedBy ?? tenant.userId,
      companyId: tenant.companyId,
      createdBy: tenant.userId,
      items: {
        create: (sale.items ?? []).map((item: Record<string, any>) => ({
          amount: amount(item.totalAmount),
          productId: String(item.productId),
          quantity: amount(item.quantity),
        })),
      },
      reason: reason ?? null,
      refundNo,
      saleId: sale.id,
      totalAmount,
    },
  });

  await restoreSaleStock(tx, tenant, sale, `Refund sale ${sale.saleNo}`);
  await reverseSaleLoyalty(tx, sale);
  await reverseSalePromotions(tx, sale);

  await tx.sale.update({
    data: {
      paymentStatus: "refunded",
      saleStatus: "refunded",
    },
    where: { id: sale.id },
  });

  return tx.sale.findFirstOrThrow({ include: saleInclude, where: { id: sale.id } });
}

export function computeCashRefundLakForSale(sale: Record<string, any>, refundAmountLak: number) {
  return computeCashRefundLak(sale.payments ?? [], amount(sale.totalAmount), refundAmountLak);
}
