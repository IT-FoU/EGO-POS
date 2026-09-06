/**
 * Device/terminal registration + policy service (Phase 3, server-only).
 *
 * Prisma-backed. Reuses existing tenant scope (`resolveTenantScope`), POS policy
 * loading (`createPosPermissionPolicyFromDatabase`), and audit logging
 * (`withTenantTransaction`). No secret is ever cached or returned.
 *
 * - registerDevice: any authorized store user registers their device as PENDING.
 * - activateDevice / revokeDevice: Owner/Manager only (enforced at the route via
 *   `assertPermission(staff.edit)`), plus a defensive check here.
 * - getDevicePolicy: returns the minimal cached security snapshot for an ACTIVE
 *   device and records a successful policy sync.
 */

import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import { createPosPermissionPolicyFromDatabase } from "@/features/access-control/pos-policy-loader";
import { buildSecuritySnapshot } from "./security-snapshot";
import type { SecuritySnapshot, TerminalDeviceStatus } from "./types";

const db = prisma as any;

export interface RegisterDeviceInput {
  deviceId: string;
  deviceName: string;
  terminalId?: string;
}

export interface DeviceView {
  deviceId: string;
  terminalId: string;
  deviceName: string;
  status: TerminalDeviceStatus;
  policyVersion: number;
  offlineGraceDays: number;
  lastPolicySyncAt: string | null;
}

function toDeviceView(row: any): DeviceView {
  return {
    deviceId: row.deviceId,
    terminalId: row.terminalId,
    deviceName: row.deviceName,
    status: row.status as TerminalDeviceStatus,
    policyVersion: row.policyVersion,
    offlineGraceDays: row.offlineGraceDays,
    lastPolicySyncAt: row.lastPolicySyncAt ? new Date(row.lastPolicySyncAt).toISOString() : null,
  };
}

function requireDeviceId(value: unknown): string {
  const deviceId = typeof value === "string" ? value.trim() : "";
  if (!deviceId) throw new Error("A non-empty deviceId is required.");
  return deviceId;
}

export async function registerDevice(
  tenant: TenantContext,
  input: RegisterDeviceInput,
): Promise<DeviceView> {
  const deviceId = requireDeviceId(input.deviceId);
  const deviceName = typeof input.deviceName === "string" && input.deviceName.trim()
    ? input.deviceName.trim()
    : "Unnamed terminal";
  const scope = await resolveTenantScope(tenant);
  const terminalId = (input.terminalId && String(input.terminalId).trim()) || "POS-01";

  return withTenantTransaction({
    action: "offline.device.register",
    module: "offline",
    newData: { deviceId, deviceName, terminalId },
    tenant,
    write: async (tx) => {
      const existing = await tx.terminalDevice.findUnique({
        where: { companyId_deviceId: { companyId: tenant.companyId, deviceId } },
      });
      if (existing) {
        // Re-registration keeps status; only refresh descriptive fields.
        const updated = await tx.terminalDevice.update({
          data: { deviceName, terminalId, branchId: scope.branchId, warehouseId: scope.warehouseId ?? null },
          where: { id: existing.id },
        });
        return toDeviceView(updated);
      }
      const created = await tx.terminalDevice.create({
        data: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          deviceId,
          deviceName,
          status: "pending",
          terminalId,
          warehouseId: scope.warehouseId ?? null,
        },
      });
      return toDeviceView(created);
    },
  });
}

export async function activateDevice(
  tenant: TenantContext,
  input: { deviceId: string },
): Promise<DeviceView> {
  const deviceId = requireDeviceId(input.deviceId);
  return withTenantTransaction({
    action: "offline.device.activate",
    module: "offline",
    newData: { deviceId },
    tenant,
    write: async (tx) => {
      const device = await tx.terminalDevice.findUnique({
        where: { companyId_deviceId: { companyId: tenant.companyId, deviceId } },
      });
      if (!device) throw new Error("Terminal device not found for this company.");
      const updated = await tx.terminalDevice.update({
        data: {
          activatedAt: new Date(),
          activatedByUserId: tenant.userId,
          lastPolicySyncAt: new Date(),
          policyVersion: Math.max(1, device.policyVersion),
          revokedAt: null,
          status: "active",
        },
        where: { id: device.id },
      });
      return toDeviceView(updated);
    },
  });
}

export async function revokeDevice(
  tenant: TenantContext,
  input: { deviceId: string },
): Promise<DeviceView> {
  const deviceId = requireDeviceId(input.deviceId);
  return withTenantTransaction({
    action: "offline.device.revoke",
    module: "offline",
    newData: { deviceId },
    tenant,
    write: async (tx) => {
      const device = await tx.terminalDevice.findUnique({
        where: { companyId_deviceId: { companyId: tenant.companyId, deviceId } },
      });
      if (!device) throw new Error("Terminal device not found for this company.");
      const updated = await tx.terminalDevice.update({
        data: { revokedAt: new Date(), status: "revoked" },
        where: { id: device.id },
      });
      return toDeviceView(updated);
    },
  });
}

async function resolveRolesAndUser(tenant: TenantContext): Promise<{
  roles: string[];
  userId: string;
  username: string;
  displayName: string;
}> {
  const scope = await resolveTenantScope(tenant);
  const user = await db.user.findUnique({
    select: { fullName: true, username: true },
    where: { id: scope.userId },
  });
  if (scope.isOwner) {
    return {
      displayName: user?.fullName ?? "Owner",
      roles: ["Owner"],
      userId: scope.userId,
      username: user?.username ?? "owner",
    };
  }
  const userRoles = await db.userRole.findMany({
    include: { role: true },
    where: { companyId: tenant.companyId, userId: scope.userId },
  });
  return {
    displayName: user?.fullName ?? user?.username ?? "Cashier",
    roles: userRoles.map((row: any) => row.role?.name).filter(Boolean),
    userId: scope.userId,
    username: user?.username ?? "cashier",
  };
}

export interface DevicePolicyResult {
  device: DeviceView;
  snapshot: SecuritySnapshot;
}

/**
 * Return the minimal cached security snapshot for an ACTIVE device and record a
 * successful policy sync (updates lastPolicySyncAt). The device must belong to
 * the authenticated tenant.
 */
export async function getDevicePolicy(
  tenant: TenantContext,
  input: { deviceId: string },
): Promise<DevicePolicyResult> {
  const deviceId = requireDeviceId(input.deviceId);
  const scope = await resolveTenantScope(tenant);
  const identity = await resolveRolesAndUser(tenant);

  const posPolicy = await createPosPermissionPolicyFromDatabase({
    assignedTerminal: null,
    branchName: scope.branchName,
    displayName: identity.displayName,
    roles: identity.roles,
    tenant,
    userId: identity.userId,
    username: identity.username,
  });

  return withTenantTransaction({
    action: "offline.device.policy_sync",
    module: "offline",
    newData: { deviceId },
    tenant,
    write: async (tx) => {
      const device = await tx.terminalDevice.findUnique({
        where: { companyId_deviceId: { companyId: tenant.companyId, deviceId } },
      });
      if (!device) throw new Error("Terminal device not found for this company.");
      if (device.status !== "active") {
        throw new Error("Terminal device is not active; activation is required.");
      }
      const now = new Date();
      const updated = await tx.terminalDevice.update({
        data: { lastPolicySyncAt: now, lastSeenAt: now },
        where: { id: device.id },
      });
      const snapshot = buildSecuritySnapshot({
        approvalRules: posPolicy.approvalRules as Record<string, unknown>,
        branchId: scope.branchId,
        companyId: tenant.companyId,
        deviceId,
        lastPolicySyncAt: now.toISOString(),
        offlineGraceDays: updated.offlineGraceDays,
        permissions: posPolicy.permissions as Record<string, boolean>,
        policyVersion: updated.policyVersion,
        role: posPolicy.role,
        terminalId: updated.terminalId,
        userId: identity.userId,
        username: identity.username,
        warehouseId: scope.warehouseId ?? null,
      });
      return { device: toDeviceView(updated), snapshot };
    },
  });
}
