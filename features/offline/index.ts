/**
 * Offline-first module barrel (tasks Phase 1).
 *
 * Public entry point for the Mini Mart offline runtime foundations. Importing
 * this module has no side effects and does not change online behavior.
 */

export * from "./types";
export * from "./operations/envelope";
export * from "./local-db/backend";
export * from "./local-db/schema";
export * from "./local-db/migrations";
export * from "./local-db/database";
export { MemoryOfflineBackend } from "./local-db/memory-backend";
export { IndexedDbOfflineBackend, isIndexedDbAvailable } from "./local-db/indexeddb-backend";
export * from "./outbox/outbox";
export * from "./commit";
export * from "./device-identity";
export * from "./feature-flags";
export * from "./diagnostics";
export * from "./sync/inbox";
export * from "./sync/sync-coordinator";
export * from "./replica/reference-types";
export * from "./replica/reference-snapshot";
export * from "./replica/store-snapshot-repository";
export * from "./config";
