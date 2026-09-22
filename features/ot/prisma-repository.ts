/**
 * R9C OT repository — weekly templates, direct grants, Auto End helpers.
 */
import { prisma } from "@/lib/db/prisma";
import {
  resolveScheduleForUser,
  weekdayForBusinessInstant,
  type StaffScheduleRow,
} from "@/features/attendance/attendance-math";
import {
  ATTENDANCE_END_SOURCE_R9C,
  assertValidOtMinutes,
  assertValidOtWeekday,
  businessDateLabelFromDate,
  businessDateMinuteInstant,
  computeRegularAndOtMinutes,
  OT_APPROVAL_STATUS,
  parseBusinessDateUtc,
  resolveAutoEndAt,
  resolveEndSourceForAutoEnd,
  resolveOtPolicy,
  type DayOffKindForOt,
  type OtApprovalStatus,
  type OtWindow,
} from "@/features/ot/ot-math";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import {
  STORE_ACTIONS,
  STORE_ROLES,
  hasStorePermission,
  normalizeStoreRole,
} from "@/features/permissions/store-permissions";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { businessDayLabel } from "@/lib/datetime/business-timezone";

const db = prisma as any;

async function listSchedulesForCompany(
  tx: Record<string, any>,
  companyId: string,
  userId?: string,
): Promise<StaffScheduleRow[]> {
  const rows = await tx.staffWorkSchedule.findMany({
    where: {
      companyId,
      OR: userId ? [{ userId: null }, { userId }] : [{ userId: null }],
    },
  });
  return rows.map((row: any) => ({
    endMinute: Number(row.endMinute),
    startMinute: Number(row.startMinute),
    userId: row.userId ? String(row.userId) : null,
    weekday: Number(row.weekday),
  }));
}

export type OtApprovalSummary = {
  approvedAt: string;
  approvedBy: string;
  branchId: string;
  businessDate: string;
  cancelledAt: string | null;
  cancelledBy: string | null;
  endMinute: number;
  id: string;
  note: string | null;
  startMinute: number;
  status: OtApprovalStatus;
  templateWeekday: number | null;
  userId: string;
};

function mapApproval(row: Record<string, any>): OtApprovalSummary {
  return {
    approvedAt: new Date(row.approvedAt).toISOString(),
    approvedBy: String(row.approvedBy),
    branchId: String(row.branchId),
    businessDate: businessDateLabelFromDate(new Date(row.businessDate)),
    cancelledAt: row.cancelledAt ? new Date(row.cancelledAt).toISOString() : null,
    cancelledBy: row.cancelledBy ? String(row.cancelledBy) : null,
    endMinute: Number(row.endMinute),
    id: String(row.id),
    note: row.note ? String(row.note) : null,
    startMinute: Number(row.startMinute),
    status: row.status === OT_APPROVAL_STATUS.CANCELLED ? "cancelled" : "approved",
    templateWeekday: row.templateWeekday == null ? null : Number(row.templateWeekday),
    userId: String(row.userId),
  };
}

function asDayOffKind(value: unknown): DayOffKindForOt | null {
  if (value === "weekly" || value === "quota" || value === "special") return value;
  return null;
}

async function assertOtManager(tenant: TenantContext, targetUserId: string, targetBranchId: string) {
  const role = await resolveStoreRoleFromTenant(tenant);
  const normalized = normalizeStoreRole(role);
  if (normalized === STORE_ROLES.CASHIER) {
    throw new Error("Cashiers cannot grant or cancel OT.");
  }
  if (tenant.userId === targetUserId) {
    throw new Error("You cannot grant or cancel your own OT.");
  }
  if (normalized === STORE_ROLES.OWNER) return role;
  if (!hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE) && !hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_FULL)) {
    throw new Error("Manager or Owner permission is required for OT.");
  }
  const scope = await resolveTenantScope(tenant);
  if (!scope.isOwner && scope.branchId !== targetBranchId) {
    throw new Error("OT target is outside your assigned branch.");
  }
  return role;
}

async function assertStaffManage(tenant: TenantContext) {
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE) && normalizeStoreRole(role) !== STORE_ROLES.OWNER) {
    throw new Error("Staff manage permission is required to configure OT templates.");
  }
}

export async function listOtWeeklyPolicies(tenant: TenantContext, userId?: string | null) {
  await assertStaffManage(tenant);
  const rows = await db.staffOtWeeklyPolicy.findMany({
    where: {
      companyId: tenant.companyId,
      OR: userId ? [{ userId: null }, { userId }] : undefined,
    },
    orderBy: [{ weekday: "asc" }, { userId: "asc" }],
  });
  return rows.map((row: any) => ({
    enabled: Boolean(row.enabled),
    endMinute: Number(row.endMinute),
    id: String(row.id),
    startMinute: Number(row.startMinute),
    userId: row.userId ? String(row.userId) : null,
    weekday: Number(row.weekday),
  }));
}

export async function upsertOtWeeklyPolicy(
  tenant: TenantContext,
  input: {
    enabled?: boolean;
    endMinute: number;
    startMinute: number;
    userId?: string | null;
    weekday: number;
  },
) {
  await assertStaffManage(tenant);
  assertValidOtWeekday(input.weekday);
  assertValidOtMinutes(input.startMinute, input.endMinute);
  const userId = input.userId === undefined ? null : input.userId;

  return withTenantTransaction({
    action: "upsert_ot_weekly_policy",
    module: "ot",
    newData: input,
    tenant,
    write: async (tx) => {
      const existing = await tx.staffOtWeeklyPolicy.findFirst({
        where: {
          companyId: tenant.companyId,
          userId,
          weekday: input.weekday,
        },
      });
      const data = {
        enabled: input.enabled ?? true,
        endMinute: input.endMinute,
        startMinute: input.startMinute,
        updatedBy: tenant.userId,
      };
      const row = existing
        ? await tx.staffOtWeeklyPolicy.update({ data, where: { id: existing.id } })
        : await tx.staffOtWeeklyPolicy.create({
            data: {
              ...data,
              companyId: tenant.companyId,
              userId,
              weekday: input.weekday,
            },
          });
      return {
        enabled: Boolean(row.enabled),
        endMinute: Number(row.endMinute),
        id: String(row.id),
        startMinute: Number(row.startMinute),
        userId: row.userId ? String(row.userId) : null,
        weekday: Number(row.weekday),
      };
    },
  });
}

export async function getApprovedOtForDate(
  tx: any,
  companyId: string,
  userId: string,
  businessDate: Date,
): Promise<(OtWindow & { id: string }) | null> {
  const row = await tx.staffOtApproval.findFirst({
    where: {
      companyId,
      userId,
      businessDate,
      status: OT_APPROVAL_STATUS.APPROVED,
    },
  });
  if (!row) return null;
  return {
    endMinute: Number(row.endMinute),
    id: String(row.id),
    startMinute: Number(row.startMinute),
  };
}

/** Prefer linked approval (even if just cancelled mid-window) for close math. */
async function resolveOtWindowForAttendance(
  tx: any,
  companyId: string,
  open: Record<string, any>,
): Promise<(OtWindow & { id: string }) | null> {
  if (open.otApprovalId) {
    const linked = await tx.staffOtApproval.findFirst({
      where: { companyId, id: open.otApprovalId },
    });
    if (linked) {
      return {
        endMinute: Number(linked.endMinute),
        id: String(linked.id),
        startMinute: Number(linked.startMinute),
      };
    }
  }
  return getApprovedOtForDate(tx, companyId, String(open.userId), new Date(open.businessDate));
}

export async function refreshOpenAttendanceAutoEndInTx(
  tx: any,
  input: {
    attendanceId: string;
    businessDate: Date;
    companyId: string;
    dayOffKind: DayOffKindForOt | null;
    otApproval: (OtWindow & { id?: string }) | null;
    schedule: { endMinute: number; startMinute: number; userId: string | null; weekday: number } | null;
    userId: string;
  },
) {
  const label = businessDateLabelFromDate(input.businessDate);
  const autoEndAt = resolveAutoEndAt({
    businessDateLabel: label,
    dayOffKind: input.dayOffKind,
    otApproval: input.otApproval,
    schedule: input.schedule,
  });
  await tx.staffAttendanceSession.update({
    data: {
      autoEndAt,
      otApprovalId: input.otApproval?.id ?? null,
    },
    where: { id: input.attendanceId },
  });
  return autoEndAt;
}

export async function computeAndApplyAutoEndAtForOpenSessionInTx(
  tx: any,
  companyId: string,
  attendance: Record<string, any>,
) {
  const businessDate = new Date(attendance.businessDate);
  const label = businessDateLabelFromDate(businessDate);
  const weekday = weekdayForBusinessInstant(new Date(attendance.startedAt));
  const schedules = await listSchedulesForCompany(tx, companyId, String(attendance.userId));
  const schedule = resolveScheduleForUser({
    schedules,
    userId: String(attendance.userId),
    weekday,
  });
  const dayOffKind = asDayOffKind(attendance.dayOffKind);
  const ot = await getApprovedOtForDate(tx, companyId, String(attendance.userId), businessDate);

  // Normal-day OT requires schedule anchor; Day Off OT grant is allowed without schedule.
  const effectiveOt =
    ot && (dayOffKind || schedule)
      ? ot
      : null;

  return refreshOpenAttendanceAutoEndInTx(tx, {
    attendanceId: String(attendance.id),
    businessDate,
    companyId,
    dayOffKind,
    otApproval: effectiveOt,
    schedule: dayOffKind ? null : schedule,
    userId: String(attendance.userId),
  });
}

export async function grantOtApproval(
  tenant: TenantContext,
  input: {
    businessDate: string;
    endMinute: number;
    note?: string;
    startMinute: number;
    userId: string;
  },
): Promise<OtApprovalSummary> {
  assertValidOtMinutes(input.startMinute, input.endMinute);
  const businessDate = parseBusinessDateUtc(input.businessDate);
  const scope = await resolveTenantScope(tenant);
  const targetBranchId = scope.branchId;
  await assertOtManager(tenant, input.userId, targetBranchId);

  const weekday = weekdayForBusinessInstant(
    businessDateMinuteInstant(input.businessDate, Math.floor((input.startMinute + input.endMinute) / 2)),
  );

  return withTenantTransaction({
    action: "grant_ot",
    module: "ot",
    newData: input,
    tenant,
    write: async (tx) => {
      const membership = await tx.companyUser.findFirst({
        where: { companyId: tenant.companyId, userId: input.userId },
      });
      if (!membership) throw new Error("Employee was not found in this company.");
      if (!scope.isOwner && membership.branchId && membership.branchId !== scope.branchId) {
        throw new Error("OT target is outside your assigned branch.");
      }

      // Day Off detection for schedule requirement
      const weekly = await tx.staffWeeklyDayOff.findFirst({
        where: { companyId: tenant.companyId, userId: input.userId, weekday },
      });
      const dayOffRequest = await tx.staffDayOffRequest.findFirst({
        where: {
          companyId: tenant.companyId,
          requestDate: businessDate,
          status: "approved",
          userId: input.userId,
        },
      });
      const isDayOff = Boolean(weekly || dayOffRequest);

      const schedules = await listSchedulesForCompany(tx, tenant.companyId, input.userId);
      const schedule = resolveScheduleForUser({
        schedules,
        userId: input.userId,
        weekday,
      });

      if (!isDayOff && !schedule) {
        throw new Error("Normal-day OT requires a work schedule. Configure schedule first or grant Day Off OT.");
      }

      const existing = await tx.staffOtApproval.findFirst({
        where: {
          companyId: tenant.companyId,
          userId: input.userId,
          businessDate,
          status: OT_APPROVAL_STATUS.APPROVED,
        },
      });
      if (existing) throw new Error("An approved OT already exists for this employee and date.");

      const now = new Date();
      const row = await tx.staffOtApproval.create({
        data: {
          approvedAt: now,
          approvedBy: tenant.userId,
          branchId: membership.branchId || targetBranchId,
          businessDate,
          companyId: tenant.companyId,
          endMinute: input.endMinute,
          note: input.note?.trim() || null,
          startMinute: input.startMinute,
          status: OT_APPROVAL_STATUS.APPROVED,
          templateWeekday: weekday,
          userId: input.userId,
        },
      });

      // Update open attendance auto_end_at if still open (no Resume after close).
      const open = await tx.staffAttendanceSession.findFirst({
        where: {
          businessDate,
          companyId: tenant.companyId,
          status: "open",
          userId: input.userId,
        },
      });
      if (open) {
        await computeAndApplyAutoEndAtForOpenSessionInTx(tx, tenant.companyId, open);
      }

      return mapApproval(row);
    },
  });
}

export async function cancelOtApproval(
  tenant: TenantContext,
  approvalId: string,
  note?: string,
): Promise<OtApprovalSummary> {
  return withTenantTransaction({
    action: "cancel_ot",
    module: "ot",
    newData: { approvalId, note },
    tenant,
    write: async (tx) => {
      const row = await tx.staffOtApproval.findFirst({
        where: { companyId: tenant.companyId, id: approvalId },
      });
      if (!row) throw new Error("OT approval was not found.");
      if (row.status !== OT_APPROVAL_STATUS.APPROVED) throw new Error("Only approved OT can be cancelled.");
      await assertOtManager(tenant, String(row.userId), String(row.branchId));

      const now = new Date();
      const businessDateLabel = businessDateLabelFromDate(new Date(row.businessDate));
      const otStart = businessDateMinuteInstant(businessDateLabel, Number(row.startMinute));
      const otEnd = businessDateMinuteInstant(businessDateLabel, Number(row.endMinute));

      let endMinute = Number(row.endMinute);
      let midWindow = false;
      if (now.getTime() >= otStart.getTime() && now.getTime() < otEnd.getTime()) {
        midWindow = true;
        const dayStart = businessDateMinuteInstant(businessDateLabel, 0);
        const currentMinute = Math.max(
          Number(row.startMinute) + 1,
          Math.ceil((now.getTime() - dayStart.getTime()) / 60_000),
        );
        endMinute = Math.min(currentMinute, Number(row.endMinute));
      }

      const updated = await tx.staffOtApproval.update({
        data: {
          cancelledAt: now,
          cancelledBy: tenant.userId,
          endMinute,
          note: note?.trim() || row.note,
          status: OT_APPROVAL_STATUS.CANCELLED,
        },
        where: { id: row.id },
      });

      const open = await tx.staffAttendanceSession.findFirst({
        where: {
          businessDate: row.businessDate,
          companyId: tenant.companyId,
          status: "open",
          userId: row.userId,
        },
      });
      if (open) {
        if (midWindow) {
          // Keep link for earned OT math; Auto End at shortened end.
          const cutoff = businessDateMinuteInstant(businessDateLabel, endMinute);
          await tx.staffAttendanceSession.update({
            data: {
              autoEndAt: cutoff,
              otApprovalId: row.id,
            },
            where: { id: open.id },
          });
        } else {
          await tx.staffAttendanceSession.update({
            data: { otApprovalId: null },
            where: { id: open.id },
          });
          const refreshed = await tx.staffAttendanceSession.findFirst({ where: { id: open.id } });
          if (refreshed) {
            await computeAndApplyAutoEndAtForOpenSessionInTx(tx, tenant.companyId, refreshed);
          }
        }
      }

      return mapApproval(updated);
    },
  });
}

export async function listOwnOtApprovals(tenant: TenantContext) {
  const rows = await db.staffOtApproval.findMany({
    where: { companyId: tenant.companyId, userId: tenant.userId },
    orderBy: [{ businessDate: "desc" }, { approvedAt: "desc" }],
    take: 60,
  });
  return rows.map(mapApproval);
}

export async function listBranchOtApprovals(tenant: TenantContext) {
  const role = await resolveStoreRoleFromTenant(tenant);
  if (
    normalizeStoreRole(role) !== STORE_ROLES.OWNER &&
    !hasStorePermission(role, STORE_ACTIONS.STAFF_MANAGE) &&
    !hasStorePermission(role, STORE_ACTIONS.REPORTS_VIEW_FULL)
  ) {
    throw new Error("Manager or Owner permission is required.");
  }
  const scope = await resolveTenantScope(tenant);
  const where: Record<string, unknown> = { companyId: tenant.companyId };
  if (!scope.isOwner) where.branchId = scope.branchId;
  const rows = await db.staffOtApproval.findMany({
    where,
    orderBy: [{ businessDate: "desc" }, { approvedAt: "desc" }],
    take: 100,
  });
  return rows.map(mapApproval);
}

export async function getMyOtStatus(tenant: TenantContext) {
  const now = new Date();
  const label = businessDayLabel(now);
  const businessDate = parseBusinessDateUtc(label);

  const open = await db.staffAttendanceSession.findFirst({
    where: {
      companyId: tenant.companyId,
      status: "open",
      userId: tenant.userId,
    },
  });

  const approval = await db.staffOtApproval.findFirst({
    where: {
      businessDate,
      companyId: tenant.companyId,
      status: OT_APPROVAL_STATUS.APPROVED,
      userId: tenant.userId,
    },
  });

  const weekday = weekdayForBusinessInstant(now);
  const schedules = await listSchedulesForCompany(db, tenant.companyId, tenant.userId);
  const schedule = resolveScheduleForUser({ schedules, userId: tenant.userId, weekday });

  const history = await listOwnOtApprovals(tenant);

  return {
    autoEndAt: open?.autoEndAt ? new Date(open.autoEndAt).toISOString() : null,
    attendanceOpen: Boolean(open),
    businessDate: label,
    dayOffKind: open?.dayOffKind ? String(open.dayOffKind) : null,
    history,
    normalEndMinute: schedule && !open?.dayOffKind ? schedule.endMinute : null,
    otApprovedUntilMinute: approval ? Number(approval.endMinute) : null,
    otApproval: approval ? mapApproval(approval) : null,
    scheduleEndMinute: schedule?.endMinute ?? null,
    scheduleStartMinute: schedule?.startMinute ?? null,
  };
}

export type CloseMinutesResult = {
  endSource: string;
  endedAt: Date;
  otApprovalId: string | null;
  otMinutes: number;
  regularMinutes: number;
};

export async function computeClosePersistence(
  tx: any,
  companyId: string,
  open: Record<string, any>,
  endedAt: Date,
  endSource: string,
): Promise<CloseMinutesResult> {
  const businessDate = new Date(open.businessDate);
  const label = businessDateLabelFromDate(businessDate);
  const dayOffKind = asDayOffKind(open.dayOffKind);
  const weekday = weekdayForBusinessInstant(new Date(open.startedAt));
  const schedules = await listSchedulesForCompany(tx, companyId, String(open.userId));
  const schedule = resolveScheduleForUser({
    schedules,
    userId: String(open.userId),
    weekday,
  });
  const ot = await resolveOtWindowForAttendance(tx, companyId, open);
  const effectiveSchedule = dayOffKind ? null : schedule;
  const effectiveOt = ot && (dayOffKind || schedule) ? ot : null;

  const { otMinutes, regularMinutes } = computeRegularAndOtMinutes({
    businessDateLabel: label,
    dayOffKind,
    endedAt,
    otApproval: effectiveOt,
    schedule: effectiveSchedule,
    startedAt: new Date(open.startedAt),
  });

  return {
    endSource,
    endedAt,
    otApprovalId: effectiveOt?.id ?? null,
    otMinutes,
    regularMinutes,
  };
}

/**
 * Idempotent Auto End sweep — closes due open attendance only.
 * Does not touch CashSession.
 */
export async function runAutoEndSweep(now = new Date()): Promise<{ closed: number; skipped: number }> {
  const due = await db.staffAttendanceSession.findMany({
    where: {
      status: "open",
      autoEndAt: { lte: now, not: null },
    },
    take: 200,
  });

  let closed = 0;
  let skipped = 0;

  for (const row of due) {
    try {
      await withTenantTransaction({
        action: "auto_end_attendance",
        module: "attendance",
        newData: { attendanceId: row.id },
        tenant: {
          branchId: String(row.branchId),
          companyId: String(row.companyId),
          userId: String(row.userId),
        },
        write: async (tx) => {
          const open = await tx.staffAttendanceSession.findFirst({
            where: {
              autoEndAt: { lte: now },
              id: row.id,
              status: "open",
            },
          });
          if (!open || !open.autoEndAt) {
            skipped += 1;
            return;
          }

          const intendedEnd = new Date(open.autoEndAt);
          const dayOffKind = asDayOffKind(open.dayOffKind);
          const ot = await getApprovedOtForDate(tx, String(open.companyId), String(open.userId), new Date(open.businessDate));
          const endSource = resolveEndSourceForAutoEnd({
            dayOffKind,
            otApproval: ot && (dayOffKind || true) ? ot : null,
          });
          // Prefer auto_ot only when OT approval actually drove the target.
          const finalSource =
            ot && open.otApprovalId
              ? ATTENDANCE_END_SOURCE_R9C.AUTO_OT
              : dayOffKind && ot
                ? ATTENDANCE_END_SOURCE_R9C.AUTO_OT
                : ATTENDANCE_END_SOURCE_R9C.AUTO_SCHEDULE;

          const computed = await computeClosePersistence(
            tx,
            String(open.companyId),
            open,
            intendedEnd,
            finalSource,
          );

          await tx.staffAttendanceSession.update({
            data: {
              autoEndAt: null,
              endSource: computed.endSource,
              endedAt: intendedEnd,
              otApprovalId: computed.otApprovalId,
              otMinutes: computed.otMinutes,
              regularMinutes: computed.regularMinutes,
              status: "closed",
            },
            where: {
              id: open.id,
              status: "open",
            },
          });
          closed += 1;
        },
      });
    } catch {
      skipped += 1;
    }
  }

  return { closed, skipped };
}

/** Lazy reconcile for a single tenant open attendance (sale/attendance paths). */
export async function reconcileDueAutoEndForUser(tenant: TenantContext, now = new Date()) {
  const open = await db.staffAttendanceSession.findFirst({
    where: {
      companyId: tenant.companyId,
      status: "open",
      userId: tenant.userId,
    },
  });
  if (!open?.autoEndAt) return null;
  if (new Date(open.autoEndAt).getTime() > now.getTime()) return null;

  const result = await withTenantTransaction({
    action: "lazy_auto_end_attendance",
    module: "attendance",
    newData: { attendanceId: open.id },
    tenant,
    write: async (tx) => {
      const row = await tx.staffAttendanceSession.findFirst({
        where: {
          autoEndAt: { lte: now },
          id: open.id,
          status: "open",
        },
      });
      if (!row?.autoEndAt) return null;
      const intendedEnd = new Date(row.autoEndAt);
      const computed = await computeClosePersistence(
        tx,
        tenant.companyId,
        row,
        intendedEnd,
        row.otApprovalId ? ATTENDANCE_END_SOURCE_R9C.AUTO_OT : ATTENDANCE_END_SOURCE_R9C.AUTO_SCHEDULE,
      );
      const closed = await tx.staffAttendanceSession.update({
        data: {
          autoEndAt: null,
          endSource: computed.endSource,
          endedAt: intendedEnd,
          otApprovalId: computed.otApprovalId,
          otMinutes: computed.otMinutes,
          regularMinutes: computed.regularMinutes,
          status: "closed",
        },
        where: { id: row.id, status: "open" },
      });
      return closed;
    },
  });
  return result;
}

export { resolveOtPolicy };
