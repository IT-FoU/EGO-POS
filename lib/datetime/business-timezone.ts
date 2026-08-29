/** GO BOX / Mini Mart reporting calendar. Laos has no DST. */
export const BUSINESS_TIME_ZONE = "Asia/Vientiane";
const OFFSET_MS = 7 * 60 * 60 * 1000;

export function businessInstantParts(date: Date) {
  const shifted = new Date(date.getTime() + OFFSET_MS);
  return {
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    month: shifted.getUTCMonth(),
    weekday: shifted.getUTCDay(),
    year: shifted.getUTCFullYear(),
  };
}

export function startOfBusinessDay(date = new Date()) {
  const parts = businessInstantParts(date);
  return new Date(Date.UTC(parts.year, parts.month, parts.day, 0, 0, 0, 0) - OFFSET_MS);
}

export function endOfBusinessDay(date = new Date()) {
  return new Date(startOfBusinessDay(date).getTime() + 86_400_000 - 1);
}

export function startOfBusinessWeek(date = new Date()) {
  const start = startOfBusinessDay(date);
  const weekday = businessInstantParts(start).weekday;
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return new Date(start.getTime() + mondayOffset * 86_400_000);
}

export function startOfBusinessMonth(date = new Date()) {
  const parts = businessInstantParts(date);
  return new Date(Date.UTC(parts.year, parts.month, 1, 0, 0, 0, 0) - OFFSET_MS);
}

export function startOfBusinessYear(date = new Date()) {
  const parts = businessInstantParts(date);
  return new Date(Date.UTC(parts.year, 0, 1, 0, 0, 0, 0) - OFFSET_MS);
}

export function businessDayLabel(date: Date) {
  const parts = businessInstantParts(date);
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function businessMonthLabel(date: Date) {
  const parts = businessInstantParts(date);
  return `${parts.year}-${String(parts.month + 1).padStart(2, "0")}`;
}

export function businessHour(date: Date) {
  return businessInstantParts(date).hour;
}

export function parseBusinessDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - OFFSET_MS);
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

/** Deterministic display date for SSR and the first client render. */
export function formatBusinessDateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
  }).format(toDate(value));
}

/** Deterministic short date-time for SSR and the first client render. */
export function formatBusinessDateTimeLabel(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(toDate(value));
}

/** Deterministic medium date-time for SSR and the first client render. */
export function formatBusinessMediumDateTime(value: Date | string, locale: "en" | "th" = "en") {
  return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(toDate(value));
}
