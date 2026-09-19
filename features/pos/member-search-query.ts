/** Shared Member Search query helpers (STEP 7). No DB I/O. */

export const MEMBER_SEARCH_DEFAULT_LIMIT = 20;
export const MEMBER_SEARCH_MAX_LIMIT = 50;
/** Debounce for live Member Search input (ms). Matches Recent Sales pattern. */
export const MEMBER_SEARCH_DEBOUNCE_MS = 300;

export function clampMemberSearchLimit(limit?: number) {
  const raw = Number(limit);
  if (!Number.isFinite(raw) || raw <= 0) {
    return MEMBER_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(Math.max(Math.floor(raw), 1), MEMBER_SEARCH_MAX_LIMIT);
}

/**
 * Trim only — do not destructively normalize Unicode / phone for primary match.
 * Digit extraction is optional and additive for phone OR clauses.
 */
export function normalizeMemberSearchQuery(raw: string | null | undefined) {
  return String(raw ?? "").trim();
}

export function memberSearchPhoneDigits(raw: string) {
  return raw.replace(/\D/g, "");
}
