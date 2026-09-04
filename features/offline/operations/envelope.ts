/**
 * Offline operation envelope (requirements §6.1, tasks Phase 1).
 *
 * Every mutation queued while offline is wrapped in an immutable envelope with
 * a UUID `operationId` (the idempotency key), device/terminal/tenant identity,
 * a monotonic per-device sequence, dependency ids, payload schema version, and
 * a canonical payload checksum. The cloud persists a unique processed-operation
 * record keyed by `companyId + operationId` (later phase); a repeat returns the
 * original result and never executes twice.
 *
 * Pure module: no browser or DB imports, so it is fully unit-testable.
 */

import type { OperationTypeName } from "../types";

export interface OfflineOperationEnvelope<TPayload = unknown> {
  /** UUID generated once on the device; the idempotency key. */
  operationId: string;
  deviceId: string;
  terminalId: string;
  companyId: string;
  branchId: string | null;
  warehouseId: string | null;
  actorUserId: string;
  /** Cached policy/permission version at creation time (for later server checks). */
  policyVersion: number | null;
  /** ISO creation timestamp (original event time; never regenerated). */
  createdAt: string;
  /** Monotonic per-device sequence number. */
  sequence: number;
  operationType: OperationTypeName;
  /** Payload schema version so the server can validate/upgrade payloads. */
  payloadSchemaVersion: number;
  /** operationIds this operation depends on (must sync first). */
  dependencies: string[];
  /** Client-generated entity ids this operation creates/touches. */
  clientEntityIds: string[];
  payload: TPayload;
  /** FNV-1a checksum of the canonical payload (best-effort integrity). */
  payloadHash: string;
}

export interface BuildEnvelopeInput<TPayload> {
  operationId?: string;
  deviceId: string;
  terminalId: string;
  companyId: string;
  branchId?: string | null;
  warehouseId?: string | null;
  actorUserId: string;
  policyVersion?: number | null;
  createdAt?: string;
  sequence: number;
  operationType: OperationTypeName;
  payloadSchemaVersion?: number;
  dependencies?: string[];
  clientEntityIds?: string[];
  payload: TPayload;
}

/**
 * Generate a UUID using the platform crypto (browser, Node 22, Workers).
 * Falls back to a v4-shaped id only if `crypto.randomUUID` is unavailable.
 */
export function newOperationId(): string {
  const c: Crypto | undefined =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  // Deterministic-shape fallback (non-crypto). Only used where randomUUID is absent.
  const rand = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${rand()}${rand()}-${rand()}-4${rand().slice(1)}-a${rand().slice(1)}-${rand()}${rand()}${rand()}`;
}

/**
 * Canonical JSON: object keys sorted recursively so equal payloads always
 * serialize identically (stable checksum + comparability).
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key]);
    }
    return sorted;
  }
  return value;
}

/** FNV-1a 32-bit hash of a string, returned as 8-char hex (non-cryptographic). */
export function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply via shifts, kept in unsigned range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Stable checksum of any value via canonical JSON + FNV-1a. */
export function canonicalHash(value: unknown): string {
  return fnv1aHex(canonicalStringify(value));
}

export function buildOperationEnvelope<TPayload>(
  input: BuildEnvelopeInput<TPayload>,
): OfflineOperationEnvelope<TPayload> {
  const payload = input.payload;
  return {
    operationId: input.operationId ?? newOperationId(),
    deviceId: input.deviceId,
    terminalId: input.terminalId,
    companyId: input.companyId,
    branchId: input.branchId ?? null,
    warehouseId: input.warehouseId ?? null,
    actorUserId: input.actorUserId,
    policyVersion: input.policyVersion ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    sequence: input.sequence,
    operationType: input.operationType,
    payloadSchemaVersion: input.payloadSchemaVersion ?? 1,
    dependencies: input.dependencies ? [...input.dependencies] : [],
    clientEntityIds: input.clientEntityIds ? [...input.clientEntityIds] : [],
    payload,
    payloadHash: canonicalHash(payload),
  };
}

export class DuplicateOperationError extends Error {
  constructor(public readonly operationId: string) {
    super(`Duplicate offline operationId: ${operationId}`);
    this.name = "DuplicateOperationError";
  }
}

export class OperationDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationDependencyError";
  }
}

interface OrderableOperation {
  operationId: string;
  sequence: number;
  dependencies: string[];
}

/**
 * Deterministic topological ordering of operations by dependency, breaking ties
 * by `sequence` then `operationId`. Detects duplicate operationIds and missing
 * or cyclic dependencies. Pure — used by the sync push planner (later phase)
 * and unit-tested here.
 */
export function topologicalOrder<T extends OrderableOperation>(operations: T[]): T[] {
  const byId = new Map<string, T>();
  for (const op of operations) {
    if (byId.has(op.operationId)) {
      throw new DuplicateOperationError(op.operationId);
    }
    byId.set(op.operationId, op);
  }

  const ordered: T[] = [];
  const state = new Map<string, "visiting" | "done">();

  const sortedRoots = [...operations].sort(compareBySequence);

  const visit = (op: T, stack: string[]): void => {
    const current = state.get(op.operationId);
    if (current === "done") return;
    if (current === "visiting") {
      throw new OperationDependencyError(
        `Cyclic offline operation dependency: ${[...stack, op.operationId].join(" -> ")}`,
      );
    }
    state.set(op.operationId, "visiting");
    const deps = [...op.dependencies].sort();
    for (const depId of deps) {
      const dep = byId.get(depId);
      if (!dep) {
        throw new OperationDependencyError(
          `Operation ${op.operationId} depends on unknown operation ${depId}`,
        );
      }
      visit(dep, [...stack, op.operationId]);
    }
    state.set(op.operationId, "done");
    ordered.push(op);
  };

  for (const op of sortedRoots) {
    visit(op, []);
  }
  return ordered;
}

function compareBySequence(a: OrderableOperation, b: OrderableOperation): number {
  if (a.sequence !== b.sequence) return a.sequence - b.sequence;
  return a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0;
}
