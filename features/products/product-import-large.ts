export const PRODUCT_IMPORT_TEMP_BUCKET = "product-import-temp";
export const PRODUCT_IMPORT_LARGE_MAX_BYTES = 100 * 1024 * 1024;
export const PRODUCT_IMPORT_LARGE_TTL_MS = 24 * 60 * 60 * 1000;
export const PRODUCT_IMPORT_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PRODUCT_IMPORT_TUS_CHUNK_BYTES = 6 * 1024 * 1024;

const SAFE_ID = /^[A-Za-z0-9_-]{8,80}$/;
const XLSX_LOCAL_HEADER = [0x50, 0x4b, 0x03, 0x04];

export type LargeImportStatus = "uploading" | "uploaded" | "failed" | "cancelled" | "expired";

export type LargeImportJob = {
  byteSize: number;
  companyId: string;
  createdAt: string;
  expiresAt: string;
  fileName: string;
  id: string;
  idempotencyKey: string;
  objectPath: string;
  status: LargeImportStatus;
  userId: string;
  verifiedAt: string | null;
};

export function assertSafeImportId(value: string) {
  if (!SAFE_ID.test(value)) throw new Error("Import id is invalid.");
  return value;
}

export function largeImportObjectPath(companyId: string, userId: string, jobId: string) {
  return `imports/${assertSafeImportId(companyId)}/${assertSafeImportId(userId)}/${assertSafeImportId(jobId)}.xlsx`;
}

export function isTempImportObjectPath(path: string) {
  const match = /^imports\/([A-Za-z0-9_-]{8,80})\/([A-Za-z0-9_-]{8,80})\/([A-Za-z0-9_-]{8,80})\.xlsx$/.exec(path);
  if (!match) return false;
  return largeImportObjectPath(match[1]!, match[2]!, match[3]!) === path;
}

export function sanitizeImportFileName(fileName: string) {
  const base = fileName.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, "").trim() ?? "";
  const limited = base.slice(0, 180);
  return limited.toLowerCase().endsWith(".xlsx") ? limited : "";
}

export function isXlsxLocalHeader(bytes: Uint8Array) {
  return XLSX_LOCAL_HEADER.every((value, index) => bytes[index] === value);
}

export function largeImportTusEndpoint(projectUrl: string) {
  const host = new URL(projectUrl).host;
  const projectRef = host.split(".")[0] ?? "";
  if (!/^[a-z0-9]{16,32}$/.test(projectRef)) throw new Error("Storage project is invalid.");
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable/sign`;
}

export function tusMetadata(entries: Record<string, string>) {
  return Object.entries(entries)
    .map(([key, value]) => `${key} ${encodeBase64(value)}`)
    .join(",");
}

function encodeBase64(value: string) {
  if (typeof btoa === "function") return btoa(value);
  return Buffer.from(value, "utf8").toString("base64");
}
