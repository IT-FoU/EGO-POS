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
  processPush,
  pullDelta,
  syncStatus,
} from "./sync-engine";
import {
  SYNC_SCHEMA_VERSION,
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
import { buildReferenceEntities } from "./prisma-reference-provider";
import { paginateReferenceEntities } from "../replica/reference-snapshot";
import { assertSingleWarehouseRollout, SINGLE_WAREHOUSE_ROLLOUT } from "../config";

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
  /** Warehouses this terminal is permitted to receive warehouse-scoped changes for. */
  warehouseIds: string[];
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

  // A terminal receives warehouse-scoped changes for ITS warehouse only. Prefer
  // the device's bound warehouse; otherwise fall back to the tenant scope. The
  // single-warehouse rollout limitation is enforced here (not assumed).
  const warehouseIds = deviceRow.warehouseId
    ? [deviceRow.warehouseId]
    : scope.warehouseIds;
  try {
    assertSingleWarehouseRollout(warehouseIds);
  } catch (error) {
    throw new SyncRequestError(
      error instanceof Error ? error.message : "Single-warehouse rollout violation",
    );
  }

  const scopeContext: ScopeContext = {
    companyId: tenant.companyId,
    branchIds: scope.branchIds,
    warehouseIds,
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
  return { scope: scopeContext, device, deviceId: trimmed, warehouseIds };
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
  return pullDelta(
    getSyncStore(),
    tenant.companyId,
    ctx.deviceId,
    validation.value,
    new Date(),
    ctx.scope.branchIds,
    ctx.warehouseIds,
  );
}

export async function bootstrapSync(
  tenant: TenantContext,
  query: { deviceId: string; cursor?: string | null; limit?: string | null },
): Promise<BootstrapResponse> {
  const validation = validateBootstrapRequest({ cursor: query.cursor, limit: query.limit });
  if (!validation.ok) throw new SyncRequestError(validation.error);
  if (!query.deviceId?.trim()) throw new SyncRequestError("deviceId is required");

  // Reference snapshot is tenant/branch/warehouse/terminal scoped; empty means
  // empty (paginateReferenceEntities never seeds defaults).
  const entities = await buildReferenceEntities(tenant, query.deviceId);
  const page = paginateReferenceEntities(entities, validation.value.cursor, validation.value.limit);
  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    entities: page.entities.map((entity) => ({
      entityType: entity.entityType,
      entityId: entity.entityId,
      version: entity.version,
      payload: entity.payload,
    })),
    nextCursor: page.nextCursor,
    hasMore: page.hasMore,
    complete: page.complete,
  };
}

export async function statusSync(
  tenant: TenantContext,
  query: { deviceId: string },
): Promise<SyncStatusResponse> {
  const ctx = await resolveSyncContext(tenant, query.deviceId);
  const status = await syncStatus(getSyncStore(), tenant.companyId, ctx.deviceId);
  return {
    ...status,
    singleWarehouseRollout: SINGLE_WAREHOUSE_ROLLOUT,
    warehouseScope: ctx.warehouseIds,
    deviceStatus: ctx.device.status,
    policyVersion: ctx.device.policyVersion,
  };
}
