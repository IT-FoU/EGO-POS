/**
 * Versioned cloud sync contract (Phase 4, requirements §6).
 *
 * Pure request/response schemas, validators, and machine-readable result/error
 * codes shared by the sync engine and the API routes. All payloads are versioned
 * (`schemaVersion`) so client and server can evolve compatibly.
 */

import type { OfflineOperationEnvelope } from "../operations/envelope";

export const SYNC_SCHEMA_VERSION = 1;

/** Durable per-command outcome returned to the client. */
export type CommandResultStatus = "accepted" | "retryable" | "blocked" | "rejected";

/** Machine-readable result/error codes (requirements §10 / tasks Phase 4). */
export const SyncErrorCode = {
  ok: "ok",
  validationFailed: "validation_failed",
  permissionDenied: "permission_denied",
  stalePolicy: "stale_policy",
  staleVersion: "stale_version",
  receiptCollision: "receipt_collision",
  insufficientStockAllocation: "insufficient_stock_allocation",
  missingLoyaltyAllowance: "missing_loyalty_allowance",
  dependencyBlocked: "dependency_blocked",
  invalidTerminal: "invalid_terminal",
  tenantMismatch: "tenant_mismatch",
  unexpectedError: "unexpected_error",
} as const;

export type SyncErrorCodeValue = (typeof SyncErrorCode)[keyof typeof SyncErrorCode];

export interface CommandResult {
  operationId: string;
  status: CommandResultStatus;
  code: SyncErrorCodeValue;
  detail: string | null;
  /** true when this result was returned from the idempotent ledger (not re-run). */
  duplicate: boolean;
}

export interface ServerChange {
  cursor: number;
  entityType: string;
  entityId: string;
  version: number;
  deleted: boolean;
  payload: unknown;
  /** Warehouse scope for warehouse-specific reference data (e.g. stock levels). */
  warehouseId?: string | null;
}

// ---- Push ----

export interface PushRequest {
  schemaVersion: number;
  deviceId: string;
  operations: OfflineOperationEnvelope[];
}

export interface PushResponse {
  schemaVersion: number;
  results: CommandResult[];
  syncCursor: number;
}

// ---- Pull ----

export interface PullRequest {
  schemaVersion: number;
  cursor: number;
  limit: number;
}

export interface PullResponse {
  schemaVersion: number;
  changes: ServerChange[];
  nextCursor: number;
  hasMore: boolean;
}

// ---- Bootstrap ----

export interface BootstrapRequest {
  schemaVersion: number;
  cursor: number;
  limit: number;
}

export interface BootstrapEntity {
  entityType: string;
  entityId: string;
  version: number;
  payload: unknown;
}

export interface BootstrapResponse {
  schemaVersion: number;
  entities: BootstrapEntity[];
  nextCursor: number;
  hasMore: boolean;
  complete: boolean;
}

// ---- Status ----

export interface SyncStatusResponse {
  schemaVersion: number;
  operations: {
    accepted: number;
    rejected: number;
    blocked: number;
    total: number;
  };
  lastPushAt: string | null;
  lastPullAt: string | null;
  syncCursor: number;
  /** Diagnostics: single-warehouse rollout flag + this terminal's warehouse scope. */
  singleWarehouseRollout?: boolean;
  warehouseScope?: string[];
  /**
   * Authoritative device status + policy version so the client can enforce
   * revocation and policy updates before the next offline session. Non-secret.
   */
  deviceStatus?: string;
  policyVersion?: number;
}

// ---- Validation ----

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;
const MAX_BATCH = 500;

function clampLimit(value: unknown, fallback = DEFAULT_LIMIT): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function clampCursor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function checkSchemaVersion(body: Record<string, unknown>): string | null {
  if (body.schemaVersion !== undefined && Number(body.schemaVersion) !== SYNC_SCHEMA_VERSION) {
    return `Unsupported sync schema version: ${String(body.schemaVersion)} (expected ${SYNC_SCHEMA_VERSION})`;
  }
  return null;
}

function isEnvelope(value: unknown): value is OfflineOperationEnvelope {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.operationId === "string" &&
    v.operationId.length > 0 &&
    typeof v.companyId === "string" &&
    typeof v.deviceId === "string" &&
    typeof v.terminalId === "string" &&
    typeof v.actorUserId === "string" &&
    typeof v.operationType === "string" &&
    typeof v.sequence === "number" &&
    Array.isArray(v.dependencies)
  );
}

export function validatePushRequest(body: unknown): ValidationResult<PushRequest> {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request body" };
  const record = body as Record<string, unknown>;
  const versionError = checkSchemaVersion(record);
  if (versionError) return { ok: false, error: versionError };
  if (typeof record.deviceId !== "string" || !record.deviceId) {
    return { ok: false, error: "deviceId is required" };
  }
  if (!Array.isArray(record.operations)) {
    return { ok: false, error: "operations must be an array" };
  }
  if (record.operations.length > MAX_BATCH) {
    return { ok: false, error: `Batch too large (max ${MAX_BATCH})` };
  }
  const operations: OfflineOperationEnvelope[] = [];
  for (const op of record.operations) {
    if (!isEnvelope(op)) {
      return { ok: false, error: "Malformed operation envelope in batch" };
    }
    operations.push(op);
  }
  return {
    ok: true,
    value: { schemaVersion: SYNC_SCHEMA_VERSION, deviceId: record.deviceId, operations },
  };
}

export function validatePullRequest(query: {
  schemaVersion?: unknown;
  cursor?: unknown;
  limit?: unknown;
}): ValidationResult<PullRequest> {
  const versionError = checkSchemaVersion(query as Record<string, unknown>);
  if (versionError) return { ok: false, error: versionError };
  return {
    ok: true,
    value: {
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: clampCursor(query.cursor),
      limit: clampLimit(query.limit),
    },
  };
}

export function validateBootstrapRequest(query: {
  schemaVersion?: unknown;
  cursor?: unknown;
  limit?: unknown;
}): ValidationResult<BootstrapRequest> {
  const versionError = checkSchemaVersion(query as Record<string, unknown>);
  if (versionError) return { ok: false, error: versionError };
  return {
    ok: true,
    value: {
      schemaVersion: SYNC_SCHEMA_VERSION,
      cursor: clampCursor(query.cursor),
      limit: clampLimit(query.limit),
    },
  };
}
