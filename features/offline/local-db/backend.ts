/**
 * Local database backend abstraction (tasks Phase 1).
 *
 * The Mini Mart offline store uses IndexedDB in the browser. To keep the
 * higher-level logic (schema migrations, outbox, atomic commit) fully testable
 * in Node without a browser, all storage goes through this small typed backend
 * interface. Requirements §5.1 explicitly allow "a maintained typed wrapper
 * (for example Dexie) or an equivalent small, tested abstraction"; this is the
 * latter, chosen to (a) run deterministic Node tests with no new dependency,
 * (b) keep the Cloudflare Workers client bundle lean, and (c) give us full
 * control over migration-failure semantics.
 *
 * Two implementations exist: {@link ./indexeddb-backend} (browser) and
 * {@link ./memory-backend} (tests + SSR safety).
 */

export interface OfflineRecord {
  id: string;
  [key: string]: unknown;
}

export type TransactionMode = "readonly" | "readwrite";

export interface OfflineBackendTransaction {
  get<T = OfflineRecord>(store: string, id: string): Promise<T | undefined>;
  getAll<T = OfflineRecord>(store: string): Promise<T[]>;
  put<T extends { id: string }>(store: string, value: T): Promise<void>;
  delete(store: string, id: string): Promise<void>;
  clear(store: string): Promise<void>;
}

export interface OfflineBackendDatabase {
  readonly name: string;
  readonly stores: readonly string[];
  /**
   * Run `fn` inside a single transaction. If `fn` throws, the transaction is
   * rolled back atomically (all-or-nothing) and the error is rethrown.
   */
  transaction<T>(
    stores: readonly string[],
    mode: TransactionMode,
    fn: (tx: OfflineBackendTransaction) => Promise<T>,
  ): Promise<T>;
  close(): void;
}

export interface OfflineBackend {
  /**
   * Open (creating if needed) a database with the given object stores. Missing
   * stores are created; existing data is preserved. `version` is the structural
   * (store-set) version, distinct from the app-level schema/data version.
   */
  open(
    name: string,
    stores: readonly string[],
    version: number,
  ): Promise<OfflineBackendDatabase>;
  deleteDatabase(name: string): Promise<void>;
}

export class LocalDbError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "LocalDbError";
  }
}
