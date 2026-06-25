import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantMembership } from "@/lib/db/resolve-tenant-user";

const db = prisma as any;

export type BranchScope = TenantContext & {
  branchId: string;
  branchIds: string[];
  branchName: string;
  isOwner: boolean;
  warehouseId?: string;
  warehouseIds: string[];
};

export async function resolveTenantScope(tenant: TenantContext, client: any = db): Promise<BranchScope> {
  const { effectiveUserId, isOwner } = await resolveTenantMembership(tenant, client);
  const scopedTenant: TenantContext = { ...tenant, userId: effectiveUserId };

  const branch = scopedTenant.branchId
    ? await client.branch.findFirst({
        where: { companyId: scopedTenant.companyId, id: scopedTenant.branchId },
      })
    : await client.branch.findFirst({
        orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
        where: { companyId: scopedTenant.companyId },
      });

  if (!branch) {
    throw new Error("Active branch was not found for this user.");
  }

  const branchIds = isOwner
    ? (await client.branch.findMany({
        select: { id: true },
        where: { companyId: scopedTenant.companyId },
      })).map((row: Record<string, any>) => row.id)
    : [branch.id];

  const warehouses = await client.warehouse.findMany({
    orderBy: { createdAt: "asc" },
    where: { branchId: { in: branchIds }, companyId: scopedTenant.companyId },
  });
  const warehouseIds = warehouses.map((warehouse: Record<string, any>) => warehouse.id);

  if (scopedTenant.warehouseId && !warehouseIds.includes(scopedTenant.warehouseId)) {
    throw new Error("Active warehouse is outside the assigned branch.");
  }

  return {
    ...scopedTenant,
    branchId: branch.id,
    branchIds,
    branchName: branch.name,
    isOwner,
    warehouseId: scopedTenant.warehouseId ?? warehouseIds[0],
    warehouseIds,
  };
}

export function branchOwnedWhere(scope: BranchScope) {
  return scope.isOwner ? {} : { branchId: scope.branchId };
}

export async function assertBranchInScope(client: any, tenant: TenantContext, branchId: string) {
  const scope = await resolveTenantScope(tenant, client);

  if (!scope.isOwner && scope.branchId !== branchId) {
    throw new Error("Branch is outside the user's assigned branch.");
  }

  return scope;
}

export async function assertWarehouseInScope(client: any, tenant: TenantContext, warehouseId: string) {
  const scope = await resolveTenantScope(tenant, client);

  if (!scope.warehouseIds.includes(warehouseId)) {
    throw new Error("Warehouse is outside the user's assigned branch.");
  }

  return scope;
}
