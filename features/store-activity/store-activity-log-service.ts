import type { Prisma } from "@prisma/client";

import { maskAuditJson } from "@/features/audit/audit-log-service";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export type StoreActivityLogFilters = {
  action?: string;
  actorId?: string;
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  page?: number;
  status?: string;
  terminalId?: string;
};

export type StoreActivityLogRecord = {
  action: string;
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  afterValue?: unknown;
  amount?: string | null;
  beforeValue?: unknown;
  branch?: { id: string; name: string | null } | null;
  branchId?: string | null;
  business?: { id: string; name: string | null } | null;
  businessId: string;
  createdAt: string;
  currency: string;
  deviceName?: string | null;
  id: string;
  metadata?: unknown;
  occurredAt: string;
  status: string;
  syncedAt?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  targetType: string;
  terminalId?: string | null;
  terminalName?: string | null;
};

export type StoreActivityLogOptions = {
  actions: string[];
  actors: Array<{ id: string; name: string }>;
  branches: Array<{ id: string; name: string }>;
  statuses: string[];
  terminals: Array<{ id: string; name: string }>;
};

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 50;
  return Math.max(1, Math.min(Math.floor(value ?? 50), 100));
}

function safeDate(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

function clean(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : undefined;
}

export function parseStoreActivityLogFilters(searchParams: URLSearchParams): StoreActivityLogFilters {
  return {
    action: clean(searchParams.get("action") ?? undefined),
    actorId: clean(searchParams.get("actorId") ?? undefined),
    branchId: clean(searchParams.get("branchId") ?? undefined),
    dateFrom: clean(searchParams.get("dateFrom") ?? undefined),
    dateTo: clean(searchParams.get("dateTo") ?? undefined),
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
    status: clean(searchParams.get("status") ?? undefined),
    terminalId: clean(searchParams.get("terminalId") ?? undefined),
  };
}

function buildWhere(tenant: TenantContext, filters: StoreActivityLogFilters): Prisma.StoreActivityLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  const dateFrom = safeDate(filters.dateFrom);
  const dateTo = safeDate(filters.dateTo, true);
  if (dateFrom) createdAt.gte = dateFrom;
  if (dateTo) createdAt.lte = dateTo;

  return {
    businessId: tenant.companyId,
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(dateFrom || dateTo ? { createdAt } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.terminalId ? { terminalId: filters.terminalId } : {}),
  };
}

function serializeLog(row: any): StoreActivityLogRecord {
  return {
    action: row.action,
    actorId: row.actorId ?? null,
    actorName: row.actorName,
    actorRole: row.actorRole,
    afterValue: maskAuditJson(row.afterValue),
    amount: row.amount == null ? null : String(row.amount),
    beforeValue: maskAuditJson(row.beforeValue),
    branch: row.branch ? { id: row.branch.id, name: row.branch.name ?? null } : null,
    branchId: row.branchId ?? null,
    business: row.business ? { id: row.business.id, name: row.business.name ?? null } : null,
    businessId: row.businessId,
    createdAt: row.createdAt.toISOString(),
    currency: row.currency ?? "LAK",
    deviceName: row.deviceName ?? null,
    id: row.id,
    metadata: maskAuditJson(row.metadata),
    occurredAt: row.occurredAt.toISOString(),
    status: row.status ?? "success",
    syncedAt: row.syncedAt ? row.syncedAt.toISOString() : null,
    targetId: row.targetId ?? null,
    targetName: row.targetName ?? null,
    targetType: row.targetType,
    terminalId: row.terminalId ?? null,
    terminalName: row.terminalName ?? null,
  };
}

export async function listStoreActivityLogsForTenant(tenant: TenantContext, filters: StoreActivityLogFilters = {}) {
  const limit = boundedLimit(filters.limit);
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const where = buildWhere(tenant, filters);
  const rows = await db.storeActivityLog.findMany({
    include: {
      branch: { select: { id: true, name: true } },
      business: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
    where,
  });
  const total = await db.storeActivityLog.count({ where });

  return {
    logs: rows.map(serializeLog),
    pagination: {
      hasNextPage: page * limit < total,
      limit,
      page,
      total,
    },
  };
}

export async function getStoreActivityLogFilterOptions(tenant: TenantContext): Promise<StoreActivityLogOptions> {
  const where = { businessId: tenant.companyId };
  const [actions, statuses, actorRows, branchRows, terminalRows] = await Promise.all([
    db.storeActivityLog.findMany({ distinct: ["action"], orderBy: { action: "asc" }, select: { action: true }, where }),
    db.storeActivityLog.findMany({ distinct: ["status"], orderBy: { status: "asc" }, select: { status: true }, where }),
    db.storeActivityLog.findMany({
      distinct: ["actorId"],
      orderBy: { actorName: "asc" },
      select: { actorId: true, actorName: true },
      where: { ...where, actorId: { not: null } },
    }),
    db.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true }, where: { companyId: tenant.companyId } }),
    db.storeActivityLog.findMany({
      distinct: ["terminalId"],
      orderBy: { terminalName: "asc" },
      select: { terminalId: true, terminalName: true },
      where: { ...where, terminalId: { not: null } },
    }),
  ]);

  return {
    actions: actions.map((row: { action: string }) => row.action).filter(Boolean),
    actors: actorRows
      .map((row: { actorId: string | null; actorName: string }) => ({ id: row.actorId ?? "", name: row.actorName }))
      .filter((row: { id: string; name: string }) => row.id && row.name),
    branches: branchRows.map((row: { id: string; name: string | null }) => ({ id: row.id, name: row.name ?? "Branch" })),
    statuses: statuses.map((row: { status: string }) => row.status).filter(Boolean),
    terminals: terminalRows
      .map((row: { terminalId: string | null; terminalName: string | null }) => ({
        id: row.terminalId ?? "",
        name: row.terminalName ?? row.terminalId ?? "Terminal",
      }))
      .filter((row: { id: string; name: string }) => row.id),
  };
}
