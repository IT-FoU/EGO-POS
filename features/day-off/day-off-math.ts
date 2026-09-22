/**
 * R9B Day Off math — quota remaining, month keys, kinds.
 * Business calendar: Asia/Vientiane. No OT. No Cron expiry job.
 */
import { businessDayLabel, businessMonthLabel, parseBusinessDate } from "@/lib/datetime/business-timezone";

export const DAY_OFF_KIND = {
  QUOTA: "quota",
  SPECIAL: "special",
  WEEKLY: "weekly",
} as const;

export const DAY_OFF_REQUEST_KIND = {
  QUOTA: "quota",
  SPECIAL: "special",
} as const;

export const DAY_OFF_SOURCE = {
  EMPLOYEE: "employee",
  GRANT: "grant",
} as const;

export const DAY_OFF_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
} as const;

export type DayOffAttendanceKind = "weekly" | "quota" | "special";
export type DayOffRequestKind = "quota" | "special";
export type DayOffSource = "employee" | "grant";
export type DayOffStatus = "pending" | "approved" | "rejected" | "cancelled";

export function monthKeyFromBusinessDate(date: Date): string {
  return businessMonthLabel(date);
}

export function monthKeyFromRequestDateLabel(label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    throw new Error("request_date must be YYYY-MM-DD.");
  }
  return label.slice(0, 7);
}

export function parseRequestDateOnly(label: string): Date {
  const parsed = parseBusinessDate(label);
  if (!parsed) throw new Error("request_date must be YYYY-MM-DD.");
  const [y, m, d] = label.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function requestDateLabel(value: Date): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Prefer ISO date part for @db.Date UTC midnight rows.
    const iso = value.toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  }
  return businessDayLabel(value);
}

export type QuotaUsageRow = {
  kind: string;
  quotaConsumed: boolean;
  quotaReturned: boolean;
  status: string;
};

/** Used = approved quota consumed and not returned. */
export function countUsedQuotaDays(rows: QuotaUsageRow[]): number {
  return rows.filter(
    (row) =>
      row.kind === DAY_OFF_REQUEST_KIND.QUOTA &&
      row.status === DAY_OFF_STATUS.APPROVED &&
      row.quotaConsumed &&
      !row.quotaReturned,
  ).length;
}

export function computeRemainingQuota(quotaDays: number, used: number): number {
  const remaining = Math.floor(quotaDays) - Math.floor(used);
  return remaining < 0 ? 0 : remaining;
}

export function resolveConfiguredQuotaDays(input: {
  companyDefault: number | null | undefined;
  employeeOverride: number | null | undefined;
}): number {
  if (input.employeeOverride != null && Number.isFinite(input.employeeOverride)) {
    return Math.max(0, Math.floor(input.employeeOverride));
  }
  if (input.companyDefault != null && Number.isFinite(input.companyDefault)) {
    return Math.max(0, Math.floor(input.companyDefault));
  }
  return 0;
}

export function assertValidWeekday(weekday: number) {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error("weekday must be an integer from 0 (Sun) to 6 (Sat).");
  }
}

export function assertValidQuotaDays(days: number) {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("monthly_quota_days must be an integer >= 0.");
  }
}
