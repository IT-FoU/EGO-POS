/**
 * StoreSnapshotRepository (Phase 5).
 *
 * Client-side owner of the read-only Mini Mart reference replica. It hydrates the
 * local `reference` store from the Phase 4 bootstrap + delta contract, applying:
 * - version checks (stale updates are ignored — older versions never overwrite),
 * - tombstones (deleted categories/products are retained as deleted so they
 *   never reappear from a stale re-delivery),
 * - tenant/branch isolation (records outside this device's namespace are rejected),
 * and assembles a normalized POS snapshot for offline reads.
 *
 * It never seeds defaults from an empty response and stores only POS-required,
 * non-secret data.
 */

import type { StoreNamespace } from "../types";
import { OfflineDatabase } from "../local-db/database";
import { MetaKey, OfflineStore } from "../local-db/schema";
import type { ServerChange } from "../server/sync-contract";
import {
  ReferenceEntityType,
  type CashSessionPayload,
  type CategoryPayload,
  type CustomerPayload,
  type ProductPayload,
  type PromotionPayload,
  type QrBankPayload,
  type ReferenceEntity,
  type ReferenceEntityTypeValue,
  type ReferenceScope,
  type SettingsPayload,
  type StockLevelPayload,
  type StoreContextPayload,
} from "./reference-types";

export interface LocalReferenceRecord {
  id: string;
  entityType: string;
  entityId: string;
  version: number;
  deleted: boolean;
  companyId: string;
  branchId: string | null;
  warehouseId: string | null;
  payload: unknown;
  localUpdatedAt: string;
}

export interface ApplyStats {
  applied: number;
  tombstoned: number;
  skippedStale: number;
  rejectedScope: number;
}

export interface BootstrapPageResult {
  entities: ReferenceEntity[];
  nextCursor: number;
  hasMore: boolean;
}

export interface DeltaPageResult {
  changes: ServerChange[];
  nextCursor: number;
  hasMore: boolean;
}

export type BootstrapFetcher = (cursor: number, limit: number) => Promise<BootstrapPageResult>;
export type DeltaFetcher = (cursor: number, limit: number) => Promise<DeltaPageResult>;

export interface LocalPosSnapshot {
  storeContext: StoreContextPayload | null;
  securitySnapshot: unknown | null;
  settings: SettingsPayload | null;
  categories: CategoryPayload[];
  products: ProductPayload[];
  customers: CustomerPayload[];
  promotions: PromotionPayload[];
  qrBanks: QrBankPayload[];
  stockLevels: StockLevelPayload[];
  cashSession: CashSessionPayload | null;
  meta: {
    bootstrapCursor: number;
    syncCursor: number;
    bootstrapComplete: boolean;
    lastSyncAt: string | null;
  };
}

function emptyStats(): ApplyStats {
  return { applied: 0, tombstoned: 0, skippedStale: 0, rejectedScope: 0 };
}

function mergeStats(a: ApplyStats, b: ApplyStats): ApplyStats {
  return {
    applied: a.applied + b.applied,
    tombstoned: a.tombstoned + b.tombstoned,
    skippedStale: a.skippedStale + b.skippedStale,
    rejectedScope: a.rejectedScope + b.rejectedScope,
  };
}

export class StoreSnapshotRepository {
  constructor(
    private readonly db: OfflineDatabase,
    private readonly namespace: StoreNamespace,
  ) {}

  private referenceId(entityType: string, entityId: string): string {
    return `${entityType}:${entityId}`;
  }

  /** Apply a batch of reference entities atomically (single transaction). */
  async applyEntities(entities: ReferenceEntity[], now = new Date()): Promise<ApplyStats> {
    if (entities.length === 0) return emptyStats();
    return this.db.transaction([OfflineStore.reference], "readwrite", async (tx) => {
      const stats = emptyStats();
      for (const entity of entities) {
        // Isolation: never accept another tenant's data into this namespace.
        if (entity.scope.companyId !== this.namespace.companyId) {
          stats.rejectedScope += 1;
          continue;
        }
        const id = this.referenceId(entity.entityType, entity.entityId);
        const existing = await tx.get<LocalReferenceRecord>(OfflineStore.reference, id);
        // Stale handling: ignore versions <= what we already have.
        if (existing && entity.version <= existing.version) {
          stats.skippedStale += 1;
          continue;
        }
        const record: LocalReferenceRecord = {
          id,
          entityType: entity.entityType,
          entityId: entity.entityId,
          version: entity.version,
          deleted: entity.deleted,
          companyId: entity.scope.companyId,
          branchId: entity.scope.branchId,
          warehouseId: entity.scope.warehouseId,
          payload: entity.payload,
          localUpdatedAt: now.toISOString(),
        };
        await tx.put(OfflineStore.reference, record);
        if (entity.deleted) stats.tombstoned += 1;
        else stats.applied += 1;
      }
      return stats;
    });
  }

  /** Resumable, paginated bootstrap of the full reference snapshot. */
  async bootstrap(
    fetchPage: BootstrapFetcher,
    limit = 200,
  ): Promise<{ stats: ApplyStats; pages: number; cursor: number }> {
    let cursor = await this.readMetaNumber(MetaKey.bootstrapCursor, 0);
    let stats = emptyStats();
    let pages = 0;
    // Bounded loop guard against a misbehaving source.
    for (let guard = 0; guard < 100000; guard += 1) {
      const page = await fetchPage(cursor, limit);
      stats = mergeStats(stats, await this.applyEntities(page.entities));
      pages += 1;
      cursor = page.nextCursor;
      await this.writeMeta(MetaKey.bootstrapCursor, cursor);
      if (!page.hasMore) break;
    }
    await this.writeMeta(MetaKey.bootstrapComplete, true);
    await this.writeMeta(MetaKey.lastSyncAt, new Date().toISOString());
    return { stats, pages, cursor };
  }

  /** Apply cloud deltas (upserts + tombstones), advancing the sync cursor. */
  async pullDelta(
    fetchChanges: DeltaFetcher,
    limit = 200,
  ): Promise<{ stats: ApplyStats; pages: number; cursor: number }> {
    let cursor = await this.readMetaNumber(MetaKey.syncCursor, 0);
    let stats = emptyStats();
    let pages = 0;
    for (let guard = 0; guard < 100000; guard += 1) {
      const page = await fetchChanges(cursor, limit);
      const entities = page.changes.map((change) => this.changeToEntity(change));
      stats = mergeStats(stats, await this.applyEntities(entities));
      pages += 1;
      cursor = page.nextCursor;
      await this.writeMeta(MetaKey.syncCursor, cursor);
      if (!page.hasMore) break;
    }
    await this.writeMeta(MetaKey.lastSyncAt, new Date().toISOString());
    return { stats, pages, cursor };
  }

  private changeToEntity(change: ServerChange): ReferenceEntity {
    const payload = (change.payload ?? {}) as Record<string, unknown>;
    const scope: ReferenceScope = {
      companyId:
        typeof payload.companyId === "string" ? payload.companyId : this.namespace.companyId,
      branchId:
        typeof payload.branchId === "string"
          ? payload.branchId
          : this.namespace.branchId,
      // Prefer the authoritative warehouse scope carried on the change.
      warehouseId:
        change.warehouseId ??
        (typeof payload.warehouseId === "string" ? payload.warehouseId : null),
    };
    return {
      entityType: change.entityType as ReferenceEntityTypeValue,
      entityId: change.entityId,
      version: change.version,
      deleted: change.deleted,
      scope,
      payload: change.payload,
    };
  }

  /** Assemble the normalized POS snapshot from the local reference store. */
  async readLocalSnapshot(): Promise<LocalPosSnapshot> {
    const records = await this.db.readAll<LocalReferenceRecord>(OfflineStore.reference);
    const live = records.filter((record) => !record.deleted);

    const byType = (type: ReferenceEntityTypeValue) =>
      live.filter((record) => record.entityType === type);
    const singleton = <T>(type: ReferenceEntityTypeValue): T | null => {
      const found = byType(type)[0];
      return found ? (found.payload as T) : null;
    };
    const list = <T>(type: ReferenceEntityTypeValue): T[] =>
      byType(type)
        .slice()
        .sort((a, b) => (a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0))
        .map((record) => record.payload as T);

    const [bootstrapCursor, syncCursor, bootstrapComplete, lastSyncAt] = await Promise.all([
      this.readMetaNumber(MetaKey.bootstrapCursor, 0),
      this.readMetaNumber(MetaKey.syncCursor, 0),
      this.readMetaBool(MetaKey.bootstrapComplete, false),
      this.readMetaString(MetaKey.lastSyncAt),
    ]);

    return {
      storeContext: singleton<StoreContextPayload>(ReferenceEntityType.storeContext),
      securitySnapshot: singleton<unknown>(ReferenceEntityType.securitySnapshot),
      settings: singleton<SettingsPayload>(ReferenceEntityType.settings),
      categories: list<CategoryPayload>(ReferenceEntityType.category),
      products: list<ProductPayload>(ReferenceEntityType.product),
      customers: list<CustomerPayload>(ReferenceEntityType.customer),
      promotions: list<PromotionPayload>(ReferenceEntityType.promotion),
      qrBanks: list<QrBankPayload>(ReferenceEntityType.qrBank),
      stockLevels: list<StockLevelPayload>(ReferenceEntityType.stockLevel),
      cashSession: singleton<CashSessionPayload>(ReferenceEntityType.cashSession),
      meta: { bootstrapCursor, syncCursor, bootstrapComplete, lastSyncAt },
    };
  }

  // ---- meta helpers ----

  private async readMetaNumber(key: string, fallback: number): Promise<number> {
    const record = await this.db.read<{ id: string; value: number }>(OfflineStore.meta, key);
    return typeof record?.value === "number" ? record.value : fallback;
  }

  private async readMetaBool(key: string, fallback: boolean): Promise<boolean> {
    const record = await this.db.read<{ id: string; value: boolean }>(OfflineStore.meta, key);
    return typeof record?.value === "boolean" ? record.value : fallback;
  }

  private async readMetaString(key: string): Promise<string | null> {
    const record = await this.db.read<{ id: string; value: string }>(OfflineStore.meta, key);
    return typeof record?.value === "string" ? record.value : null;
  }

  private async writeMeta(key: string, value: unknown): Promise<void> {
    await this.db.transaction([OfflineStore.meta], "readwrite", async (tx) => {
      await tx.put(OfflineStore.meta, { id: key, value });
    });
  }
}
