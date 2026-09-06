/**
 * In-memory offline backend (tests + SSR safety).
 *
 * Simulates IndexedDB semantics closely enough to test the migration runner,
 * atomic commit, outbox ordering, database isolation, and reload persistence:
 *
 * - A module-level "disk" retains each database's data across `close()`/`open()`
 *   so reopening the same name restores committed data (reload persistence).
 * - Distinct database names never share data (isolation).
 * - `transaction` snapshots touched stores and restores them on throw
 *   (all-or-nothing atomicity).
 *
 * This backend is also safe to use on the server / during SSR where IndexedDB
 * does not exist.
 */

import {
  type OfflineBackend,
  type OfflineBackendDatabase,
  type OfflineBackendTransaction,
  type OfflineRecord,
  type TransactionMode,
  LocalDbError,
} from "./backend";

type StoreData = Map<string, OfflineRecord>;
type DiskImage = { version: number; stores: Map<string, StoreData> };

function cloneRecord(record: OfflineRecord): OfflineRecord {
  return structuredCloneSafe(record);
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Isolated in-memory backend. Each instance has its own "disk", so tests do not
 * leak state into one another. Pass a shared instance to simulate persistence
 * across reopen within a single test.
 */
export class MemoryOfflineBackend implements OfflineBackend {
  private readonly disk = new Map<string, DiskImage>();

  async open(
    name: string,
    stores: readonly string[],
    version: number,
  ): Promise<OfflineBackendDatabase> {
    let image = this.disk.get(name);
    if (!image) {
      image = { version, stores: new Map() };
      this.disk.set(name, image);
    }
    image.version = Math.max(image.version, version);
    for (const store of stores) {
      if (!image.stores.has(store)) {
        image.stores.set(store, new Map());
      }
    }
    return new MemoryDatabase(name, stores, image);
  }

  async deleteDatabase(name: string): Promise<void> {
    this.disk.delete(name);
  }
}

class MemoryDatabase implements OfflineBackendDatabase {
  private open = true;

  constructor(
    readonly name: string,
    readonly stores: readonly string[],
    private readonly image: DiskImage,
  ) {}

  async transaction<T>(
    stores: readonly string[],
    _mode: TransactionMode,
    fn: (tx: OfflineBackendTransaction) => Promise<T>,
  ): Promise<T> {
    if (!this.open) {
      throw new LocalDbError("Transaction on a closed database");
    }
    for (const store of stores) {
      if (!this.image.stores.has(store)) {
        throw new LocalDbError(`Unknown object store: ${store}`);
      }
    }

    // Snapshot touched stores for rollback on error (atomicity).
    const snapshot = new Map<string, StoreData>();
    for (const store of stores) {
      const original = this.image.stores.get(store)!;
      const copy: StoreData = new Map();
      for (const [key, value] of original) {
        copy.set(key, cloneRecord(value));
      }
      snapshot.set(store, copy);
    }

    const tx = new MemoryTransaction(this.image, new Set(stores));
    try {
      const result = await fn(tx);
      return result;
    } catch (error) {
      // Roll back all touched stores.
      for (const [store, data] of snapshot) {
        this.image.stores.set(store, data);
      }
      throw error;
    }
  }

  close(): void {
    this.open = false;
  }
}

class MemoryTransaction implements OfflineBackendTransaction {
  constructor(
    private readonly image: DiskImage,
    private readonly allowed: Set<string>,
  ) {}

  private storeOf(store: string): StoreData {
    if (!this.allowed.has(store)) {
      throw new LocalDbError(`Store ${store} not in transaction scope`);
    }
    const data = this.image.stores.get(store);
    if (!data) {
      throw new LocalDbError(`Unknown object store: ${store}`);
    }
    return data;
  }

  async get<T = OfflineRecord>(store: string, id: string): Promise<T | undefined> {
    const record = this.storeOf(store).get(id);
    return record ? (cloneRecord(record) as unknown as T) : undefined;
  }

  async getAll<T = OfflineRecord>(store: string): Promise<T[]> {
    return [...this.storeOf(store).values()].map(
      (record) => cloneRecord(record) as unknown as T,
    );
  }

  async put<T extends { id: string }>(store: string, value: T): Promise<void> {
    if (value.id === undefined || value.id === null || value.id === "") {
      throw new LocalDbError(`Record for store ${store} is missing an id`);
    }
    this.storeOf(store).set(value.id, cloneRecord(value as unknown as OfflineRecord));
  }

  async delete(store: string, id: string): Promise<void> {
    this.storeOf(store).delete(id);
  }

  async clear(store: string): Promise<void> {
    this.storeOf(store).clear();
  }
}
