/**
 * SyncStore abstraction (Phase 4).
 *
 * The sync engine depends on this interface, not Prisma directly, so the full
 * push/pull/bootstrap/idempotency behavior is deterministically testable in Node
 * (via {@link InMemorySyncStore}) while production uses the Prisma-backed store.
 */

import type { CommandResultStatus, ServerChange, SyncErrorCodeValue } from "./sync-contract";

export interface StoredOperation {
  operationId: string;
  status: Exclude<CommandResultStatus, "retryable">; // persisted result is terminal
  code: SyncErrorCodeValue;
  detail: string | null;
  result: unknown;
}

export interface SaveOperationInput {
  companyId: string;
  operationId: string;
  deviceId: string;
  terminalDeviceId: string | null;
  actorUserId: string;
  operationType: string;
  sequence: number;
  payloadHash: string | null;
  status: StoredOperation["status"];
  code: SyncErrorCodeValue;
  detail: string | null;
  result: unknown;
  now: Date;
}

export interface OperationCounts {
  accepted: number;
  rejected: number;
  blocked: number;
  total: number;
}

export interface CursorState {
  syncCursor: number;
  lastPushAt: string | null;
  lastPullAt: string | null;
}

export interface ChangesPage {
  changes: ServerChange[];
  nextCursor: number;
  hasMore: boolean;
}

export interface BootstrapPage {
  entities: Array<{ entityType: string; entityId: string; version: number; payload: unknown }>;
  nextCursor: number;
  hasMore: boolean;
}

export interface SyncStore {
  getOperationResult(companyId: string, operationId: string): Promise<StoredOperation | null>;
  saveOperationResult(input: SaveOperationInput): Promise<void>;
  countOperations(companyId: string): Promise<OperationCounts>;
  latestChangeCursor(companyId: string): Promise<number>;
  /**
   * Changes since `cursor`, ordered by cursor. When `branchIds` is provided,
   * only company-wide changes (branchId null) and changes for those branches are
   * returned (cross-branch isolation). Omit for no branch filter (Phase 4 default).
   */
  listChangesSince(
    companyId: string,
    cursor: number,
    limit: number,
    branchIds?: string[],
    warehouseIds?: string[],
  ): Promise<ChangesPage>;
  listBootstrapEntities(companyId: string, cursor: number, limit: number): Promise<BootstrapPage>;
  getCursorState(companyId: string, deviceId: string): Promise<CursorState>;
  setCursorState(companyId: string, deviceId: string, patch: Partial<CursorState>): Promise<void>;
}

// ---- In-memory implementation (tests / SSR safety) ----

interface MemoryChange extends ServerChange {
  companyId: string;
  branchId: string | null;
}

interface MemoryBootstrapEntity {
  companyId: string;
  entityType: string;
  entityId: string;
  version: number;
  payload: unknown;
}

export class InMemorySyncStore implements SyncStore {
  private operations = new Map<string, StoredOperation>();
  private changes: MemoryChange[] = [];
  private bootstrap: MemoryBootstrapEntity[] = [];
  private cursors = new Map<string, CursorState>();

  private opKey(companyId: string, operationId: string): string {
    return `${companyId}::${operationId}`;
  }

  /** Test seam: seed the server change feed. */
  seedChange(
    companyId: string,
    change: Omit<ServerChange, "cursor">,
    branchId: string | null = null,
    warehouseId: string | null = null,
  ): number {
    const cursor = this.changes.length + 1;
    this.changes.push({
      ...change,
      companyId,
      branchId,
      warehouseId: change.warehouseId ?? warehouseId,
      cursor,
    });
    return cursor;
  }

  /** Test seam: seed bootstrap reference entities. */
  seedBootstrapEntity(entity: MemoryBootstrapEntity): void {
    this.bootstrap.push(entity);
  }

  async getOperationResult(companyId: string, operationId: string): Promise<StoredOperation | null> {
    return this.operations.get(this.opKey(companyId, operationId)) ?? null;
  }

  async saveOperationResult(input: SaveOperationInput): Promise<void> {
    const key = this.opKey(input.companyId, input.operationId);
    if (this.operations.has(key)) return; // immutable ledger: never overwrite
    this.operations.set(key, {
      code: input.code,
      detail: input.detail,
      operationId: input.operationId,
      result: input.result,
      status: input.status,
    });
  }

  async countOperations(companyId: string): Promise<OperationCounts> {
    const counts: OperationCounts = { accepted: 0, rejected: 0, blocked: 0, total: 0 };
    for (const [key, op] of this.operations) {
      if (!key.startsWith(`${companyId}::`)) continue;
      counts.total += 1;
      counts[op.status] += 1;
    }
    return counts;
  }

  async latestChangeCursor(companyId: string): Promise<number> {
    let max = 0;
    for (const change of this.changes) {
      if (change.companyId === companyId && change.cursor > max) max = change.cursor;
    }
    return max;
  }

  async listChangesSince(
    companyId: string,
    cursor: number,
    limit: number,
    branchIds?: string[],
    warehouseIds?: string[],
  ): Promise<ChangesPage> {
    const pending = this.changes
      .filter((change) => change.companyId === companyId && change.cursor > cursor)
      .filter(
        (change) =>
          !branchIds || change.branchId === null || branchIds.includes(change.branchId),
      )
      .filter((change) => {
        const wh = change.warehouseId ?? null;
        return !warehouseIds || wh === null || warehouseIds.includes(wh);
      })
      .sort((a, b) => a.cursor - b.cursor);
    const page = pending.slice(0, limit);
    const hasMore = pending.length > page.length;
    const nextCursor = page.length ? page[page.length - 1].cursor : cursor;
    return {
      changes: page.map(({ companyId: _c, branchId: _b, ...rest }) => rest),
      hasMore,
      nextCursor,
    };
  }

  async listBootstrapEntities(companyId: string, cursor: number, limit: number): Promise<BootstrapPage> {
    const all = this.bootstrap
      .filter((entity) => entity.companyId === companyId)
      .sort((a, b) =>
        a.entityType === b.entityType
          ? a.entityId < b.entityId
            ? -1
            : a.entityId > b.entityId
              ? 1
              : 0
          : a.entityType < b.entityType
            ? -1
            : 1,
      );
    const page = all.slice(cursor, cursor + limit);
    const nextCursor = cursor + page.length;
    const hasMore = nextCursor < all.length;
    return {
      entities: page.map((entity) => ({
        entityId: entity.entityId,
        entityType: entity.entityType,
        payload: entity.payload,
        version: entity.version,
      })),
      hasMore,
      nextCursor,
    };
  }

  async getCursorState(companyId: string, deviceId: string): Promise<CursorState> {
    return (
      this.cursors.get(`${companyId}::${deviceId}`) ?? {
        syncCursor: 0,
        lastPushAt: null,
        lastPullAt: null,
      }
    );
  }

  async setCursorState(
    companyId: string,
    deviceId: string,
    patch: Partial<CursorState>,
  ): Promise<void> {
    const key = `${companyId}::${deviceId}`;
    const current = this.cursors.get(key) ?? { syncCursor: 0, lastPushAt: null, lastPullAt: null };
    this.cursors.set(key, { ...current, ...patch });
  }
}
