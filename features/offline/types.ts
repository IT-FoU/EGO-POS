/**
 * Offline-first common types (Phase 1).
 *
 * Shared vocabulary for the Mini Mart offline runtime. These types are the
 * single source of truth for feature status, operation/entity lifecycle
 * states, the per-record base fields, and the store namespace. They are pure
 * TypeScript with no browser/Prisma imports so they can be used on the client,
 * in tests, and (where relevant) on the server sync boundary later.
 *
 * No production behavior changes by importing this module; it defines types
 * and small pure helpers only.
 */

/**
 * User-facing runtime status vocabulary (requirements §6, Phase 0 §4).
 * A single union so online/offline UI never drifts.
 */
export type OfflineFeatureStatus =
  | "online"
  | "syncing"
  | "offline_ready"
  | "offline_queued"
  | "needs_attention"
  | "blocked"
  | "not_available";

export const OFFLINE_FEATURE_STATUSES: readonly OfflineFeatureStatus[] = [
  "online",
  "syncing",
  "offline_ready",
  "offline_queued",
  "needs_attention",
  "blocked",
  "not_available",
] as const;

/**
 * Durable state of a queued outbox operation (requirements §5.2 / tasks Phase 1).
 * `pending` → `syncing` → (`synced` | `retryable` | `blocked` | `rejected`).
 */
export type OperationStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "retryable"
  | "blocked"
  | "rejected";

export const OPERATION_STATUSES: readonly OperationStatus[] = [
  "pending",
  "syncing",
  "synced",
  "retryable",
  "blocked",
  "rejected",
] as const;

/** Terminal states an operation may never transition out of. */
export const TERMINAL_OPERATION_STATUSES: readonly OperationStatus[] = [
  "synced",
  "rejected",
] as const;

/**
 * Safe lifecycle state of a locally stored entity (tasks Phase 1).
 */
export type LocalEntityStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete"
  | "conflict"
  | "rejected";

export const LOCAL_ENTITY_STATUSES: readonly LocalEntityStatus[] = [
  "synced",
  "pending_create",
  "pending_update",
  "pending_delete",
  "conflict",
  "rejected",
] as const;

/**
 * Isolation key for the local database. One physical database exists per
 * company + branch + terminal so a store can never read another store's cache
 * in the same browser profile (requirements §5.2, Phase 0 §9.2).
 */
export interface StoreNamespace {
  companyId: string;
  branchId: string;
  terminalId: string;
}

/**
 * Base fields every local record must carry (tasks Phase 1). Domain records
 * extend this. `serverVersion`/`updatedAt` describe the last known cloud state;
 * `localVersion`/`localUpdatedAt` describe local edits pending sync.
 */
export interface BaseLocalEntity {
  /** Stable id (server id when known, otherwise a client-generated id). */
  id: string;
  companyId: string;
  branchId: string | null;
  warehouseId: string | null;
  /** Last server-known update time (ISO), if the record originated in the cloud. */
  updatedAt: string | null;
  /** Local mutation time (ISO). */
  localUpdatedAt: string;
  /** Monotonically increasing local edit counter. */
  localVersion: number;
  /** Last server version/etag applied locally, if any. */
  serverVersion: number | null;
  /** Sync lifecycle state. */
  syncStatus: LocalEntityStatus;
  /** Tombstone flag for deletions (never hard-delete unsynced records). */
  deleted: boolean;
  /** Provenance of the local write. */
  source: EntitySource;
}

export interface EntitySource {
  deviceId: string;
  terminalId: string;
  /** true when the record came from a server pull rather than a local write. */
  fromServer: boolean;
}

/**
 * Known offline operation types. Kept as string constants (not an exhaustive
 * closed enum) so later phases can register more without a breaking change,
 * while giving current call sites autocomplete + typo safety.
 */
export const OperationType = {
  posSaleComplete: "pos.sale.complete",
  posSaleReturn: "pos.sale.return",
  posSaleExchange: "pos.sale.exchange",
  posSaleVoid: "pos.sale.void",
  posSaleRefund: "pos.sale.refund",
  cashSessionOpen: "cash.session.open",
  cashSessionClose: "cash.session.close",
  cashMovement: "cash.movement",
  heldBillCreate: "held_bill.create",
  heldBillResume: "held_bill.resume",
  heldBillCancel: "held_bill.cancel",
  inventoryStockIn: "inventory.stock_in",
  inventoryAdjustment: "inventory.adjustment",
  inventoryCount: "inventory.count",
  productUpsert: "product.upsert",
  customerUpsert: "customer.upsert",
} as const;

export type OperationTypeValue =
  (typeof OperationType)[keyof typeof OperationType];

/** A string operation type; known values are provided by {@link OperationType}. */
export type OperationTypeName = OperationTypeValue | (string & {});
