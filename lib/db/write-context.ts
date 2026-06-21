import type { Session } from "next-auth";
import { prisma } from "@/lib/db/prisma";
import { isDemoMode } from "@/lib/demo-mode";

export type TenantContext = {
  companyId: string;
  branchId?: string;
  warehouseId?: string;
  userId: string;
};

export type WriteResult<T = unknown> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export class DemoModeWriteError extends Error {
  constructor() {
    super("Production writes are disabled while IGO_DEMO_MODE=true.");
    this.name = "DemoModeWriteError";
  }
}

export function tenantFromSession(session: Session): TenantContext {
  const companyId = session.user.activeCompanyId;
  const userId = session.user.id;

  if (!companyId || !userId) {
    throw new Error("Active company and user are required for production writes.");
  }

  return {
    branchId: session.user.activeBranchId,
    companyId,
    warehouseId: session.user.activeWarehouseId,
    userId,
  };
}

export function assertProductionWritesEnabled() {
  if (isDemoMode()) {
    throw new DemoModeWriteError();
  }
}

export async function withTenantTransaction<T>({
  action,
  module,
  newData,
  oldData,
  tenant,
  write,
}: {
  action: string;
  module: string;
  newData?: unknown;
  oldData?: unknown;
  tenant: TenantContext;
  write: (tx: any) => Promise<T>;
}) {
  assertProductionWritesEnabled();

  return prisma.$transaction(
    async (tx: any) => {
      const result = await write(tx);

      await tx.auditLog.create({
        data: {
          action,
          companyId: tenant.companyId,
          module,
          newData: newData === undefined ? undefined : JSON.parse(JSON.stringify(newData)),
          oldData: oldData === undefined ? undefined : JSON.parse(JSON.stringify(oldData)),
          userId: tenant.userId,
        },
      });

      return result;
    },
    { timeout: 30000 },
  );
}

export function writeFailure(error: unknown): WriteResult<never> {
  const message = error instanceof Error ? error.message : "Unknown write error";
  return { error: message, ok: false };
}

export function writeSuccess<T>(data: T): WriteResult<T> {
  return { data, ok: true };
}

export function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function optionalString(value: unknown) {
  const parsed = stringValue(value);
  return parsed.length > 0 ? parsed : undefined;
}
