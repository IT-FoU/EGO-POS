/**
 * POS offline gate (Phase 6) — pure decision for whether offline POS reads are
 * permitted and which state to surface.
 *
 * Blocks offline POS use when: the device is revoked/not activated, the terminal
 * scope fails, bootstrap never completed, the local replica is invalid, or the
 * data is stale beyond policy. Surfaces: online, syncing, offline_ready, stale,
 * blocked, read_only.
 */

import { daysSincePolicySync } from "../server/authorization";
import { DEFAULT_OFFLINE_GRACE_DAYS, type TerminalDeviceStatus } from "../server/types";

export type PosOfflineState =
  | "online"
  | "syncing"
  | "offline_ready"
  | "stale"
  | "blocked"
  | "read_only";

export const DEFAULT_SOFT_STALE_HOURS = 24;

export interface PosGateInput {
  flagEnabled: boolean;
  online: boolean;
  syncing: boolean;
  bootstrapComplete: boolean;
  replicaValid: boolean;
  terminalScopeOk: boolean;
  deviceStatus: TerminalDeviceStatus;
  lastSyncAt: string | null;
  now: Date;
  gracePeriodDays?: number;
  softStaleHours?: number;
}

export interface PosGateResult {
  state: PosOfflineState;
  /** Whether the offline replica may be used for POS reads right now. */
  offlineReadsPermitted: boolean;
  reason: string | null;
}

function offlineReady(input: PosGateInput): { ok: boolean; reason: string | null } {
  if (input.deviceStatus === "revoked") return { ok: false, reason: "device_revoked" };
  if (!input.terminalScopeOk) return { ok: false, reason: "terminal_scope" };
  if (!input.bootstrapComplete) return { ok: false, reason: "never_bootstrapped" };
  if (!input.replicaValid) return { ok: false, reason: "invalid_replica" };
  if (input.deviceStatus !== "active") return { ok: false, reason: "device_not_activated" };
  const graceDays = input.gracePeriodDays ?? DEFAULT_OFFLINE_GRACE_DAYS;
  if (daysSincePolicySync(input.lastSyncAt, input.now) > graceDays) {
    return { ok: false, reason: "stale_beyond_policy" };
  }
  return { ok: true, reason: null };
}

export function evaluatePosOfflineGate(input: PosGateInput): PosGateResult {
  // Flag off: online path only; offline reads never used (behavior unchanged).
  if (!input.flagEnabled) {
    return { state: "online", offlineReadsPermitted: false, reason: "offline_disabled" };
  }

  const ready = offlineReady(input);

  if (input.syncing) {
    return { state: "syncing", offlineReadsPermitted: ready.ok, reason: ready.reason };
  }

  if (input.online) {
    // Online is authoritative; offline replica is a validated fallback.
    return { state: "online", offlineReadsPermitted: ready.ok, reason: ready.reason };
  }

  // Offline branch: must be fully ready or POS offline use is blocked.
  if (!ready.ok) {
    return { state: "blocked", offlineReadsPermitted: false, reason: ready.reason };
  }

  const softHours = input.softStaleHours ?? DEFAULT_SOFT_STALE_HOURS;
  const ageHours = daysSincePolicySync(input.lastSyncAt, input.now) * 24;
  if (ageHours > softHours) {
    return { state: "stale", offlineReadsPermitted: true, reason: "stale" };
  }
  return { state: "read_only", offlineReadsPermitted: true, reason: null };
}
