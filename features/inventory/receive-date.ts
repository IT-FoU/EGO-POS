import { startOfBusinessDay } from "@/lib/datetime/business-timezone";

export const INVALID_RECEIVE_DATE = "Receive date must be a valid date.";

/** Date-only YYYY-MM-DD becomes 00:00 Asia/Vientiane. Empty stays null. */
export function businessReceiveInstant(value: string | null | undefined): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new Error(INVALID_RECEIVE_DATE);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(INVALID_RECEIVE_DATE);
  }
  return startOfBusinessDay(new Date(Date.UTC(year, month - 1, day, 12, 0, 0)));
}
