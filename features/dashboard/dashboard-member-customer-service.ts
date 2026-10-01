import {
  buildCustomerInsightSummary,
  buildMembershipInsightSummary,
  customerInsightTrailingDays,
  type CustomerInsightSummary,
  type MembershipInsightSummary,
} from "@/features/dashboard/dashboard-member-customer-analytics";
import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";

export type InsightDataStatus = {
  hasError: boolean;
  message?: string;
};

export type DashboardMemberCustomerSnapshot = {
  customer: CustomerInsightSummary;
  customerDataStatus: InsightDataStatus;
  membership: MembershipInsightSummary;
  membershipDataStatus: InsightDataStatus;
  scope: {
    customerBehaviorBranchId: string;
    identityScope: "company";
  };
};

function emptyMembershipSummary(): MembershipInsightSummary {
  return {
    activePaidMembers: 0,
    age18AndUnder: 0,
    age19Plus: 0,
    expiringMembers: [],
    expiringSoon: 0,
    membershipRevenueLak: null,
    membershipRevenueStatus: "deferred",
    newPaidMembersToday: null,
    newPaidMembersTodayStatus: "deferred",
    unknownAge: 0,
  };
}

function emptyCustomerSummary(): CustomerInsightSummary {
  return {
    frequentCount: 0,
    frequentCustomers: [],
    highValueCount: 0,
    highValueCustomers: [],
    newCustomersToday: 0,
    totalCustomers: 0,
  };
}

async function loadMembershipInsights(tenant: TenantContext, client: any, now: Date) {
  const subscriptions = await client.customerSubscription.findMany({
    orderBy: [{ endDate: "desc" }, { id: "asc" }],
    select: {
      customer: {
        select: {
          birthday: true,
          companyId: true,
          fullName: true,
          id: true,
          status: true,
        },
      },
      endDate: true,
      id: true,
      plan: {
        select: {
          name: true,
          subscriptionType: true,
        },
      },
      startDate: true,
      status: true,
    },
    where: {
      customer: {
        companyId: tenant.companyId,
        status: "active",
      },
      status: "active",
    },
  });
  return buildMembershipInsightSummary(subscriptions, now);
}

async function loadCustomerInsights(tenant: TenantContext, branchId: string, client: any, now: Date) {
  const trailingStart = new Date(now.getTime() - customerInsightTrailingDays * 86_400_000);
  const [customers, sales] = await Promise.all([
    client.customer.findMany({
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      select: {
        createdAt: true,
        fullName: true,
        id: true,
        status: true,
      },
      where: {
        companyId: tenant.companyId,
        status: { in: ["active", "inactive"] },
      },
    }),
    client.sale.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      select: {
        createdAt: true,
        customerId: true,
        id: true,
        refunds: {
          select: {
            kind: true,
            paymentAmount: true,
            refundAmount: true,
            totalAmount: true,
          },
        },
        saleStatus: true,
        totalAmount: true,
      },
      where: {
        branchId,
        companyId: tenant.companyId,
        createdAt: { gte: trailingStart, lte: now },
        customerId: { not: null },
        saleStatus: { in: [...REPORT_SALE_STATUSES] },
      },
    }),
  ]);
  return buildCustomerInsightSummary(customers, sales, now);
}

export async function getPrismaDashboardMemberCustomerSnapshot(
  tenant: TenantContext,
  client: any = prisma,
  now = new Date(),
): Promise<DashboardMemberCustomerSnapshot> {
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView, client);
  const scope = await resolveTenantScope(tenant, client);
  const [membershipResult, customerResult] = await Promise.allSettled([
    loadMembershipInsights(tenant, client, now),
    loadCustomerInsights(tenant, scope.branchId, client, now),
  ]);

  return {
    customer: customerResult.status === "fulfilled" ? customerResult.value : emptyCustomerSummary(),
    customerDataStatus: {
      hasError: customerResult.status === "rejected",
      message: customerResult.status === "rejected" ? "Customer insights could not be loaded." : undefined,
    },
    membership: membershipResult.status === "fulfilled" ? membershipResult.value : emptyMembershipSummary(),
    membershipDataStatus: {
      hasError: membershipResult.status === "rejected",
      message: membershipResult.status === "rejected" ? "Membership insights could not be loaded." : undefined,
    },
    scope: {
      customerBehaviorBranchId: scope.branchId,
      identityScope: "company",
    },
  };
}

export async function getMiniMartDashboardMemberCustomerSnapshot() {
  const { requireSession } = await import("@/lib/auth/session");
  const session = await requireSession();
  return getPrismaDashboardMemberCustomerSnapshot(tenantFromSession(session));
}
