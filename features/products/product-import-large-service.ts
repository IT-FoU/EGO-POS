import { PermissionDeniedError } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";
import {
  isXlsxLocalHeader,
  largeImportObjectPath,
  PRODUCT_IMPORT_LARGE_MAX_BYTES,
  PRODUCT_IMPORT_LARGE_TTL_MS,
  PRODUCT_IMPORT_TEMP_BUCKET,
  PRODUCT_IMPORT_XLSX_MIME,
  sanitizeImportFileName,
  type LargeImportJob,
} from "@/features/products/product-import-large";
import { getLargeImportStorage, type LargeImportStorage } from "@/features/products/product-import-large-storage";
import { getLargeImportStore, type LargeImportStore } from "@/features/products/product-import-large-store";

const CLEANUP_LIMIT = 25;

export type LargeImportAuthorization = {
  bucket: string;
  contentType: string;
  expiresAt: string;
  fileName: string;
  jobId: string;
  objectPath: string;
  status: LargeImportJob["status"];
  token: string | null;
  tusEndpoint: string | null;
};

export async function startLargeImportUpload(
  input: { byteSize: number; fileName: string; idempotencyKey: string },
  tenant: TenantContext,
  deps?: { now?: Date; storage?: LargeImportStorage; store?: LargeImportStore },
): Promise<LargeImportAuthorization> {
  const now = deps?.now ?? new Date();
  const store = deps?.store ?? getLargeImportStore();
  const storage = deps?.storage ?? getLargeImportStorage();
  const fileName = sanitizeImportFileName(input.fileName);
  if (!fileName) throw new Error("Only an Excel .xlsx file can use large upload.");
  if (!Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > PRODUCT_IMPORT_LARGE_MAX_BYTES) {
    throw new Error("This file is larger than the 100 MB upload limit.");
  }
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) throw new Error("Upload retry key is invalid.");

  const existing = await store.findByIdempotency(tenant.companyId, tenant.userId, input.idempotencyKey);
  const job = existing ?? newJob(input, tenant, fileName, now);
  assertOwner(job, tenant);
  if (isExpired(job, now) && job.status !== "cancelled") {
    await storage.remove([job.objectPath]);
    job.status = "expired";
  }
  if (job.status === "uploaded") return authorization(job, null);
  if (job.status === "expired" || job.status === "cancelled" || job.status === "failed") {
    job.status = "uploading";
    job.createdAt = now.toISOString();
    job.expiresAt = new Date(now.getTime() + PRODUCT_IMPORT_LARGE_TTL_MS).toISOString();
    job.verifiedAt = null;
    job.byteSize = input.byteSize;
    job.fileName = fileName;
  }
  await store.save(job);
  const signed = await storage.authorizeUpload(job.objectPath);
  return authorization(job, signed);
}

export async function verifyLargeImportUpload(
  jobId: string,
  tenant: TenantContext,
  deps?: { now?: Date; storage?: LargeImportStorage; store?: LargeImportStore },
) {
  const now = deps?.now ?? new Date();
  const store = deps?.store ?? getLargeImportStore();
  const storage = deps?.storage ?? getLargeImportStorage();
  const job = await ownedJob(store, jobId, tenant);
  if (isExpired(job, now)) {
    await storage.remove([job.objectPath]);
    job.status = "expired";
    await store.save(job);
    return publicJob(job);
  }
  const size = await storage.readSize(job.objectPath);
  const prefix = await storage.readPrefix(job.objectPath, 4);
  if (size === null || !prefix || size !== job.byteSize || size > PRODUCT_IMPORT_LARGE_MAX_BYTES || !isXlsxLocalHeader(prefix)) {
    await storage.remove([job.objectPath]);
    job.status = "failed";
    job.verifiedAt = null;
    await store.save(job);
    return publicJob(job);
  }
  job.status = "uploaded";
  job.verifiedAt = now.toISOString();
  await store.save(job);
  return publicJob(job);
}

export async function cancelLargeImportUpload(
  jobId: string,
  tenant: TenantContext,
  deps?: { storage?: LargeImportStorage; store?: LargeImportStore },
) {
  const store = deps?.store ?? getLargeImportStore();
  const storage = deps?.storage ?? getLargeImportStorage();
  const job = await ownedJob(store, jobId, tenant);
  await storage.remove([job.objectPath]);
  job.status = "cancelled";
  job.verifiedAt = null;
  await store.save(job);
  return publicJob(job);
}

export async function cleanupExpiredLargeImports(
  now = new Date(),
  deps?: { protectedUploadIds?: string[]; storage?: LargeImportStorage; store?: LargeImportStore },
) {
  const store = deps?.store ?? getLargeImportStore();
  const storage = deps?.storage ?? getLargeImportStorage();
  const protectedIds = new Set(deps && "protectedUploadIds" in deps ? deps.protectedUploadIds ?? [] : await protectedUploadIds());
  const jobs = await store.listExpired(now, CLEANUP_LIMIT);
  let removed = 0;
  for (const job of jobs) {
    if (protectedIds.has(job.id)) continue;
    await storage.remove([job.objectPath]);
    job.status = "expired";
    await store.save(job);
    removed += 1;
  }
  return { removed };
}

async function protectedUploadIds() {
  const { getImportProcessStore } = await import("@/features/products/product-import-process-store");
  return getImportProcessStore().listProtectedUploadIds();
}

async function ownedJob(store: LargeImportStore, jobId: string, tenant: TenantContext) {
  const job = await store.get(jobId);
  if (!job || job.companyId !== tenant.companyId || job.userId !== tenant.userId) {
    throw new PermissionDeniedError("products.create");
  }
  return job;
}

function assertOwner(job: LargeImportJob, tenant: TenantContext) {
  if (job.companyId !== tenant.companyId || job.userId !== tenant.userId) {
    throw new PermissionDeniedError("products.create");
  }
}

function newJob(
  input: { byteSize: number; idempotencyKey: string },
  tenant: TenantContext,
  fileName: string,
  now: Date,
): LargeImportJob {
  const id = crypto.randomUUID();
  return {
    byteSize: input.byteSize,
    companyId: tenant.companyId,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PRODUCT_IMPORT_LARGE_TTL_MS).toISOString(),
    fileName,
    id,
    idempotencyKey: input.idempotencyKey,
    objectPath: largeImportObjectPath(tenant.companyId, tenant.userId, id),
    status: "uploading",
    userId: tenant.userId,
    verifiedAt: null,
  };
}

function authorization(
  job: LargeImportJob,
  signed: { token: string; tusEndpoint: string } | null,
): LargeImportAuthorization {
  return {
    bucket: PRODUCT_IMPORT_TEMP_BUCKET,
    contentType: PRODUCT_IMPORT_XLSX_MIME,
    expiresAt: job.expiresAt,
    fileName: job.fileName,
    jobId: job.id,
    objectPath: job.objectPath,
    status: job.status,
    token: signed?.token ?? null,
    tusEndpoint: signed?.tusEndpoint ?? null,
  };
}

function isExpired(job: LargeImportJob, now: Date) {
  return Date.parse(job.expiresAt) <= now.getTime();
}

function publicJob(job: LargeImportJob) {
  return {
    byteSize: job.byteSize,
    expiresAt: job.expiresAt,
    fileName: job.fileName,
    jobId: job.id,
    status: job.status,
  };
}
