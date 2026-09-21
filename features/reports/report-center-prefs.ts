import { DemoStorageKeys } from "@/lib/demo/storage-keys";
import { readListFromStorage, writeListToStorage } from "@/lib/demo/storage";
import { findReportCenterEntry, REPORT_CENTER_ENTRIES } from "@/features/reports/report-center-catalog";

const RECENT_LIMIT = 8;
const knownIds = new Set(REPORT_CENTER_ENTRIES.map((entry) => entry.id));

function sanitizeIds(ids: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    if (!knownIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}

export function readReportCenterFavorites() {
  return sanitizeIds(readListFromStorage<string>(DemoStorageKeys.reportCenterFavorites));
}

export function writeReportCenterFavorites(ids: string[]) {
  const next = sanitizeIds(ids);
  writeListToStorage(DemoStorageKeys.reportCenterFavorites, next);
  return next;
}

export function toggleReportCenterFavorite(id: string) {
  if (!findReportCenterEntry(id)) return readReportCenterFavorites();
  const current = readReportCenterFavorites();
  const next = current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
  return writeReportCenterFavorites(next);
}

export function readReportCenterRecent() {
  return sanitizeIds(readListFromStorage<string>(DemoStorageKeys.reportCenterRecent));
}

export function recordReportCenterRecent(id: string) {
  if (!findReportCenterEntry(id)) return readReportCenterRecent();
  const next = [id, ...readReportCenterRecent().filter((value) => value !== id)].slice(0, RECENT_LIMIT);
  writeListToStorage(DemoStorageKeys.reportCenterRecent, next);
  return next;
}
