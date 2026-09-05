/**
 * Prisma-backed {@link CashSaleGateway} (Phase 6B, production).
 *
 * The authoritative server application of an accepted offline CASH sale. It
 * REUSES the existing online sale write path (`writeCompletePrismaSale`) — the
 * same canonical sale/items/cash-payment/stock-movement/receipt/audit logic — so
 * there is NO parallel, weaker sale path. In ONE transaction it also advances the
 * terminal-reserved receipt range + the terminal stock leases and records the
 * accepted OfflineOperation ledger row with the local→cloud id mapping. A
 * rejection records only a rejected ledger row (no sale).
 *
 * Note: this gateway requires the offline Prisma tables + a live database, so it
 * is exercised in production/integration, not the Node unit tests (which use the
 * in-memory gateway). The orchestration + validation it depends on are covered by
 * `applyOfflineCashSale` tests.
 */

import { prisma } from "@/lib/db/prisma";
import { withTenantTransaction, type TenantContext } from "@/lib/db/write-context";
import { writeCompletePrismaSale, type CompletePrismaSaleInput } from "@/features/pos/prisma-repository";
import type {
  AcceptedCommitInput,
  CashSaleGateway,
  CashSaleReconciliation,
  CloudAllocationView,
  CloudCashSessionView,
  CloudDeviceView,
  CloudReceiptRangeView,
  RejectedRecordInput,
  StoredCashSaleResult,
} from "./cash-sale-apply";
import type { SyncErrorCodeValue } from "./sync-contract";

const db = prisma as any;

export class PrismaCashSaleGateway implements CashSaleGateway {
  private async terminalDeviceId(companyId: string, deviceId: string): Promise<string | null> {
    const device = await db.terminalDevice.findUnique({
      where: { companyId_deviceId: { companyId, deviceId } },
      select: { id: true },
    });
    return device?.id ?? null;
  }

  async getExistingResult(companyId: string, operationId: string): Promise<StoredCashSaleResult | null> {
    const row = await db.offlineOperation.findUnique({
      where: { companyId_operationId: { companyId, operationId } },
    });
    if (!row) return null;
    return {
      status: row.status as StoredCashSaleResult["status"],
      code: row.resultCode as SyncErrorCodeValue,
      detail: row.resultDetail ?? null,
      result: (row.result as CashSaleReconciliation | null) ?? null,
    };
  }

  async getDevice(companyId: string, deviceId: string): Promise<CloudDeviceView | null> {
    const row = await db.terminalDevice.findUnique({
      where: { companyId_deviceId: { companyId, deviceId } },
      select: { status: true, policyVersion: true },
    });
    return row ? { status: row.status, policyVersion: row.policyVersion } : null;
  }

  async getCashSession(companyId: string, sessionId: string): Promise<CloudCashSessionView | null> {
    const row = await db.cashSession.findFirst({
      where: { id: sessionId, companyId },
      select: { id: true, companyId: true, branchId: true, cashierId: true, closedAt: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      companyId: row.companyId,
      branchId: row.branchId,
      cashierId: row.cashierId,
      closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
    };
  }

  async getReceiptRange(companyId: string, deviceId: string): Promise<CloudReceiptRangeView | null> {
    const terminalDeviceId = await this.terminalDeviceId(companyId, deviceId);
    if (!terminalDeviceId) return null;
    const row = await db.terminalReceiptRange.findFirst({
      where: { companyId, terminalDeviceId, status: "active" },
      orderBy: { rangeStart: "asc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      prefix: row.prefix,
      rangeStart: row.rangeStart,
      rangeEnd: row.rangeEnd,
      nextValue: row.nextValue,
      status: row.status,
    };
  }

  async getAllocation(
    companyId: string,
    deviceId: string,
    productId: string,
    lotId: string | null,
  ): Promise<CloudAllocationView | null> {
    const terminalDeviceId = await this.terminalDeviceId(companyId, deviceId);
    if (!terminalDeviceId) return null;
    const row = await db.terminalStockAllocation.findFirst({
      where: { companyId, terminalDeviceId, productId, lotId: lotId ?? null, status: "active" },
    });
    if (!row) return null;
    return {
      id: row.id,
      productId: row.productId,
      lotId: row.lotId ?? null,
      allocatedQty: Number(row.allocatedQty),
      consumedQty: Number(row.consumedQty),
      baseVersion: row.baseVersion,
      status: row.status,
      expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    };
  }

  async commitAccepted(input: AcceptedCommitInput): Promise<CashSaleReconciliation> {
    const { payload } = input;
    const tenant: TenantContext = {
      companyId: input.companyId,
      branchId: payload.branchId,
      warehouseId: payload.warehouseId ?? undefined,
      userId: input.actorUserId,
    };

    const saleInput: CompletePrismaSaleInput = {
      branchId: payload.branchId,
      warehouseId: payload.warehouseId ?? "",
      cashAmount: payload.payment.paidCashLak,
      changeAmount: payload.payment.changeLak,
      customerId: payload.customerId ?? undefined,
      discountAmount: payload.discountTotalLak,
      discountPercent: 0,
      items: payload.lines.map((line) => ({
        productId: line.productId,
        unitId: line.unitId ?? undefined,
        quantity: line.quantity,
        sellingPrice: line.unitPriceLak,
        conversionQty: line.conversionQty,
      })),
      paymentMode: "cash",
      qrAmount: 0,
      cardAmount: 0,
      transferAmount: 0,
      saleNo: payload.saleNo,
      taxAmount: payload.taxAmountLak,
      taxRate: payload.taxRatePercent,
      totalAmount: payload.totalLak,
    };

    return withTenantTransaction({
      action: "offline.sale.apply",
      module: "offline",
      newData: { operationId: input.operationId, receiptReference: payload.receiptReference },
      tenant,
      write: async (tx) => {
        // 1) Canonical sale via the EXISTING online write path (reused, not forked).
        const sale = await writeCompletePrismaSale(tx, saleInput, tenant);

        // 2) Advance the terminal-reserved receipt range (optimistic on cursor).
        await tx.terminalReceiptRange.update({
          where: { id: input.receiptRangeAdvance.id },
          data: {
            nextValue: input.receiptRangeAdvance.nextValue,
            status: input.receiptRangeAdvance.status,
          },
        });

        // 3) Advance the terminal stock leases (optimistic base version).
        for (const advance of input.allocationAdvances) {
          await tx.terminalStockAllocation.update({
            where: { id: advance.id },
            data: {
              consumedQty: advance.consumedQty,
              baseVersion: advance.baseVersion,
              status: advance.status,
            },
          });
        }

        // 4) Reconciliation mapping (local -> canonical cloud ids).
        const itemIdMap = payload.lines.map((line, index) => ({
          localLineId: line.lineId,
          cloudItemId: sale.items?.[index]?.id ?? `${sale.id}:item:${index}`,
        }));
        const reconciliation: CashSaleReconciliation = {
          status: "accepted",
          localSaleId: payload.saleId,
          cloudSaleId: sale.id,
          saleNo: sale.saleNo,
          receiptNo: sale.receiptNo ?? `RCPT-${sale.saleNo}`,
          receiptReference: payload.receiptReference,
          totalLak: Number(sale.totalAmount),
          itemIdMap,
        };

        // 5) Immutable accepted ledger row + audit linkage, in the SAME tx.
        const audit = await tx.auditLog.create({
          data: {
            action: "offline.operation.accepted",
            companyId: input.companyId,
            module: "offline",
            newData: { operationId: input.operationId, cloudSaleId: sale.id },
            userId: input.actorUserId,
          },
        });
        await tx.offlineOperation.create({
          data: {
            actorUserId: input.actorUserId,
            auditLogId: audit.id,
            companyId: input.companyId,
            deviceId: input.deviceId,
            operationId: input.operationId,
            operationType: "pos.sale.complete",
            payloadHash: null,
            processedAt: new Date(),
            result: reconciliation as unknown as Record<string, unknown>,
            resultCode: "ok",
            resultDetail: null,
            sequence: 0,
            status: "accepted",
            terminalDeviceId: (await this.terminalDeviceId(input.companyId, input.deviceId)) ?? input.deviceId,
          },
        });

        return reconciliation;
      },
    });
  }

  async recordRejected(input: RejectedRecordInput): Promise<void> {
    await withTenantTransaction({
      action: "offline.operation.rejected",
      module: "offline",
      newData: { operationId: input.operationId, code: input.code, detail: input.detail },
      tenant: { companyId: input.companyId, userId: input.actorUserId },
      write: async (tx) => {
        const existing = await tx.offlineOperation.findUnique({
          where: { companyId_operationId: { companyId: input.companyId, operationId: input.operationId } },
        });
        if (existing) return;
        await tx.offlineOperation.create({
          data: {
            actorUserId: input.actorUserId,
            companyId: input.companyId,
            deviceId: input.deviceId,
            operationId: input.operationId,
            operationType: input.operationType,
            payloadHash: input.payloadHash,
            processedAt: new Date(),
            result: null,
            resultCode: input.code,
            resultDetail: input.detail,
            sequence: 0,
            status: "rejected",
            terminalDeviceId: (await this.terminalDeviceId(input.companyId, input.deviceId)) ?? input.deviceId,
          },
        });
      },
    });
  }
}
