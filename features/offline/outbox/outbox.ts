/**
 * Durable outbox (requirements §5.2, tasks Phase 1).
 *
 * Stores queued operations with their immutable envelope and a mutable durable
 * status (`pending` → `syncing` → `synced`|`retryable`|`blocked`|`rejected`),
 * attempt count, and error detail. The full history of an operation is retained;
 * records are keyed by `operationId` for idempotency.
 */

import type { OperationStatus } from "../types";
import type { OfflineOperationEnvelope } from "../operations/envelope";
import type { OfflineBackendTransaction } from "../local-db/backend";
import { OfflineStore } from "../local-db/schema";

export interface OutboxRecord {
  /** Equals `envelope.operationId` (primary key). */
  id: string;
  envelope: OfflineOperationEnvelope;
  status: OperationStatus;
  attempts: number;
  sequence: number;
  createdAt: string;
  updatedAt: string;
  lastErrorCode: string | null;
  lastErrorDetail: string | null;
}

export function createOutboxRecord(
  envelope: OfflineOperationEnvelope,
  now: string,
): OutboxRecord {
  return {
    id: envelope.operationId,
    envelope,
    status: "pending",
    attempts: 0,
    sequence: envelope.sequence,
    createdAt: now,
    updatedAt: now,
    lastErrorCode: null,
    lastErrorDetail: null,
  };
}

/** Valid durable status transitions. Terminal states cannot change. */
const ALLOWED_TRANSITIONS: Record<OperationStatus, readonly OperationStatus[]> = {
  pending: ["syncing", "blocked", "rejected"],
  syncing: ["synced", "retryable", "blocked", "rejected"],
  retryable: ["syncing", "pending", "blocked", "rejected"],
  blocked: ["pending", "syncing", "rejected"],
  synced: [],
  rejected: [],
};

export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidOperationTransitionError extends Error {
  constructor(from: OperationStatus, to: OperationStatus) {
    super(`Invalid outbox status transition: ${from} -> ${to}`);
    this.name = "InvalidOperationTransitionError";
  }
}

export async function getOutboxRecord(
  tx: OfflineBackendTransaction,
  operationId: string,
): Promise<OutboxRecord | undefined> {
  return tx.get<OutboxRecord>(OfflineStore.outbox, operationId);
}

export async function listOutbox(
  tx: OfflineBackendTransaction,
): Promise<OutboxRecord[]> {
  const records = await tx.getAll<OutboxRecord>(OfflineStore.outbox);
  return records.sort((a, b) => a.sequence - b.sequence);
}

/** Pending/retryable operations in deterministic sequence order. */
export async function listPendingOutbox(
  tx: OfflineBackendTransaction,
): Promise<OutboxRecord[]> {
  const records = await listOutbox(tx);
  return records.filter(
    (record) => record.status === "pending" || record.status === "retryable",
  );
}

export interface UpdateOutboxStatusInput {
  status: OperationStatus;
  incrementAttempts?: boolean;
  errorCode?: string | null;
  errorDetail?: string | null;
  now?: string;
}

export async function updateOutboxStatus(
  tx: OfflineBackendTransaction,
  operationId: string,
  input: UpdateOutboxStatusInput,
): Promise<OutboxRecord> {
  const record = await getOutboxRecord(tx, operationId);
  if (!record) {
    throw new Error(`Outbox record not found: ${operationId}`);
  }
  if (!canTransition(record.status, input.status)) {
    throw new InvalidOperationTransitionError(record.status, input.status);
  }
  const updated: OutboxRecord = {
    ...record,
    status: input.status,
    attempts: record.attempts + (input.incrementAttempts ? 1 : 0),
    updatedAt: input.now ?? new Date().toISOString(),
    lastErrorCode: input.errorCode ?? (input.status === "synced" ? null : record.lastErrorCode),
    lastErrorDetail:
      input.errorDetail ?? (input.status === "synced" ? null : record.lastErrorDetail),
  };
  await tx.put(OfflineStore.outbox, updated);
  return updated;
}
