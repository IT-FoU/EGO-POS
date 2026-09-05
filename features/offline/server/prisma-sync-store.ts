/**
 * Prisma-backed SyncStore (Phase 4, production).
 *
 * Persists the immutable OfflineOperation ledger (idempotency keyed by
 * companyId+operationId) with audit linkage, reads the ordered server-change
 * feed for delta pull, and tracks per-device cursor state. Bootstrap reference
 * data is wired to domain tables in Phase 5; here it returns an empty, correctly
 * paginated page (empty means empty — never seeds defaults).
 */

import { prisma } from "@/lib/db/prisma";
import { assertProductionWritesEnabled } from "@/lib/db/write-context";
import type {
  BootstrapPage,
  ChangesPage,
  CursorState,
  OperationCounts,
  SaveOperationInput,
  StoredOperation,
  SyncStore,
} from "./sync-store";
import type { SyncErrorCodeValue } from "./sync-contract";

const db = prisma as any;

export class PrismaSyncStore implements SyncStore {
  async getOperationResult(companyId: string, operationId: string): Promise<StoredOperation | null> {
    const row = await db.offlineOperation.findUnique({
      where: { companyId_operationId: { companyId, operationId } },
    });
    if (!row) return null;
    return {
      operationId: row.operationId,
      status: row.status as StoredOperation["status"],
      code: row.resultCode as SyncErrorCodeValue,
      detail: row.resultDetail ?? null,
      result: row.result ?? null,
    };
  }

  async saveOperationResult(input: SaveOperationInput): Promise<void> {
    assertProductionWritesEnabled();
    await db.$transaction(async (tx: any) => {
      // Idempotency guard inside the transaction: never overwrite a stored result.
      const existing = await tx.offlineOperation.findUnique({
        where: { companyId_operationId: { companyId: input.companyId, operationId: input.operationId } },
      });
      if (existing) return;

      const audit = await tx.auditLog.create({
        data: {
          action: `offline.operation.${input.status}`,
          companyId: input.companyId,
          module: "offline",
          newData: {
            code: input.code,
            deviceId: input.deviceId,
            operationId: input.operationId,
            operationType: input.operationType,
            status: input.status,
            terminalDeviceId: input.terminalDeviceId,
          },
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
          operationType: input.operationType,
          payloadHash: input.payloadHash,
          processedAt: input.now,
          result: input.result === undefined ? null : (input.result as any),
          resultCode: input.code,
          resultDetail: input.detail,
          sequence: input.sequence,
          status: input.status,
          terminalDeviceId: input.terminalDeviceId,
        },
      });
    });
  }

  async countOperations(companyId: string): Promise<OperationCounts> {
    const grouped = await db.offlineOperation.groupBy({
      by: ["status"],
      where: { companyId },
      _count: { _all: true },
    });
    const counts: OperationCounts = { accepted: 0, rejected: 0, blocked: 0, total: 0 };
    for (const row of grouped as Array<{ status: string; _count: { _all: number } }>) {
      const n = row._count._all;
      counts.total += n;
      if (row.status === "accepted") counts.accepted += n;
      else if (row.status === "rejected") counts.rejected += n;
      else if (row.status === "blocked") counts.blocked += n;
    }
    return counts;
  }

  async latestChangeCursor(companyId: string): Promise<number> {
    const row = await db.offlineServerChange.findFirst({
      orderBy: { seq: "desc" },
      select: { seq: true },
      where: { companyId },
    });
    return row?.seq ?? 0;
  }

  async listChangesSince(companyId: string, cursor: number, limit: number): Promise<ChangesPage> {
    const rows = await db.offlineServerChange.findMany({
      orderBy: { seq: "asc" },
      take: limit + 1,
      where: { companyId, seq: { gt: cursor } },
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = page.length ? page[page.length - 1].seq : cursor;
    return {
      changes: page.map((row: any) => ({
        cursor: row.seq,
        entityType: row.entityType,
        entityId: row.entityId,
        version: row.version,
        deleted: row.deleted,
        payload: row.payload ?? null,
      })),
      hasMore,
      nextCursor,
    };
  }

  async listBootstrapEntities(_companyId: string, cursor: number): Promise<BootstrapPage> {
    // Phase 5 wires reference snapshot data. Empty means empty (never seed).
    return { entities: [], nextCursor: cursor, hasMore: false };
  }

  async getCursorState(companyId: string, deviceId: string): Promise<CursorState> {
    const row = await db.offlineSyncCursor.findUnique({
      where: { companyId_deviceId: { companyId, deviceId } },
    });
    return {
      syncCursor: row?.syncCursor ? Number(row.syncCursor) : 0,
      lastPushAt: row?.lastPushAt ? new Date(row.lastPushAt).toISOString() : null,
      lastPullAt: row?.lastPullAt ? new Date(row.lastPullAt).toISOString() : null,
    };
  }

  async setCursorState(
    companyId: string,
    deviceId: string,
    patch: Partial<CursorState>,
  ): Promise<void> {
    assertProductionWritesEnabled();
    const data: Record<string, unknown> = {};
    if (patch.syncCursor !== undefined) data.syncCursor = String(patch.syncCursor);
    if (patch.lastPushAt !== undefined) data.lastPushAt = patch.lastPushAt ? new Date(patch.lastPushAt) : null;
    if (patch.lastPullAt !== undefined) data.lastPullAt = patch.lastPullAt ? new Date(patch.lastPullAt) : null;

    const device = await db.terminalDevice.findUnique({
      where: { companyId_deviceId: { companyId, deviceId } },
      select: { id: true },
    });

    await db.offlineSyncCursor.upsert({
      create: {
        companyId,
        deviceId,
        terminalDeviceId: device?.id ?? deviceId,
        ...data,
      },
      update: data,
      where: { companyId_deviceId: { companyId, deviceId } },
    });
  }
}
