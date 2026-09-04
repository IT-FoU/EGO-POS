/**
 * Read-only offline diagnostics (Phase 0 §16, tasks Phase 0/1/11).
 *
 * Produces a queue/status snapshot from the local database. Safe to run even
 * when the offline write flag is off, and never exposes secrets — only counts,
 * timestamps, and non-sensitive metadata.
 */

import type { OperationStatus } from "./types";
import { OFFLINE_FEATURE_STATUSES } from "./types";
import { OfflineDatabase } from "./local-db/database";
import { MetaKey, OfflineStore } from "./local-db/schema";
import { listOutbox, type OutboxRecord } from "./outbox/outbox";

export interface OutboxCounts {
  total: number;
  pending: number;
  syncing: number;
  synced: number;
  retryable: number;
  blocked: number;
  rejected: number;
}

export interface OfflineDiagnostics {
  namespaceName: string;
  schemaVersion: number;
  counts: OutboxCounts;
  /** Operations needing attention (blocked + rejected + retryable). */
  needsAttention: number;
  lastSyncCursor: string | null;
  lastPolicySyncAt: string | null;
  createdAt: string | null;
}

function emptyCounts(): OutboxCounts {
  return {
    total: 0,
    pending: 0,
    syncing: 0,
    synced: 0,
    retryable: 0,
    blocked: 0,
    rejected: 0,
  };
}

export function summarizeOutbox(records: OutboxRecord[]): OutboxCounts {
  const counts = emptyCounts();
  for (const record of records) {
    counts.total += 1;
    counts[record.status] += 1;
  }
  return counts;
}

export async function collectOfflineDiagnostics(
  db: OfflineDatabase,
): Promise<OfflineDiagnostics> {
  const records = await db.transaction([OfflineStore.outbox], "readonly", (tx) =>
    listOutbox(tx),
  );
  const counts = summarizeOutbox(records);

  const [syncCursor, lastPolicySyncAt, createdAt, schemaVersion] = await Promise.all([
    db.read<{ id: string; value: string }>(OfflineStore.meta, MetaKey.syncCursor),
    db.read<{ id: string; value: string }>(OfflineStore.meta, MetaKey.lastPolicySyncAt),
    db.read<{ id: string; value: string }>(OfflineStore.meta, MetaKey.createdAt),
    db.getSchemaVersion(),
  ]);

  return {
    namespaceName: db.name,
    schemaVersion,
    counts,
    needsAttention: counts.blocked + counts.rejected + counts.retryable,
    lastSyncCursor: syncCursor?.value ?? null,
    lastPolicySyncAt: lastPolicySyncAt?.value ?? null,
    createdAt: createdAt?.value ?? null,
  };
}

/**
 * Derive the single user-facing status from diagnostics + connectivity.
 * Pure — unit tested. `online` reflects browser connectivity; queued/attention
 * states take precedence so the UI never implies a clean synced state while work
 * is pending.
 */
export function deriveFeatureStatus(input: {
  online: boolean;
  syncing: boolean;
  writeEnabled: boolean;
  counts: Pick<OutboxCounts, "pending" | "retryable" | "blocked" | "rejected">;
}): (typeof OFFLINE_FEATURE_STATUSES)[number] {
  if (!input.writeEnabled) return "not_available";
  if (input.counts.blocked > 0 || input.counts.rejected > 0) return "needs_attention";
  if (input.syncing) return "syncing";
  if (!input.online) {
    return input.counts.pending + input.counts.retryable > 0
      ? "offline_queued"
      : "offline_ready";
  }
  if (input.counts.pending + input.counts.retryable > 0) return "syncing";
  return "online";
}

export type { OperationStatus };
