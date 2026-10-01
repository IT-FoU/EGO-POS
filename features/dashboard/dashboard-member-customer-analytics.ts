import { membershipExpiringDays } from "@/features/notifications/notification-types";
import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import { netReportLifecycle, reportMoney } from "@/features/reports/report-lifecycle";
import {
  businessDayLabel,
  businessInstantParts,
  startOfBusinessDay,
} from "@/lib/datetime/business-timezone";

export const frequentCustomerBillThreshold = 3;
export const highValueCustomerSpendThresholdLak = 500_000;
export const customerInsightTrailingDays = 90;

export type MembershipInsightSubscription = {
  customer: {
    birthday: Date | null;
    companyId: string;
    fullName: string;
    id: string;
    status: string;
  };
  endDate: Date;
  id: string;
  plan: {
    name: string;
    subscriptionType: string;
  };
  startDate: Date;
  status: string;
};

export type MembershipInsightSummary = {
  activePaidMembers: number;
  age18AndUnder: number;
  age19Plus: number;
  expiringMembers: Array<{
    customerId: string;
    customerName: string;
    daysRemaining: number;
    endDate: string;
    planName: string;
  }>;
  expiringSoon: number;
  membershipRevenueLak: null;
  membershipRevenueStatus: "deferred";
  newPaidMembersToday: null;
  newPaidMembersTodayStatus: "deferred";
  unknownAge: number;
};

export type CustomerInsightCustomer = {
  createdAt: Date;
  fullName: string;
  id: string;
  status: string;
};

export type CustomerInsightSale = {
  createdAt: Date;
  customerId: string | null;
  id: string;
  refunds: Array<Record<string, unknown>>;
  saleStatus: string;
  totalAmount: unknown;
};

export type CustomerInsightRow = {
  billCount: number;
  customerId: string;
  customerName: string;
  frequent: boolean;
  highValue: boolean;
  lastPurchase: string;
  netSpendLak: number;
};

export type CustomerInsightSummary = {
  frequentCount: number;
  frequentCustomers: CustomerInsightRow[];
  highValueCount: number;
  highValueCustomers: CustomerInsightRow[];
  newCustomersToday: number;
  totalCustomers: number;
};

const reportStatuses = new Set<string>(REPORT_SALE_STATUSES);

export function membershipPlanIsTimeBased(subscriptionType: unknown) {
  return /month|year|day|week|time/i.test(String(subscriptionType ?? ""));
}

function validCustomerStatus(status: unknown) {
  return status === "active" || status === "inactive";
}

export function membershipAgeOnDate(birthday: Date | null, now = new Date()) {
  if (!birthday || !Number.isFinite(birthday.getTime()) || birthday.getTime() > now.getTime()) return null;
  const born = businessInstantParts(birthday);
  const current = businessInstantParts(now);
  let age = current.year - born.year;
  if (current.month < born.month || (current.month === born.month && current.day < born.day)) age -= 1;
  return age >= 0 ? age : null;
}

export function membershipIsActive(subscription: MembershipInsightSubscription, now = new Date()) {
  const today = startOfBusinessDay(now).getTime();
  return (
    subscription.status === "active" &&
    subscription.customer.status === "active" &&
    membershipPlanIsTimeBased(subscription.plan.subscriptionType) &&
    startOfBusinessDay(subscription.startDate).getTime() <= today &&
    startOfBusinessDay(subscription.endDate).getTime() >= today
  );
}

export function buildMembershipInsightSummary(
  subscriptions: MembershipInsightSubscription[],
  now = new Date(),
): MembershipInsightSummary {
  const activeByCustomer = new Map<string, MembershipInsightSubscription>();
  for (const subscription of subscriptions) {
    if (!membershipIsActive(subscription, now)) continue;
    const current = activeByCustomer.get(subscription.customer.id);
    if (!current || subscription.endDate.getTime() > current.endDate.getTime()) {
      activeByCustomer.set(subscription.customer.id, subscription);
    }
  }

  let age18AndUnder = 0;
  let age19Plus = 0;
  let unknownAge = 0;
  const expiringMembers: MembershipInsightSummary["expiringMembers"] = [];

  for (const subscription of activeByCustomer.values()) {
    const age = membershipAgeOnDate(subscription.customer.birthday, now);
    if (age === null) unknownAge += 1;
    else if (age <= 18) age18AndUnder += 1;
    else age19Plus += 1;

    const daysRemaining = membershipExpiringDays(subscription.endDate, now);
    if (daysRemaining !== null) {
      expiringMembers.push({
        customerId: subscription.customer.id,
        customerName: subscription.customer.fullName,
        daysRemaining,
        endDate: businessDayLabel(subscription.endDate),
        planName: subscription.plan.name,
      });
    }
  }

  expiringMembers.sort(
    (left, right) =>
      left.daysRemaining - right.daysRemaining ||
      left.customerName.localeCompare(right.customerName) ||
      left.customerId.localeCompare(right.customerId),
  );

  return {
    activePaidMembers: activeByCustomer.size,
    age18AndUnder,
    age19Plus,
    expiringMembers: expiringMembers.slice(0, 10),
    expiringSoon: expiringMembers.length,
    membershipRevenueLak: null,
    membershipRevenueStatus: "deferred",
    newPaidMembersToday: null,
    newPaidMembersTodayStatus: "deferred",
    unknownAge,
  };
}

export function buildCustomerInsightSummary(
  customers: CustomerInsightCustomer[],
  sales: CustomerInsightSale[],
  now = new Date(),
): CustomerInsightSummary {
  const validCustomers = new Map(
    customers.filter((customer) => validCustomerStatus(customer.status)).map((customer) => [customer.id, customer]),
  );
  const todayLabel = businessDayLabel(now);
  const byCustomer = new Map<string, CustomerInsightRow>();

  for (const sale of sales) {
    if (!sale.customerId || !reportStatuses.has(sale.saleStatus)) continue;
    const customer = validCustomers.get(sale.customerId);
    if (!customer) continue;
    const lifecycle = netReportLifecycle(sale.refunds as Array<Record<string, any>>, []);
    const current = byCustomer.get(customer.id) ?? {
      billCount: 0,
      customerId: customer.id,
      customerName: customer.fullName,
      frequent: false,
      highValue: false,
      lastPurchase: sale.createdAt.toISOString(),
      netSpendLak: 0,
    };
    current.billCount += 1;
    current.netSpendLak += reportMoney(sale.totalAmount) + lifecycle.revenueLak;
    if (sale.createdAt.getTime() > new Date(current.lastPurchase).getTime()) {
      current.lastPurchase = sale.createdAt.toISOString();
    }
    byCustomer.set(customer.id, current);
  }

  const rows = Array.from(byCustomer.values()).map((row) => ({
    ...row,
    frequent: row.billCount >= frequentCustomerBillThreshold,
    highValue: row.netSpendLak >= highValueCustomerSpendThresholdLak,
  }));
  const frequentCustomers = rows
    .filter((row) => row.frequent)
    .sort(
      (left, right) =>
        right.billCount - left.billCount ||
        right.netSpendLak - left.netSpendLak ||
        left.customerName.localeCompare(right.customerName) ||
        left.customerId.localeCompare(right.customerId),
    );
  const highValueCustomers = rows
    .filter((row) => row.highValue)
    .sort(
      (left, right) =>
        right.netSpendLak - left.netSpendLak ||
        right.billCount - left.billCount ||
        left.customerName.localeCompare(right.customerName) ||
        left.customerId.localeCompare(right.customerId),
    );

  return {
    frequentCount: frequentCustomers.length,
    frequentCustomers: frequentCustomers.slice(0, 5),
    highValueCount: highValueCustomers.length,
    highValueCustomers: highValueCustomers.slice(0, 5),
    newCustomersToday: Array.from(validCustomers.values()).filter(
      (customer) => businessDayLabel(customer.createdAt) === todayLabel,
    ).length,
    totalCustomers: validCustomers.size,
  };
}
