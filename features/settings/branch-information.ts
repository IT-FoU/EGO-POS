import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

export type ActiveBranchInformation = {
  address: string;
  id: string;
  isMainBranch: boolean;
  name: string;
  phone: string;
};

/**
 * Load the session's active branch only.
 * Never accepts a client-supplied branch id.
 */
export async function getActiveBranchInformation(tenant: TenantContext): Promise<ActiveBranchInformation | null> {
  const branchId = tenant.branchId?.trim();
  if (!branchId) return null;

  const branch = await prisma.branch.findFirst({
    where: { companyId: tenant.companyId, id: branchId },
    select: {
      address: true,
      id: true,
      isMainBranch: true,
      name: true,
      phone: true,
    },
  });
  if (!branch) return null;

  return {
    address: branch.address ?? "",
    id: branch.id,
    isMainBranch: branch.isMainBranch,
    name: branch.name,
    phone: branch.phone ?? "",
  };
}

/**
 * Update only name/phone/address on the session active branch.
 * Client must never supply branchId — it is taken from trusted tenant context.
 */
export async function updateActiveBranchInformation(
  input: { address?: string | null; name: string; phone?: string | null },
  tenant: TenantContext,
): Promise<ActiveBranchInformation> {
  const branchId = tenant.branchId?.trim();
  if (!branchId) {
    throw new Error("Active branch is required.");
  }

  const name = String(input.name ?? "").trim();
  if (!name) {
    throw new Error("Branch name is required.");
  }

  const phone = String(input.phone ?? "").trim() || null;
  const address = String(input.address ?? "").trim() || null;

  const updated = await prisma.branch.updateMany({
    where: { companyId: tenant.companyId, id: branchId },
    data: { address, name, phone },
  });
  if (updated.count !== 1) {
    throw new Error("Active branch was not found for this company.");
  }

  const branch = await getActiveBranchInformation(tenant);
  if (!branch) {
    throw new Error("Active branch was not found after save.");
  }
  return branch;
}
