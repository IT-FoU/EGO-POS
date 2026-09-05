/**
 * Offline authorization + scope enforcement (Phase 3).
 *
 * Pure decision logic reused by the sync server and (for preview) the client.
 * The cloud remains the final authority — this encodes the rules requirements
 * §5.3/§9 describe:
 *   - a device must be registered AND activated before offline writes,
 *   - a revoked device is blocked,
 *   - offline authorization has a configurable grace period (default 7 days from
 *     the last successful security/policy sync); on expiry, reads remain but new
 *     financial/inventory writes are blocked until online reauthorization,
 *   - a stale cached policy version forces a policy refresh before writes,
 *   - every operation must match the device's tenant/branch/warehouse/terminal/user.
 */

import {
  DEFAULT_OFFLINE_GRACE_DAYS,
  OfflineDenyReason,
  type OfflineAuthorizationResult,
  type TerminalDeviceStatus,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface DeviceAuthzView {
  status: TerminalDeviceStatus;
  /** Server's current policy version for this device's scope. */
  policyVersion: number;
  offlineGraceDays: number;
  /** ISO timestamp of the last successful security/policy sync, if any. */
  lastPolicySyncAt: string | null;
}

export interface EvaluateOfflineWriteInput {
  device: DeviceAuthzView | null;
  /** Policy version the device currently has cached. */
  cachedPolicyVersion: number;
  /** Whether the acting user still holds the required permission. */
  permissionGranted: boolean;
  /** Whether the acting user account is still enabled. */
  userEnabled: boolean;
  now: Date;
}

/** Days elapsed since the last successful policy sync (Infinity if never). */
export function daysSincePolicySync(lastPolicySyncAt: string | null, now: Date): number {
  if (!lastPolicySyncAt) return Number.POSITIVE_INFINITY;
  const then = new Date(lastPolicySyncAt).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - then) / MS_PER_DAY;
}

export function isWithinGrace(
  lastPolicySyncAt: string | null,
  graceDays: number,
  now: Date,
): boolean {
  const days = daysSincePolicySync(lastPolicySyncAt, now);
  return days <= (graceDays ?? DEFAULT_OFFLINE_GRACE_DAYS);
}

/**
 * Evaluate whether a NEW offline financial/inventory write is authorized.
 * Reads are permitted in every non-fatal case (readOnly=true), preserving the
 * "no silent data loss / always readable" guarantee.
 */
export function evaluateOfflineWriteAuthorization(
  input: EvaluateOfflineWriteInput,
): OfflineAuthorizationResult {
  const { device } = input;
  if (!device) {
    return { allowed: false, reason: OfflineDenyReason.deviceNotFound, readOnly: false };
  }
  if (device.status === "revoked") {
    return { allowed: false, reason: OfflineDenyReason.deviceRevoked, readOnly: true };
  }
  if (device.status !== "active") {
    return { allowed: false, reason: OfflineDenyReason.deviceNotActivated, readOnly: true };
  }
  if (!input.userEnabled) {
    return { allowed: false, reason: OfflineDenyReason.userDisabled, readOnly: true };
  }
  if (!input.permissionGranted) {
    return { allowed: false, reason: OfflineDenyReason.permissionDenied, readOnly: true };
  }
  if (input.cachedPolicyVersion < device.policyVersion) {
    // Device is running an out-of-date policy; require a refresh before writing.
    return { allowed: false, reason: OfflineDenyReason.policyStale, readOnly: true };
  }
  if (!isWithinGrace(device.lastPolicySyncAt, device.offlineGraceDays, input.now)) {
    return { allowed: false, reason: OfflineDenyReason.graceExpired, readOnly: true };
  }
  return { allowed: true, reason: OfflineDenyReason.ok, readOnly: false };
}

export class OfflineScopeError extends Error {
  constructor(public readonly reason: OfflineAuthorizationResult["reason"], message: string) {
    super(message);
    this.name = "OfflineScopeError";
  }
}

export interface ScopeContext {
  companyId: string;
  branchIds: string[];
  warehouseIds: string[];
  /** The device's bound terminal id + owning user (from the registered device). */
  terminalId: string;
  deviceId: string;
  userId: string;
}

export interface ScopedEnvelope {
  companyId: string;
  branchId: string | null;
  warehouseId: string | null;
  terminalId: string;
  deviceId: string;
  actorUserId: string;
}

/**
 * Enforce that an operation envelope is within the device's authorized scope.
 * Throws {@link OfflineScopeError} with a machine-readable reason on mismatch.
 */
export function assertOperationScope(envelope: ScopedEnvelope, scope: ScopeContext): void {
  if (envelope.companyId !== scope.companyId) {
    throw new OfflineScopeError(
      OfflineDenyReason.tenantMismatch,
      "Operation company does not match the authenticated tenant",
    );
  }
  if (envelope.deviceId !== scope.deviceId) {
    throw new OfflineScopeError(
      OfflineDenyReason.terminalMismatch,
      "Operation device does not match the registered device",
    );
  }
  if (envelope.terminalId !== scope.terminalId) {
    throw new OfflineScopeError(
      OfflineDenyReason.terminalMismatch,
      "Operation terminal does not match the registered terminal",
    );
  }
  if (envelope.actorUserId !== scope.userId) {
    throw new OfflineScopeError(
      OfflineDenyReason.permissionDenied,
      "Operation actor does not match the authenticated user",
    );
  }
  if (envelope.branchId && !scope.branchIds.includes(envelope.branchId)) {
    throw new OfflineScopeError(
      OfflineDenyReason.branchMismatch,
      "Operation branch is outside the authorized scope",
    );
  }
  if (envelope.warehouseId && !scope.warehouseIds.includes(envelope.warehouseId)) {
    throw new OfflineScopeError(
      OfflineDenyReason.warehouseMismatch,
      "Operation warehouse is outside the authorized scope",
    );
  }
}
