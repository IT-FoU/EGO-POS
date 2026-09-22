import {
  resolveScheduleForUser,
  weekdayForBusinessInstant,
  type StaffScheduleRow,
} from "@/features/attendance/attendance-math";

export type AttendanceQaScheduleSource = "employee_override" | "company_default" | "none";

export type AttendanceQaRow = {
  attendanceId: string;
  branchId: string;
  branchName: string;
  businessDate: string;
  cashSessionId: string | null;
  companyId: string;
  employeeName: string;
  endSource: string | null;
  endedAt: string | null;
  lateMinutes: number;
  regularMinutes: number | null;
  scheduleSource: AttendanceQaScheduleSource;
  scheduledEnd: string | null;
  scheduledStart: string | null;
  startedAt: string;
  status: "open" | "closed";
  userId: string;
};

export type AttendanceQaSummary = {
  closedAttendance: number;
  lateSessions: number;
  openAttendance: number;
  totalLateMinutes: number;
};

export function formatScheduleClock(minute: number | null | undefined) {
  if (minute == null || !Number.isFinite(minute)) return null;
  const hours = Math.floor(minute / 60);
  const mins = minute % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function classifyScheduleSource(input: {
  schedules: StaffScheduleRow[];
  startedAt: Date;
  userId: string;
}): { schedule: StaffScheduleRow | null; source: AttendanceQaScheduleSource } {
  const weekday = weekdayForBusinessInstant(input.startedAt);
  const hasOverride = input.schedules.some((row) => row.userId === input.userId && row.weekday === weekday);
  const schedule = resolveScheduleForUser({
    schedules: input.schedules,
    userId: input.userId,
    weekday,
  });
  if (!schedule) return { schedule: null, source: "none" };
  return { schedule, source: hasOverride ? "employee_override" : "company_default" };
}

export function summarizeAttendanceQa(rows: AttendanceQaRow[]): AttendanceQaSummary {
  return {
    closedAttendance: rows.filter((row) => row.status === "closed").length,
    lateSessions: rows.filter((row) => row.lateMinutes > 0).length,
    openAttendance: rows.filter((row) => row.status === "open").length,
    totalLateMinutes: rows.reduce((total, row) => total + row.lateMinutes, 0),
  };
}
