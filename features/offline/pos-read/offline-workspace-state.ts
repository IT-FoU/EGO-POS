/**
 * Offline POS workspace decision (Phase 6.2) — pure state machine.
 *
 * Decides what the public offline workspace should render BEFORE any store data
 * is read into view. It gates offline replica use behind a device-local PIN and
 * enforces the offline gate (revocation, scope, bootstrap, staleness).
 *
 * - `locked`: offline-ready + a device lock exists → require PIN unlock. Store
 *   data is only assembled AFTER a successful in-memory unlock.
 * - `no_lock`: offline-ready but no PIN configured → cannot use offline; a PIN
 *   must be set while online first.
 * - `online_setup_pin`: online + replica ready + no PIN → offer to set one.
 * - `blocked`: gate denied (revoked/scope/never-bootstrapped/stale/invalid).
 *
 * Pure module — deterministically testable, renders nothing itself.
 */

import type { PosGateResult } from "./pos-offline-gate";

export type OfflineWorkspaceDecision =
  | { kind: "flag_off" }
  | { kind: "online" }
  | { kind: "online_setup_pin" }
  | { kind: "blocked"; reason: string | null }
  | { kind: "no_lock" }
  | { kind: "locked" };

export interface OfflineWorkspaceInput {
  flagEnabled: boolean;
  online: boolean;
  hasTerminal: boolean;
  /** Result of {@link evaluatePosOfflineGate} for this terminal + replica. */
  gate: PosGateResult;
  /** Whether a device-local lock (PIN hash) is stored for this namespace. */
  lockSet: boolean;
}

export function decideOfflineWorkspace(input: OfflineWorkspaceInput): OfflineWorkspaceDecision {
  if (!input.flagEnabled) return { kind: "flag_off" };

  if (input.online) {
    // Online is authoritative. If the replica is ready but no PIN exists yet,
    // offer to set one so the device can be unlocked during a later outage.
    if (input.hasTerminal && input.gate.offlineReadsPermitted && !input.lockSet) {
      return { kind: "online_setup_pin" };
    }
    return { kind: "online" };
  }

  // Offline branch: never expose replica data unless fully permitted AND unlocked.
  if (!input.hasTerminal) return { kind: "blocked", reason: "not_set" };
  if (!input.gate.offlineReadsPermitted) {
    return { kind: "blocked", reason: input.gate.reason };
  }
  if (!input.lockSet) return { kind: "no_lock" };
  return { kind: "locked" };
}
