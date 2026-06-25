import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

const DEMO_LOGIN_USER_IDS: Record<string, string> = {
  "demo-cashier-login": "cashier",
  "demo-manager-login": "manager",
  "demo-owner": "igo-admin",
  "demo-owner-login": "igo-admin",
};

export type TenantMembership = {
  effectiveUserId: string;
  isOwner: boolean;
};

export async function resolveTenantMembership(
  tenant: TenantContext,
  client: any = prisma,
): Promise<TenantMembership> {
  let effectiveUserId = tenant.userId;

  let membership = await client.companyUser.findFirst({
    select: { isOwner: true },
    where: {
      companyId: tenant.companyId,
      status: "active",
      userId: effectiveUserId,
    },
  });

  if (!membership) {
    const demoUsername = DEMO_LOGIN_USER_IDS[effectiveUserId];
    if (demoUsername) {
      const user = await client.user.findFirst({
        select: { id: true },
        where: { username: demoUsername },
      });
      if (user) {
        effectiveUserId = user.id;
        membership = await client.companyUser.findFirst({
          select: { isOwner: true },
          where: {
            companyId: tenant.companyId,
            status: "active",
            userId: effectiveUserId,
          },
        });
      }
    }
  }

  if (!membership) {
    throw new Error("User is not assigned to the active company.");
  }

  return {
    effectiveUserId,
    isOwner: Boolean(membership.isOwner),
  };
}
