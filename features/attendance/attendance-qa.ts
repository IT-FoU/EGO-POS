import { prisma } from "@/lib/db/prisma";
import {
  classifyScheduleSource,
  formatScheduleClock,
  type AttendanceQaRow,
} from "@/features/attendance/attendance-qa-display";
import type { StaffScheduleRow } from "@/features/attendance/attendance-math";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

export {
  classifyScheduleSource,
  formatScheduleClock,
  summarizeAttendanceQa,
  type AttendanceQaRow,
  type AttendanceQaScheduleSource,
  type AttendanceQaSummary,
} from "@/features/attendance/attendance-qa-display";

function dateLabel(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function loadAttendanceQaRows(
  tenant: TenantContext,
  filters: { branchId?: string; date?: string; status?: string; userId?: string },
): Promise<{
  branches: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string }>;
  rows: AttendanceQaRow[];
}> {
  const scope = await resolveTenantScope(tenant);
  const requestedBranch = filters.branchId;
  const branchId = scope.isOwner
    ? requestedBranch && scope.branchIds.includes(requestedBranch)
      ? requestedBranch
      : undefined
    : scope.branchId;
  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(branchId ? { branchId } : { branchId: { in: scope.branchIds } }),
  };
  if (filters.userId) where.userId = filters.userId;
  if (filters.status === "open" || filters.status === "closed") where.status = filters.status;
  if (filters.date && /^\d{4}-\d{2}-\d{2}$/.test(filters.date)) {
    const [year, month, day] = filters.date.split("-").map(Number);
    where.businessDate = new Date(Date.UTC(year, month - 1, day));
  }

  const [sessions, schedules, branches, members] = await Promise.all([
    prisma.staffAttendanceSession.findMany({
      include: {
        branch: { select: { id: true, name: true } },
        user: { select: { fullName: true, id: true, username: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 200,
      where,
    }),
    prisma.staffWorkSchedule.findMany({
      where: { companyId: scope.companyId },
    }),
    prisma.branch.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: scope.isOwner
        ? { companyId: scope.companyId }
        : { companyId: scope.companyId, id: scope.branchId },
    }),
    prisma.companyUser.findMany({
      orderBy: { createdAt: "asc" },
      select: { user: { select: { fullName: true, id: true, username: true } } },
      where: { companyId: scope.companyId, status: "active" },
    }),
  ]);

  const scheduleRows: StaffScheduleRow[] = schedules.map((row) => ({
    endMinute: row.endMinute,
    startMinute: row.startMinute,
    userId: row.userId,
    weekday: row.weekday,
  }));

  const rows: AttendanceQaRow[] = sessions.map((session) => {
    const startedAt = session.startedAt;
    const resolved = classifyScheduleSource({
      schedules: scheduleRows,
      startedAt,
      userId: session.userId,
    });
    return {
      attendanceId: session.id,
      branchId: session.branchId,
      branchName: session.branch.name,
      businessDate: dateLabel(session.businessDate),
      cashSessionId: session.cashSessionId,
      companyId: session.companyId,
      employeeName: session.user.fullName || session.user.username,
      endSource: session.endSource,
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      lateMinutes: session.lateMinutes,
      regularMinutes: session.regularMinutes,
      scheduleSource: resolved.source,
      scheduledEnd: formatScheduleClock(resolved.schedule?.endMinute),
      scheduledStart: formatScheduleClock(resolved.schedule?.startMinute),
      startedAt: startedAt.toISOString(),
      status: session.status === "closed" ? "closed" : "open",
      userId: session.userId,
    };
  });

  const employees = members.map((member) => ({
    id: member.user.id,
    name: member.user.fullName || member.user.username,
  }));

  return { branches: branches.map((branch) => ({ id: branch.id, name: branch.name })), employees, rows };
}
