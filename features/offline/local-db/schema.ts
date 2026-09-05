/**
 * Local database schema definition (tasks Phase 1).
 *
 * Declares the object stores, the structural (store-set) version, the app-level
 * schema/data version, and the per-namespace database name. Store creation is
 * structural (handled by the backend at open); data transformations are handled
 * by the migration runner keyed on {@link CURRENT_SCHEMA_VERSION}.
 */

import type { StoreNamespace } from "../types";

/** Object store names. Infra stores + representative domain/document stores. */
export const OfflineStore = {
  /** Key/value metadata: schema version, sequence, cursors, device, namespace. */
  meta: "_meta",
  /** Durable outbox of pending operations. */
  outbox: "outbox",
  /** Applied server changes (inbox) — populated by the sync engine (later phase). */
  inbox: "inbox",
  /** Append-only sync log. */
  syncLog: "sync_log",
  /** Conflict/repair records. */
  conflicts: "conflicts",
  /** Local audit records. */
  auditLog: "audit_log",

  /**
   * Read-only cloud reference snapshot (Phase 5). One uniform store keyed by
   * `${entityType}:${entityId}` holds all bootstrapped/pulled reference entities
   * (store context, security snapshot, products, categories, customers,
   * promotions, settings, QR banks, stock levels, cash-session context) with a
   * version + tombstone so deletes never reappear.
   */
  reference: "reference",

  // Domain snapshot stores (kept for Phase 6 local documents).
  products: "products",
  categories: "categories",
  customers: "customers",
  promotions: "promotions",
  settings: "settings",
  qrBanks: "qr_banks",

  // Locally created documents.
  sales: "sales",
  cashSessions: "cash_sessions",
  heldBills: "held_bills",
  inventoryEvents: "inventory_events",
} as const;

export type OfflineStoreName = (typeof OfflineStore)[keyof typeof OfflineStore];

export const ALL_STORES: readonly OfflineStoreName[] = Object.freeze(
  Object.values(OfflineStore) as OfflineStoreName[],
);

/**
 * Structural version: increment whenever the SET of object stores changes.
 * (Data transformations do not change this — see CURRENT_SCHEMA_VERSION.)
 * v2 adds the Phase 5 `reference` store.
 */
export const STRUCTURAL_VERSION = 2;

/** App-level schema/data version, advanced by the migration runner. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Meta keys stored as records `{ id, value }` in the meta store. */
export const MetaKey = {
  schemaVersion: "schemaVersion",
  namespace: "namespace",
  sequence: "sequence",
  device: "device",
  bootstrapCursor: "bootstrapCursor",
  syncCursor: "syncCursor",
  lastPolicySyncAt: "lastPolicySyncAt",
  createdAt: "createdAt",
  deviceLock: "deviceLock",
  securitySnapshot: "securitySnapshot",
  policyVersion: "policyVersion",
  bootstrapComplete: "bootstrapComplete",
  lastSyncAt: "lastSyncAt",
} as const;

const NAME_PREFIX = "egopos.offline";

/** Sanitize an id segment so it is safe inside a database name. */
function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * Per-namespace database name. One physical database per company+branch+terminal
 * so a store can never read another store's cache in the same browser profile.
 */
export function offlineDatabaseName(namespace: StoreNamespace): string {
  const company = sanitizeSegment(namespace.companyId);
  const branch = sanitizeSegment(namespace.branchId);
  const terminal = sanitizeSegment(namespace.terminalId);
  return `${NAME_PREFIX}::${company}::${branch}::${terminal}`;
}
