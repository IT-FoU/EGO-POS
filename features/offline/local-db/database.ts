/**
 * OfflineDatabase (tasks Phase 1).
 *
 * High-level, namespace-isolated handle over a {@link OfflineBackend}. Opens the
 * per-company+branch+terminal database, ensures stores exist, runs schema
 * migrations (failure preserves data + surfaces a recovery state), and exposes
 * typed read/transaction helpers plus a monotonic per-device sequence.
 */

import type { StoreNamespace } from "../types";
import {
  type OfflineBackend,
  type OfflineBackendDatabase,
  type OfflineBackendTransaction,
  type OfflineRecord,
  type TransactionMode,
} from "./backend";
import { IndexedDbOfflineBackend } from "./indexeddb-backend";
import { type Migration, runMigrations, SCHEMA_MIGRATIONS } from "./migrations";
import {
  ALL_STORES,
  CURRENT_SCHEMA_VERSION,
  MetaKey,
  offlineDatabaseName,
  OfflineStore,
  STRUCTURAL_VERSION,
  type OfflineStoreName,
} from "./schema";

export interface OpenOfflineDatabaseOptions {
  namespace: StoreNamespace;
  /** Defaults to the IndexedDB backend (browser). Tests inject a memory backend. */
  backend?: OfflineBackend;
  /** Defaults to {@link SCHEMA_MIGRATIONS}. */
  migrations?: readonly Migration[];
  /** Defaults to {@link CURRENT_SCHEMA_VERSION}. */
  schemaVersion?: number;
  /** Defaults to {@link ALL_STORES}. */
  stores?: readonly string[];
  /** Defaults to {@link STRUCTURAL_VERSION}. */
  structuralVersion?: number;
}

export class OfflineDatabase {
  private constructor(
    readonly namespace: StoreNamespace,
    readonly name: string,
    readonly schemaVersion: number,
    private readonly db: OfflineBackendDatabase,
  ) {}

  static async open(options: OpenOfflineDatabaseOptions): Promise<OfflineDatabase> {
    const backend = options.backend ?? new IndexedDbOfflineBackend();
    const stores = options.stores ?? ALL_STORES;
    const structuralVersion = options.structuralVersion ?? STRUCTURAL_VERSION;
    const name = offlineDatabaseName(options.namespace);

    const db = await backend.open(name, stores, structuralVersion);

    // Runs migrations; on failure throws LocalDbMigrationError (data preserved).
    const schemaVersion = await runMigrations(
      db,
      options.migrations ?? SCHEMA_MIGRATIONS,
      options.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    );

    // Stamp namespace + createdAt once (idempotent).
    await db.transaction([OfflineStore.meta], "readwrite", async (tx) => {
      const existing = await tx.get(OfflineStore.meta, MetaKey.namespace);
      if (!existing) {
        await tx.put(OfflineStore.meta, {
          id: MetaKey.namespace,
          value: options.namespace,
        });
        await tx.put(OfflineStore.meta, {
          id: MetaKey.createdAt,
          value: new Date().toISOString(),
        });
      }
    });

    return new OfflineDatabase(options.namespace, name, schemaVersion, db);
  }

  get stores(): readonly string[] {
    return this.db.stores;
  }

  transaction<T>(
    stores: readonly string[],
    mode: TransactionMode,
    fn: (tx: OfflineBackendTransaction) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(stores, mode, fn);
  }

  read<T = OfflineRecord>(store: OfflineStoreName, id: string): Promise<T | undefined> {
    return this.db.transaction([store], "readonly", (tx) => tx.get<T>(store, id));
  }

  readAll<T = OfflineRecord>(store: OfflineStoreName): Promise<T[]> {
    return this.db.transaction([store], "readonly", (tx) => tx.getAll<T>(store));
  }

  /** Current app-level schema version recorded in meta. */
  async getSchemaVersion(): Promise<number> {
    const record = await this.read<{ id: string; value: number }>(
      OfflineStore.meta,
      MetaKey.schemaVersion,
    );
    return typeof record?.value === "number" ? record.value : 0;
  }

  /**
   * Atomically read-and-increment the monotonic per-device sequence within an
   * existing transaction. Must be called inside a readwrite transaction that
   * includes the meta store so sequence allocation is atomic with the write.
   */
  static async nextSequence(tx: OfflineBackendTransaction): Promise<number> {
    const record = await tx.get<{ id: string; value: number }>(
      OfflineStore.meta,
      MetaKey.sequence,
    );
    const next = (typeof record?.value === "number" ? record.value : 0) + 1;
    await tx.put(OfflineStore.meta, { id: MetaKey.sequence, value: next });
    return next;
  }

  close(): void {
    this.db.close();
  }
}
