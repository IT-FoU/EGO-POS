import type { LargeImportJob, LargeImportStatus } from "@/features/products/product-import-large";
import { prisma } from "@/lib/db/prisma";

export type LargeImportStore = {
  findByIdempotency(companyId: string, userId: string, idempotencyKey: string): Promise<LargeImportJob | null>;
  get(id: string): Promise<LargeImportJob | null>;
  listExpired(now: Date, limit: number): Promise<LargeImportJob[]>;
  save(job: LargeImportJob): Promise<void>;
};

let storeOverride: LargeImportStore | null = null;

export function setLargeImportStoreForTests(store: LargeImportStore | null) {
  storeOverride = store;
}

export function getLargeImportStore() {
  return storeOverride ?? prismaLargeImportStore;
}

export function createMemoryLargeImportStore(): LargeImportStore {
  const jobs = new Map<string, LargeImportJob>();
  return {
    async findByIdempotency(companyId, userId, idempotencyKey) {
      return [...jobs.values()].find((job) => job.companyId === companyId && job.userId === userId && job.idempotencyKey === idempotencyKey) ?? null;
    },
    async get(id) {
      return jobs.get(id) ?? null;
    },
    async listExpired(now, limit) {
      return [...jobs.values()]
        .filter((job) => job.status !== "cancelled" && job.status !== "expired" && Date.parse(job.expiresAt) <= now.getTime())
        .slice(0, limit);
    },
    async save(job) {
      jobs.set(job.id, job);
    },
  };
}

type UploadRow = {
  byteSize: number;
  companyId: string;
  createdAt: Date;
  expiresAt: Date;
  fileName: string;
  id: string;
  idempotencyKey: string;
  objectPath: string;
  status: string;
  userId: string;
  verifiedAt: Date | null;
};

const prismaLargeImportStore: LargeImportStore = {
  async findByIdempotency(companyId, userId, idempotencyKey) {
    const row = await delegate().findUnique({
      where: { companyId_userId_idempotencyKey: { companyId, userId, idempotencyKey } },
    });
    return row ? mapRow(row) : null;
  },
  async get(id) {
    const row = await delegate().findUnique({ where: { id } });
    return row ? mapRow(row) : null;
  },
  async listExpired(now, limit) {
    const rows = await delegate().findMany({
      where: { expiresAt: { lte: now }, status: { in: ["uploading", "uploaded", "failed"] } },
      orderBy: { expiresAt: "asc" },
      take: limit,
    });
    return rows.map(mapRow);
  },
  async save(job) {
    const data = {
      byteSize: job.byteSize,
      companyId: job.companyId,
      createdAt: new Date(job.createdAt),
      expiresAt: new Date(job.expiresAt),
      fileName: job.fileName,
      id: job.id,
      idempotencyKey: job.idempotencyKey,
      objectPath: job.objectPath,
      status: job.status,
      userId: job.userId,
      verifiedAt: job.verifiedAt ? new Date(job.verifiedAt) : null,
    };
    await delegate().upsert({ create: data, update: data, where: { id: job.id } });
  },
};

function delegate() {
  return (prisma as unknown as {
    productImportUpload: {
      findMany(args: unknown): Promise<UploadRow[]>;
      findUnique(args: unknown): Promise<UploadRow | null>;
      upsert(args: unknown): Promise<UploadRow>;
    };
  }).productImportUpload;
}

function mapRow(row: UploadRow): LargeImportJob {
  return {
    byteSize: row.byteSize,
    companyId: row.companyId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    fileName: row.fileName,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    objectPath: row.objectPath,
    status: row.status as LargeImportStatus,
    userId: row.userId,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
  };
}
