/**
 * R9B Day Off repository — policies, requests, approval, Worked-on-Day-Off.
 */
import { prisma } from "@/lib/db/prisma";
import {
  assertValidQuotaDays,
  assertValidWeekday,
  computeRemainingQuota,
  countUsedQuotaDays,
  DAY_OFF_REQUEST_KIND,
  DAY_OFF_SOURCE,
  DAY_OFF_STATUS,
  monthKeyFromBusinessDate,
  monthKeyFromRequestDateLabel,
  parseRequestDateOnly,
  requestDateLabel,
  resolveConfiguredQuotaDays,
  type DayOffAttendanceKind,
  type DayOffRequestKind,
  type DayOffSource,
  type DayOffStatus,
} from "@/features/day-off/day-off-math";
import { weekdayForBusinessInstant } from "@/features/attendance/attendance-math";
import { businessDayLabel, businessMonthLabel } from "@/lib/datetime/business-timezone";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import { STORE_ROLES, hasStorePermission, STORE_ACTIONS, normalizeStoreRole } from "@/features/permissions/store-permissions";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";

const db = prisma as any;

const WEEKLY_BLOCKS_QUOTA = "This date is already a Weekly Day Off.";

export type DayOffQuotaSummary = {
  monthKey: string;
  quotaDays: number | null;
  remaining: number | null;
  snapshotExists: boolean;
  used: number;
};

export type DayOffRequestSummary = {
  decidedAt: string | null;
  decidedBy: string | null;
  decisionNote: string | null;
  id: string;
  kind: DayOffRequestKind;
  monthKey: string;
  quotaConsumed: boolean;
  quotaReturned: boolean;
  reason: string | null;
  requestDate: string;
  requestedAt: string;
  source: DayOffSource;
  status: DayOffStatus;
  userId: string;
  workedMarkedAt: string | null;
};

function mapRequest(row: Record<string, any>): DayOffRequestSummary {
  return {
    decidedAt: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
    decidedBy: row.decidedBy ? String(row.decidedBy) : null,
    decisionNote: row.decisionNote ? String(row.decisionNote) : null,
    id: String(row.id),
    kind: row.kind === "special" ? "special" : "quota",
    monthKey: String(row.monthKey),
    quotaConsumed: Boolean(row.quotaConsumed),
    quotaReturned: Boolean(row.quotaReturned),
    reason: row.reason ? String(row.reason) : null,
    requestDate: requestDateLabel(new Date(row.requestDate)),
    requestedAt: new Date(row.requestedAt).toISOString(),
    source: row.source === "grant" ? "grant" : "employee",
    status: String(row.status) as DayOffStatus,
    userId: String(row.userId),
    workedMarkedAt: row.workedMarkedAt ? new Date(row.workedMarkedAt).toISOString() : null,
  };
}

async function resolveConfiguredQuota(tx: any, companyId: string, userId: string): Promise<number> {
  const [override, companyDefault] = await Promise.all([
    tx.staffDayOffQuotaPolicy.findFirst({ where: { companyId, userId } }),
    tx.staffDayOffQuotaPolicy.findFirst({ where: { companyId, userId: null } }),
  ]);
  return resolveConfiguredQuotaDays({
    companyDefault: companyDefault?.monthlyQuotaDays,
    employeeOverride: override?.monthlyQuotaDays,
  });
}

/** Read-only: never creates staff_day_off_months. */
export async function getQuotaSummaryReadOnly(
  tenant: TenantContext,
  userId: string,
  monthKey = businessMonthLabel(new Date()),
): Promise<DayOffQuotaSummary> {
  const [snapshot, requests, configured] = await Promise.all([
    db.staffDayOffMonth.findFirst({
      where: { companyId: tenant.companyId, monthKey, userId },
    }),
    db.staffDayOffRequest.findMany({
      where: { companyId: tenant.companyId, monthKey, userId },
    }),
    resolveConfiguredQuota(db, tenant.companyId, userId),
  ]);
  const used = countUsedQuotaDays(requests);
  if (!snapshot) {
    return {
      monthKey,
      quotaDays: null,
      remaining: computeRemainingQuota(configured, used),
      snapshotExists: false,
      used,
    };
  }
  return {
    monthKey,
    quotaDays: Number(snapshot.quotaDays),
    remaining: computeRemainingQuota(Number(snapshot.quotaDays), used),
    snapshotExists: true,
    used,
  };
}

/** Write path: create month snapshot if missing. */
async function ensureMonthSnapshotInTx(
  tx: any,
  companyId: string,
  userId: string,
  monthKey: string,
): Promise<{ quotaDays: number; id: string }> {
  const existing = await tx.staffDayOffMonth.findFirst({
    where: { companyId, monthKey, userId },
  });
  if (existing) {
    return { id: existing.id, quotaDays: Number(existing.quotaDays) };
  }
  const quotaDays = await resolveConfiguredQuota(tx, companyId, userId);
  const created = await tx.staffDayOffMonth.create({
    data: { companyId, monthKey, quotaDays, userId },
  });
  return { id: created.id, quotaDays: Number(created.quotaDays) };
}

export async function listWeeklyDayOffs(tenant: TenantContext, userId: string): Promise<number[]> {
  const rows = await db.staffWeeklyDayOff.findMany({
    orderBy: { weekday: "asc" },
    where: { companyId: tenant.companyId, userId },
  });
  return rows.map((row: any) => Number(row.weekday));
}

export async function upsertWeeklyDayOff(
  tenant: TenantContext,
  input: { userId: string; weekday: number },
) {
  assertValidWeekday(input.weekday);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE)) {
    throw new Error("Staff manage permission is required to configure Weekly Day Off.");
  }
  return withTenantTransaction({
    action: "upsert_weekly_day_off",
    module: "day_off",
    newData: input,
    tenant,
    write: async (tx) => {
      const existing = await tx.staffWeeklyDayOff.findFirst({
        where: { companyId: tenant.companyId, userId: input.userId, weekday: input.weekday },
      });
      if (existing) return existing;
      return tx.staffWeeklyDayOff.create({
        data: {
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          userId: input.userId,
          weekday: input.weekday,
        },
      });
    },
  });
}

export async function removeWeeklyDayOff(
  tenant: TenantContext,
  input: { userId: string; weekday: number },
) {
  assertValidWeekday(input.weekday);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE)) {
    throw new Error("Staff manage permission is required to configure Weekly Day Off.");
  }
  return withTenantTransaction({
    action: "remove_weekly_day_off",
    module: "day_off",
    newData: input,
    tenant,
    write: async (tx) => {
      await tx.staffWeeklyDayOff.deleteMany({
        where: { companyId: tenant.companyId, userId: input.userId, weekday: input.weekday },
      });
      return { ok: true };
    },
  });
}

export async function upsertQuotaPolicy(
  tenant: TenantContext,
  input: { monthlyQuotaDays: number; userId?: string | null },
) {
  assertValidQuotaDays(input.monthlyQuotaDays);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE)) {
    throw new Error("Staff manage permission is required to configure Day Off quota.");
  }
  const userId = input.userId === undefined ? null : input.userId;
  return withTenantTransaction({
    action: "upsert_day_off_quota_policy",
    module: "day_off",
    newData: input,
    tenant,
    write: async (tx) => {
      const existing = await tx.staffDayOffQuotaPolicy.findFirst({
        where: userId ? { companyId: tenant.companyId, userId } : { companyId: tenant.companyId, userId: null },
      });
      if (existing) {
        return tx.staffDayOffQuotaPolicy.update({
          data: { monthlyQuotaDays: input.monthlyQuotaDays, updatedBy: tenant.userId },
          where: { id: existing.id },
        });
      }
      return tx.staffDayOffQuotaPolicy.create({
        data: {
          companyId: tenant.companyId,
          monthlyQuotaDays: input.monthlyQuotaDays,
          updatedBy: tenant.userId,
          userId,
        },
      });
    },
  });
}

async function assertNoWeeklyConflict(tx: any, companyId: string, userId: string, requestDate: Date) {
  const label = requestDateLabel(requestDate);
  const [y, m, d] = label.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0) - 7 * 60 * 60 * 1000);
  const wd = weekdayForBusinessInstant(probe);
  const weekly = await tx.staffWeeklyDayOff.findFirst({
    where: { companyId, userId, weekday: wd },
  });
  if (weekly) throw new Error(WEEKLY_BLOCKS_QUOTA);
}

export async function createEmployeeQuotaRequest(
  tenant: TenantContext,
  input: { reason?: string; requestDate: string },
): Promise<DayOffRequestSummary> {
  const monthKey = monthKeyFromRequestDateLabel(input.requestDate);
  const requestDate = parseRequestDateOnly(input.requestDate);
  const scope = await resolveTenantScope(tenant);

  return withTenantTransaction({
    action: "create_day_off_request",
    module: "day_off",
    newData: input,
    tenant,
    write: async (tx) => {
      await assertNoWeeklyConflict(tx, tenant.companyId, tenant.userId, requestDate);

      const approved = await tx.staffDayOffRequest.findFirst({
        where: {
          companyId: tenant.companyId,
          requestDate,
          status: DAY_OFF_STATUS.APPROVED,
          userId: tenant.userId,
        },
      });
      if (approved) throw new Error("An approved Day Off already exists for this date.");

      const pending = await tx.staffDayOffRequest.findFirst({
        where: {
          companyId: tenant.companyId,
          requestDate,
          status: DAY_OFF_STATUS.PENDING,
          userId: tenant.userId,
        },
      });
      if (pending) throw new Error("A pending Day Off request already exists for this date.");

      // Snapshot only on real quota write.
      await ensureMonthSnapshotInTx(tx, tenant.companyId, tenant.userId, monthKey);

      const row = await tx.staffDayOffRequest.create({
        data: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          kind: DAY_OFF_REQUEST_KIND.QUOTA,
          monthKey,
          reason: input.reason?.trim() || null,
          requestDate,
          requestedBy: tenant.userId,
          source: DAY_OFF_SOURCE.EMPLOYEE,
          status: DAY_OFF_STATUS.PENDING,
          userId: tenant.userId,
        },
      });
      return mapRequest(row);
    },
  });
}

export async function grantSpecialDayOff(
  tenant: TenantContext,
  input: { reason?: string; requestDate: string; userId: string },
): Promise<DayOffRequestSummary> {
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE) && normalizeStoreRole(role) !== STORE_ROLES.OWNER) {
    if (!hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_FULL)) {
      throw new Error("Manager or Owner permission is required to grant Special Day Off.");
    }
  }
  if (input.userId === tenant.userId && normalizeStoreRole(role) !== STORE_ROLES.OWNER) {
    // Managers should not self-grant specials casually; Owner may.
  }
  const monthKey = monthKeyFromRequestDateLabel(input.requestDate);
  const requestDate = parseRequestDateOnly(input.requestDate);
  const scope = await resolveTenantScope(tenant);
  const now = new Date();

  return withTenantTransaction({
    action: "grant_special_day_off",
    module: "day_off",
    newData: input,
    tenant,
    write: async (tx) => {
      const approved = await tx.staffDayOffRequest.findFirst({
        where: {
          companyId: tenant.companyId,
          requestDate,
          status: DAY_OFF_STATUS.APPROVED,
          userId: input.userId,
        },
      });
      if (approved) throw new Error("An approved Day Off already exists for this date.");

      const row = await tx.staffDayOffRequest.create({
        data: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          decidedAt: now,
          decidedBy: tenant.userId,
          decisionNote: input.reason?.trim() || null,
          kind: DAY_OFF_REQUEST_KIND.SPECIAL,
          monthKey,
          reason: input.reason?.trim() || null,
          requestDate,
          requestedBy: tenant.userId,
          source: DAY_OFF_SOURCE.GRANT,
          status: DAY_OFF_STATUS.APPROVED,
          userId: input.userId,
        },
      });

      await markAttendanceWorkedOnDayOffInTx(tx, {
        attendanceKind: "special",
        companyId: tenant.companyId,
        requestId: row.id,
        requestDate,
        userId: input.userId,
      });

      return mapRequest(row);
    },
  });
}

async function assertApprover(tenant: TenantContext, targetUserId: string, targetBranchId: string) {
  const role = await resolveStoreRoleFromTenant(tenant);
  const normalized = normalizeStoreRole(role);
  if (normalized === STORE_ROLES.CASHIER) {
    throw new Error("Cashiers cannot approve Day Off requests.");
  }
  if (tenant.userId === targetUserId) {
    throw new Error("You cannot approve or decide your own Day Off request.");
  }
  if (normalized === STORE_ROLES.OWNER) return role;
  if (!hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_FULL) && !hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE)) {
    throw new Error("Manager or Owner permission is required.");
  }
  const scope = await resolveTenantScope(tenant);
  if (!scope.isOwner && scope.branchId !== targetBranchId) {
    throw new Error("Day Off request is outside your assigned branch.");
  }
  return role;
}

export async function approveDayOffRequest(
  tenant: TenantContext,
  requestId: string,
  decisionNote?: string,
): Promise<DayOffRequestSummary> {
  return withTenantTransaction({
    action: "approve_day_off",
    module: "day_off",
    newData: { decisionNote, requestId },
    tenant,
    write: async (tx) => {
      const row = await tx.staffDayOffRequest.findFirst({
        where: { companyId: tenant.companyId, id: requestId },
      });
      if (!row) throw new Error("Day Off request was not found.");
      if (row.status !== DAY_OFF_STATUS.PENDING) throw new Error("Only pending Day Off requests can be approved.");
      await assertApprover(tenant, String(row.userId), String(row.branchId));

      if (row.kind === DAY_OFF_REQUEST_KIND.QUOTA) {
        await assertNoWeeklyConflict(tx, tenant.companyId, String(row.userId), new Date(row.requestDate));
      }

      const existingApproved = await tx.staffDayOffRequest.findFirst({
        where: {
          companyId: tenant.companyId,
          id: { not: row.id },
          requestDate: row.requestDate,
          status: DAY_OFF_STATUS.APPROVED,
          userId: row.userId,
        },
      });
      if (existingApproved) {
        throw new Error("An approved Day Off already exists for this date.");
      }

      let quotaConsumed = false;
      if (row.kind === DAY_OFF_REQUEST_KIND.QUOTA) {
        const snapshot = await ensureMonthSnapshotInTx(tx, tenant.companyId, String(row.userId), String(row.monthKey));
        const monthRows = await tx.staffDayOffRequest.findMany({
          where: { companyId: tenant.companyId, monthKey: row.monthKey, userId: row.userId },
        });
        const used = countUsedQuotaDays(monthRows);
        const remaining = computeRemainingQuota(snapshot.quotaDays, used);
        if (remaining < 1) throw new Error("No remaining Day Off quota for this month.");
        quotaConsumed = true;
      }

      const now = new Date();
      const updated = await tx.staffDayOffRequest.update({
        data: {
          decidedAt: now,
          decidedBy: tenant.userId,
          decisionNote: decisionNote?.trim() || null,
          quotaConsumed,
          status: DAY_OFF_STATUS.APPROVED,
        },
        where: { id: row.id },
      });

      await markAttendanceWorkedOnDayOffInTx(tx, {
        attendanceKind: row.kind === "special" ? "special" : "quota",
        companyId: tenant.companyId,
        requestId: row.id,
        requestDate: new Date(row.requestDate),
        userId: String(row.userId),
      });

      return mapRequest(updated);
    },
  });
}

export async function rejectDayOffRequest(
  tenant: TenantContext,
  requestId: string,
  decisionNote?: string,
): Promise<DayOffRequestSummary> {
  return withTenantTransaction({
    action: "reject_day_off",
    module: "day_off",
    newData: { decisionNote, requestId },
    tenant,
    write: async (tx) => {
      const row = await tx.staffDayOffRequest.findFirst({
        where: { companyId: tenant.companyId, id: requestId },
      });
      if (!row) throw new Error("Day Off request was not found.");
      if (row.status !== DAY_OFF_STATUS.PENDING) throw new Error("Only pending Day Off requests can be rejected.");
      await assertApprover(tenant, String(row.userId), String(row.branchId));
      const updated = await tx.staffDayOffRequest.update({
        data: {
          decidedAt: new Date(),
          decidedBy: tenant.userId,
          decisionNote: decisionNote?.trim() || null,
          status: DAY_OFF_STATUS.REJECTED,
        },
        where: { id: row.id },
      });
      return mapRequest(updated);
    },
  });
}

/** Employee: pending only. Owner/Manager: approved (with quota restore rules). */
export async function cancelDayOffRequest(
  tenant: TenantContext,
  requestId: string,
  decisionNote?: string,
): Promise<DayOffRequestSummary> {
  return withTenantTransaction({
    action: "cancel_day_off",
    module: "day_off",
    newData: { decisionNote, requestId },
    tenant,
    write: async (tx) => {
      const row = await tx.staffDayOffRequest.findFirst({
        where: { companyId: tenant.companyId, id: requestId },
      });
      if (!row) throw new Error("Day Off request was not found.");

      const role = await resolveStoreRoleFromTenant(tenant);
      const normalized = normalizeStoreRole(role);
      const isOwnerOrManager =
        normalized === STORE_ROLES.OWNER ||
        hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE) ||
        hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_FULL);

      if (row.status === DAY_OFF_STATUS.PENDING) {
        if (String(row.userId) !== tenant.userId && !isOwnerOrManager) {
          throw new Error("You can only cancel your own pending Day Off request.");
        }
        if (String(row.userId) === tenant.userId || isOwnerOrManager) {
          // employee pending cancel OR manager cancel pending
        } else {
          throw new Error("Not allowed to cancel this Day Off request.");
        }
      } else if (row.status === DAY_OFF_STATUS.APPROVED) {
        if (!isOwnerOrManager) {
          throw new Error("Employees cannot cancel an approved Day Off.");
        }
        if (tenant.userId === String(row.userId) && normalized !== STORE_ROLES.OWNER) {
          throw new Error("You cannot cancel your own approved Day Off request.");
        }
        await assertApprover(tenant, String(row.userId), String(row.branchId));
      } else {
        throw new Error("Only pending or approved Day Off requests can be cancelled.");
      }

      const data: Record<string, unknown> = {
        decidedAt: new Date(),
        decidedBy: tenant.userId,
        decisionNote: decisionNote?.trim() || row.decisionNote,
        status: DAY_OFF_STATUS.CANCELLED,
      };

      // Restore quota: consumed, not returned, not already worked.
      if (
        row.status === DAY_OFF_STATUS.APPROVED &&
        row.quotaConsumed &&
        !row.quotaReturned &&
        !row.workedMarkedAt
      ) {
        data.quotaConsumed = false;
      }

      const updated = await tx.staffDayOffRequest.update({ data, where: { id: row.id } });
      return mapRequest(updated);
    },
  });
}

export async function listOwnDayOffRequests(tenant: TenantContext): Promise<DayOffRequestSummary[]> {
  const rows = await db.staffDayOffRequest.findMany({
    orderBy: [{ requestDate: "desc" }, { createdAt: "desc" }],
    take: 100,
    where: { companyId: tenant.companyId, userId: tenant.userId },
  });
  return rows.map(mapRequest);
}

export async function listPendingDayOffRequests(tenant: TenantContext): Promise<DayOffRequestSummary[]> {
  const role = await resolveStoreRoleFromTenant(tenant);
  const scope = await resolveTenantScope(tenant);
  const where: Record<string, unknown> = {
    companyId: tenant.companyId,
    status: DAY_OFF_STATUS.PENDING,
  };
  if (!scope.isOwner) where.branchId = scope.branchId;
  if (normalizeStoreRole(role) === STORE_ROLES.CASHIER) {
    throw new Error("Cashiers cannot list Day Off approvals.");
  }
  const rows = await db.staffDayOffRequest.findMany({
    orderBy: { requestedAt: "asc" },
    take: 200,
    where,
  });
  return rows.map(mapRequest);
}

/**
 * Mark attendance sessions on request_date as Worked on Day Off.
 * Returns quota once for quota kind.
 */
async function markAttendanceWorkedOnDayOffInTx(
  tx: any,
  input: {
    attendanceKind: DayOffAttendanceKind;
    companyId: string;
    requestDate: Date;
    requestId: string | null;
    userId: string;
  },
) {
  const dateLabel = requestDateLabel(input.requestDate);
  const [y, m, d] = dateLabel.split("-").map(Number);
  const businessDate = new Date(Date.UTC(y, m - 1, d));

  const sessions = await tx.staffAttendanceSession.findMany({
    orderBy: { startedAt: "asc" },
    where: {
      businessDate,
      companyId: input.companyId,
      userId: input.userId,
    },
  });
  if (!sessions.length) return;

  const firstId = String(sessions[0].id);
  for (const session of sessions) {
    await tx.staffAttendanceSession.update({
      data: {
        dayOffKind: input.attendanceKind,
        dayOffRequestId: input.requestId,
      },
      where: { id: session.id },
    });
  }

  if (!input.requestId) return;

  const request = await tx.staffDayOffRequest.findFirst({
    where: { companyId: input.companyId, id: input.requestId },
  });
  if (!request || request.status !== DAY_OFF_STATUS.APPROVED) return;

  const patch: Record<string, unknown> = {};
  if (!request.workedMarkedAt) {
    patch.workedMarkedAt = new Date();
    patch.primaryAttendanceSessionId = firstId;
  }
  if (
    request.kind === DAY_OFF_REQUEST_KIND.QUOTA &&
    request.quotaConsumed &&
    !request.quotaReturned
  ) {
    patch.quotaReturned = true;
  }
  if (Object.keys(patch).length) {
    await tx.staffDayOffRequest.update({ data: patch, where: { id: request.id } });
  }
}

/**
 * Called from Start Work (same tx). Does not block Start Work.
 * Sets day_off_kind on the new attendance row and returns quota once.
 */
export async function applyDayOffOnStartWorkInTx(
  tx: any,
  tenant: TenantContext,
  input: { attendanceId: string; businessDate: Date; startedAt: Date; userId: string },
): Promise<{ dayOffKind: DayOffAttendanceKind | null; dayOffRequestId: string | null }> {
  const dateLabel = requestDateLabel(input.businessDate);
  const [y, m, d] = dateLabel.split("-").map(Number);
  const businessDate = new Date(Date.UTC(y, m - 1, d));

  const approved = await tx.staffDayOffRequest.findFirst({
    where: {
      companyId: tenant.companyId,
      requestDate: businessDate,
      status: DAY_OFF_STATUS.APPROVED,
      userId: input.userId,
    },
  });

  let dayOffKind: DayOffAttendanceKind | null = null;
  let dayOffRequestId: string | null = null;

  if (approved) {
    dayOffKind = approved.kind === "special" ? "special" : "quota";
    dayOffRequestId = String(approved.id);
  } else {
    const weekday = weekdayForBusinessInstant(input.startedAt);
    const weekly = await tx.staffWeeklyDayOff.findFirst({
      where: { companyId: tenant.companyId, userId: input.userId, weekday },
    });
    if (weekly) dayOffKind = "weekly";
  }

  if (!dayOffKind) return { dayOffKind: null, dayOffRequestId: null };

  await tx.staffAttendanceSession.update({
    data: { dayOffKind, dayOffRequestId },
    where: { id: input.attendanceId },
  });

  if (dayOffRequestId) {
    const request = await tx.staffDayOffRequest.findFirst({ where: { id: dayOffRequestId } });
    if (request) {
      const patch: Record<string, unknown> = {};
      if (!request.workedMarkedAt) {
        patch.workedMarkedAt = new Date();
        patch.primaryAttendanceSessionId = input.attendanceId;
      }
      if (request.kind === DAY_OFF_REQUEST_KIND.QUOTA && request.quotaConsumed && !request.quotaReturned) {
        patch.quotaReturned = true;
      }
      if (Object.keys(patch).length) {
        await tx.staffDayOffRequest.update({ data: patch, where: { id: request.id } });
      }
    }
  }

  return { dayOffKind, dayOffRequestId };
}

export { WEEKLY_BLOCKS_QUOTA, monthKeyFromBusinessDate };
