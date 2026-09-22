/**
 * R9D Staff Attendance Report repository — read-only day-level grain.
 * Persisted SoT only for late/regular/ot/day_off_kind/end_source.
 * Schedule display is weekday-resolved from current config (not historical snapshot).
 */
import { prisma } from "@/lib/db/prisma";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";
import { businessDayLabel, businessMonthLabel, parseBusinessDate } from "@/lib/datetime/business-timezone";
import {
  resolveScheduleForUser,
  weekdayForBusinessInstant,
  type StaffScheduleRow,
} from "@/features/attendance/attendance-math";
import { formatScheduleClock } from "@/features/attendance/attendance-qa-display";
import {
  DAY_OFF_REQUEST_KIND,
  DAY_OFF_STATUS,
  countUsedQuotaDays,
  computeRemainingQuota,
} from "@/features/day-off/day-off-math";
import {
  ATTENDANCE_REPORT_PAGE_SIZE,
  aggregateSessionsToDay,
  buildDayOffOnlyRow,
  buildNoWorkRecordRow,
  rowKey,
  summarizeAttendanceDays,
  type AttendanceDayRow,
  type AttendanceEmployeeSummaryRow,
  type AttendanceReportSummary,
  type AttendanceSessionDetail,
} from "@/features/reports/attendance-report-math";
import {
  attendanceDateLabelsInRange,
  resolveAttendanceReportRange,
  toUtcDateOnly,
  type AttendanceReportTableQuery,
} from "@/features/reports/attendance-report-query";

const db = prisma as any;

export type AttendanceLoadOptions = { allRows?: boolean };

export type AttendanceReportTableResult = {
  employeeSummaries: AttendanceEmployeeSummaryRow[];
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: AttendanceReportTableQuery;
  rows: AttendanceDayRow[];
  scheduleNote: "weekday_resolved";
  summary: AttendanceReportSummary;
  totalRowCount: number;
};

function clientOf(client?: any) {
  return client ?? db;
}

function clampBranch(scope: BranchScope, branchId?: string) {
  if (!scope.isOwner) return scope.branchId;
  if (branchId && scope.branchIds.includes(branchId)) return branchId;
  return undefined;
}

function dateLabelOf(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const iso = value.toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  return businessDayLabel(value instanceof Date ? value : new Date(value));
}

function matchesFilters(row: AttendanceDayRow, query: AttendanceReportTableQuery): boolean {
  if (query.workStatus !== "all" && row.workStatus !== query.workStatus) return false;
  if (query.dayOffStatus !== "all") {
    if (query.dayOffStatus === "none" && row.dayOffLabel !== "none") return false;
    if (query.dayOffStatus !== "none" && row.dayOffLabel !== query.dayOffStatus) return false;
  }
  if (query.lateStatus === "late" && row.lateMinutes <= 0) return false;
  if (query.lateStatus === "on_time" && (row.lateMinutes > 0 || row.workStatus === "day_off" || row.workStatus === "no_work_record")) {
    return false;
  }
  if (query.endSource !== "all") {
    if (query.endSource === "none" && row.endSource) return false;
    if (query.endSource === "manual" && row.endSource !== "manual") return false;
    if (query.endSource === "auto_schedule" && row.endSource !== "auto_schedule") return false;
    if (query.endSource === "auto_ot" && row.endSource !== "auto_ot") return false;
  }
  if (query.otStatus === "has_ot" && !(row.otMinutes != null && row.otMinutes > 0)) return false;
  if (query.otStatus === "no_ot" && !(row.otMinutes === 0)) return false;
  if (query.otStatus === "not_recorded" && row.otMinutes != null) return false;
  if (query.employeeQuery) {
    const q = query.employeeQuery.toLowerCase();
    if (!row.employeeName.toLowerCase().includes(q)) return false;
  }
  return true;
}

function scheduleForDate(input: {
  businessDate: string;
  schedules: StaffScheduleRow[];
  userId: string;
}): { scheduledEnd: string | null; scheduledStart: string | null; scheduleResolved: boolean } {
  const instant = parseBusinessDate(input.businessDate) ?? toUtcDateOnly(input.businessDate);
  const weekday = weekdayForBusinessInstant(instant);
  const schedule = resolveScheduleForUser({
    schedules: input.schedules,
    userId: input.userId,
    weekday,
  });
  if (!schedule) {
    return { scheduledEnd: null, scheduledStart: null, scheduleResolved: false };
  }
  return {
    scheduleResolved: true,
    scheduledEnd: formatScheduleClock(schedule.endMinute),
    scheduledStart: formatScheduleClock(schedule.startMinute),
  };
}

function buildEmployeeSummaries(
  rows: AttendanceDayRow[],
  snapshots: Map<string, { quotaDays: number }>,
  usedByUser: Map<string, number>,
): AttendanceEmployeeSummaryRow[] {
  const byUser = new Map<string, AttendanceDayRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  const out: AttendanceEmployeeSummaryRow[] = [];
  for (const [userId, userRows] of byUser) {
    const snap = snapshots.get(userId);
    const used = usedByUser.get(userId) ?? null;
    let regularMinutes = 0;
    let otMinutes = 0;
    let lateDays = 0;
    let lateMinutes = 0;
    let autoEndCount = 0;
    let workDays = 0;
    let workedOnDayOffDays = 0;
    let dayOffUsedFromRows = 0;
    for (const row of userRows) {
      if (row.workStatus === "worked" || row.workStatus === "open") workDays += 1;
      if (row.dayOffLabel === "worked_on_day_off") workedOnDayOffDays += 1;
      if (row.dayOffLabel === "quota" || row.dayOffLabel === "special" || row.dayOffLabel === "weekly") {
        dayOffUsedFromRows += 1;
      }
      if (row.lateMinutes > 0) {
        lateDays += 1;
        lateMinutes += row.lateMinutes;
      }
      if (row.autoEnd) autoEndCount += 1;
      if (row.regularMinutes != null) regularMinutes += row.regularMinutes;
      if (row.otMinutes != null) otMinutes += row.otMinutes;
    }
    out.push({
      autoEndCount,
      dayOffRemaining: snap && used != null ? computeRemainingQuota(snap.quotaDays, used) : null,
      dayOffUsed: used != null ? used : dayOffUsedFromRows || null,
      employeeName: userRows[0]!.employeeName,
      lateDays,
      lateMinutes,
      otMinutes,
      quotaDays: snap?.quotaDays ?? null,
      quotaSnapshotExists: Boolean(snap),
      regularMinutes,
      trackedDays: userRows.length,
      userId,
      workDays,
      workedOnDayOffDays,
    });
  }
  return out.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function loadAttendanceReportTable(
  tenant: TenantContext,
  query: AttendanceReportTableQuery,
  client?: any,
  options?: AttendanceLoadOptions,
): Promise<AttendanceReportTableResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const branchId = clampBranch(scope, query.branchId);
  const range = resolveAttendanceReportRange(query);
  const dateLabels = attendanceDateLabelsInRange(range.dateFrom, range.dateTo);
  const utcFrom = dateLabels[0] ? toUtcDateOnly(dateLabels[0]) : undefined;
  const utcTo = dateLabels.length ? toUtcDateOnly(dateLabels[dateLabels.length - 1]!) : undefined;

  const sessionWhere: Record<string, unknown> = {
    companyId: tenant.companyId,
  };
  if (branchId) sessionWhere.branchId = branchId;
  else if (!scope.isOwner) sessionWhere.branchId = { in: scope.branchIds };
  if (query.employeeId) sessionWhere.userId = query.employeeId;
  if (utcFrom && utcTo) sessionWhere.businessDate = { gte: utcFrom, lte: utcTo };

  const dayOffWhere: Record<string, unknown> = {
    companyId: tenant.companyId,
    status: DAY_OFF_STATUS.APPROVED,
  };
  if (branchId) dayOffWhere.branchId = branchId;
  else if (!scope.isOwner) dayOffWhere.branchId = { in: scope.branchIds };
  if (query.employeeId) dayOffWhere.userId = query.employeeId;
  if (utcFrom && utcTo) dayOffWhere.requestDate = { gte: utcFrom, lte: utcTo };

  const [sessions, dayOffRequests, schedules, weeklyDayOffs, filterOptions] = await Promise.all([
    dbClient.staffAttendanceSession.findMany({
      orderBy: [{ businessDate: "asc" }, { startedAt: "asc" }],
      where: sessionWhere,
    }),
    dbClient.staffDayOffRequest.findMany({
      orderBy: [{ requestDate: "asc" }],
      where: dayOffWhere,
    }),
    dbClient.staffWorkSchedule.findMany({
      select: { endMinute: true, startMinute: true, userId: true, weekday: true },
      where: { companyId: tenant.companyId },
    }),
    dbClient.staffWeeklyDayOff.findMany({
      select: { userId: true, weekday: true },
      where: {
        companyId: tenant.companyId,
        ...(query.employeeId ? { userId: query.employeeId } : {}),
      },
    }),
    getReportFilterOptions(tenant, dbClient),
  ]);

  const scheduleRows: StaffScheduleRow[] = (schedules as StaffScheduleRow[]).map((row) => ({
    endMinute: Number(row.endMinute),
    startMinute: Number(row.startMinute),
    userId: row.userId ?? null,
    weekday: Number(row.weekday),
  }));

  const userIds = new Set<string>();
  for (const session of sessions as Array<{ userId: string }>) userIds.add(session.userId);
  for (const req of dayOffRequests as Array<{ userId: string }>) userIds.add(req.userId);
  if (query.employeeId) userIds.add(query.employeeId);

  // When employee filter is set, expand weekly for that employee even with no attendance.
  if (query.employeeId) {
    for (const w of weeklyDayOffs as Array<{ userId: string }>) {
      if (w.userId === query.employeeId) userIds.add(w.userId);
    }
  } else {
    for (const w of weeklyDayOffs as Array<{ userId: string }>) {
      if (userIds.has(w.userId)) userIds.add(w.userId);
    }
  }

  const users = userIds.size
    ? await dbClient.user.findMany({
        select: { fullName: true, id: true, username: true },
        where: { id: { in: [...userIds] } },
      })
    : [];
  const userName = new Map<string, string>(
    (users as Array<{ fullName?: string | null; id: string; username?: string | null }>).map((u) => [
      u.id,
      String(u.fullName || u.username || u.id),
    ]),
  );

  const branchIdsNeeded = new Set<string>();
  for (const session of sessions as Array<{ branchId: string }>) branchIdsNeeded.add(session.branchId);
  for (const req of dayOffRequests as Array<{ branchId: string }>) branchIdsNeeded.add(req.branchId);
  if (branchId) branchIdsNeeded.add(branchId);
  else scope.branchIds.forEach((id) => branchIdsNeeded.add(id));

  const branches = branchIdsNeeded.size
    ? await dbClient.branch.findMany({
        select: { id: true, name: true },
        where: { companyId: tenant.companyId, id: { in: [...branchIdsNeeded] } },
      })
    : [];
  const branchName = new Map<string, string>(
    (branches as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]),
  );

  const defaultBranchId = branchId ?? scope.branchId;
  const defaultBranchName = branchName.get(defaultBranchId) ?? scope.branchName;

  // Group sessions by user+date
  const sessionsByKey = new Map<string, AttendanceSessionDetail[]>();
  const sessionMeta = new Map<string, { branchId: string; userId: string; businessDate: string }>();

  for (const raw of sessions as Array<Record<string, any>>) {
    const businessDate = dateLabelOf(raw.businessDate);
    const key = rowKey(raw.userId, businessDate);
    const detail: AttendanceSessionDetail = {
      attendanceId: String(raw.id),
      autoEnd: raw.endSource === "auto_schedule" || raw.endSource === "auto_ot",
      cashSessionId: raw.cashSessionId ? String(raw.cashSessionId) : null,
      dayOffKind: raw.dayOffKind ? String(raw.dayOffKind) : null,
      dayOffRequestId: raw.dayOffRequestId ? String(raw.dayOffRequestId) : null,
      endSource: raw.endSource ? String(raw.endSource) : null,
      endedAt: raw.endedAt ? new Date(raw.endedAt).toISOString() : null,
      lateMinutes: Number(raw.lateMinutes ?? 0),
      note: raw.note ? String(raw.note) : null,
      otApprovalId: raw.otApprovalId ? String(raw.otApprovalId) : null,
      otMinutes: raw.otMinutes == null ? null : Number(raw.otMinutes),
      regularMinutes: raw.regularMinutes == null ? null : Number(raw.regularMinutes),
      startedAt: new Date(raw.startedAt).toISOString(),
      status: raw.status === "open" ? "open" : "closed",
    };
    const list = sessionsByKey.get(key) ?? [];
    list.push(detail);
    sessionsByKey.set(key, list);
    sessionMeta.set(key, { branchId: String(raw.branchId), businessDate, userId: String(raw.userId) });
  }

  const dayMap = new Map<string, AttendanceDayRow>();

  for (const [key, sessionList] of sessionsByKey) {
    const meta = sessionMeta.get(key)!;
    const sched = scheduleForDate({
      businessDate: meta.businessDate,
      schedules: scheduleRows,
      userId: meta.userId,
    });
    dayMap.set(
      key,
      aggregateSessionsToDay({
        branchId: meta.branchId,
        branchName: branchName.get(meta.branchId) ?? defaultBranchName,
        businessDate: meta.businessDate,
        employeeName: userName.get(meta.userId) ?? meta.userId,
        scheduleResolved: sched.scheduleResolved,
        scheduledEnd: sched.scheduledEnd,
        scheduledStart: sched.scheduledStart,
        sessions: sessionList,
        userId: meta.userId,
      }),
    );
  }

  // Approved Day Off requests without attendance → Day Off-only rows
  for (const req of dayOffRequests as Array<Record<string, any>>) {
    const businessDate = dateLabelOf(req.requestDate);
    const key = rowKey(String(req.userId), businessDate);
    if (dayMap.has(key)) {
      // Attendance already present — Worked on Day Off handled via persisted day_off_kind
      continue;
    }
    const kind = String(req.kind);
    const dayOffLabel =
      kind === DAY_OFF_REQUEST_KIND.QUOTA ? "quota" : kind === DAY_OFF_REQUEST_KIND.SPECIAL ? "special" : "quota";
    const sched = scheduleForDate({
      businessDate,
      schedules: scheduleRows,
      userId: String(req.userId),
    });
    dayMap.set(
      key,
      buildDayOffOnlyRow({
        branchId: String(req.branchId),
        branchName: branchName.get(String(req.branchId)) ?? defaultBranchName,
        businessDate,
        dayOffLabel,
        dayOffRequestId: String(req.id),
        employeeName: userName.get(String(req.userId)) ?? String(req.userId),
        scheduleResolved: sched.scheduleResolved,
        scheduledEnd: sched.scheduledEnd,
        scheduledStart: sched.scheduledStart,
        userId: String(req.userId),
      }),
    );
  }

  // Weekly Day Off expansion for known users (and always for employee filter)
  const weeklyByUser = new Map<string, Set<number>>();
  for (const w of weeklyDayOffs as Array<{ userId: string; weekday: number }>) {
    if (!userIds.has(w.userId) && w.userId !== query.employeeId) continue;
    const set = weeklyByUser.get(w.userId) ?? new Set();
    set.add(Number(w.weekday));
    weeklyByUser.set(w.userId, set);
  }

  for (const [userId, weekdays] of weeklyByUser) {
    for (const label of dateLabels) {
      const instant = parseBusinessDate(label) ?? toUtcDateOnly(label);
      const weekday = weekdayForBusinessInstant(instant);
      if (!weekdays.has(weekday)) continue;
      const key = rowKey(userId, label);
      if (dayMap.has(key)) continue;
      const sched = scheduleForDate({ businessDate: label, schedules: scheduleRows, userId });
      dayMap.set(
        key,
        buildDayOffOnlyRow({
          branchId: defaultBranchId,
          branchName: defaultBranchName,
          businessDate: label,
          dayOffLabel: "weekly",
          dayOffRequestId: null,
          employeeName: userName.get(userId) ?? userId,
          scheduleResolved: sched.scheduleResolved,
          scheduledEnd: sched.scheduledEnd,
          scheduledStart: sched.scheduledStart,
          userId,
        }),
      );
    }
  }

  // No Work Record — only when a specific employee is filtered
  if (query.employeeId) {
    for (const label of dateLabels) {
      const key = rowKey(query.employeeId, label);
      if (dayMap.has(key)) continue;
      const sched = scheduleForDate({
        businessDate: label,
        schedules: scheduleRows,
        userId: query.employeeId,
      });
      dayMap.set(
        key,
        buildNoWorkRecordRow({
          branchId: defaultBranchId,
          branchName: defaultBranchName,
          businessDate: label,
          employeeName: userName.get(query.employeeId) ?? query.employeeId,
          scheduleResolved: sched.scheduleResolved,
          scheduledEnd: sched.scheduledEnd,
          scheduledStart: sched.scheduledStart,
          userId: query.employeeId,
        }),
      );
    }
  }

  let allRows = [...dayMap.values()].sort((a, b) => {
    const byDate = a.businessDate.localeCompare(b.businessDate);
    if (byDate !== 0) return byDate;
    return a.employeeName.localeCompare(b.employeeName);
  });
  allRows = allRows.filter((row) => matchesFilters(row, query));

  const summary = summarizeAttendanceDays(allRows);

  // Quota snapshots for employee summary — read only, never create
  const monthKeys = [...new Set(dateLabels.map((d) => d.slice(0, 7)))];
  const summaryUserIds = [...new Set(allRows.map((r) => r.userId))];
  const snapshots =
    summaryUserIds.length && monthKeys.length
      ? await dbClient.staffDayOffMonth.findMany({
          where: {
            companyId: tenant.companyId,
            monthKey: { in: monthKeys },
            userId: { in: summaryUserIds },
          },
        })
      : [];

  // Prefer primary month (first in range) for remaining display
  const primaryMonth = monthKeys[0] ?? businessMonthLabel(new Date());
  const snapshotMap = new Map<string, { quotaDays: number }>();
  for (const snap of snapshots as Array<{ monthKey: string; quotaDays: number; userId: string }>) {
    if (snap.monthKey === primaryMonth || !snapshotMap.has(snap.userId)) {
      snapshotMap.set(snap.userId, { quotaDays: Number(snap.quotaDays) });
    }
  }

  const quotaRequests =
    summaryUserIds.length && monthKeys.length
      ? await dbClient.staffDayOffRequest.findMany({
          select: {
            kind: true,
            quotaConsumed: true,
            quotaReturned: true,
            status: true,
            userId: true,
            monthKey: true,
          },
          where: {
            companyId: tenant.companyId,
            monthKey: { in: monthKeys },
            userId: { in: summaryUserIds },
          },
        })
      : [];

  const usedByUser = new Map<string, number>();
  for (const uid of summaryUserIds) {
    const rows = (quotaRequests as Array<{
      kind: string;
      monthKey: string;
      quotaConsumed: boolean;
      quotaReturned: boolean;
      status: string;
      userId: string;
    }>).filter((r) => r.userId === uid && r.monthKey === primaryMonth);
    if (snapshotMap.has(uid) || rows.length) {
      usedByUser.set(uid, countUsedQuotaDays(rows));
    }
  }

  const employeeSummaries = buildEmployeeSummaries(allRows, snapshotMap, usedByUser);

  const pageSize = ATTENDANCE_REPORT_PAGE_SIZE;
  const totalRowCount = allRows.length;
  const pageCount = Math.max(1, Math.ceil(totalRowCount / pageSize));
  const page = Math.min(query.page, pageCount);
  const rows = options?.allRows ? allRows : allRows.slice((page - 1) * pageSize, page * pageSize);

  return {
    employeeSummaries,
    filterOptions,
    page,
    pageCount,
    pageSize,
    query: { ...query, page },
    rows,
    scheduleNote: "weekday_resolved",
    summary,
    totalRowCount,
  };
}

export async function loadAttendanceDayDetail(
  tenant: TenantContext,
  userId: string,
  businessDate: string,
  client?: any,
) {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const utcDate = toUtcDateOnly(businessDate);

  const sessions = await dbClient.staffAttendanceSession.findMany({
    orderBy: { startedAt: "asc" },
    where: {
      businessDate: utcDate,
      companyId: tenant.companyId,
      userId,
      ...(scope.isOwner ? {} : { branchId: { in: scope.branchIds } }),
    },
  });

  const dayOff = await dbClient.staffDayOffRequest.findFirst({
    where: {
      companyId: tenant.companyId,
      requestDate: utcDate,
      status: DAY_OFF_STATUS.APPROVED,
      userId,
      ...(scope.isOwner ? {} : { branchId: { in: scope.branchIds } }),
    },
  });

  const otIds = (sessions as Array<{ otApprovalId?: string | null }>)
    .map((s) => s.otApprovalId)
    .filter(Boolean) as string[];
  const otApprovals = otIds.length
    ? await dbClient.staffOtApproval.findMany({ where: { id: { in: otIds } } })
    : [];

  const user = await dbClient.user.findFirst({
    select: { fullName: true, id: true, username: true },
    where: { id: userId },
  });

  const schedules = await dbClient.staffWorkSchedule.findMany({
    select: { endMinute: true, startMinute: true, userId: true, weekday: true },
    where: { companyId: tenant.companyId },
  });
  const scheduleRows: StaffScheduleRow[] = (schedules as StaffScheduleRow[]).map((row) => ({
    endMinute: Number(row.endMinute),
    startMinute: Number(row.startMinute),
    userId: row.userId ?? null,
    weekday: Number(row.weekday),
  }));
  const sched = scheduleForDate({ businessDate, schedules: scheduleRows, userId });

  const branchId =
    (sessions as Array<{ branchId: string }>)[0]?.branchId ??
    (dayOff as { branchId?: string } | null)?.branchId ??
    scope.branchId;
  const branch = await dbClient.branch.findFirst({
    select: { id: true, name: true },
    where: { companyId: tenant.companyId, id: branchId },
  });

  return {
    branchId,
    branchName: branch?.name ?? scope.branchName,
    businessDate,
    dayOffRequest: dayOff
      ? {
          id: String((dayOff as any).id),
          kind: String((dayOff as any).kind),
          reason: (dayOff as any).reason ?? null,
          status: String((dayOff as any).status),
        }
      : null,
    employeeName: String(user?.fullName || user?.username || userId),
    otApprovals: (otApprovals as Array<Record<string, any>>).map((row) => ({
      endMinute: Number(row.endMinute),
      id: String(row.id),
      startMinute: Number(row.startMinute),
      status: String(row.status),
    })),
    scheduleNote: "weekday_resolved" as const,
    scheduledEnd: sched.scheduledEnd,
    scheduledStart: sched.scheduledStart,
    sessions: (sessions as Array<Record<string, any>>).map((raw) => ({
      attendanceId: String(raw.id),
      autoEnd: raw.endSource === "auto_schedule" || raw.endSource === "auto_ot",
      cashSessionId: raw.cashSessionId ? String(raw.cashSessionId) : null,
      dayOffKind: raw.dayOffKind ? String(raw.dayOffKind) : null,
      dayOffRequestId: raw.dayOffRequestId ? String(raw.dayOffRequestId) : null,
      endSource: raw.endSource ? String(raw.endSource) : null,
      endedAt: raw.endedAt ? new Date(raw.endedAt).toISOString() : null,
      lateMinutes: Number(raw.lateMinutes ?? 0),
      note: raw.note ? String(raw.note) : null,
      otApprovalId: raw.otApprovalId ? String(raw.otApprovalId) : null,
      otMinutes: raw.otMinutes == null ? null : Number(raw.otMinutes),
      regularMinutes: raw.regularMinutes == null ? null : Number(raw.regularMinutes),
      startedAt: new Date(raw.startedAt).toISOString(),
      status: raw.status === "open" ? "open" : "closed",
    })),
    userId,
  };
}
