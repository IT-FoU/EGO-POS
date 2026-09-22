/**
 * R9A attendance math — schedule resolve, late, regular minutes.
 * Business calendar: Asia/Vientiane helpers. No fabricated 08:00.
 */
import {
  BUSINESS_TIME_ZONE,
  businessDayLabel,
  businessInstantParts,
  startOfBusinessDay,
} from "@/lib/datetime/business-timezone";

export const ATTENDANCE_STATUS = {
  CLOSED: "closed",
  OPEN: "open",
} as const;

export const ATTENDANCE_END_SOURCE = {
  MANUAL: "manual",
} as const;

export type StaffScheduleRow = {
  endMinute: number;
  startMinute: number;
  userId: string | null;
  weekday: number;
};

export function parseBusinessDateOnly(value: Date): Date {
  const label = businessDayLabel(value);
  const [y, m, d] = label.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function resolveScheduleForUser(input: {
  schedules: StaffScheduleRow[];
  userId: string;
  weekday: number;
}): StaffScheduleRow | null {
  const weekday = input.weekday;
  const override = input.schedules.find(
    (row) => row.userId === input.userId && row.weekday === weekday,
  );
  if (override) return override;
  const companyDefault = input.schedules.find(
    (row) => row.userId == null && row.weekday === weekday,
  );
  return companyDefault ?? null;
}

/** Scheduled local start instant for a Start Work timestamp, or null if no schedule. */
export function scheduledStartInstant(input: {
  endMinute: number;
  startAt: Date;
  startMinute: number;
}): Date {
  const dayStart = startOfBusinessDay(input.startAt);
  return new Date(dayStart.getTime() + input.startMinute * 60_000);
}

export function computeLateMinutes(input: {
  schedule: StaffScheduleRow | null;
  startedAt: Date;
}): number {
  if (!input.schedule) return 0;
  const scheduled = scheduledStartInstant({
    endMinute: input.schedule.endMinute,
    startAt: input.startedAt,
    startMinute: input.schedule.startMinute,
  });
  const diffMs = input.startedAt.getTime() - scheduled.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 60_000);
}

export function computeRegularMinutes(startedAt: Date, endedAt: Date): number {
  const diffMs = endedAt.getTime() - startedAt.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / 60_000);
}

export function weekdayForBusinessInstant(at: Date): number {
  return businessInstantParts(at).weekday;
}

export function assertValidScheduleMinutes(startMinute: number, endMinute: number) {
  if (!Number.isInteger(startMinute) || startMinute < 0 || startMinute >= 1440) {
    throw new Error("start_minute must be an integer from 0 to 1439.");
  }
  if (!Number.isInteger(endMinute) || endMinute <= startMinute || endMinute > 1440) {
    throw new Error("end_minute must be > start_minute and <= 1440.");
  }
}

export function assertValidWeekday(weekday: number) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error("weekday must be an integer from 0 (Sun) to 6 (Sat).");
  }
}

export { BUSINESS_TIME_ZONE, businessDayLabel, startOfBusinessDay };
