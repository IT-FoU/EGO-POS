import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, stringValue, withTenantTransaction } from "@/lib/db/write-context";
import {
  parseMembershipLevelCreateInput,
  parseMembershipLevelUpdateInput,
  type MembershipLevelCreateInput,
  type MembershipLevelWriteInput,
} from "@/features/membership-levels/dto";
import type { MembershipLevelRecord } from "@/features/membership-levels/types";

const db = prisma as any;

type Row = Record<string, any>;

function mapMembershipLevel(row: Row): MembershipLevelRecord {
  return {
    customerCount: Number(row._count?.customers ?? 0),
    discountPercent: Number(row.discountPercent ?? 0),
    id: row.id,
    isActive: Boolean(row.isActive),
    minSpendLak: Number(row.minSpendLak ?? 0),
    name: row.name,
    promotionCount: Number(row._count?.promotionMembershipLevels ?? 0),
  };
}

export async function getPrismaMembershipLevels(tenant: TenantContext) {
  const levels = await db.membershipLevel.findMany({
    include: {
      _count: {
        select: {
          customers: true,
          promotionMembershipLevels: true,
        },
      },
    },
    orderBy: [{ isActive: "desc" }, { minSpendLak: "asc" }, { name: "asc" }],
    where: { companyId: tenant.companyId },
  });

  return levels.map(mapMembershipLevel);
}

export async function createPrismaMembershipLevel(input: MembershipLevelCreateInput, tenant: TenantContext) {
  const data = parseMembershipLevelCreateInput(input);

  return withTenantTransaction({
    action: "create",
    module: "membership_levels",
    newData: data,
    tenant,
    write: async (tx) => {
      const level = await tx.membershipLevel.create({
        data: {
          companyId: tenant.companyId,
          discountPercent: numberValue(data.discountPercent),
          isActive: data.isActive ?? true,
          minSpendLak: numberValue(data.minSpendLak),
          name: stringValue(data.name),
        },
        include: { _count: { select: { customers: true, promotionMembershipLevels: true } } },
      });

      return mapMembershipLevel(level);
    },
  });
}

export async function updatePrismaMembershipLevel(
  membershipLevelId: string,
  input: MembershipLevelWriteInput,
  tenant: TenantContext,
) {
  const data = parseMembershipLevelUpdateInput(input);

  return withTenantTransaction({
    action: "update",
    module: "membership_levels",
    newData: { membershipLevelId, ...data },
    tenant,
    write: async (tx) => {
      const existing = await tx.membershipLevel.findFirstOrThrow({
        where: { companyId: tenant.companyId, id: membershipLevelId },
      });
      const level = await tx.membershipLevel.update({
        data: {
          discountPercent: data.discountPercent === undefined ? undefined : numberValue(data.discountPercent),
          isActive: data.isActive,
          minSpendLak: data.minSpendLak === undefined ? undefined : numberValue(data.minSpendLak),
          name: data.name === undefined ? undefined : stringValue(data.name),
        },
        include: { _count: { select: { customers: true, promotionMembershipLevels: true } } },
        where: { id: existing.id },
      });

      return mapMembershipLevel(level);
    },
  });
}

export async function archivePrismaMembershipLevel(membershipLevelId: string, tenant: TenantContext) {
  return updatePrismaMembershipLevel(membershipLevelId, { isActive: false }, tenant);
}

export async function deletePrismaMembershipLevel(membershipLevelId: string, tenant: TenantContext) {
  return withTenantTransaction({
    action: "delete",
    module: "membership_levels",
    oldData: { membershipLevelId },
    tenant,
    write: async (tx) => {
      const existing = await tx.membershipLevel.findFirstOrThrow({
        include: { _count: { select: { customers: true, promotionMembershipLevels: true } } },
        where: { companyId: tenant.companyId, id: membershipLevelId },
      });
      const referenceCount = Number(existing._count.customers ?? 0) +
        Number(existing._count.promotionMembershipLevels ?? 0);

      if (referenceCount > 0) {
        const archived = await tx.membershipLevel.update({
          data: { isActive: false },
          include: { _count: { select: { customers: true, promotionMembershipLevels: true } } },
          where: { id: existing.id },
        });
        return mapMembershipLevel(archived);
      }

      const deleted = await tx.membershipLevel.delete({
        include: { _count: { select: { customers: true, promotionMembershipLevels: true } } },
        where: { id: existing.id },
      });
      return mapMembershipLevel(deleted);
    },
  });
}
