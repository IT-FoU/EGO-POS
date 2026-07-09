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
          select: {
            address: true,
            createdAt: true,
            id: true,
            isMainBranch: true,
            name: true,
            phone: true,
            updatedAt: true,
          },
        },
        members: {
          orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
          select: {
            allowBackOfficeAccess: true,
            allowPosAccess: true,
            branchId: true,
            createdAt: true,
            id: true,
            isOwner: true,
            status: true,
            user: {
              select: { email: true, fullName: true, id: true, phone: true, username: true },
            },
          },
          take: 5,
        },
        owner: {
          select: { email: true, fullName: true, id: true, phone: true, username: true },
        },
        plan: {
          select: { monthlyPrice: true, planName: true },
        },
        settings: {
          select: {
            baseCurrency: true,
            currencyDisplay: true,
            profileAddress: true,
            profileEmail: true,
            profilePhone: true,
          },
        },
        subscriptions: {
          orderBy: { startDate: "desc" },
          select: {
            endDate: true,
            id: true,
            plan: { select: { planName: true } },
            startDate: true,
            status: true,
          },
          take: 1,
        },
        warehouses: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            branchId: true,
            id: true,
            name: true,
            type: true,
          },
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

type PlatformSalesRange = {
  from: Date;
  to: Date;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function getAdminCommandDashboardData() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysStart = addDays(todayStart, -29);
  const range: PlatformSalesRange = {
    from: monthStart < thirtyDaysStart ? monthStart : thirtyDaysStart,
    to: tomorrowStart,
  };

  try {
    const sales = await db.sale.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        companyId: true,
        createdAt: true,
        id: true,
        saleStatus: true,
        totalAmount: true,
      },
      where: {
        createdAt: { gte: range.from, lt: range.to },
        saleStatus: "completed",
      },
    });

    const byBusiness = new Map<string, { billCount: number; salesLak: number; todayBillCount: number; todaySalesLak: number }>();
    const byDay = new Map<string, { billCount: number; salesLak: number }>();

    for (const sale of sales) {
      const createdAt = new Date(sale.createdAt);
      const saleAmount = amount(sale.totalAmount);
      const business = byBusiness.get(sale.companyId) ?? { billCount: 0, salesLak: 0, todayBillCount: 0, todaySalesLak: 0 };
      business.billCount += 1;
      business.salesLak += saleAmount;
      if (createdAt >= todayStart && createdAt < tomorrowStart) {
        business.todayBillCount += 1;
        business.todaySalesLak += saleAmount;
      }
      byBusiness.set(sale.companyId, business);

      const key = dayKey(createdAt);
      const day = byDay.get(key) ?? { billCount: 0, salesLak: 0 };
      day.billCount += 1;
      day.salesLak += saleAmount;
      byDay.set(key, day);
    }

    return {
      generatedAt: now.toISOString(),
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      salesByBusiness: Array.from(byBusiness.entries()).map(([businessId, metrics]) => ({ businessId, ...metrics })),
      salesByDay: Array.from(byDay.entries()).map(([date, metrics]) => ({ date, ...metrics })),
      status: "connected" as const,
    };
  } catch (error) {
    if (shouldUseDemoAdminFallback(error)) {
      return {
        generatedAt: now.toISOString(),
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        salesByBusiness: [],
        salesByDay: [],
        status: "unavailable" as const,
      };
    }
    throw error;
  }
}
