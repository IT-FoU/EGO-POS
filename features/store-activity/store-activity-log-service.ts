import type { Prisma } from "@prisma/client";

import { maskAuditJson } from "@/features/audit/audit-log-service";
import {
  activityActionMatchesModule,
  ESSENTIAL_ACTIVITY_ACTIONS,
  ESSENTIAL_ACTIVITY_MODULES,
} from "@/features/store-activity/record-essential-activity";
import { UNMATCHED_TERMINAL_ID } from "@/features/terminals/terminal-analytics";
import { endOfBusinessDay, startOfBusinessDay, startOfBusinessMonth } from "@/lib/datetime/business-timezone";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export type StoreActivityLogFilters = {
  action?: string;
  actorId?: string;
  branchId?: string;
  dateFrom?: string;
  datePreset?: string;
  dateTo?: string;
  limit?: number;
  module?: string;
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
  modules: string[];
  terminals: Array<{ id: string; name: string }>;
};

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 50;
  return Math.max(1, Math.min(Math.floor(value ?? 50), 100));
}

function businessDayRange(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const anchor = new Date(`${value}T12:00:00+07:00`);
  if (Number.isNaN(anchor.getTime())) return null;
  return { gte: startOfBusinessDay(anchor), lte: endOfBusinessDay(anchor) };
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
    datePreset: clean(searchParams.get("datePreset") ?? undefined),
    dateTo: clean(searchParams.get("dateTo") ?? undefined),
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    module: clean(searchParams.get("module") ?? undefined),
    page: searchParams.get("page") ? Number(searchParams.get("page")) : undefined,
    status: clean(searchParams.get("status") ?? undefined),
    terminalId: clean(searchParams.get("terminalId") ?? undefined),
  };
}

export function activityCreatedAtRange(filters: StoreActivityLogFilters): Prisma.DateTimeFilter {
  const preset = filters.datePreset || (filters.dateFrom || filters.dateTo ? "custom" : "today");
  if (preset === "month") {
    return { gte: startOfBusinessMonth(), lte: endOfBusinessDay() };
  }
  if (preset === "custom") {
    const day = businessDayRange(filters.dateFrom);
    if (day && (!filters.dateTo || filters.dateTo === filters.dateFrom)) return day;
    const from = businessDayRange(filters.dateFrom);
    const to = businessDayRange(filters.dateTo);
    if (from || to) {
      return {
        ...(from ? { gte: from.gte } : {}),
        ...(to ? { lte: to.lte } : {}),
      };
    }
  }
  return { gte: startOfBusinessDay(), lte: endOfBusinessDay() };
}

export function buildStoreActivityWhere(
  tenant: TenantContext,
  filters: StoreActivityLogFilters,
  companyTerminalIds: string[],
  companyUserIds: string[],
): Prisma.StoreActivityLogWhereInput {
  const where: Prisma.StoreActivityLogWhereInput = {
    businessId: tenant.companyId,
    createdAt: activityCreatedAtRange(filters),
  };
  if (filters.branchId) where.branchId = filters.branchId;
  if (filters.status) where.status = filters.status;

  const terminalId = clean(filters.terminalId);
  if (terminalId && terminalId !== "all") {
    where.terminalId = companyTerminalIds.includes(terminalId) ? terminalId : UNMATCHED_TERMINAL_ID;
  }

  const actorId = clean(filters.actorId);
  if (actorId && actorId !== "all") {
    where.actorId = companyUserIds.includes(actorId) ? actorId : UNMATCHED_TERMINAL_ID;
  }

  const moduleName = clean(filters.module);
  const action = clean(filters.action);
  if (moduleName && !(ESSENTIAL_ACTIVITY_MODULES as readonly string[]).includes(moduleName)) {
    where.action = UNMATCHED_TERMINAL_ID;
  } else if (action && moduleName && !activityActionMatchesModule(action, moduleName)) {
    where.action = UNMATCHED_TERMINAL_ID;
  } else if (action) {
    where.action = action;
  } else if (moduleName === "pos") {
    where.action = { startsWith: "pos." };
  } else if (moduleName === "products") {
    where.action = { startsWith: "product." };
  } else if (moduleName === "inventory") {
    where.action = { startsWith: "inventory." };
  } else if (moduleName === "staff") {
    where.action = { startsWith: "staff." };
  } else if (moduleName === "settings") {
    where.OR = [{ action: { startsWith: "settings." } }, { action: { startsWith: "terminal." } }];
  }

  return where;
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
  const [terminalRows, memberRows] = await Promise.all([
    db.posTerminal.findMany({
      orderBy: { terminalCode: "asc" },
      select: { id: true, terminalCode: true, terminalName: true },
      where: { companyId: tenant.companyId },
    }),
    db.companyUser.findMany({
      select: { user: { select: { fullName: true, username: true } }, userId: true },
      where: { companyId: tenant.companyId },
    }),
  ]);
  const actors = new Map<string, string>();
  for (const member of memberRows as Array<{ user?: { fullName?: string | null; username?: string | null } | null; userId: string }>) {
    if (!member.userId || actors.has(member.userId)) continue;
    actors.set(member.userId, String(member.user?.fullName || member.user?.username || "Staff"));
  }
  const where = buildStoreActivityWhere(tenant, filters, terminalRows.map((row: { id: string }) => row.id), [...actors.keys()]);
  const [rows, total] = await Promise.all([
    db.storeActivityLog.findMany({
      include: {
        branch: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      where,
    }),
    db.storeActivityLog.count({ where }),
  ]);

  return {
    logs: rows.map(serializeLog),
    options: {
      actions: [...ESSENTIAL_ACTIVITY_ACTIONS],
      actors: [...actors.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((left, right) => left.name.localeCompare(right.name)),
      modules: [...ESSENTIAL_ACTIVITY_MODULES],
      terminals: terminalRows.map((row: { id: string; terminalCode: string; terminalName?: string | null }) => ({
        id: row.id,
        name: row.terminalName ? `${row.terminalCode} · ${row.terminalName}` : row.terminalCode,
      })),
    },
    pagination: {
      hasNextPage: page * limit < total,
      limit,
      page,
      total,
    },
  };
}
