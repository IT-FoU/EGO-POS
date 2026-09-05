/**
 * Sync engine (Phase 4, requirements §6).
 *
 * Pure orchestration over a {@link SyncStore}:
 * - processPush: deterministic dependency ordering, per-command tenant/device/
 *   terminal/policy validation, idempotency keyed by companyId+operationId
 *   (a duplicate returns the stored result without re-running), and a
 *   machine-readable result for every operation. Terminal results (accepted/
 *   rejected) are persisted to the immutable ledger; transient results (blocked/
 *   retryable) are returned but never persisted, so a later retry is re-evaluated.
 * - pullDelta: cursor-based, deterministic, tombstone-aware; empty means empty
 *   (never seeds defaults).
 * - bootstrap: resumable/paginated reference snapshot.
 *
 * Domain application of accepted commands (creating sales, movements, etc.) is a
 * pluggable hook wired in Phase 5/6; Phase 4 records the authoritative decision.
 */

import { topologicalOrder } from "../operations/envelope";
import type { OfflineOperationEnvelope } from "../operations/envelope";
import {
  assertOperationScope,
  evaluateOfflineWriteAuthorization,
  OfflineScopeError,
  type DeviceAuthzView,
  type ScopeContext,
} from "./authorization";
import { OfflineDenyReason } from "./types";
import {
  SYNC_SCHEMA_VERSION,
  SyncErrorCode,
  type BootstrapRequest,
  type BootstrapResponse,
  type CommandResult,
  type CommandResultStatus,
  type PullRequest,
  type PullResponse,
  type PushResponse,
  type SyncErrorCodeValue,
  type SyncStatusResponse,
} from "./sync-contract";
import type { SyncStore } from "./sync-store";

export interface CommandDecision {
  status: CommandResultStatus;
  code: SyncErrorCodeValue;
  detail: string | null;
  result?: unknown;
}

export interface PushContext {
  companyId: string;
  deviceId: string;
  scope: ScopeContext;
  device: DeviceAuthzView;
  cachedPolicyVersion: number;
  now: Date;
  /**
   * Optional domain applier for accepted commands (Phase 5/6). Called only after
   * scope/policy/dependency checks pass. Returning a non-accepted status rejects
   * or blocks the command. When omitted, valid commands are accepted (recorded).
   */
  applyCommand?: (envelope: OfflineOperationEnvelope) => Promise<CommandDecision>;
}

function accepted(): CommandDecision {
  return { status: "accepted", code: SyncErrorCode.ok, detail: null };
}

function scopeReasonToCode(reason: string): SyncErrorCodeValue {
  switch (reason) {
    case OfflineDenyReason.tenantMismatch:
      return SyncErrorCode.tenantMismatch;
    case OfflineDenyReason.terminalMismatch:
      return SyncErrorCode.invalidTerminal;
    case OfflineDenyReason.permissionDenied:
      return SyncErrorCode.permissionDenied;
    default:
      return SyncErrorCode.validationFailed;
  }
}

/** Device-level authorization gate applied to every command in the batch. */
function deviceGate(ctx: PushContext): CommandDecision | null {
  const authz = evaluateOfflineWriteAuthorization({
    device: ctx.device,
    cachedPolicyVersion: ctx.cachedPolicyVersion,
    permissionGranted: true, // per-user permission is validated by the route wrapper
    userEnabled: true,
    now: ctx.now,
  });
  if (authz.allowed) return null;
  switch (authz.reason) {
    case OfflineDenyReason.policyStale:
    case OfflineDenyReason.graceExpired:
      return { status: "blocked", code: SyncErrorCode.stalePolicy, detail: authz.reason };
    default:
      return { status: "rejected", code: SyncErrorCode.permissionDenied, detail: authz.reason };
  }
}

export async function processPush(
  store: SyncStore,
  ctx: PushContext,
  operations: OfflineOperationEnvelope[],
): Promise<PushResponse> {
  const results: (CommandResult | null)[] = new Array(operations.length).fill(null);

  // 1) Flag in-batch duplicate operationIds (keep the first occurrence).
  const firstIndexById = new Map<string, number>();
  operations.forEach((op, index) => {
    if (firstIndexById.has(op.operationId)) {
      results[index] = {
        operationId: op.operationId,
        status: "rejected",
        code: SyncErrorCode.validationFailed,
        detail: "Duplicate operationId within batch",
        duplicate: false,
      };
    } else {
      firstIndexById.set(op.operationId, index);
    }
  });

  const uniqueOps = [...firstIndexById.values()].map((index) => operations[index]);
  const batchIds = new Set(uniqueOps.map((op) => op.operationId));

  // 2) Deterministic dependency ordering (deps outside the batch are checked at
  //    processing time against the ledger). Fall back to sequence order on cycle.
  let ordered: OfflineOperationEnvelope[];
  try {
    ordered = topologicalOrder(
      uniqueOps.map((op) => ({
        operationId: op.operationId,
        sequence: op.sequence,
        dependencies: op.dependencies.filter((dep) => batchIds.has(dep)),
      })),
    ).map((entry) => uniqueOps.find((op) => op.operationId === entry.operationId)!);
  } catch {
    ordered = [...uniqueOps].sort((a, b) =>
      a.sequence !== b.sequence
        ? a.sequence - b.sequence
        : a.operationId < b.operationId
          ? -1
          : 1,
    );
  }

  const gate = deviceGate(ctx);
  const acceptedThisRun = new Set<string>();

  const isDependencySatisfied = async (dep: string): Promise<boolean> => {
    if (acceptedThisRun.has(dep)) return true;
    const stored = await store.getOperationResult(ctx.companyId, dep);
    return stored?.status === "accepted";
  };

  for (const env of ordered) {
    const index = firstIndexById.get(env.operationId)!;

    // 2a) Idempotency: return the stored terminal result without re-running.
    const existing = await store.getOperationResult(ctx.companyId, env.operationId);
    if (existing) {
      if (existing.status === "accepted") acceptedThisRun.add(env.operationId);
      results[index] = {
        operationId: env.operationId,
        status: existing.status,
        code: existing.code,
        detail: existing.detail,
        duplicate: true,
        result: existing.result ?? undefined,
      };
      continue;
    }

    // 2b) Scope enforcement (tenant/device/terminal/branch/warehouse/actor).
    let decision: CommandDecision | null = null;
    try {
      assertOperationScope(
        {
          companyId: env.companyId,
          branchId: env.branchId,
          warehouseId: env.warehouseId,
          terminalId: env.terminalId,
          deviceId: env.deviceId,
          actorUserId: env.actorUserId,
        },
        ctx.scope,
      );
    } catch (error) {
      const reason = error instanceof OfflineScopeError ? error.reason : OfflineDenyReason.tenantMismatch;
      decision = {
        status: "rejected",
        code: scopeReasonToCode(reason),
        detail: error instanceof Error ? error.message : "Scope violation",
      };
    }

    // 2c) Device-level gate (policy/grace/revocation).
    if (!decision && gate) decision = gate;

    // 2d) Dependency satisfaction.
    if (!decision) {
      for (const dep of env.dependencies) {
        if (!(await isDependencySatisfied(dep))) {
          decision = {
            status: "blocked",
            code: SyncErrorCode.dependencyBlocked,
            detail: `Waiting on dependency ${dep}`,
          };
          break;
        }
      }
    }

    // 2e) Domain application (or default accept).
    if (!decision) {
      decision = ctx.applyCommand ? await ctx.applyCommand(env) : accepted();
    }

    // 3) Persist only terminal results (accepted/rejected). Blocked/retryable are
    //    transient and re-evaluated on the next push.
    if (decision.status === "accepted" || decision.status === "rejected") {
      await store.saveOperationResult({
        companyId: ctx.companyId,
        operationId: env.operationId,
        deviceId: env.deviceId,
        terminalDeviceId: ctx.scope.deviceId,
        actorUserId: env.actorUserId,
        operationType: env.operationType,
        sequence: env.sequence,
        payloadHash: env.payloadHash ?? null,
        status: decision.status,
        code: decision.code,
        detail: decision.detail,
        result: decision.result ?? null,
        now: ctx.now,
      });
      if (decision.status === "accepted") acceptedThisRun.add(env.operationId);
    }

    results[index] = {
      operationId: env.operationId,
      status: decision.status,
      code: decision.code,
      detail: decision.detail,
      duplicate: false,
      result: decision.result ?? undefined,
    };
  }

  const syncCursor = await store.latestChangeCursor(ctx.companyId);
  await store.setCursorState(ctx.companyId, ctx.deviceId, {
    lastPushAt: ctx.now.toISOString(),
  });

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    results: results.map((result) => result!),
    syncCursor,
  };
}

export async function pullDelta(
  store: SyncStore,
  companyId: string,
  deviceId: string,
  req: PullRequest,
  now: Date = new Date(),
  branchIds?: string[],
  warehouseIds?: string[],
): Promise<PullResponse> {
  const page = await store.listChangesSince(companyId, req.cursor, req.limit, branchIds, warehouseIds);
  await store.setCursorState(companyId, deviceId, {
    lastPullAt: now.toISOString(),
    syncCursor: page.nextCursor,
  });
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    changes: page.changes,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
  };
}

export async function bootstrap(
  store: SyncStore,
  companyId: string,
  req: BootstrapRequest,
): Promise<BootstrapResponse> {
  const page = await store.listBootstrapEntities(companyId, req.cursor, req.limit);
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entities: page.entities,
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    complete: !page.hasMore,
  };
}

export async function syncStatus(
  store: SyncStore,
  companyId: string,
  deviceId: string,
): Promise<SyncStatusResponse> {
  const [counts, cursor] = await Promise.all([
    store.countOperations(companyId),
    store.getCursorState(companyId, deviceId),
  ]);
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    operations: counts,
    lastPushAt: cursor.lastPushAt,
    lastPullAt: cursor.lastPullAt,
    syncCursor: cursor.syncCursor,
  };
}
