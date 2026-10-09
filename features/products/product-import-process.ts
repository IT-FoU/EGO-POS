export const IMPORT_PROCESS_LEASE_MS = 2 * 60 * 60 * 1000;
export const IMPORT_PROCESS_MAX_ATTEMPTS = 3;
export const IMPORT_PROCESS_MEMORY_STOP_BYTES = Math.floor(4 * 1024 * 1024 * 1024 * 0.8);
export const IMPORT_PROCESS_TIME_LIMIT_MS = 10 * 60 * 1000;
export const IMPORT_METADATA_MAX_COMPRESSED_BYTES = 100 * 1024 * 1024;
export const IMPORT_METADATA_MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
export const IMPORT_METADATA_MAX_ENTRY_BYTES = 512 * 1024 * 1024;
export const IMPORT_METADATA_MAX_ENTRIES = 8_000;
export const IMPORT_METADATA_MAX_RATIO = 20;
export const IMPORT_METADATA_MAX_SHEETS_STORED = 50;
export const IMPORT_METADATA_MAX_SHEET_NAME = 80;
export const IMPORT_METADATA_IMAGE_SKIP_BYTES = 5 * 1024 * 1024;
export const IMPORT_CONTAINER_ALLOWED_HOSTS = [
  "arkhwskvcnntluoakmef.supabase.co",
  "arkhwskvcnntluoakmef.storage.supabase.co",
] as const;

export const IMPORT_PROCESS_STATUSES = ["queued", "running", "ready", "failed", "cancelled", "expired"] as const;
export type ImportProcessStatus = (typeof IMPORT_PROCESS_STATUSES)[number];

export type ImportProcessSheet = {
  name: string;
  rows: number;
};

export type ImportProcessRecord = {
  attempt: number;
  companyId: string;
  durationMs: number | null;
  entryCount: number | null;
  errorCode: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
  id: string;
  oversizedImages: number | null;
  peakMemoryBytes: number | null;
  phase: string;
  progressPercent: number;
  queuedAt: string;
  rowCount: number | null;
  sheetCount: number | null;
  sheetNames: ImportProcessSheet[];
  startedAt: string | null;
  status: ImportProcessStatus;
  uncompressedBytes: number | null;
  uploadId: string;
  userId: string;
};

const PROCESS_ID = /^[A-Za-z0-9_-]{8,80}$/;

export function assertImportProcessId(value: string) {
  if (!PROCESS_ID.test(value)) throw new Error("Process id is invalid.");
  return value;
}

export function parseImportProcessMessage(body: unknown) {
  if (!body || typeof body !== "object" || !("processId" in body)) throw new Error("Process message is invalid.");
  const processId = (body as { processId?: unknown }).processId;
  if (typeof processId !== "string") throw new Error("Process message is invalid.");
  return { processId: assertImportProcessId(processId) };
}

export function encodeSheetNames(sheets: ImportProcessSheet[]) {
  const limited = sheets.slice(0, IMPORT_METADATA_MAX_SHEETS_STORED).map((sheet) => ({
    name: sheet.name.slice(0, IMPORT_METADATA_MAX_SHEET_NAME),
    rows: Math.max(0, Math.floor(sheet.rows)),
  }));
  const encoded = JSON.stringify(limited);
  if (encoded.length > 4000) return JSON.stringify(limited.slice(0, 20));
  return encoded;
}

export function decodeSheetNames(value: string | null): ImportProcessSheet[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const name = "name" in item && typeof item.name === "string" ? item.name.slice(0, IMPORT_METADATA_MAX_SHEET_NAME) : "";
      const rows = "rows" in item && typeof item.rows === "number" && Number.isFinite(item.rows) ? Math.max(0, Math.floor(item.rows)) : 0;
      return name ? [{ name, rows }] : [];
    });
  } catch {
    return [];
  }
}
