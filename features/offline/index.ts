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
export * from "./pos-read/pos-read-types";
export * from "./pos-read/pos-search";
export * from "./pos-read/pos-read-repository";
export * from "./pos-read/pos-offline-gate";
export * from "./pos-read/pos-read-provider";
export * from "./pos-read/pos-sync-controller";
export * from "./pos-read/network-client";
export * from "./pos-read/pos-offline-status-store";
export * from "./pos-read/pos-client-props";
export * from "./pos-read/active-terminal";
export * from "./checkout/cart-math";
export * from "./checkout/cash-sale-types";
export * from "./checkout/terminal-provisioning";
export * from "./checkout/cash-session-guard";
export * from "./checkout/stock-guard";
export * from "./checkout/commit-cash-sale";
export * from "./checkout/offline-checkout-service";
export * from "./checkout/outbox-flush";
