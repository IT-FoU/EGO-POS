/**
 * Sync endpoint wiring (Phase 4, server-only).
 *
 * Resolves the authenticated tenant + registered device into the engine's
 * PushContext (reusing `resolveTenantScope`), then delegates to the pure sync
 * engine over the Prisma-backed store. All routes are session/tenant/permission
 * secured by `runRead`/`runWrite`; server validation is never bypassed.
 */

import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import type { DeviceAuthzView, ScopeContext } from "./authorization";
import {
  bootstrap,
  processPush,
  pullDelta,
  syncStatus,
} from "./sync-engine";
import {
  validateBootstrapRequest,
  validatePullRequest,
  validatePushRequest,
  type BootstrapResponse,
  type PullResponse,
  type PushResponse,
  type SyncStatusResponse,
} from "./sync-contract";
import { PrismaSyncStore } from "./prisma-sync-store";
import type { SyncStore } from "./sync-store";

const db = prisma as any;

let sharedStore: SyncStore | null = null;
export function getSyncStore(): SyncStore {
  if (!sharedStore) sharedStore = new PrismaSyncStore();
  return sharedStore;
}

export class SyncRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncRequestError";
  }
}

interface ResolvedSyncContext {
  scope: ScopeContext;
  device: DeviceAuthzView;
  deviceId: string;
}

async function resolveSyncContext(
  tenant: TenantContext,
  deviceId: string,
): Promise<ResolvedSyncContext> {
  const trimmed = deviceId.trim();
  if (!trimmed) throw new SyncRequestError("deviceId is required");
  const [deviceRow, scope] = await Promise.all([
    db.terminalDevice.findUnique({
      where: { companyId_deviceId: { companyId: tenant.companyId, deviceId: trimmed } },
    }),
    resolveTenantScope(tenant),
  ]);
  if (!deviceRow) throw new SyncRequestError("Terminal device is not registered for this company");

  const scopeContext: ScopeContext = {
    companyId: tenant.companyId,
    branchIds: scope.branchIds,
    warehouseIds: scope.warehouseIds,
    terminalId: deviceRow.terminalId,
    deviceId: trimmed,
    userId: scope.userId,
  };
  const device: DeviceAuthzView = {
    status: deviceRow.status,
    policyVersion: deviceRow.policyVersion,
    offlineGraceDays: deviceRow.offlineGraceDays,
    lastPolicySyncAt: deviceRow.lastPolicySyncAt
      ? new Date(deviceRow.lastPolicySyncAt).toISOString()
      : null,
  };
  return { scope: scopeContext, device, deviceId: trimmed };
}

export async function pushSync(tenant: TenantContext, body: unknown): Promise<PushResponse> {
  const validation = validatePushRequest(body);
  if (!validation.ok) throw new SyncRequestError(validation.error);
  const request = validation.value;
  const ctx = await resolveSyncContext(tenant, request.deviceId);
  const cachedPolicyVersion = Number(
    (body as Record<string, unknown>)?.policyVersion ?? ctx.device.policyVersion,
  );
  return processPush(getSyncStore(), {
    companyId: tenant.companyId,
    deviceId: ctx.deviceId,
    scope: ctx.scope,
    device: ctx.device,
    cachedPolicyVersion: Number.isFinite(cachedPolicyVersion)
      ? cachedPolicyVersion
      : ctx.device.policyVersion,
    now: new Date(),
  }, request.operations);
}

export async function pullSync(
  tenant: TenantContext,
  query: { deviceId: string; cursor?: string | null; limit?: string | null },
): Promise<PullResponse> {
  const validation = validatePullRequest({ cursor: query.cursor, limit: query.limit });
  if (!validation.ok) throw new SyncRequestError(validation.error);
  const ctx = await resolveSyncContext(tenant, query.deviceId);
  return pullDelta(getSyncStore(), tenant.companyId, ctx.deviceId, validation.value);
}

export async function bootstrapSync(
  tenant: TenantContext,
  query: { cursor?: string | null; limit?: string | null },
): Promise<BootstrapResponse> {
  const validation = validateBootstrapRequest({ cursor: query.cursor, limit: query.limit });
  if (!validation.ok) throw new SyncRequestError(validation.error);
  return bootstrap(getSyncStore(), tenant.companyId, validation.value);
}

export async function statusSync(
  tenant: TenantContext,
  query: { deviceId: string },
): Promise<SyncStatusResponse> {
  const ctx = await resolveSyncContext(tenant, query.deviceId);
  return syncStatus(getSyncStore(), tenant.companyId, ctx.deviceId);
}
