/**
 * Outbox flush + reconciliation (Phase 6C, client).
 *
 * When connectivity returns (startup / focus / reconnect / Sync Now), flush READY
 * outbox operations to the secured push endpoint in deterministic dependency
 * order, ONE at a time. It:
 * - never sends a request while offline,
 * - prevents parallel flushes for the same local database,
 * - retries an interrupted operation with the SAME operationId (server idempotency
 *   returns the original result — no duplicate cloud sale),
 * - on accepted → sets the outbox synced + reconciles the local sale (local → cloud
 *   ids, pending → synced),
 * - on rejected → sets the outbox rejected + the local sale rejected with the
 *   reason, preserving the immutable receipt/audit (never deletes or silently
 *   retries),
 * - stops the batch on a transient/network error so it is retried next cycle.
 */

import { OfflineDatabase } from "../local-db/database";
import { OfflineStore } from "../local-db/schema";
import { topologicalOrder } from "../operations/envelope";
import {
  listPendingOutbox,
  updateOutboxStatus,
  type OutboxRecord,
} from "../outbox/outbox";
import type { CommandResult } from "../server/sync-contract";
import type { CashSaleReconciliation } from "../server/cash-sale-apply";
import { markLocalSaleRejected, markLocalSaleSynced } from "./offline-checkout-service";

/** Pushes one operation (single-op batch) and returns its per-command results. */
export type PushFetcher = (envelopes: OutboxRecord["envelope"][]) => Promise<CommandResult[]>;

export interface FlushDeps {
  push: PushFetcher;
  isOnline: () => boolean;
}

export interface FlushResult {
  ran: boolean;
  reason?: "offline" | "already_flushing" | "empty";
  accepted: number;
  rejected: number;
  retried: number;
}

// Single-flight guard per local database name (prevents parallel/duplicate flush).
const flushing = new Set<string>();

function orderPending(records: OutboxRecord[]): OutboxRecord[] {
  const ids = new Set(records.map((r) => r.id));
  try {
    const ordered = topologicalOrder(
      records.map((r) => ({
        operationId: r.id,
        sequence: r.sequence,
        dependencies: r.envelope.dependencies.filter((dep) => ids.has(dep)),
      })),
    );
    return ordered.map((entry) => records.find((r) => r.id === entry.operationId)!);
  } catch {
    return [...records].sort((a, b) => a.sequence - b.sequence);
  }
}

function saleIdOf(record: OutboxRecord): string | null {
  const payload = record.envelope.payload as { saleId?: unknown } | null;
  return payload && typeof payload.saleId === "string" ? payload.saleId : null;
}

export async function flushOutbox(db: OfflineDatabase, deps: FlushDeps): Promise<FlushResult> {
  const empty: FlushResult = { ran: false, accepted: 0, rejected: 0, retried: 0 };
  // Never touch the network while truly offline.
  if (!deps.isOnline()) return { ...empty, reason: "offline" };
  if (flushing.has(db.name)) return { ...empty, reason: "already_flushing" };
  flushing.add(db.name);
  try {
    const pending = await db.transaction([OfflineStore.outbox], "readonly", (tx) => listPendingOutbox(tx));
    if (pending.length === 0) return { ...empty, ran: true, reason: "empty" };

    const ordered = orderPending(pending);
    let accepted = 0;
    let rejected = 0;
    let retried = 0;

    for (const record of ordered) {
      // Re-check connectivity before each operation (may drop mid-flush).
      if (!deps.isOnline()) break;

      await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
        updateOutboxStatus(tx, record.id, { status: "syncing", incrementAttempts: true }),
      );

      let results: CommandResult[];
      try {
        results = await deps.push([record.envelope]);
      } catch {
        // Interrupted response: keep it retryable and stop; the SAME operationId
        // is retried next cycle (server idempotency prevents a duplicate sale).
        await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
          updateOutboxStatus(tx, record.id, { status: "retryable", errorDetail: "network_error" }),
        );
        retried += 1;
        break;
      }

      const result = results.find((r) => r.operationId === record.id) ?? results[0] ?? null;
      const saleId = saleIdOf(record);

      if (result && result.status === "accepted") {
        await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
          updateOutboxStatus(tx, record.id, { status: "synced", errorCode: result.code }),
        );
        const recon = (result.result ?? null) as CashSaleReconciliation | null;
        if (saleId) {
          await markLocalSaleSynced(db, saleId, {
            cloudSaleId: recon?.cloudSaleId ?? null,
            canonicalSaleNo: recon?.saleNo ?? null,
          });
        }
        accepted += 1;
      } else if (result && result.status === "rejected") {
        await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
          updateOutboxStatus(tx, record.id, { status: "rejected", errorCode: result.code, errorDetail: result.detail }),
        );
        if (saleId) await markLocalSaleRejected(db, saleId, result.detail ?? result.code);
        rejected += 1;
      } else {
        // blocked / retryable / missing → leave for a later cycle (same operationId).
        await db.transaction([OfflineStore.outbox], "readwrite", (tx) =>
          updateOutboxStatus(tx, record.id, {
            status: "retryable",
            errorCode: result?.code,
            errorDetail: result?.detail ?? "no_result",
          }),
        );
        retried += 1;
      }
    }

    return { ran: true, accepted, rejected, retried };
  } finally {
    flushing.delete(db.name);
  }
}

/** Test/diagnostics: whether a flush is currently in progress for a database. */
export function isFlushing(dbName: string): boolean {
  return flushing.has(dbName);
}
