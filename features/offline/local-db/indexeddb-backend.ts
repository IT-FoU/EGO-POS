/**
 * IndexedDB offline backend (browser runtime).
 *
 * Implements {@link OfflineBackend} over the native IndexedDB API. Object stores
 * are created (never dropped) in `onupgradeneeded`; app-level data migrations are
 * handled separately by the migration runner so store creation and data
 * transformation have independent, testable failure semantics.
 *
 * Atomicity: on error inside a transaction callback we call `tx.abort()`, which
 * rolls the IndexedDB transaction back (all-or-nothing).
 */

import {
  type OfflineBackend,
  type OfflineBackendDatabase,
  type OfflineBackendTransaction,
  type OfflineRecord,
  type TransactionMode,
  LocalDbError,
} from "./backend";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

export class IndexedDbOfflineBackend implements OfflineBackend {
  async open(
    name: string,
    stores: readonly string[],
    version: number,
  ): Promise<OfflineBackendDatabase> {
    if (!isIndexedDbAvailable()) {
      throw new LocalDbError("IndexedDB is not available in this environment");
    }
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const store of stores) {
          if (!database.objectStoreNames.contains(store)) {
            database.createObjectStore(store, { keyPath: "id" });
          }
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new LocalDbError(`Failed to open database ${name}`));
      request.onblocked = () =>
        reject(new LocalDbError(`Opening database ${name} is blocked by another tab`));
    });
    return new IndexedDbDatabase(db, stores);
  }

  async deleteDatabase(name: string): Promise<void> {
    if (!isIndexedDbAvailable()) return;
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new LocalDbError(`Failed to delete database ${name}`));
      request.onblocked = () => resolve();
    });
  }
}

class IndexedDbDatabase implements OfflineBackendDatabase {
  readonly name: string;
  readonly stores: readonly string[];

  constructor(private readonly db: IDBDatabase, stores: readonly string[]) {
    this.name = db.name;
    this.stores = stores;
  }

  transaction<T>(
    stores: readonly string[],
    mode: TransactionMode,
    fn: (tx: OfflineBackendTransaction) => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try {
        tx = this.db.transaction([...stores], mode);
      } catch (error) {
        reject(new LocalDbError("Failed to start IndexedDB transaction", error));
        return;
      }

      let settled = false;
      let result: T;
      let failure: unknown;

      tx.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };
      tx.onabort = () => {
        if (!settled) {
          settled = true;
          reject(failure ?? tx.error ?? new LocalDbError("Transaction aborted"));
        }
      };
      tx.onerror = () => {
        failure = failure ?? tx.error;
      };

      const wrapper = new IndexedDbTransaction(tx);
      fn(wrapper)
        .then((value) => {
          result = value;
          // Let the transaction complete naturally (oncomplete resolves).
        })
        .catch((error) => {
          failure = error;
          try {
            tx.abort();
          } catch {
            // Already inactive/aborted; onabort will reject.
          }
        });
    });
  }

  close(): void {
    this.db.close();
  }
}

class IndexedDbTransaction implements OfflineBackendTransaction {
  constructor(private readonly tx: IDBTransaction) {}

  private storeOf(store: string): IDBObjectStore {
    return this.tx.objectStore(store);
  }

  async get<T = OfflineRecord>(store: string, id: string): Promise<T | undefined> {
    const value = await requestToPromise(this.storeOf(store).get(id));
    return (value ?? undefined) as T | undefined;
  }

  async getAll<T = OfflineRecord>(store: string): Promise<T[]> {
    const values = await requestToPromise(this.storeOf(store).getAll());
    return (values ?? []) as T[];
  }

  async put<T extends { id: string }>(store: string, value: T): Promise<void> {
    await requestToPromise(this.storeOf(store).put(value));
  }

  async delete(store: string, id: string): Promise<void> {
    await requestToPromise(this.storeOf(store).delete(id));
  }

  async clear(store: string): Promise<void> {
    await requestToPromise(this.storeOf(store).clear());
  }
}
