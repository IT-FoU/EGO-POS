/**
 * In-memory {@link CashSaleGateway} (Phase 6B tests / SSR safety).
 *
 * Simulates the authoritative persistence + atomic commit semantics of the
 * production Prisma gateway so `applyOfflineCashSale` is fully unit-testable in
 * Node: an accepted sale creates exactly one canonical cloud sale + advances the
 * receipt range and leases + records the accepted ledger; a rejection records
 * only a rejected ledger row and never touches the sale/range/lease.
 */

import type {
  AcceptedCommitInput,
  CashSaleGateway,
  CashSaleReconciliation,
  CloudActorView,
  CloudAllocationView,
  CloudCashSessionView,
  CloudDeviceView,
  CloudReceiptRangeView,
  RejectedRecordInput,
  StoredCashSaleResult,
} from "./cash-sale-apply";

interface CloudSaleRecord {
  id: string;
  companyId: string;
  branchId: string;
  warehouseId: string | null;
  saleNo: string;
  receiptNo: string;
  totalLak: number;
  itemIds: string[];
  cashSessionId: string;
  createdBy: string;
}

interface AuditRecord {
  action: string;
  operationId: string;
  status: string;
}

export class InMemoryCashSaleGateway implements CashSaleGateway {
  private ledger = new Map<string, StoredCashSaleResult>();
  private devices = new Map<string, CloudDeviceView>();
  private actors = new Map<string, CloudActorView>();
  private sessions = new Map<string, CloudCashSessionView>();
  private ranges = new Map<string, CloudReceiptRangeView>();
  private allocations = new Map<string, CloudAllocationView>();
  private sales = new Map<string, CloudSaleRecord>();
  private audit: AuditRecord[] = [];
  private saleCounter = 0;

  private key(companyId: string, rest: string): string {
    return `${companyId}::${rest}`;
  }
  private allocKey(companyId: string, deviceId: string, productId: string, lotId: string | null): string {
    return `${companyId}::${deviceId}::${productId}::${lotId ?? ""}`;
  }

  // ---- Seeders (tests) ----
  seedDevice(companyId: string, deviceId: string, device: CloudDeviceView): void {
    this.devices.set(this.key(companyId, deviceId), device);
  }
  seedActor(companyId: string, userId: string, actor: CloudActorView): void {
    this.actors.set(this.key(companyId, userId), actor);
  }
  seedCashSession(companyId: string, session: CloudCashSessionView): void {
    this.sessions.set(this.key(companyId, session.id), session);
  }
  seedReceiptRange(companyId: string, deviceId: string, range: CloudReceiptRangeView): void {
    this.ranges.set(this.key(companyId, deviceId), range);
  }
  seedAllocation(companyId: string, deviceId: string, alloc: CloudAllocationView): void {
    this.allocations.set(this.allocKey(companyId, deviceId, alloc.productId, alloc.lotId), alloc);
  }

  // ---- Inspectors (tests) ----
  saleCount(): number {
    return this.sales.size;
  }
  listSales(): CloudSaleRecord[] {
    return [...this.sales.values()];
  }
  getLedger(companyId: string, operationId: string): StoredCashSaleResult | null {
    return this.ledger.get(this.key(companyId, operationId)) ?? null;
  }
  currentRange(companyId: string, deviceId: string): CloudReceiptRangeView | null {
    return this.ranges.get(this.key(companyId, deviceId)) ?? null;
  }
  currentAllocation(companyId: string, deviceId: string, productId: string, lotId: string | null): CloudAllocationView | null {
    return this.allocations.get(this.allocKey(companyId, deviceId, productId, lotId)) ?? null;
  }
  auditCount(): number {
    return this.audit.length;
  }

  // ---- CashSaleGateway ----
  async getExistingResult(companyId: string, operationId: string): Promise<StoredCashSaleResult | null> {
    return this.ledger.get(this.key(companyId, operationId)) ?? null;
  }

  async getDevice(companyId: string, deviceId: string): Promise<CloudDeviceView | null> {
    return this.devices.get(this.key(companyId, deviceId)) ?? null;
  }

  async getActor(companyId: string, userId: string): Promise<CloudActorView | null> {
    return this.actors.get(this.key(companyId, userId)) ?? null;
  }

  async getCashSession(companyId: string, sessionId: string): Promise<CloudCashSessionView | null> {
    return this.sessions.get(this.key(companyId, sessionId)) ?? null;
  }

  async getReceiptRange(companyId: string, deviceId: string): Promise<CloudReceiptRangeView | null> {
    return this.ranges.get(this.key(companyId, deviceId)) ?? null;
  }

  async getAllocation(
    companyId: string,
    deviceId: string,
    productId: string,
    lotId: string | null,
  ): Promise<CloudAllocationView | null> {
    return this.allocations.get(this.allocKey(companyId, deviceId, productId, lotId)) ?? null;
  }

  async commitAccepted(input: AcceptedCommitInput): Promise<CashSaleReconciliation> {
    const ledgerKey = this.key(input.companyId, input.operationId);
    // Immutable ledger: a committed operation is never re-applied.
    const existing = this.ledger.get(ledgerKey);
    if (existing?.status === "accepted" && existing.result) return existing.result;

    const cloudSaleId = `cloud-sale-${(this.saleCounter += 1)}`;
    const itemIdMap = input.payload.lines.map((line, index) => ({
      localLineId: line.lineId,
      cloudItemId: `${cloudSaleId}:item:${index}`,
    }));

    // Advance the receipt range.
    const range = this.ranges.get(this.key(input.companyId, input.deviceId));
    if (range) {
      this.ranges.set(this.key(input.companyId, input.deviceId), {
        ...range,
        nextValue: input.receiptRangeAdvance.nextValue,
        status: input.receiptRangeAdvance.status as CloudReceiptRangeView["status"],
      });
    }
    // Advance leases.
    for (const advance of input.allocationAdvances) {
      for (const [k, alloc] of this.allocations) {
        if (alloc.id === advance.id) {
          this.allocations.set(k, {
            ...alloc,
            consumedQty: advance.consumedQty,
            baseVersion: advance.baseVersion,
            status: advance.status as CloudAllocationView["status"],
          });
        }
      }
    }

    const receiptNo = input.payload.receiptReference;
    this.sales.set(cloudSaleId, {
      id: cloudSaleId,
      companyId: input.companyId,
      branchId: input.payload.branchId,
      warehouseId: input.payload.warehouseId,
      saleNo: input.payload.saleNo,
      receiptNo,
      totalLak: input.payload.totalLak,
      itemIds: itemIdMap.map((m) => m.cloudItemId),
      cashSessionId: input.payload.cashSessionId,
      createdBy: input.actorUserId,
    });

    const reconciliation: CashSaleReconciliation = {
      status: "accepted",
      localSaleId: input.payload.saleId,
      cloudSaleId,
      saleNo: input.payload.saleNo,
      receiptNo,
      receiptReference: input.payload.receiptReference,
      totalLak: input.payload.totalLak,
      itemIdMap,
    };

    this.audit.push({ action: "offline.operation.accepted", operationId: input.operationId, status: "accepted" });
    this.ledger.set(ledgerKey, { status: "accepted", code: "ok", detail: null, result: reconciliation });
    return reconciliation;
  }

  async recordRejected(input: RejectedRecordInput): Promise<void> {
    const ledgerKey = this.key(input.companyId, input.operationId);
    if (this.ledger.has(ledgerKey)) return; // immutable ledger
    this.audit.push({ action: "offline.operation.rejected", operationId: input.operationId, status: "rejected" });
    this.ledger.set(ledgerKey, { status: "rejected", code: input.code, detail: input.detail, result: null });
  }
}
