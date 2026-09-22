/**
 * R9C OT + Auto End math — Asia/Vientiane minute precision. No payroll.
 */
import {
  assertValidScheduleMinutes,
  assertValidWeekday,
  type StaffScheduleRow,
} from "@/features/attendance/attendance-math";
import { businessDayLabel, startOfBusinessDay } from "@/lib/datetime/business-timezone";

export const OT_APPROVAL_STATUS = {
  APPROVED: "approved",
  CANCELLED: "cancelled",
} as const;

export type OtApprovalStatus = (typeof OT_APPROVAL_STATUS)[keyof typeof OT_APPROVAL_STATUS];

export const ATTENDANCE_END_SOURCE_R9C = {
  MANUAL: "manual",
  AUTO_SCHEDULE: "auto_schedule",
  AUTO_OT: "auto_ot",
} as const;

export type DayOffKindForOt = "weekly" | "quota" | "special";

export type OtWindow = {
  endMinute: number;
  startMinute: number;
};

export function assertValidOtMinutes(startMinute: number, endMinute: number) {
  assertValidScheduleMinutes(startMinute, endMinute);
}

export function assertValidOtWeekday(weekday: number) {
  assertValidWeekday(weekday);
}

export function parseBusinessDateUtc(label: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label.trim());
  if (!match) throw new Error("business_date must be YYYY-MM-DD.");
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  return new Date(Date.UTC(y, m - 1, d));
}

export function businessDateLabelFromDate(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new Error("Invalid date.");
  // Stored DATE maps as UTC midnight — prefer ISO date slice when already date-only.
  const iso = value.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso) && value.getUTCHours() === 0 && value.getUTCMinutes() === 0) {
    return iso;
  }
  return businessDayLabel(value);
}

/** Instant for a business calendar date + minute-of-day in Asia/Vientiane. */
export function businessDateMinuteInstant(businessDateLabel: string, minute: number): Date {
  const [y, m, d] = businessDateLabel.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayStart = startOfBusinessDay(utcNoon);
  return new Date(dayStart.getTime() + minute * 60_000);
}

export function minutesBetween(startedAt: Date, endedAt: Date): number {
  const diff = endedAt.getTime() - startedAt.getTime();
  if (diff <= 0) return 0;
  return Math.floor(diff / 60_000);
}

export function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end <= start) return 0;
  return Math.floor((end - start) / 60_000);
}

/**
 * Resolve credited close instant for OT/regular math.
 * Day Off without OT grant: no clamp (manual full work).
 * Normal day: clamp to schedule end or OT end.
 */
export function resolveCreditedEndedAt(input: {
  dayOffKind: DayOffKindForOt | null;
  endedAt: Date;
  otApproval: OtWindow | null;
  schedule: StaffScheduleRow | null;
  businessDateLabel: string;
}): Date {
  const { dayOffKind, endedAt, otApproval, schedule, businessDateLabel } = input;

  if (dayOffKind) {
    if (otApproval) {
      const otEnd = businessDateMinuteInstant(businessDateLabel, otApproval.endMinute);
      return endedAt.getTime() > otEnd.getTime() ? otEnd : endedAt;
    }
    return endedAt;
  }

  if (otApproval) {
    const otEnd = businessDateMinuteInstant(businessDateLabel, otApproval.endMinute);
    return endedAt.getTime() > otEnd.getTime() ? otEnd : endedAt;
  }

  if (schedule) {
    const scheduleEnd = businessDateMinuteInstant(businessDateLabel, schedule.endMinute);
    return endedAt.getTime() > scheduleEnd.getTime() ? scheduleEnd : endedAt;
  }

  return endedAt;
}

export function computeRegularAndOtMinutes(input: {
  businessDateLabel: string;
  dayOffKind: DayOffKindForOt | null;
  endedAt: Date;
  otApproval: OtWindow | null;
  schedule: StaffScheduleRow | null;
  startedAt: Date;
}): { otMinutes: number; regularMinutes: number } {
  const creditedEnd = resolveCreditedEndedAt(input);
  const worked = minutesBetween(input.startedAt, creditedEnd);

  if (input.dayOffKind) {
    return { otMinutes: worked, regularMinutes: 0 };
  }

  if (!input.schedule) {
    return { otMinutes: 0, regularMinutes: worked };
  }

  const scheduleEnd = businessDateMinuteInstant(input.businessDateLabel, input.schedule.endMinute);
  const regularEnd = creditedEnd.getTime() < scheduleEnd.getTime() ? creditedEnd : scheduleEnd;
  let regularMinutes = minutesBetween(input.startedAt, regularEnd);

  let otMinutes = 0;
  if (input.otApproval) {
    const otStart = businessDateMinuteInstant(input.businessDateLabel, input.otApproval.startMinute);
    const otEnd = businessDateMinuteInstant(input.businessDateLabel, input.otApproval.endMinute);
    otMinutes = overlapMinutes(input.startedAt, creditedEnd, otStart, otEnd);
  }

  if (regularMinutes + otMinutes > worked) {
    otMinutes = Math.max(0, worked - regularMinutes);
  }
  if (regularMinutes > worked) {
    regularMinutes = worked;
  }

  return { otMinutes, regularMinutes };
}

/**
 * Auto End target for an open attendance session.
 * Day Off: only with explicit OT grant. Never use normal schedule end on Day Off.
 * Normal day: OT end if approved, else schedule end, else null.
 */
export function resolveAutoEndAt(input: {
  businessDateLabel: string;
  dayOffKind: DayOffKindForOt | null;
  otApproval: OtWindow | null;
  schedule: StaffScheduleRow | null;
}): Date | null {
  if (input.dayOffKind) {
    if (!input.otApproval) return null;
    return businessDateMinuteInstant(input.businessDateLabel, input.otApproval.endMinute);
  }
  if (input.otApproval) {
    return businessDateMinuteInstant(input.businessDateLabel, input.otApproval.endMinute);
  }
  if (input.schedule) {
    return businessDateMinuteInstant(input.businessDateLabel, input.schedule.endMinute);
  }
  return null;
}

export function resolveEndSourceForAutoEnd(input: {
  dayOffKind: DayOffKindForOt | null;
  otApproval: OtWindow | null;
}): string {
  if (input.otApproval) return ATTENDANCE_END_SOURCE_R9C.AUTO_OT;
  return ATTENDANCE_END_SOURCE_R9C.AUTO_SCHEDULE;
}

export function resolveOtPolicy(
  policies: Array<{ enabled: boolean; endMinute: number; startMinute: number; userId: string | null; weekday: number }>,
  userId: string,
  weekday: number,
): OtWindow | null {
  const override = policies.find((p) => p.userId === userId && p.weekday === weekday && p.enabled);
  if (override) return { endMinute: override.endMinute, startMinute: override.startMinute };
  const company = policies.find((p) => p.userId == null && p.weekday === weekday && p.enabled);
  if (company) return { endMinute: company.endMinute, startMinute: company.startMinute };
  return null;
}
