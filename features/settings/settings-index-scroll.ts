/**
 * One-shot Settings index scroll memory.
 * Session + current history entry only — no cookies, database, or global app scroll system.
 */

export const SETTINGS_INDEX_SCROLL_STORAGE_KEY = "ego-pos:settings-index-scroll";
export const SETTINGS_INDEX_SCROLL_HISTORY_KEY = "egoSettingsIndexScroll";

export type SettingsIndexScrollSnapshot = {
  rowHref: string;
  y: number;
};

function isSnapshot(value: unknown): value is SettingsIndexScrollSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as { rowHref?: unknown; y?: unknown };
  return typeof row.rowHref === "string" && row.rowHref.startsWith("/settings/") && typeof row.y === "number" && Number.isFinite(row.y) && row.y >= 0;
}

export function captureSettingsIndexScroll(rowHref: string) {
  if (typeof window === "undefined") return;
  if (!rowHref.startsWith("/settings/")) return;
  const snapshot: SettingsIndexScrollSnapshot = {
    rowHref,
    y: Math.max(0, Math.round(window.scrollY || 0)),
  };
  try {
    window.sessionStorage.setItem(SETTINGS_INDEX_SCROLL_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore private-mode quota errors. History state still covers browser Back.
  }
  const current = window.history.state && typeof window.history.state === "object" ? window.history.state : {};
  window.history.replaceState({ ...current, [SETTINGS_INDEX_SCROLL_HISTORY_KEY]: snapshot }, "");
}

export function readSettingsIndexScrollSnapshot(): SettingsIndexScrollSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SETTINGS_INDEX_SCROLL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isSnapshot(parsed)) return parsed;
    }
  } catch {
    // Fall through to history state.
  }
  const fromHistory = window.history.state?.[SETTINGS_INDEX_SCROLL_HISTORY_KEY];
  return isSnapshot(fromHistory) ? fromHistory : null;
}

/** Read and clear. A second call in the same visit returns null. */
export function consumeSettingsIndexScroll(): SettingsIndexScrollSnapshot | null {
  const snapshot = readSettingsIndexScrollSnapshot();
  clearSettingsIndexScroll();
  return snapshot;
}

export function clearSettingsIndexScroll() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SETTINGS_INDEX_SCROLL_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  const current = window.history.state;
  if (current && typeof current === "object" && SETTINGS_INDEX_SCROLL_HISTORY_KEY in current) {
    const next = { ...current };
    delete next[SETTINGS_INDEX_SCROLL_HISTORY_KEY];
    window.history.replaceState(next, "");
  }
}

/** Drop a pending restore when the user leaves the Settings module. */
export function clearSettingsIndexScrollIfOutsideSettings() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/settings" || window.location.pathname.startsWith("/settings/")) return;
  clearSettingsIndexScroll();
}

/**
 * Keep the saved offset when the originating row is still in that viewport.
 * Otherwise move near the row so a layout shift does not leave it off-screen.
 */
export function settingsIndexScrollTarget(snapshot: SettingsIndexScrollSnapshot, rowDocumentTop: number | null, viewportHeight: number) {
  const saved = Math.max(0, snapshot.y);
  if (rowDocumentTop == null || !Number.isFinite(rowDocumentTop)) return saved;
  const view = Math.max(1, viewportHeight);
  const rowInSavedView = rowDocumentTop >= saved && rowDocumentTop < saved + view;
  if (rowInSavedView) return saved;
  return Math.max(0, Math.round(rowDocumentTop - 24));
}
