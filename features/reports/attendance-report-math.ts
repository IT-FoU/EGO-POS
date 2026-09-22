/**
 * R9D Staff Attendance Report — display math only. No write / no SoT mutation.
 */
export type AttendanceWorkStatus = "worked" | "open" | "day_off" | "no_work_record";
export type AttendanceDayOffLabel =
  | "none"
  | "weekly"
  | "quota"
  | "special"
  | "worked_on_day_off";

export type AttendanceEndSourceFilter = "all" | "manual" | "auto_schedule" | "auto_ot" | "none";
export type AttendanceLateFilter = "all" | "late" | "on_time";
export type AttendanceOtFilter = "all" | "has_ot" | "no_ot" | "not_recorded";
export type AttendanceDayOffFilter = "all" | "none" | "weekly" | "quota" | "special" | "worked_on_day_off";
export type AttendanceWorkStatusFilter = "all" | "worked" | "open" | "day_off" | "no_work_record";

export const ATTENDANCE_REPORT_PAGE_SIZE = 50;
export const ATTENDANCE_REPORT_MAX_DAYS = 62;

export type AttendanceSessionDetail = {
  attendanceId: string;
  autoEnd: boolean;
  cashSessionId: string | null;
  dayOffKind: string | null;
  dayOffRequestId: string | null;
  endSource: string | null;
  endedAt: string | null;
  lateMinutes: number;
  note: string | null;
  otApprovalId: string | null;
  otMinutes: number | null;
  regularMinutes: number | null;
  startedAt: string;
  status: "open" | "closed";
};

export type AttendanceDayRow = {
  autoEnd: boolean;
  autoEndKind: "auto_schedule" | "auto_ot" | null;
  branchId: string;
  branchName: string;
  businessDate: string;
  cashSessionIds: string[];
  dayOffLabel: AttendanceDayOffLabel;
  dayOffRequestId: string | null;
  employeeName: string;
  endSource: string | null;
  endedAt: string | null;
  lateMinutes: number;
  note: string | null;
  otApprovalId: string | null;
  otMinutes: number | null;
  regularMinutes: number | null;
  /** Resolved from current weekday schedule config — not a historical snapshot. */
  scheduleResolved: boolean;
  scheduledEnd: string | null;
  scheduledStart: string | null;
  sessionCount: number;
  sessions: AttendanceSessionDetail[];
  startedAt: string | null;
  userId: string;
  workStatus: AttendanceWorkStatus;
};

export type AttendanceReportSummary = {
  autoEndCount: number;
  dayOffDays: number;
  employees: number;
  lateDays: number;
  openSessions: number;
  otHoursMinutes: number;
  otNotRecordedDays: number;
  regularHoursMinutes: number;
  totalLateMinutes: number;
  workDays: number;
  workedOnDayOffDays: number;
};

export type AttendanceEmployeeSummaryRow = {
  autoEndCount: number;
  dayOffRemaining: number | null;
  dayOffUsed: number | null;
  employeeName: string;
  lateDays: number;
  lateMinutes: number;
  otMinutes: number;
  quotaDays: number | null;
  quotaSnapshotExists: boolean;
  regularMinutes: number;
  trackedDays: number;
  userId: string;
  workDays: number;
  workedOnDayOffDays: number;
};

export function formatHoursMinutes(totalMinutes: number | null | undefined, nullLabel = "—") {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return nullLabel;
  const mins = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatLateDisplay(lateMinutes: number) {
  if (lateMinutes <= 0) return "on_time";
  return `${lateMinutes}`;
}

export function dayOffLabelFromKind(kind: string | null | undefined, hasWork: boolean): AttendanceDayOffLabel {
  if (!kind) return "none";
  if (hasWork) return "worked_on_day_off";
  if (kind === "weekly") return "weekly";
  if (kind === "quota") return "quota";
  if (kind === "special") return "special";
  return "none";
}

export function summarizeAttendanceDays(rows: AttendanceDayRow[]): AttendanceReportSummary {
  const employees = new Set(rows.map((r) => r.userId));
  let workDays = 0;
  let dayOffDays = 0;
  let workedOnDayOffDays = 0;
  let lateDays = 0;
  let totalLateMinutes = 0;
  let autoEndCount = 0;
  let openSessions = 0;
  let regularHoursMinutes = 0;
  let otHoursMinutes = 0;
  let otNotRecordedDays = 0;

  for (const row of rows) {
    if (row.workStatus === "worked" || row.workStatus === "open") workDays += 1;
    if (row.dayOffLabel !== "none" && row.dayOffLabel !== "worked_on_day_off") dayOffDays += 1;
    if (row.dayOffLabel === "worked_on_day_off") workedOnDayOffDays += 1;
    if (row.lateMinutes > 0) {
      lateDays += 1;
      totalLateMinutes += row.lateMinutes;
    }
    if (row.autoEnd) autoEndCount += 1;
    if (row.workStatus === "open") openSessions += 1;
    if (row.regularMinutes != null) regularHoursMinutes += row.regularMinutes;
    if (row.otMinutes == null && row.workStatus === "worked") otNotRecordedDays += 1;
    if (row.otMinutes != null) otHoursMinutes += row.otMinutes;
  }

  return {
    autoEndCount,
    dayOffDays,
    employees: employees.size,
    lateDays,
    openSessions,
    otHoursMinutes,
    otNotRecordedDays,
    regularHoursMinutes,
    totalLateMinutes,
    workDays,
    workedOnDayOffDays,
  };
}

export function aggregateSessionsToDay(input: {
  branchId: string;
  branchName: string;
  businessDate: string;
  employeeName: string;
  scheduleResolved: boolean;
  scheduledEnd: string | null;
  scheduledStart: string | null;
  sessions: AttendanceSessionDetail[];
  userId: string;
}): AttendanceDayRow {
  const sessions = [...input.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const first = sessions[0]!;
  const hasOpen = sessions.some((s) => s.status === "open");
  const latestEnded = sessions
    .filter((s) => s.endedAt)
    .map((s) => s.endedAt!)
    .sort()
    .at(-1) ?? null;

  let regularMinutes: number | null = 0;
  let otMinutes: number | null = 0;
  let otHasNull = false;
  let lateMinutes = first.lateMinutes;
  let dayOffKind: string | null = null;
  let dayOffRequestId: string | null = null;
  let otApprovalId: string | null = null;
  let endSource: string | null = null;
  let autoEnd = false;
  let autoEndKind: "auto_schedule" | "auto_ot" | null = null;
  const cashSessionIds: string[] = [];
  const notes: string[] = [];

  for (const session of sessions) {
    if (session.regularMinutes == null) {
      if (!hasOpen) regularMinutes = regularMinutes === 0 ? null : regularMinutes;
    } else if (regularMinutes != null) {
      regularMinutes += session.regularMinutes;
    }
    if (session.otMinutes == null) {
      otHasNull = true;
    } else if (otMinutes != null) {
      otMinutes += session.otMinutes;
    }
    if (session.dayOffKind) dayOffKind = session.dayOffKind;
    if (session.dayOffRequestId) dayOffRequestId = session.dayOffRequestId;
    if (session.otApprovalId) otApprovalId = session.otApprovalId;
    if (session.endSource) endSource = session.endSource;
    if (session.endSource === "auto_schedule" || session.endSource === "auto_ot") {
      autoEnd = true;
      autoEndKind = session.endSource;
    }
    if (session.cashSessionId) cashSessionIds.push(session.cashSessionId);
    if (session.note) notes.push(session.note);
  }

  if (otHasNull && otMinutes === 0) otMinutes = null;
  if (hasOpen) {
    // Open days: avoid presenting incomplete hours as final.
    regularMinutes = null;
    otMinutes = null;
  }

  const workStatus: AttendanceWorkStatus = hasOpen ? "open" : "worked";
  const dayOffLabel = dayOffLabelFromKind(dayOffKind, true);

  return {
    autoEnd,
    autoEndKind,
    branchId: input.branchId,
    branchName: input.branchName,
    businessDate: input.businessDate,
    cashSessionIds: [...new Set(cashSessionIds)],
    dayOffLabel,
    dayOffRequestId,
    employeeName: input.employeeName,
    endSource,
    endedAt: hasOpen ? null : latestEnded,
    lateMinutes,
    note: notes.join(" | ") || null,
    otApprovalId,
    otMinutes,
    regularMinutes,
    scheduleResolved: input.scheduleResolved,
    scheduledEnd: input.scheduledEnd,
    scheduledStart: input.scheduledStart,
    sessionCount: sessions.length,
    sessions,
    startedAt: first.startedAt,
    userId: input.userId,
    workStatus,
  };
}

export function buildDayOffOnlyRow(input: {
  branchId: string;
  branchName: string;
  businessDate: string;
  dayOffLabel: Exclude<AttendanceDayOffLabel, "none" | "worked_on_day_off">;
  dayOffRequestId: string | null;
  employeeName: string;
  scheduleResolved: boolean;
  scheduledEnd: string | null;
  scheduledStart: string | null;
  userId: string;
}): AttendanceDayRow {
  return {
    autoEnd: false,
    autoEndKind: null,
    branchId: input.branchId,
    branchName: input.branchName,
    businessDate: input.businessDate,
    cashSessionIds: [],
    dayOffLabel: input.dayOffLabel,
    dayOffRequestId: input.dayOffRequestId,
    employeeName: input.employeeName,
    endSource: null,
    endedAt: null,
    lateMinutes: 0,
    note: null,
    otApprovalId: null,
    otMinutes: null,
    regularMinutes: null,
    scheduleResolved: input.scheduleResolved,
    scheduledEnd: input.scheduledEnd,
    scheduledStart: input.scheduledStart,
    sessionCount: 0,
    sessions: [],
    startedAt: null,
    userId: input.userId,
    workStatus: "day_off",
  };
}

export function buildNoWorkRecordRow(input: {
  branchId: string;
  branchName: string;
  businessDate: string;
  employeeName: string;
  scheduleResolved: boolean;
  scheduledEnd: string | null;
  scheduledStart: string | null;
  userId: string;
}): AttendanceDayRow {
  return {
    autoEnd: false,
    autoEndKind: null,
    branchId: input.branchId,
    branchName: input.branchName,
    businessDate: input.businessDate,
    cashSessionIds: [],
    dayOffLabel: "none",
    dayOffRequestId: null,
    employeeName: input.employeeName,
    endSource: null,
    endedAt: null,
    lateMinutes: 0,
    note: null,
    otApprovalId: null,
    otMinutes: null,
    regularMinutes: null,
    scheduleResolved: input.scheduleResolved,
    scheduledEnd: input.scheduledEnd,
    scheduledStart: input.scheduledStart,
    sessionCount: 0,
    sessions: [],
    startedAt: null,
    userId: input.userId,
    workStatus: "no_work_record",
  };
}

export function rowKey(userId: string, businessDate: string) {
  return `${userId}::${businessDate}`;
}
