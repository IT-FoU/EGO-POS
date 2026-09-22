import { prisma } from "@/lib/db/prisma";
import {
  ATTENDANCE_END_SOURCE,
  ATTENDANCE_STATUS,
  assertValidScheduleMinutes,
  assertValidWeekday,
  computeLateMinutes,
  computeRegularMinutes,
  parseBusinessDateOnly,
  resolveScheduleForUser,
  weekdayForBusinessInstant,
  type StaffScheduleRow,
} from "@/features/attendance/attendance-math";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import { applyDayOffOnStartWorkInTx } from "@/features/day-off/prisma-repository";

const db = prisma as any;

export type AttendanceSessionSummary = {
  branchId: string;
  businessDate: string;
  cashSessionId: string | null;
  endSource: string | null;
  endedAt: string | null;
  id: string;
  lateMinutes: number;
  regularMinutes: number | null;
  startedAt: string;
  status: "open" | "closed";
  userId: string;
};

function mapAttendance(row: Record<string, any>): AttendanceSessionSummary {
  const businessDate =
    row.businessDate instanceof Date
      ? row.businessDate.toISOString().slice(0, 10)
      : String(row.businessDate).slice(0, 10);
  return {
    branchId: String(row.branchId),
    businessDate,
    cashSessionId: row.cashSessionId ? String(row.cashSessionId) : null,
    endSource: row.endSource ? String(row.endSource) : null,
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
    id: String(row.id),
    lateMinutes: Number(row.lateMinutes ?? 0),
    regularMinutes: row.regularMinutes == null ? null : Number(row.regularMinutes),
    startedAt: new Date(row.startedAt).toISOString(),
    status: row.status === ATTENDANCE_STATUS.CLOSED ? "closed" : "open",
    userId: String(row.userId),
  };
}

export async function listSchedulesForCompany(
  tx: Record<string, any>,
  companyId: string,
  userId?: string,
): Promise<StaffScheduleRow[]> {
  const rows = await tx.staffWorkSchedule.findMany({
    where: {
      companyId,
      OR: userId
        ? [{ userId: null }, { userId }]
        : [{ userId: null }],
    },
  });
  return rows.map((row: any) => ({
    endMinute: Number(row.endMinute),
    startMinute: Number(row.startMinute),
    userId: row.userId ? String(row.userId) : null,
    weekday: Number(row.weekday),
  }));
}

export async function upsertStaffWorkSchedule(
  input: {
    endMinute: number;
    startMinute: number;
    userId?: string | null;
    weekday: number;
  },
  tenant: TenantContext,
) {
  assertValidWeekday(input.weekday);
  assertValidScheduleMinutes(input.startMinute, input.endMinute);
  const userId = input.userId === undefined ? null : input.userId;

  return withTenantTransaction({
    action: "upsert_schedule",
    module: "attendance",
    newData: input,
    tenant,
    write: async (tx) => {
      if (userId) {
        const existing = await tx.staffWorkSchedule.findFirst({
          where: { companyId: tenant.companyId, userId, weekday: input.weekday },
        });
        const row = existing
          ? await tx.staffWorkSchedule.update({
              data: { endMinute: input.endMinute, startMinute: input.startMinute },
              where: { id: existing.id },
            })
          : await tx.staffWorkSchedule.create({
              data: {
                companyId: tenant.companyId,
                endMinute: input.endMinute,
                startMinute: input.startMinute,
                userId,
                weekday: input.weekday,
              },
            });
        return row;
      }

      const existing = await tx.staffWorkSchedule.findFirst({
        where: { companyId: tenant.companyId, userId: null, weekday: input.weekday },
      });
      return existing
        ? await tx.staffWorkSchedule.update({
            data: { endMinute: input.endMinute, startMinute: input.startMinute },
            where: { id: existing.id },
          })
        : await tx.staffWorkSchedule.create({
            data: {
              companyId: tenant.companyId,
              endMinute: input.endMinute,
              startMinute: input.startMinute,
              userId: null,
              weekday: input.weekday,
            },
          });
    },
  });
}

export async function getOpenAttendanceSession(
  tenant: TenantContext,
  client: Record<string, any> = db,
): Promise<AttendanceSessionSummary | null> {
  const scope = await resolveTenantScope(tenant, client);
  const row = await client.staffAttendanceSession.findFirst({
    where: {
      branchId: scope.branchId,
      companyId: tenant.companyId,
      status: ATTENDANCE_STATUS.OPEN,
      userId: tenant.userId,
    },
  });
  return row ? mapAttendance(row) : null;
}

/**
 * Create open attendance inside an existing tenant transaction (Start Work).
 * Caller must already have created the open CashSession in the same tx.
 */
export async function createOpenAttendanceInTx(
  tx: Record<string, any>,
  tenant: TenantContext,
  input: { branchId: string; cashSessionId: string; note?: string; startedAt?: Date },
): Promise<AttendanceSessionSummary> {
  const existing = await tx.staffAttendanceSession.findFirst({
    where: {
      companyId: tenant.companyId,
      status: ATTENDANCE_STATUS.OPEN,
      userId: tenant.userId,
    },
  });
  if (existing) {
    throw new Error("An open attendance session already exists. End Work before starting again.");
  }

  const startedAt = input.startedAt ?? new Date();
  const weekday = weekdayForBusinessInstant(startedAt);
  const schedules = await listSchedulesForCompany(tx, tenant.companyId, tenant.userId);
  const schedule = resolveScheduleForUser({
    schedules,
    userId: tenant.userId,
    weekday,
  });
  const lateMinutes = computeLateMinutes({ schedule, startedAt });
  const businessDate = parseBusinessDateOnly(startedAt);

  const row = await tx.staffAttendanceSession.create({
    data: {
      branchId: input.branchId,
      businessDate,
      cashSessionId: input.cashSessionId,
      companyId: tenant.companyId,
      lateMinutes,
      note: input.note?.trim() ? input.note.trim() : null,
      startedAt,
      status: ATTENDANCE_STATUS.OPEN,
      userId: tenant.userId,
    },
  });

  // R9B: classify Worked on Day Off without blocking Start Work / sale gate.
  await applyDayOffOnStartWorkInTx(tx, tenant, {
    attendanceId: String(row.id),
    businessDate,
    startedAt,
    userId: tenant.userId,
  });

  const refreshed = await tx.staffAttendanceSession.findFirst({ where: { id: row.id } });
  return mapAttendance(refreshed ?? row);
}

export async function endAttendanceWork(
  tenant: TenantContext,
  input?: { note?: string },
): Promise<AttendanceSessionSummary> {
  return withTenantTransaction({
    action: "end_work",
    module: "attendance",
    newData: input ?? {},
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const open = await tx.staffAttendanceSession.findFirst({
        where: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          status: ATTENDANCE_STATUS.OPEN,
          userId: tenant.userId,
        },
      });
      if (!open) {
        throw new Error("No open attendance session to end.");
      }

      const endedAt = new Date();
      const regularMinutes = computeRegularMinutes(new Date(open.startedAt), endedAt);
      const closed = await tx.staffAttendanceSession.update({
        data: {
          endSource: ATTENDANCE_END_SOURCE.MANUAL,
          endedAt,
          note: input?.note?.trim() ? input.note.trim() : open.note,
          regularMinutes,
          status: ATTENDANCE_STATUS.CLOSED,
        },
        where: { id: open.id },
      });
      return mapAttendance(closed);
    },
  });
}

export async function assertOpenAttendanceForSale(
  tenant: TenantContext,
  tx: Record<string, any>,
  cashSessionId: string,
) {
  const scope = await resolveTenantScope(tenant, tx);
  const session = await tx.staffAttendanceSession.findFirst({
    where: {
      branchId: scope.branchId,
      companyId: tenant.companyId,
      status: ATTENDANCE_STATUS.OPEN,
      userId: tenant.userId,
    },
  });

  if (!session) {
    throw new Error("An open attendance session is required before completing a sale. Start Work first.");
  }

  if (session.cashSessionId && session.cashSessionId !== cashSessionId) {
    throw new Error("Open attendance is not linked to the active cash session.");
  }

  return session;
}
