/**
 * Atomic local-write-plus-queue (requirements §4.1, tasks Phase 1).
 *
 * `commitLocalAndQueue` writes one or more local entity mutations AND the
 * outbox operation envelope inside a SINGLE transaction: either everything
 * commits or nothing does. UI success may only be shown after this resolves.
 *
 * Idempotency: the outbox is keyed by `operationId`; committing the same
 * operationId twice throws {@link DuplicateOperationError} and rolls back, so a
 * retry/reload/crash never creates a second sale, movement, or ledger entry.
 */

import type { BaseLocalEntity, LocalEntityStatus } from "./types";
import {
  buildOperationEnvelope,
  DuplicateOperationError,
  type BuildEnvelopeInput,
  type OfflineOperationEnvelope,
} from "./operations/envelope";
import { OfflineDatabase } from "./local-db/database";
import type { OfflineStoreName } from "./local-db/schema";
import { OfflineStore } from "./local-db/schema";
import type { OfflineBackendTransaction } from "./local-db/backend";
import { createOutboxRecord, getOutboxRecord, type OutboxRecord } from "./outbox/outbox";

/** Minimal shape a caller must supply for a local entity write. */
export interface LocalEntityInput {
  id: string;
  companyId: string;
  branchId?: string | null;
  warehouseId?: string | null;
  updatedAt?: string | null;
  serverVersion?: number | null;
  syncStatus?: LocalEntityStatus;
  deleted?: boolean;
  /** Domain fields. */
  [key: string]: unknown;
}

export interface LocalWrite {
  store: OfflineStoreName;
  entity: LocalEntityInput;
}

export interface CommitContext {
  deviceId: string;
  terminalId: string;
  now?: string;
}

export type CommitEnvelopeInput<TPayload> = Omit<
  BuildEnvelopeInput<TPayload>,
  "sequence" | "deviceId" | "terminalId" | "createdAt"
> & {
  createdAt?: string;
};

export interface CommitLocalAndQueueInput<TPayload> {
  writes: LocalWrite[];
  envelope: CommitEnvelopeInput<TPayload>;
  context: CommitContext;
}

export interface CommitResult<TPayload> {
  envelope: OfflineOperationEnvelope<TPayload>;
  outbox: OutboxRecord;
}

function stampEntity(
  input: LocalEntityInput,
  existing: BaseLocalEntity | undefined,
  ctx: Required<Pick<CommitContext, "deviceId" | "terminalId">>,
  now: string,
): BaseLocalEntity & Record<string, unknown> {
  const nextLocalVersion = (existing?.localVersion ?? 0) + 1;
  const isNew = existing === undefined;
  const inferredStatus: LocalEntityStatus = input.deleted
    ? "pending_delete"
    : isNew
      ? "pending_create"
      : "pending_update";
  const { syncStatus, deleted, ...rest } = input;
  return {
    ...rest,
    id: input.id,
    companyId: input.companyId,
    branchId: input.branchId ?? existing?.branchId ?? null,
    warehouseId: input.warehouseId ?? existing?.warehouseId ?? null,
    updatedAt: input.updatedAt ?? existing?.updatedAt ?? null,
    localUpdatedAt: now,
    localVersion: nextLocalVersion,
    serverVersion: input.serverVersion ?? existing?.serverVersion ?? null,
    syncStatus: syncStatus ?? inferredStatus,
    deleted: deleted ?? existing?.deleted ?? false,
    source: { deviceId: ctx.deviceId, terminalId: ctx.terminalId, fromServer: false },
  };
}

/**
 * Atomically apply local writes + enqueue the operation. All work happens in one
 * transaction spanning the meta, outbox, and every touched entity store.
 */
export async function commitLocalAndQueue<TPayload>(
  db: OfflineDatabase,
  input: CommitLocalAndQueueInput<TPayload>,
): Promise<CommitResult<TPayload>> {
  const now = input.context.now ?? new Date().toISOString();
  const touchedStores = new Set<string>([OfflineStore.meta, OfflineStore.outbox]);
  for (const write of input.writes) {
    touchedStores.add(write.store);
  }

  return db.transaction([...touchedStores], "readwrite", async (tx) => {
    const sequence = await OfflineDatabase.nextSequence(tx);

    const envelope = buildOperationEnvelope<TPayload>({
      ...input.envelope,
      deviceId: input.context.deviceId,
      terminalId: input.context.terminalId,
      createdAt: input.envelope.createdAt ?? now,
      sequence,
    });

    // Idempotency guard: never enqueue the same operationId twice.
    const existingOp = await getOutboxRecord(tx, envelope.operationId);
    if (existingOp) {
      throw new DuplicateOperationError(envelope.operationId);
    }

    // Apply entity writes with local bookkeeping stamped.
    for (const write of input.writes) {
      const existing = await tx.get<BaseLocalEntity>(write.store, write.entity.id);
      const stamped = stampEntity(
        write.entity,
        existing,
        { deviceId: input.context.deviceId, terminalId: input.context.terminalId },
        now,
      );
      await writeEntity(tx, write.store, stamped);
    }

    const outbox = createOutboxRecord(envelope, now);
    await tx.put(OfflineStore.outbox, outbox);

    return { envelope, outbox };
  });
}

async function writeEntity(
  tx: OfflineBackendTransaction,
  store: string,
  entity: BaseLocalEntity & Record<string, unknown>,
): Promise<void> {
  await tx.put(store, entity);
}
