import { mapPrismaPosCustomer } from "@/features/pos/dto-mapper";
import {
  clampMemberSearchLimit,
  memberSearchPhoneDigits,
  normalizeMemberSearchQuery,
} from "@/features/pos/member-search-query";
import { assertPosActionAllowed, buildPosPolicyForTenant } from "@/features/pos/pos-permission-guard";
import type { PosCustomer } from "@/features/pos/types";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

const memberSearchInclude = {
  membershipLevel: true,
  subscriptions: {
    orderBy: { endDate: "desc" as const },
    take: 1,
    where: { status: "active" },
  },
};

export type MemberSearchPage = {
  limit: number;
  query: string;
  results: PosCustomer[];
};

/**
 * Authoritative POS Member Search.
 * Scoped by company + branchOwnedWhere (Owner: company-wide; others: assigned branch).
 * Requires create_sale (POS sale path) — Cashiers already load POS with members historically.
 */
export async function searchPrismaMembers(
  tenant: TenantContext,
  input: { limit?: number; search?: string | null } = {},
): Promise<MemberSearchPage> {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "create_sale");

  const scope = await resolveTenantScope(tenant);
  const query = normalizeMemberSearchQuery(input.search);
  const limit = clampMemberSearchLimit(input.limit);

  if (!query) {
    return { limit, query: "", results: [] };
  }

  const digits = memberSearchPhoneDigits(query);
  const or: Array<Record<string, unknown>> = [
    { fullName: { contains: query, mode: "insensitive" } },
    { phone: { contains: query, mode: "insensitive" } },
    { customerCode: { contains: query, mode: "insensitive" } },
    { qrMemberCode: { contains: query, mode: "insensitive" } },
    { email: { contains: query, mode: "insensitive" } },
  ];
  // Additive phone-digit match — does not replace the raw query for other fields.
  if (digits.length >= 3 && digits !== query) {
    or.push({ phone: { contains: digits } });
  }

  const rows = await db.customer.findMany({
    include: memberSearchInclude,
    orderBy: [{ fullName: "asc" }, { id: "asc" }],
    take: limit,
    where: {
      companyId: tenant.companyId,
      status: "active",
      ...branchOwnedWhere(scope),
      OR: or,
    },
  });

  return {
    limit,
    query,
    results: rows.map(mapPrismaPosCustomer),
  };
}

/** Optional single-member refresh (Hold/Resume / select verification). */
export async function getPrismaPosMemberById(
  tenant: TenantContext,
  customerId: string,
): Promise<PosCustomer | null> {
  const policy = await buildPosPolicyForTenant(tenant);
  assertPosActionAllowed(policy, "create_sale");

  const scope = await resolveTenantScope(tenant);
  const id = String(customerId ?? "").trim();
  if (!id) return null;

  const row = await db.customer.findFirst({
    include: memberSearchInclude,
    where: {
      companyId: tenant.companyId,
      id,
      status: "active",
      ...branchOwnedWhere(scope),
    },
  });

  return row ? mapPrismaPosCustomer(row) : null;
}
