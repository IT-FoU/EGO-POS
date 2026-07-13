import { prisma } from "@/lib/db/prisma";
import {
  DEFAULT_BUSINESS_TEMPLATE_KEY,
  getTemplateAwareEntryPath,
  STORE_POST_LOGIN_REASON,
  type StorePostLoginRedirect,
} from "@/lib/auth/store-post-login-redirect";

export type StoreMembershipSummary = {
  allowBackOfficeAccess: boolean;
  allowPOSAccess: boolean;
  branchId: string | null;
  businessTemplateKey: string;
  companyId: string;
  companyName: string;
  isOwner: boolean;
  roleNames: string[];
  storeCode: string;
};

export type StoreMembershipResolution = {
  memberships: StoreMembershipSummary[];
  resolvedUserId: string | null;
  source: "session_user_id" | "session_identity";
};

function resolveRoleNames(
  isOwner: boolean,
  companyId: string,
  roles: Array<{ companyId: string | null; role: { name: string } }>,
) {
  if (isOwner) {
    return ["Owner"];
  }

  return roles.filter((entry) => entry.companyId === companyId).map((entry) => entry.role.name);
}

export async function getStoreMembershipsForUser(userId: string): Promise<StoreMembershipSummary[]> {
  const memberships = await prisma.companyUser.findMany({
    include: {
      company: {
        select: {
          businessTemplateKey: true,
          id: true,
          name: true,
          storeCode: true,
        },
      },
      user: {
        include: {
          roles: {
            include: { role: true },
          },
        },
      },
    },
    orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
    where: {
      status: "active",
      user: { status: "active" },
      userId,
    },
  });

  return memberships
    .filter((membership) => membership.company)
    .map((membership) => ({
      allowBackOfficeAccess: membership.allowBackOfficeAccess,
      allowPOSAccess: membership.allowPosAccess,
      branchId: membership.branchId,
      businessTemplateKey: membership.company.businessTemplateKey || DEFAULT_BUSINESS_TEMPLATE_KEY,
      companyId: membership.company.id,
      companyName: membership.company.name,
      isOwner: membership.isOwner,
      roleNames: resolveRoleNames(membership.isOwner, membership.company.id, membership.user.roles),
      storeCode: membership.company.storeCode,
    }));
}

export async function getStoreMembershipsForSessionIdentity({
  email,
  userId,
  username,
}: {
  email?: string | null;
  userId?: string | null;
  username?: string | null;
}): Promise<StoreMembershipResolution> {
  if (userId) {
    const memberships = await getStoreMembershipsForUser(userId);
    if (memberships.length > 0) {
      return { memberships, resolvedUserId: userId, source: "session_user_id" };
    }
  }

  const trimmedUsername = username?.trim();
  const trimmedEmail = email?.trim().toLowerCase();
  const identityFilters = [
    trimmedUsername ? { username: trimmedUsername } : null,
    trimmedUsername ? { username: trimmedUsername.toLowerCase() } : null,
    trimmedEmail ? { email: trimmedEmail } : null,
  ].filter((filter): filter is { email: string } | { username: string } => Boolean(filter));

  if (identityFilters.length === 0) {
    return { memberships: [], resolvedUserId: userId ?? null, source: "session_user_id" };
  }

  const user = await prisma.user.findFirst({
    select: { id: true },
    where: {
      OR: identityFilters,
      status: "active",
    },
  });

  if (!user) {
    return { memberships: [], resolvedUserId: userId ?? null, source: "session_user_id" };
  }

  return {
    memberships: await getStoreMembershipsForUser(user.id),
    resolvedUserId: user.id,
    source: "session_identity",
  };
}

export function resolveStorePostLoginRedirect(
  memberships: StoreMembershipSummary[],
  preferredCompanyId?: string | null,
): StorePostLoginRedirect {
  if (memberships.length === 0) {
    return {
      businessTemplateKey: DEFAULT_BUSINESS_TEMPLATE_KEY,
      reason: STORE_POST_LOGIN_REASON.noCompany,
      redirectTo: "/businesses?status=no_assignment",
    };
  }

  const activeMembership =
    (preferredCompanyId
      ? memberships.find((membership) => membership.companyId === preferredCompanyId)
      : null) ?? memberships[0];

  if (!activeMembership) {
    return {
      businessTemplateKey: DEFAULT_BUSINESS_TEMPLATE_KEY,
      reason: STORE_POST_LOGIN_REASON.noCompany,
      redirectTo: "/businesses?status=no_assignment",
    };
  }

  if (!preferredCompanyId && memberships.length > 1) {
    return {
      businessTemplateKey: activeMembership.businessTemplateKey,
      companyId: activeMembership.companyId,
      companyName: activeMembership.companyName,
      reason: STORE_POST_LOGIN_REASON.multiCompany,
      redirectTo: "/businesses",
    };
  }

  return {
    businessTemplateKey: activeMembership.businessTemplateKey,
    companyId: activeMembership.companyId,
    companyName: activeMembership.companyName,
    reason: STORE_POST_LOGIN_REASON.singleCompany,
    redirectTo: getTemplateAwareEntryPath({
      allowBackOfficeAccess: activeMembership.allowBackOfficeAccess,
      allowPOSAccess: activeMembership.allowPOSAccess,
      businessTemplateKey: activeMembership.businessTemplateKey,
      roles: activeMembership.roleNames,
    }),
  };
}

export async function resolveStorePostLoginRedirectForUser(
  userId: string,
  preferredCompanyId?: string | null,
): Promise<StorePostLoginRedirect> {
  const memberships = await getStoreMembershipsForUser(userId);
  return resolveStorePostLoginRedirect(memberships, preferredCompanyId);
}

export async function getMembershipSessionFields(userId: string, companyId: string) {
  const membership = await prisma.companyUser.findFirst({
    include: {
      company: {
        select: {
          businessTemplateKey: true,
          id: true,
          name: true,
        },
      },
      user: {
        include: {
          roles: {
            include: { role: true },
          },
        },
      },
    },
    where: {
      companyId,
      status: "active",
      userId,
    },
  });

  if (!membership?.company) {
    return null;
  }

  const activeBranch = membership.branchId
    ? await prisma.branch.findFirst({
        where: { companyId, id: membership.branchId },
      })
    : await prisma.branch.findFirst({
        orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
        where: { companyId },
      });

  const activeWarehouse = activeBranch
    ? await prisma.warehouse.findFirst({
        orderBy: { createdAt: "asc" },
        where: { branchId: activeBranch.id, companyId },
      })
    : null;

  const roleNames = resolveRoleNames(membership.isOwner, companyId, membership.user.roles);

  return {
    activeBranchId: activeBranch?.id,
    activeCompanyId: membership.company.id,
    activeCompanyName: membership.company.name,
    activeWarehouseId: activeWarehouse?.id,
    allowBackOfficeAccess: membership.allowBackOfficeAccess,
    allowPOSAccess: membership.allowPosAccess,
    assignedTerminal: membership.assignedTerminal ?? "POS-01",
    businessTemplateKey: membership.company.businessTemplateKey || DEFAULT_BUSINESS_TEMPLATE_KEY,
    roles: roleNames,
  };
}
