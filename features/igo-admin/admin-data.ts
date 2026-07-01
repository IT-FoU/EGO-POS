import { prisma } from "@/lib/db/prisma";
import { isDemoFallbackEnabled } from "@/lib/demo-mode";
import { getPlatformAuditActionScope, getStoreActivityLogScope } from "@/features/permissions";
import { PLATFORM_ROLES, normalizePlatformPermissionRole } from "@/features/permissions/platform-permissions";

const db = prisma as any;

const demoBusiness = {
  branches: [{ name: "GO BOX Main Branch" }],
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  id: "demo-business",
  name: "GO BOX",
  owner: {
    email: "????????????",
    fullName: "GO BOX Owner",
    id: "demo-owner",
    phone: "",
    username: "owner",
  },
  plan: { planName: "Free" },
  status: "active",
};

const demoUser = {
  companies: [{ company: { id: "demo-business", name: "GO BOX" } }],
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  email: "????????????",
  fullName: "GO BOX Owner",
  id: "demo-owner",
  status: "active",
  username: "owner",
};

function demoDashboardSnapshot() {
  return {
    activeBusinesses: 1,
    newRegistrations: 1,
    suspendedBusinesses: 0,
    totalBusinesses: 1,
    totalUsers: 1,
  };
}

function shouldUseDemoAdminFallback(error: unknown) {
  if (!isDemoFallbackEnabled()) {
    return false;
  }

  if (process.env.NODE_ENV !== "production") {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[igo-admin-data] demo fallback", message);
  }

  return true;
}

export async function getAdminDashboardSnapshot() {
  try {
    const [totalBusinesses, totalUsers, activeBusinesses, suspendedBusinesses, newRegistrations] =
      await Promise.all([
        db.company.count(),
        db.user.count(),
        db.company.count({ where: { status: "active" } }),
        db.company.count({ where: { status: "suspended" } }),
        db.company.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

    return {
      activeBusinesses,
      newRegistrations,
      suspendedBusinesses,
      totalBusinesses,
      totalUsers,
    };
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return demoDashboardSnapshot();
    }
    throw error;
  }
}

export async function getAdminBusinesses(role?: string | null) {
  try {
    const normalizedRole = normalizePlatformPermissionRole(role);
    if (normalizedRole === PLATFORM_ROLES.TEMPLATE_MANAGER) {
      return [];
    }
    if (normalizedRole === PLATFORM_ROLES.BILLING_ADMIN) {
      return await db.company.findMany({
        select: {
          id: true,
          name: true,
          plan: {
            select: { monthlyPrice: true, planName: true },
          },
          status: true,
          subscriptions: {
            orderBy: { startDate: "desc" },
            select: { status: true },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    }
    return await db.company.findMany({
      include: {
        _count: {
          select: {
            branches: true,
            members: true,
          },
        },
        branches: {
          orderBy: [{ isMainBranch: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
        owner: {
          select: { email: true, fullName: true, id: true, phone: true, username: true },
        },
        plan: {
          select: { monthlyPrice: true, planName: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return [demoBusiness];
    }
    throw error;
  }
}

export async function getAdminUsers() {
  try {
    return await db.user.findMany({
      include: {
        companies: {
          include: {
            company: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return [demoUser];
    }
    throw error;
  }
}

export async function getAdminAuditLogs() {
  try {
    return await db.auditLog.findMany({
      include: {
        company: {
          select: { name: true },
        },
        user: {
          select: { fullName: true, username: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return [];
    }
    throw error;
  }
}

function platformAuditWhereForRole(role?: string | null) {
  const scope = getPlatformAuditActionScope(role);
  if (scope.type === "all") return {};
  if (scope.type === "none") return null;
  return {
    OR: scope.allowedPrefixes.map((prefix) =>
      prefix.endsWith(".") ? { action: { startsWith: prefix } } : { action: prefix },
    ),
  };
}

export async function getAdminPlatformAuditLogs(role?: string | null) {
  try {
    const where = platformAuditWhereForRole(role);
    if (!where) return [];
    return await db.platformAuditLog.findMany({
      include: {
        business: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      where,
    });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return [];
    }
    throw error;
  }
}

export async function getAdminStoreActivityLogs(role?: string | null) {
  try {
    const scope = getStoreActivityLogScope(role);
    if (scope.type !== "all") {
      return [];
    }
    return await db.storeActivityLog.findMany({
      include: {
        branch: {
          select: { id: true, name: true },
        },
        business: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return [];
    }
    throw error;
  }
}

export async function getAdminPlans() {
  try {
    return await db.plan.findMany({
      orderBy: { monthlyPrice: "asc" },
      select: {
        customLogo: true,
        id: true,
        isActive: true,
        maxBranches: true,
        maxCashiers: true,
        maxProducts: true,
        maxPromotions: true,
        maxReports: true,
        monthlyPrice: true,
        planName: true,
        removeWatermark: true,
        yearlyPrice: true,
      },
    });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return [];
    }
    throw error;
  }
}

export async function getAdminSubscriptions() {
  try {
    return await db.saaSSubscription.findMany({
      include: {
        company: {
          select: { id: true, name: true, status: true },
        },
        plan: {
          select: { monthlyPrice: true, planName: true },
        },
      },
      orderBy: { startDate: "desc" },
      take: 50,
    });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return [];
    }
    throw error;
  }
}

export async function getAdminPlatformUsersCount() {
  try {
    return await db.superAdmin.count({ where: { status: "active" } });
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return 0;
    }
    throw error;
  }
}
