import type { ImportProcessRecord, ImportProcessSheet, ImportProcessStatus } from "@/features/products/product-import-process";
import { decodeSheetNames, encodeSheetNames } from "@/features/products/product-import-process";
import { prisma } from "@/lib/db/prisma";

export type ImportProcessStore = {
  findByUploadId(uploadId: string): Promise<ImportProcessRecord | null>;
  get(id: string): Promise<ImportProcessRecord | null>;
  listProtectedUploadIds(): Promise<string[]>;
  save(record: ImportProcessRecord): Promise<void>;
};

let storeOverride: ImportProcessStore | null = null;

export function setImportProcessStoreForTests(store: ImportProcessStore | null) {
  storeOverride = store;
}

export function getImportProcessStore() {
  return storeOverride ?? prismaImportProcessStore;
}

export function createMemoryImportProcessStore(): ImportProcessStore {
  const records = new Map<string, ImportProcessRecord>();
  return {
    async findByUploadId(uploadId) {
      return [...records.values()].find((record) => record.uploadId === uploadId) ?? null;
    },
    async get(id) {
      return records.get(id) ?? null;
    },
    async listProtectedUploadIds() {
      return [...records.values()].filter((record) => record.status === "queued" || record.status === "running").map((record) => record.uploadId);
    },
    async save(record) {
      records.set(record.id, record);
    },
  };
}

type ProcessRow = {
  attempt: number;
  companyId: string;
  durationMs: number | null;
  entryCount: number | null;
  errorCode: string | null;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  id: string;
  oversizedImages: number | null;
  peakMemoryBytes: bigint | null;
  phase: string;
  progressPercent: number;
  queuedAt: Date;
  rowCount: number | null;
  sheetCount: number | null;
  sheetNames: string | null;
  startedAt: Date | null;
  status: string;
  uncompressedBytes: bigint | null;
  uploadId: string;
  userId: string;
};

const prismaImportProcessStore: ImportProcessStore = {
  async findByUploadId(uploadId) {
    const row = await delegate().findUnique({ where: { uploadId } });
    return row ? mapRow(row) : null;
  },
  async get(id) {
    const row = await delegate().findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  },
  async listProtectedUploadIds() {
    const rows = await delegate().findMany({
      select: { uploadId: true },
      where: { status: { in: ["queued", "running"] } },
    });
    return rows.map((row) => row.uploadId);
  },
  async save(record) {
    const data = {
      attempt: record.attempt,
      companyId: record.companyId,
      durationMs: record.durationMs,
      entryCount: record.entryCount,
      errorCode: record.errorCode,
      finishedAt: record.finishedAt ? new Date(record.finishedAt) : null,
      heartbeatAt: record.heartbeatAt ? new Date(record.heartbeatAt) : null,
      id: record.id,
      oversizedImages: record.oversizedImages,
      peakMemoryBytes: record.peakMemoryBytes === null ? null : BigInt(record.peakMemoryBytes),
      phase: record.phase,
      progressPercent: record.progressPercent,
      queuedAt: new Date(record.queuedAt),
      rowCount: record.rowCount,
      sheetCount: record.sheetCount,
      sheetNames: record.sheetNames.length ? encodeSheetNames(record.sheetNames) : null,
      startedAt: record.startedAt ? new Date(record.startedAt) : null,
      status: record.status,
      uncompressedBytes: record.uncompressedBytes === null ? null : BigInt(record.uncompressedBytes),
      uploadId: record.uploadId,
      userId: record.userId,
    };
    await delegate().upsert({ create: data, update: data, where: { id: record.id } });
  },
};

function delegate() {
  return (prisma as unknown as {
    productImportProcess: {
      findMany(args: unknown): Promise<Array<{ uploadId: string }>>;
      findUnique(args: unknown): Promise<ProcessRow | null>;
      upsert(args: unknown): Promise<ProcessRow>;
    };
  }).productImportProcess;
}

function mapRow(row: ProcessRow): ImportProcessRecord {
  return {
    attempt: row.attempt,
    companyId: row.companyId,
    durationMs: row.durationMs,
    entryCount: row.entryCount,
    errorCode: row.errorCode,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    id: row.id,
    oversizedImages: row.oversizedImages,
    peakMemoryBytes: row.peakMemoryBytes === null ? null : Number(row.peakMemoryBytes),
    phase: row.phase,
    progressPercent: row.progressPercent,
    queuedAt: row.queuedAt.toISOString(),
    rowCount: row.rowCount,
    sheetCount: row.sheetCount,
    sheetNames: decodeSheetNames(row.sheetNames),
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status as ImportProcessStatus,
    uncompressedBytes: row.uncompressedBytes === null ? null : Number(row.uncompressedBytes),
    uploadId: row.uploadId,
    userId: row.userId,
  };
}

export type { ImportProcessSheet };
