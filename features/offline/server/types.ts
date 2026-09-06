/**
 * Offline server-side shared types (Phase 3/4).
 *
 * Pure types + string unions shared by the device/terminal authorization layer
 * and the sync engine. No Prisma or Next imports so the logic stays unit-testable.
 */

export type TerminalDeviceStatus = "pending" | "active" | "revoked";
export type TerminalAllocationStatus = "active" | "exhausted" | "expired" | "revoked";
export type OfflineAllowanceStatus = "active" | "used" | "expired" | "revoked";
export type TerminalReceiptRangeStatus = "active" | "exhausted" | "revoked";

/** Default offline authorization grace period (requirements §5.3). */
export const DEFAULT_OFFLINE_GRACE_DAYS = 7;

/**
 * Machine-readable reasons an offline write may be denied. UI maps these to
 * localized, user-safe messages; the server is always the final authority.
 */
export const OfflineDenyReason = {
  ok: "ok",
  deviceNotFound: "device_not_found",
  deviceNotActivated: "device_not_activated",
  deviceRevoked: "device_revoked",
  graceExpired: "grace_expired",
  policyStale: "policy_stale",
  permissionDenied: "permission_denied",
  userDisabled: "user_disabled",
  tenantMismatch: "tenant_mismatch",
  branchMismatch: "branch_mismatch",
  warehouseMismatch: "warehouse_mismatch",
  terminalMismatch: "terminal_mismatch",
} as const;

export type OfflineDenyReasonValue =
  (typeof OfflineDenyReason)[keyof typeof OfflineDenyReason];

export interface OfflineAuthorizationResult {
  allowed: boolean;
  reason: OfflineDenyReasonValue;
  /** true when reads are still allowed even though writes are blocked. */
  readOnly: boolean;
}

/** Minimal, non-secret cached security snapshot handed to a device. */
export interface SecuritySnapshot {
  companyId: string;
  branchId: string;
  warehouseId: string | null;
  terminalId: string;
  deviceId: string;
  userId: string;
  username: string;
  role: string;
  /** POS permission action → allowed. */
  permissions: Record<string, boolean>;
  /** Approval policy snapshot (read-only offline). */
  approvalRules: Record<string, unknown>;
  policyVersion: number;
  offlineGraceDays: number;
  lastPolicySyncAt: string;
  /** Never includes passwords, tokens, DB URLs, or any secret. */
}
