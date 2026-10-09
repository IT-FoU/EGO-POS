import { PermissionDeniedError } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";
import type { LargeImportStore } from "@/features/products/product-import-large-store";
import { getLargeImportStore } from "@/features/products/product-import-large-store";
import {
  IMPORT_PROCESS_LEASE_MS,
  IMPORT_PROCESS_MAX_ATTEMPTS,
  type ImportProcessRecord,
  type ImportProcessSheet,
} from "@/features/products/product-import-process";
import { getImportProcessStore, type ImportProcessStore } from "@/features/products/product-import-process-store";

export type ImportProcessSender = {
  send(processId: string): Promise<void>;
};

export type PublicImportProcess = {
  attempt: number;
  errorCode: string | null;
  phase: string;
  processId: string;
  progressPercent: number;
  rowCount: number | null;
  sheetCount: number | null;
  sheets: ImportProcessSheet[];
  status: ImportProcessRecord["status"];
};

export async function startImportProcess(
  uploadId: string,
  tenant: TenantContext,
  deps?: { now?: Date; sender?: ImportProcessSender; store?: ImportProcessStore; uploads?: LargeImportStore },
) {
  const now = deps?.now ?? new Date();
  const uploads = deps?.uploads ?? getLargeImportStore();
  const store = deps?.store ?? getImportProcessStore();
  const upload = await uploads.get(uploadId);
  if (!upload || upload.companyId !== tenant.companyId || upload.userId !== tenant.userId) {
    throw new PermissionDeniedError("products.create");
  }
  if (upload.status !== "uploaded") throw new Error("The workbook is not ready to read.");
  if (Date.parse(upload.expiresAt) < now.getTime() + IMPORT_PROCESS_LEASE_MS) {
    throw new Error("This workbook expires too soon. Upload it again.");
  }
  const existing = await store.findByUploadId(upload.id);
  if (existing && (existing.status === "running" || existing.status === "ready" || existing.status === "cancelled")) {
    return publicProcess(existing);
  }
  if (existing && existing.attempt >= IMPORT_PROCESS_MAX_ATTEMPTS && existing.status === "failed") {
    return publicProcess(existing);
  }
  const record = existing
    ? {
        ...existing,
        attempt: existing.status === "failed" ? existing.attempt + 1 : existing.attempt,
        errorCode: null,
        finishedAt: null,
        phase: "queued",
        progressPercent: 0,
        queuedAt: now.toISOString(),
        startedAt: null,
        status: "queued" as const,
      }
    : newRecord(upload.id, tenant, now);
  await store.save(record);
  if (!deps?.sender) throw new Error("Import processing queue is not configured.");
  await deps.sender.send(record.id);
  return publicProcess(record);
}

export async function readImportProcess(
  processId: string,
  tenant: TenantContext,
  deps?: { store?: ImportProcessStore },
) {
  const store = deps?.store ?? getImportProcessStore();
  const record = await store.get(processId);
  if (!record || record.companyId !== tenant.companyId || record.userId !== tenant.userId) {
    throw new PermissionDeniedError("products.create");
  }
  return publicProcess(record);
}

export async function cancelImportProcess(
  processId: string,
  tenant: TenantContext,
  deps?: { store?: ImportProcessStore },
) {
  const store = deps?.store ?? getImportProcessStore();
  const record = await store.get(processId);
  if (!record || record.companyId !== tenant.companyId || record.userId !== tenant.userId) {
    throw new PermissionDeniedError("products.create");
  }
  if (record.status === "queued" || record.status === "running") {
    record.status = "cancelled";
    record.phase = "cancelled";
    record.finishedAt = new Date().toISOString();
    await store.save(record);
  }
  return publicProcess(record);
}

function newRecord(uploadId: string, tenant: TenantContext, now: Date): ImportProcessRecord {
  return {
    attempt: 1,
    companyId: tenant.companyId,
    durationMs: null,
    entryCount: null,
    errorCode: null,
    finishedAt: null,
    heartbeatAt: null,
    id: crypto.randomUUID(),
    oversizedImages: null,
    peakMemoryBytes: null,
    phase: "queued",
    progressPercent: 0,
    queuedAt: now.toISOString(),
    rowCount: null,
    sheetCount: null,
    sheetNames: [],
    startedAt: null,
    status: "queued",
    uncompressedBytes: null,
    uploadId,
    userId: tenant.userId,
  };
}

function publicProcess(record: ImportProcessRecord): PublicImportProcess {
  return {
    attempt: record.attempt,
    errorCode: record.errorCode,
    phase: record.phase,
    processId: record.id,
    progressPercent: record.progressPercent,
    rowCount: record.rowCount,
    sheetCount: record.sheetCount,
    sheets: record.sheetNames,
    status: record.status,
  };
}
