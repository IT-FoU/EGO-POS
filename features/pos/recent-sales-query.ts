/** Shared Recent Sales list query helpers (STEP 6). No DB I/O. */

export const RECENT_SALES_DEFAULT_LIMIT = 25;
export const RECENT_SALES_MAX_LIMIT = 50;

export type RecentSalesDatePreset = "today" | "yesterday" | "week" | "month" | "custom";

export type RecentSalesListFilters = {
  cursor?: string | null;
  dateFrom?: string | null;
  datePreset?: RecentSalesDatePreset | null;
  dateTo?: string | null;
  limit?: number;
  search?: string | null;
};

export type RecentSalesCursorPayload = {
  createdAt: string;
  id: string;
};

export function clampRecentSalesLimit(limit?: number) {
  const raw = Number(limit);
  if (!Number.isFinite(raw) || raw <= 0) {
    return RECENT_SALES_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(raw), 1), RECENT_SALES_MAX_LIMIT);
}

export function encodeRecentSalesCursor(payload: RecentSalesCursorPayload): string {
  return Buffer.from(`${payload.createdAt}|${payload.id}`, "utf8").toString("base64url");
}

export function decodeRecentSalesCursor(cursor: string | null | undefined): RecentSalesCursorPayload | null {
  if (!cursor?.trim()) {
    return null;
  }
  try {
    const decoded = Buffer.from(cursor.trim(), "base64url").toString("utf8");
    const sep = decoded.indexOf("|");
    if (sep <= 0) {
      return null;
    }
    const createdAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!id || Number.isNaN(new Date(createdAt).getTime())) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

/**
 * Resolve inclusive date bounds for Recent Sales filters.
 * Uses local calendar days (same semantics as the previous client-side filter).
 */
export function resolveRecentSalesDateRange(
  preset: RecentSalesDatePreset | null | undefined,
  customStart?: string | null,
  customEnd?: string | null,
  now = new Date(),
): { from?: Date; to?: Date } {
  if (!preset) {
    return {};
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === "today") {
    return { from: startOfToday, to: now };
  }

  if (preset === "yesterday") {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 1);
    const to = new Date(startOfToday);
    to.setMilliseconds(-1);
    return { from, to };
  }

  if (preset === "week") {
    const from = new Date(startOfToday);
    from.setDate(from.getDate() - 6);
    return { from, to: now };
  }

  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from, to: now };
  }

  const from = customStart?.trim() ? new Date(`${customStart.trim()}T00:00:00`) : undefined;
  const to = customEnd?.trim() ? new Date(`${customEnd.trim()}T23:59:59.999`) : undefined;
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  };
}
