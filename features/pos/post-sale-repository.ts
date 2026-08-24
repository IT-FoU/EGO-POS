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
import { returnRemainingSaleCore } from "@/features/pos/return-repository";
import {
  amount,
  getPrismaSaleById,
  loadMutableSale,
  lockSaleForUpdate,
  mapSaleRow,
  postSaleInclude,
  RECENT_SALE_STATUSES,
  resolveCashierName,
} from "@/features/pos/post-sale-shared";
import { prisma } from "@/lib/db/prisma";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";

export { getPrismaSaleById, loadMutableSale, lockSaleForUpdate, mapSaleRow } from "@/features/pos/post-sale-shared";

const db = prisma as any;
const saleInclude = postSaleInclude;

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
      saleStatus: { in: [...RECENT_SALE_STATUSES] },
      ...branchOwnedWhere(scope),
    },
  });

  const rows: PosRecentSaleRecord[] = [];
  for (const sale of sales) {
    const cashierName = await resolveCashierName(db, sale.createdBy);
    const record = mapSaleRow(sale, cashierName);
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

function assertSaleVoidable(sale: Record<string, any>) {
  const status = String(sale.saleStatus);
  if (status === "cancelled") {
    throw new Error("Sale is already voided.");
  }
  if (status === "refunded") {
    throw new Error("Sale is already refunded.");
  }
  if (status !== "completed") {
    throw new Error(`Sale cannot be voided while status is ${status}.`);
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
      await lockSaleForUpdate(tx, tenant, saleId);
      const sale = await loadMutableSale(tx, tenant, saleId);
      assertSaleVoidable(sale);
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
      await lockSaleForUpdate(tx, tenant, saleId);
      const sale = await loadMutableSale(tx, tenant, saleId);
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
  assertSaleVoidable(sale);
  await lockSaleForUpdate(tx, tenant, String(sale.id));
  await restoreSaleStock(tx, tenant, sale, `Void sale ${sale.saleNo}${reason ? `: ${reason}` : ""}`);
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
  return returnRemainingSaleCore(tx, tenant, sale, reason, approvedBy);
}

export function computeCashRefundLakForSale(sale: Record<string, any>, refundAmountLak: number) {
  return computeCashRefundLak(sale.payments ?? [], amount(sale.totalAmount), refundAmountLak);
}
