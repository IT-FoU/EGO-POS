/**
 * Cached security snapshot builder (Phase 3, requirements §5.3).
 *
 * Assembles the minimal, non-secret policy snapshot a device caches for offline
 * authorization. It contains identity, role, POS permissions, approval policy,
 * a policy version, and the last policy-sync timestamp — and never any password,
 * token, database URL, or other secret. Pure; the caller supplies already-loaded
 * (server-authorized) policy data.
 */

import type { SecuritySnapshot } from "./types";

export interface BuildSecuritySnapshotInput {
  companyId: string;
  branchId: string;
  warehouseId: string | null;
  terminalId: string;
  deviceId: string;
  userId: string;
  username: string;
  role: string;
  permissions: Record<string, boolean>;
  approvalRules: Record<string, unknown>;
  policyVersion: number;
  offlineGraceDays: number;
  lastPolicySyncAt: string;
}

/** Keys that must never appear in a cached snapshot. */
const FORBIDDEN_KEYS = [
  "password",
  "passwordhash",
  "token",
  "accesstoken",
  "secret",
  "databaseurl",
  "database_url",
  "connectionstring",
];

function assertNoSecrets(record: Record<string, unknown>, where: string): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
      throw new Error(`Refusing to cache secret-like field "${key}" in ${where}`);
    }
  }
}

export function buildSecuritySnapshot(input: BuildSecuritySnapshotInput): SecuritySnapshot {
  assertNoSecrets(input.approvalRules, "approvalRules");
  return {
    companyId: input.companyId,
    branchId: input.branchId,
    warehouseId: input.warehouseId,
    terminalId: input.terminalId,
    deviceId: input.deviceId,
    userId: input.userId,
    username: input.username,
    role: input.role,
    permissions: { ...input.permissions },
    approvalRules: { ...input.approvalRules },
    policyVersion: input.policyVersion,
    offlineGraceDays: input.offlineGraceDays,
    lastPolicySyncAt: input.lastPolicySyncAt,
  };
}
