import { computeCashSessionTotalsForShifts } from "@/features/cash-sessions/prisma-repository";
import { readRequireCashShiftBeforeSaleFromJson } from "@/features/products/unit-pricing-defaults";
import {
  loadDashboardCriticalSalesKpis,
  resolveDashboardCriticalContext,
} from "@/features/dashboard/critical-queries";
import {
  buildDashboardPromotionSummary,
  promotionSoonWindow,
  type DashboardPromotionSummary,
} from "@/features/dashboard/dashboard-promotion-analytics";
import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";
import {
  businessDayLabel,
  businessHour,
  businessMonthLabel,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
  startOfBusinessYear,
} from "@/lib/datetime/business-timezone";
import {
  availableStock,
  classifyStockNotification,
  membershipExpiringDays,
  promotionWindowDays,
} from "@/features/notifications/notification-types";

export type DashboardAlertSeverity = "info" | "warning" | "critical";
export type DashboardAlertCode =
  | "low_stock"
  | "near_expiry"
  | "out_of_stock"
  | "membership_expiring"
  | "promotion_starting"
  | "promotion_ending";

export type DashboardAlert = {
  code?: DashboardAlertCode;
  href?: string;
  message: string;
  severity: DashboardAlertSeverity;
  title: string;
  type: string;
  value?: string;
};

export type DashboardSalesPoint = {
  hour?: string;
  label: string;
  salesLak: number;
};

export type TodaySalesPoint = DashboardSalesPoint;

export type TopSellingProduct = {
  name: string;
  quantity: number;
  totalLak: number;
};

export type DashboardLowStockItem = {
  minStock: number;
  name: string;
  quantity: number;
};

export type DashboardRecentSale = {
  createdAt: string;
  paymentMethod: string;
  saleNo: string;
  status: string;
  totalLak: number;
};

export type DashboardCurrencyCode = "LAK" | "THB" | "USD";

export type DashboardCurrencyBreakdown = {
  billCount: number;
  currency: DashboardCurrencyCode;
  paymentMethods: Array<{ method: string; total: number }>;
  total: number;
};

export type DashboardRangeKey = "custom" | "month" | "today" | "week" | "year";
export type DashboardTrendGranularity = "day" | "hour" | "month";

export type DashboardDateRange = {
  end?: Date;
  key: DashboardRangeKey;
  start?: Date;
};

export type DashboardPromotionSlice = {
  dataStatus: DashboardSnapshot["dataStatus"];
  period: DashboardSnapshot["period"];
  summary: DashboardPromotionSummary;
};

export type ShiftSummary = {
  cashierName: string;
  cashierId: string;
  closedAt: string | null;
  countedCashLak: number | null;
  differenceLak: number | null;
  expectedCashLak: number;
  openedAt: string;
  openingCashLak: number;
  status: "open" | "closed";
};

export type DashboardSnapshot = {
  alerts: DashboardAlert[];
  cards: {
    cashDrawerExpectedLak: number;
    cogsLak: number;
    customerCreditDueLak: number;
    discountLak: number;
    expiredProducts: number;
    grossSalesLak: number;
    inventoryValueLak: number;
    itemsSoldToday: number;
    lowStockProducts: number;
    loyaltyRedeemedLak: number;
    netSalesLak: number;
    nearExpiryProducts: number;
    profitTodayLak: number;
    promotionDiscountLak: number;
    refundLak: number;
    salesTodayLak: number;
    supplierPayablesDueLak: number;
    totalBillsToday: number;
    voidCount: number;
  };
  closeDay: {
    cashCountedLak: number;
    cashSalesLak: number;
    differenceLak: number;
    expectedCashLak: number;
    profitLak: number;
    qrTransferSalesLak: number;
    refundLak: number;
    shiftSummaries: ShiftSummary[];
    totalBills: number;
    totalSalesLak: number;
    voidCount: number;
  };
  hourlySales: TodaySalesPoint[];
  salesTrend: DashboardSalesPoint[];
  lowStockItems: DashboardLowStockItem[];
  recentSales: DashboardRecentSale[];
  period: {
    end: string;
    key: DashboardRangeKey;
    label: string;
    start: string;
    trendGranularity: DashboardTrendGranularity;
  };
  shift: {
    cashInLak: number;
    cashOutLak: number;
    cashSalesLak: number;
    cashierName: string | null;
    countedCashLak: number | null;
    differenceLak: number | null;
    expectedCashLak: number;
    hasActiveCashSession: boolean;
    openedAt: string | null;
    openingCashLak: number;
    qrTransferSalesLak: number;
    requireCashShiftBeforeSale: boolean;
    status: "not_started" | "open" | "closed";
  };
  summary: {
    cogsLak: number;
    discountLak: number;
    grossSalesLak: number;
    inventoryValueLak: number;
    loyaltyRedeemedLak: number;
    netSalesLak: number;
    promotionDiscountLak: number;
    refundLak: number;
    voidCount: number;
  };
  paymentBreakdown: Array<{ method: string; totalLak: number }>;
  currencyBreakdown: DashboardCurrencyBreakdown[];
  topProducts: TopSellingProduct[];
  dataStatus: {
    hasError: boolean;
    isPartial: boolean;
    message?: string;
    warnings?: string[];
  };
};

function logDashboardQueryFailure(functionName: string, queryName: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${functionName}] ${queryName} failed: ${message}`);
}

function emptySnapshot(errorMessage?: string): DashboardSnapshot {
  const { end, label, start } = resolveDateRange({ key: "today" });

  return {
    alerts: [],
    cards: {
      cashDrawerExpectedLak: 0,
      cogsLak: 0,
      customerCreditDueLak: 0,
      discountLak: 0,
      expiredProducts: 0,
      grossSalesLak: 0,
      inventoryValueLak: 0,
      itemsSoldToday: 0,
      lowStockProducts: 0,
      loyaltyRedeemedLak: 0,
      netSalesLak: 0,
      nearExpiryProducts: 0,
      profitTodayLak: 0,
      promotionDiscountLak: 0,
      refundLak: 0,
      salesTodayLak: 0,
      supplierPayablesDueLak: 0,
      totalBillsToday: 0,
      voidCount: 0,
    },
    closeDay: {
      cashCountedLak: 0,
      cashSalesLak: 0,
      differenceLak: 0,
      expectedCashLak: 0,
      profitLak: 0,
      qrTransferSalesLak: 0,
      refundLak: 0,
      shiftSummaries: [],
      totalBills: 0,
      totalSalesLak: 0,
      voidCount: 0,
    },
    hourlySales: Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      label: `${String(hour).padStart(2, "0")}:00`,
      salesLak: 0,
    })),
    salesTrend: Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      label: `${String(hour).padStart(2, "0")}:00`,
      salesLak: 0,
    })),
    lowStockItems: [],
    recentSales: [],
    period: {
      end: end.toISOString(),
      key: "today",
      label,
      start: start.toISOString(),
      trendGranularity: "hour",
    },
    shift: {
      cashInLak: 0,
      cashOutLak: 0,
      cashSalesLak: 0,
      cashierName: null,
      countedCashLak: null,
      differenceLak: null,
      expectedCashLak: 0,
      hasActiveCashSession: false,
      openedAt: null,
      openingCashLak: 0,
      qrTransferSalesLak: 0,
      requireCashShiftBeforeSale: true,
      status: "not_started",
    },
    summary: {
      cogsLak: 0,
      discountLak: 0,
      grossSalesLak: 0,
      inventoryValueLak: 0,
      loyaltyRedeemedLak: 0,
      netSalesLak: 0,
      promotionDiscountLak: 0,
      refundLak: 0,
      voidCount: 0,
    },
    paymentBreakdown: [],
    currencyBreakdown: [
      { billCount: 0, currency: "LAK", paymentMethods: [], total: 0 },
      { billCount: 0, currency: "THB", paymentMethods: [], total: 0 },
      { billCount: 0, currency: "USD", paymentMethods: [], total: 0 },
    ],
    topProducts: [],
    dataStatus: {
      hasError: Boolean(errorMessage),
      isPartial: false,
      message: errorMessage,
    },
  };
}

function startOfDay(date = new Date()) {
  return startOfBusinessDay(date);
}

function startOfWeek(date = new Date()) {
  return startOfBusinessWeek(date);
}

function startOfMonth(date = new Date()) {
  return startOfBusinessMonth(date);
}

function startOfYear(date = new Date()) {
  return startOfBusinessYear(date);
}

function resolveDateRange(range: DashboardDateRange) {
  const now = new Date();
  let start = startOfDay(now);

  if (range.key === "week") {
    start = startOfWeek(now);
  }
  if (range.key === "month") {
    start = startOfMonth(now);
  }
  if (range.key === "year") {
    start = startOfYear(now);
  }
  if (range.key === "custom" && range.start && range.end) {
    start = startOfDay(range.start);
  }

  const end = new Date(start);
  if (range.key === "today") {
    end.setDate(end.getDate() + 1);
  } else if (range.key === "week") {
    end.setDate(end.getDate() + 7);
  } else if (range.key === "month") {
    end.setMonth(end.getMonth() + 1);
  } else if (range.key === "year") {
    end.setFullYear(end.getFullYear() + 1);
  } else if (range.key === "custom" && range.end) {
    end.setTime(startOfDay(range.end).getTime());
    end.setDate(end.getDate() + 1);
  } else {
    end.setDate(end.getDate() + 1);
  }

  const labels: Record<DashboardRangeKey, string> = {
    custom: "Custom Date",
    month: "This Month",
    today: "Today",
    week: "This Week",
    year: "This Year",
  };

  return { end, label: labels[range.key], start };
}

function trendGranularityForRange(range: DashboardDateRange, start: Date, end: Date): DashboardTrendGranularity {
  if (range.key === "today") return "hour";
  if (range.key === "year") return "month";
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86_400_000));
  if (range.key === "custom" && days <= 1) return "hour";
  if (days > 31) return "month";
  return "day";
}

export function buildDashboardSalesTrend(
  sales: Array<{ createdAt: Date; totalAmount: unknown }>,
  range: DashboardDateRange,
  start: Date,
  end: Date,
): { granularity: DashboardTrendGranularity; points: DashboardSalesPoint[] } {
  const granularity = trendGranularityForRange(range, start, end);
  const totals = new Map<string, number>();

  for (const sale of sales) {
    const key =
      granularity === "hour"
        ? String(businessHour(sale.createdAt)).padStart(2, "0") + ":00"
        : granularity === "month"
          ? businessMonthLabel(sale.createdAt)
          : businessDayLabel(sale.createdAt);
    totals.set(key, (totals.get(key) ?? 0) + amount(sale.totalAmount));
  }

  if (granularity === "hour") {
    return {
      granularity,
      points: Array.from({ length: 24 }, (_, hour) => {
        const label = `${String(hour).padStart(2, "0")}:00`;
        return { hour: label, label, salesLak: totals.get(label) ?? 0 };
      }),
    };
  }

  const points: DashboardSalesPoint[] = [];
  if (granularity === "day") {
    for (let cursor = new Date(start); cursor < end; cursor = new Date(cursor.getTime() + 86_400_000)) {
      const label = businessDayLabel(cursor);
      points.push({ label, salesLak: totals.get(label) ?? 0 });
    }
  } else {
    for (let cursor = new Date(start); cursor < end; cursor = startOfBusinessMonth(new Date(cursor.getTime() + 32 * 86_400_000))) {
      const label = businessMonthLabel(cursor);
      points.push({ label, salesLak: totals.get(label) ?? 0 });
    }
  }

  return { granularity, points };
}

function plusDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatLak(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} LAK`;
}

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isCashierOnly(roles: string[] = []) {
  const normalized = roles.map((role) => role.toLowerCase());
  return normalized.some((role) => ["cashier", "staff"].includes(role))
    && !normalized.some((role) => ["owner", "manager", "admin"].includes(role));
}

export function shouldRouteToPos(roles: string[] = []) {
  return isCashierOnly(roles);
}

export type DashboardSecondaryContext = {
  salesTodayLak: number;
  shiftSummaries: ShiftSummary[];
};

export type DashboardSecondarySlice = {
  alerts: DashboardAlert[];
  cardPatch: Pick<
    DashboardSnapshot["cards"],
    | "customerCreditDueLak"
    | "expiredProducts"
    | "inventoryValueLak"
    | "lowStockProducts"
    | "loyaltyRedeemedLak"
    | "nearExpiryProducts"
    | "promotionDiscountLak"
    | "supplierPayablesDueLak"
    | "voidCount"
  >;
  dataStatus: DashboardSnapshot["dataStatus"];
  lowStockItems: DashboardLowStockItem[];
  summaryPatch: Pick<
    DashboardSnapshot["summary"],
    "inventoryValueLak" | "loyaltyRedeemedLak" | "promotionDiscountLak" | "voidCount"
  >;
  voidCount: number;
};

export function mergeDashboardSnapshots(
  critical: DashboardSnapshot,
  secondary: DashboardSecondarySlice,
): DashboardSnapshot {
  return {
    ...critical,
    alerts: secondary.alerts,
    cards: {
      ...critical.cards,
      ...secondary.cardPatch,
    },
    closeDay: {
      ...critical.closeDay,
      voidCount: secondary.voidCount,
    },
    dataStatus: {
      hasError: critical.dataStatus.hasError || secondary.dataStatus.hasError,
      isPartial: critical.dataStatus.isPartial || secondary.dataStatus.isPartial,
      message: critical.dataStatus.message ?? secondary.dataStatus.message,
      warnings: [...(critical.dataStatus.warnings ?? []), ...(secondary.dataStatus.warnings ?? [])],
    },
    lowStockItems: secondary.lowStockItems,
    summary: {
      ...critical.summary,
      ...secondary.summaryPatch,
    },
  };
}

export async function getMiniMartDashboardSnapshot(
  range: DashboardDateRange = { key: "today" },
): Promise<DashboardSnapshot> {
  const { requireSession } = await import("@/lib/auth/session");
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView);

  try {
    return await getPrismaDashboardSnapshot(tenant, range);
  } catch (error) {
    logDashboardQueryFailure("getMiniMartDashboardSnapshot", "dashboardSnapshot", error);
    return emptySnapshot("Dashboard data could not be loaded");
  }
}

export async function getMiniMartDashboardCriticalSnapshot(
  range: DashboardDateRange = { key: "today" },
): Promise<DashboardSnapshot> {
  const { requireSession } = await import("@/lib/auth/session");
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView);

  try {
    return await loadDashboardCriticalSnapshot(tenant, range);
  } catch (error) {
    logDashboardQueryFailure("getMiniMartDashboardCriticalSnapshot", "dashboardCritical", error);
    return emptySnapshot("Dashboard data could not be loaded");
  }
}

export async function getMiniMartDashboardSecondarySnapshot(
  range: DashboardDateRange,
  context: DashboardSecondaryContext,
): Promise<DashboardSecondarySlice> {
  const { requireSession } = await import("@/lib/auth/session");
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView);

  try {
    return await loadDashboardSecondarySlice(tenant, range, prisma, context);
  } catch (error) {
    logDashboardQueryFailure("getMiniMartDashboardSecondarySnapshot", "dashboardSecondary", error);
    return emptySecondarySlice("Some dashboard data could not be loaded.");
  }
}

export async function getMiniMartDashboardPromotionSnapshot(
  range: DashboardDateRange,
): Promise<DashboardPromotionSlice> {
  const { requireSession } = await import("@/lib/auth/session");
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView);

  try {
    return await loadDashboardPromotionSlice(tenant, range, prisma);
  } catch (error) {
    logDashboardQueryFailure("getMiniMartDashboardPromotionSnapshot", "dashboardPromotions", error);
    return emptyPromotionSlice(range, "Promotion data could not be loaded.");
  }
}

/*
 * Dashboard calculation contract
 * - Revenue, transaction count, profit, COGS, payment totals, and top products
 *   come from loadDashboardCriticalSalesKpis + assembleDashboardSalesKpis, which
 *   reuse the same sale filters and netReportLifecycle netting as Reports.
 *   Dashboard must not subtract refunds again from already-netted revenue.
 * - PERF-07/10: critical path is permission+scope → sales KPIs → cash sessions →
 *   cash-session totals. Sales KPIs and cash totals use one bounded query each.
 *   Secondary inventory/alert/history queries must not start until that path
 *   completes (PrismaPg max:1 serializes all queries).
 * - Dashboard does not load the Reports page catalogues (products/inventory/
 *   customers/suppliers snapshots) on first paint.
 * - Query failures never produce mock metrics. The service returns an empty
 *   snapshot with dataStatus.hasError so callers can show an unavailable state.
 * - No cross-request cache is applied here until checkout/refund/void invalidation exists.
 * - Date ranges use inclusive start and exclusive end; custom ranges include the
 *   full selected end day in the Asia/Vientiane business timezone.
 */
function dashboardLoadTimingEnabled() {
  return process.env.IGO_DASHBOARD_LOAD_TIMING === "1";
}

export const dashboardLoadStages: string[] = [];

export function resetDashboardLoadStages() {
  dashboardLoadStages.length = 0;
}

async function timedDashboardLoad<T>(label: string, fn: () => Promise<T>): Promise<T> {
  dashboardLoadStages.push(label);
  if (!dashboardLoadTimingEnabled()) {
    return fn();
  }
  const started = Date.now();
  try {
    return await fn();
  } finally {
    console.info(`[dashboard-load] ${label} ${Date.now() - started}ms`);
  }
}

function inventoryBalanceValueLak(row: {
  product: {
    costPriceLak: unknown;
    units?: Array<{ costPriceLak: unknown; isBaseUnit?: boolean }>;
  };
  quantity: unknown;
}) {
  const units = row.product.units ?? [];
  const baseUnit = units.find((unit) => unit.isBaseUnit) ?? units[0];
  return amount(row.quantity) * amount(baseUnit?.costPriceLak ?? row.product.costPriceLak);
}

function emptySecondarySlice(errorMessage?: string): DashboardSecondarySlice {
  return {
    alerts: [],
    cardPatch: {
      customerCreditDueLak: 0,
      expiredProducts: 0,
      inventoryValueLak: 0,
      lowStockProducts: 0,
      loyaltyRedeemedLak: 0,
      nearExpiryProducts: 0,
      promotionDiscountLak: 0,
      supplierPayablesDueLak: 0,
      voidCount: 0,
    },
    dataStatus: {
      hasError: Boolean(errorMessage),
      isPartial: Boolean(errorMessage),
      message: errorMessage,
    },
    lowStockItems: [],
    summaryPatch: {
      inventoryValueLak: 0,
      loyaltyRedeemedLak: 0,
      promotionDiscountLak: 0,
      voidCount: 0,
    },
    voidCount: 0,
  };
}

function emptyPromotionSlice(range: DashboardDateRange, errorMessage?: string): DashboardPromotionSlice {
  const { end, label, start } = resolveDateRange(range);
  return {
    dataStatus: {
      hasError: Boolean(errorMessage),
      isPartial: Boolean(errorMessage),
      message: errorMessage,
    },
    period: {
      end: end.toISOString(),
      key: range.key,
      label,
      start: start.toISOString(),
      trendGranularity: trendGranularityForRange(range, start, end),
    },
    summary: {
      activeCount: 0,
      endingSoonCount: 0,
      promotionDiscountLak: 0,
      startingSoonCount: 0,
      topPromotions: [],
      usageCount: 0,
    },
  };
}

type DashBalance = {
  productId: string;
  product: {
    costPriceLak: unknown;
    minStock: unknown;
    nameEn: string;
    nameLo: string;
    units?: Array<{ costPriceLak: unknown; isBaseUnit?: boolean }>;
  };
  quantity: unknown;
  warehouseId: string;
};

type DashTxn = { amount: unknown; transactionType: string };

export async function getPrismaDashboardCriticalSnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any = prisma,
): Promise<DashboardSnapshot> {
  return loadDashboardCriticalSnapshot(tenant, range, client);
}

export async function getPrismaDashboardSecondarySnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
  context: DashboardSecondaryContext,
  client: any = prisma,
): Promise<DashboardSecondarySlice> {
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView, client);
  return loadDashboardSecondarySlice(tenant, range, client, context);
}

export async function getPrismaDashboardPromotionSnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any = prisma,
): Promise<DashboardPromotionSlice> {
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView, client);
  return loadDashboardPromotionSlice(tenant, range, client);
}

export async function getPrismaDashboardSnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any = prisma,
): Promise<DashboardSnapshot> {
  const started = dashboardLoadTimingEnabled() ? Date.now() : 0;
  const critical = await loadDashboardCriticalSnapshot(tenant, range, client);
  const secondary = await loadDashboardSecondarySlice(tenant, range, client, {
    salesTodayLak: critical.cards.salesTodayLak,
    shiftSummaries: critical.closeDay.shiftSummaries,
  });
  if (dashboardLoadTimingEnabled()) {
    console.info(`[dashboard-load] total ${Date.now() - started}ms`);
  }
  return mergeDashboardSnapshots(critical, secondary);
}

async function loadDashboardCriticalSnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any = prisma,
): Promise<DashboardSnapshot> {
  const db = client as any;
  const scope = await timedDashboardLoad("scope", () => resolveDashboardCriticalContext(tenant, client));
  const { end, label, start } = resolveDateRange(range);
  const dateTo = new Date(end.getTime() - 1);

  const salesKpis = (await timedDashboardLoad("critical-sales-kpis", () =>
    loadDashboardCriticalSalesKpis(scope, { dateFrom: start, dateTo }, db),
  )).kpis;

  const [sessionRows, companySettings] = await timedDashboardLoad("critical-cash-sessions", () =>
    Promise.all([
      db.cashSession.findMany({
        include: { transactions: true },
        orderBy: { openedAt: "asc" },
        where: {
          branchId: scope.branchId,
          companyId: tenant.companyId,
          OR: [
            { cashierId: tenant.userId, closedAt: null },
            { openedAt: { gte: start, lt: end } },
          ],
        },
      }),
      db.companySetting.findUnique({
        select: { unitPricingDefaults: true },
        where: { companyId: tenant.companyId },
      }),
    ]),
  ) as [Array<Record<string, any>>, Record<string, any> | null];
  const requireCashShiftBeforeSale = readRequireCashShiftBeforeSaleFromJson(companySettings?.unitPricingDefaults);
  const currentShift = [...sessionRows]
    .filter((shift) => !shift.closedAt && shift.cashierId === tenant.userId)
    .sort((left, right) => new Date(right.openedAt).getTime() - new Date(left.openedAt).getTime())[0] ?? null;
  const todayShifts = sessionRows.filter((shift) => {
    const openedAt = new Date(shift.openedAt).getTime();
    return openedAt >= start.getTime() && openedAt < end.getTime();
  });

  const shiftTxns = (currentShift?.transactions ?? []) as DashTxn[];
  const grossSalesLak = salesKpis.grossSalesLak;
  const discountLak = salesKpis.discountLak;
  const salesTodayLak = amount(salesKpis.totalRevenue);
  const profitTodayLak = amount(salesKpis.totalProfit);
  const cogsLak = amount(salesKpis.cogsLak);
  const refundLak = amount(salesKpis.refundLak);
  const netSalesLak = salesTodayLak;
  const itemsSoldToday = amount(salesKpis.itemsSold);
  const profitWarnings: string[] = [];
  if (salesKpis.missingSaleLineCosts) {
    profitWarnings.push("Some sale lines are missing cost snapshots; profit and COGS may be partial.");
  }
  const cashSalesLak = salesKpis.paymentBreakdown
    .filter((row) => row.label.toLowerCase() === "cash")
    .reduce((total, row) => total + amount(row.totalLak), 0);
  const qrTransferSalesLak = salesKpis.paymentBreakdown
    .filter((row) => ["qr", "transfer", "card"].includes(row.label.toLowerCase()))
    .reduce((total, row) => total + amount(row.totalLak), 0);
  const cashInLak = shiftTxns
    .filter((transaction) => transaction.transactionType === "cash_in")
    .reduce((total, transaction) => total + amount(transaction.amount), 0);
  const cashOutLak = shiftTxns
    .filter((transaction) => transaction.transactionType === "cash_out")
    .reduce((total, transaction) => total + amount(transaction.amount), 0);
  const openingCashLak = amount(currentShift?.openingCash);
  const shiftsForTotals = new Map<string, Record<string, any>>();
  if (currentShift) {
    shiftsForTotals.set(String(currentShift.id), currentShift);
  }
  for (const shift of todayShifts as Array<Record<string, any>>) {
    shiftsForTotals.set(String(shift.id), shift);
  }
  const totalsByShiftId = await timedDashboardLoad("critical-cash-totals", () =>
    computeCashSessionTotalsForShifts(
      Array.from(shiftsForTotals.values()).map((shift) => ({
        endAt: shift.closedAt ?? new Date(),
        session: shift,
      })),
      db,
    ),
  );
  await timedDashboardLoad("critical-complete", async () => undefined);
  const currentShiftTotals = currentShift ? totalsByShiftId.get(String(currentShift.id)) ?? null : null;
  const expectedCashLak = currentShiftTotals?.expectedCashLak ?? 0;
  const salesTrend = buildDashboardSalesTrend(salesKpis.nettedSales, range, start, end);
  const trendPoints = salesTrend.points;
  const topProducts = salesKpis.productRows.slice(0, 10);
  const recentSales = salesKpis.nettedSales.slice(0, 20).map((sale) => ({
    createdAt: sale.createdAt.toISOString(),
    paymentMethod: sale.paymentMethod,
    saleNo: sale.saleNo,
    status: sale.saleStatus,
    totalLak: amount(sale.totalAmount),
  }));
  const paymentBreakdown = salesKpis.paymentBreakdown.map((row) => ({
    method: row.label.toLowerCase(),
    totalLak: amount(row.totalLak),
  }));
  const billIdsByCurrency = new Map<DashboardCurrencyCode, Set<string>>([
    ["LAK", new Set()],
    ["THB", new Set()],
    ["USD", new Set()],
  ]);
  const paymentByCurrency = new Map<DashboardCurrencyCode, Map<string, number>>([
    ["LAK", new Map()],
    ["THB", new Map()],
    ["USD", new Map()],
  ]);
  for (const payment of salesKpis.paymentRows) {
    const currency: DashboardCurrencyCode = "LAK";
    const method = String(payment.paymentMethod ?? "cash");
    billIdsByCurrency.get(currency)?.add(payment.saleId);
    const methodTotals = paymentByCurrency.get(currency);
    methodTotals?.set(method, (methodTotals.get(method) ?? 0) + amount(payment.amount));
  }
  const currencyBreakdown: DashboardCurrencyBreakdown[] = (["LAK", "THB", "USD"] as DashboardCurrencyCode[])
    .map((currency) => {
      const methodTotals = paymentByCurrency.get(currency) ?? new Map<string, number>();
      return {
        billCount: billIdsByCurrency.get(currency)?.size ?? 0,
        currency,
        paymentMethods: Array.from(methodTotals.entries()).map(([method, total]) => ({ method, total })),
        total: Array.from(methodTotals.values()).reduce((sum, total) => sum + total, 0),
      };
    });
  const cashierIds = Array.from(new Set(todayShifts.map((shift) => String(shift.cashierId))));
  const cashiers = cashierIds.length
    ? await timedDashboardLoad("critical-cashier-names", () =>
        db.user.findMany({
          select: { fullName: true, id: true, username: true },
          where: {
            companies: { some: { companyId: tenant.companyId } },
            id: { in: cashierIds },
          },
        }),
      )
    : [];
  const cashierNameById = new Map(
    (cashiers as Array<{ fullName?: string | null; id: string; username?: string | null }>).map((user) => [
      String(user.id),
      user.fullName || user.username || String(user.id),
    ]),
  );
  const shiftSummaries: ShiftSummary[] = (todayShifts as Array<Record<string, any>>).map((shift) => {
    const totals = totalsByShiftId.get(String(shift.id));
    const counted = shift.closingCash == null ? null : amount(shift.closingCash);
    const shiftExpectedCashLak = shift.expectedCash == null
      ? totals?.expectedCashLak ?? 0
      : amount(shift.expectedCash);
    const difference = shift.cashDifference == null
      ? counted == null
        ? null
        : counted - shiftExpectedCashLak
      : amount(shift.cashDifference);
    return {
      cashierName: cashierNameById.get(String(shift.cashierId)) ?? String(shift.cashierId),
      cashierId: shift.cashierId,
      closedAt: shift.closedAt?.toISOString() ?? null,
      countedCashLak: counted,
      differenceLak: difference,
      expectedCashLak: shiftExpectedCashLak,
      openedAt: shift.openedAt.toISOString(),
      openingCashLak: amount(shift.openingCash),
      status: shift.closedAt ? "closed" : "open",
    };
  });
  const closeDayExpectedCashLak = shiftSummaries.length > 0
    ? shiftSummaries.reduce((total, shift) => total + shift.expectedCashLak, 0)
    : expectedCashLak;
  const currentShiftSummary = currentShift
    ? shiftSummaries.find((shift) => shift.cashierId === currentShift.cashierId && shift.closedAt === null) ?? null
    : null;

  return {
    alerts: [],
    cards: {
      cashDrawerExpectedLak: expectedCashLak,
      cogsLak,
      customerCreditDueLak: 0,
      discountLak,
      expiredProducts: 0,
      grossSalesLak,
      inventoryValueLak: 0,
      itemsSoldToday,
      lowStockProducts: 0,
      loyaltyRedeemedLak: 0,
      netSalesLak,
      nearExpiryProducts: 0,
      profitTodayLak,
      promotionDiscountLak: 0,
      refundLak,
      salesTodayLak,
      supplierPayablesDueLak: 0,
      totalBillsToday: amount(salesKpis.totalTransactions),
      voidCount: 0,
    },
    closeDay: {
      cashCountedLak: shiftSummaries.reduce((total, shift) => total + (shift.countedCashLak ?? 0), 0),
      cashSalesLak,
      differenceLak: shiftSummaries.reduce((total, shift) => total + (shift.differenceLak ?? 0), 0),
      expectedCashLak: closeDayExpectedCashLak,
      profitLak: profitTodayLak,
      qrTransferSalesLak,
      refundLak,
      shiftSummaries,
      totalBills: amount(salesKpis.totalTransactions),
      totalSalesLak: salesTodayLak,
      voidCount: 0,
    },
    hourlySales: trendPoints,
    salesTrend: trendPoints,
    lowStockItems: [],
    paymentBreakdown,
    currencyBreakdown,
    period: {
      end: end.toISOString(),
      key: range.key,
      label,
      start: start.toISOString(),
      trendGranularity: salesTrend.granularity,
    },
    recentSales,
    shift: {
      cashInLak,
      cashOutLak,
      cashSalesLak: currentShiftTotals?.cashSalesLak ?? 0,
      cashierName: currentShiftSummary?.cashierName ?? null,
      countedCashLak: currentShiftSummary?.countedCashLak ?? null,
      differenceLak: currentShiftSummary?.differenceLak ?? null,
      expectedCashLak,
      hasActiveCashSession: Boolean(currentShift),
      openedAt: currentShift?.openedAt.toISOString() ?? null,
      openingCashLak,
      qrTransferSalesLak: currentShiftTotals?.nonCashSalesLak ?? 0,
      requireCashShiftBeforeSale,
      status: currentShift ? "open" : "not_started",
    },
    summary: {
      cogsLak,
      discountLak,
      grossSalesLak,
      inventoryValueLak: 0,
      loyaltyRedeemedLak: 0,
      netSalesLak,
      promotionDiscountLak: 0,
      refundLak,
      voidCount: 0,
    },
    topProducts,
    dataStatus: {
      hasError: false,
      isPartial: profitWarnings.length > 0,
      warnings: profitWarnings,
    },
  };
}

async function loadDashboardPromotionSlice(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any,
): Promise<DashboardPromotionSlice> {
  const db = client as any;
  const scope = await resolveTenantScope(tenant, client);
  const { end, label, start } = resolveDateRange(range);
  const now = new Date();
  const soon = promotionSoonWindow(now);
  const [promotions, usages] = await Promise.all([
    db.promotion.findMany({
      select: {
        endDate: true,
        id: true,
        isActive: true,
        promotionName: true,
        startDate: true,
        status: true,
      },
      where: {
        companyId: scope.companyId,
        isActive: true,
        status: { in: ["active", "scheduled"] },
        OR: [
          { startDate: { lte: now }, endDate: { gte: now } },
          { startDate: { gte: now, lt: soon.end } },
          { endDate: { gte: now, lt: soon.end } },
        ],
      },
    }),
    db.promotionUsage.findMany({
      select: {
        discountAmountLak: true,
        promotion: { select: { promotionName: true, status: true } },
        promotionId: true,
        saleId: true,
      },
      where: {
        companyId: scope.companyId,
        sale: {
          branchId: scope.branchId,
          companyId: scope.companyId,
          createdAt: { gte: start, lt: end },
          saleStatus: { in: [...REPORT_SALE_STATUSES] },
        },
      },
    }),
  ]);

  return {
    dataStatus: { hasError: false, isPartial: false },
    period: {
      end: end.toISOString(),
      key: range.key,
      label,
      start: start.toISOString(),
      trendGranularity: trendGranularityForRange(range, start, end),
    },
    summary: buildDashboardPromotionSummary(promotions, usages, now),
  };
}

async function loadDashboardSecondarySlice(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any,
  context: DashboardSecondaryContext,
): Promise<DashboardSecondarySlice> {
  const db = client as any;
  await timedDashboardLoad("secondary-start", async () => undefined);
  const scope = await timedDashboardLoad("secondary-scope", () => resolveTenantScope(tenant, client));
  const { end, start } = resolveDateRange(range);
  const now = new Date();
  const branchWhere = { branchId: scope.branchId };
  const reportSaleWhere = {
    ...branchWhere,
    companyId: tenant.companyId,
    createdAt: { gte: start, lt: end },
    saleStatus: { in: [...REPORT_SALE_STATUSES] },
  };
  const branchWarehouseRows = await timedDashboardLoad("secondary-warehouses", () =>
    db.warehouse.findMany({
      select: { id: true },
      where: {
        branchId: scope.branchId,
        companyId: tenant.companyId,
        id: { in: scope.warehouseIds },
      },
    }),
  );
  const branchWarehouseIds = new Set(
    (branchWarehouseRows as Array<{ id: string }>).map((warehouse) => String(warehouse.id)),
  );
  const branchWarehouseFilter = { in: Array.from(branchWarehouseIds) };

  const [
    inventoryBalances,
    reservations,
    nearExpiryCount,
    expiredCount,
    customerCredit,
    supplierPayables,
    promotionDiscount,
    loyaltyRedeemed,
    voidCount,
    memberships,
    promotions,
  ] = await timedDashboardLoad("secondary-reads", () =>
    Promise.all([
      db.inventoryBalance.findMany({
        select: {
          productId: true,
          quantity: true,
          warehouseId: true,
          product: {
            select: {
              costPriceLak: true,
              minStock: true,
              nameEn: true,
              nameLo: true,
              units: { select: { costPriceLak: true, isBaseUnit: true } },
            },
          },
        },
        where: {
          warehouseId: branchWarehouseFilter,
          companyId: tenant.companyId,
        },
      }),
      db.stockReservation.findMany({
        select: { baseQuantity: true, productId: true, warehouseId: true },
        where: {
          companyId: tenant.companyId,
          status: "ACTIVE",
          warehouseId: branchWarehouseFilter,
        },
      }),
      db.inventoryLot.count({
        where: {
          companyId: tenant.companyId,
          expiryDate: { gte: startOfBusinessDay(now), lt: plusDays(startOfBusinessDay(now), 31) },
          quantity: { gt: 0 },
          warehouseId: branchWarehouseFilter,
        },
      }),
      db.inventoryLot.count({
        where: {
          warehouseId: branchWarehouseFilter,
          companyId: tenant.companyId,
          expiryDate: { lt: start },
          quantity: { gt: 0 },
        },
      }),
      db.customer.aggregate({
        _sum: { outstandingBalance: true },
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          outstandingBalance: { gt: 0 },
          status: "active",
        },
      }),
      db.supplierPayable.aggregate({
        _sum: { balanceAmount: true },
        where: {
          companyId: tenant.companyId,
        },
      }),
      db.saleItem.aggregate({
        _sum: { promotionDiscount: true },
        where: { sale: reportSaleWhere },
      }),
      db.loyaltyPointLedger.aggregate({
        _sum: { amountLak: true },
        where: {
          companyId: tenant.companyId,
          createdAt: { gte: start, lt: end },
          pointType: "redeem",
        },
      }),
      db.sale.count({
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          createdAt: { gte: start, lt: end },
          saleStatus: "cancelled",
        },
      }),
      db.customerSubscription.findMany({
        select: {
          customer: { select: { fullName: true, status: true } },
          endDate: true,
          id: true,
          plan: { select: { subscriptionType: true } },
          status: true,
        },
        where: {
          customer: { companyId: tenant.companyId, status: "active" },
          status: "active",
        },
        orderBy: { endDate: "asc" },
        take: 100,
      }),
      db.promotion.findMany({
        select: {
          endDate: true,
          id: true,
          isActive: true,
          promotionName: true,
          startDate: true,
          status: true,
        },
        where: {
          companyId: tenant.companyId,
          status: { in: ["active", "scheduled"] },
          OR: [
            { startDate: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + 7 * 86_400_000) } },
            { endDate: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } },
          ],
        },
        orderBy: [{ startDate: "asc" }, { endDate: "asc" }],
        take: 100,
      }),
    ]),
  );

  const inventoryRows = (inventoryBalances as DashBalance[]).filter((row) =>
    branchWarehouseIds.has(String(row.warehouseId)),
  );
  const reservedByProduct = new Map<string, number>();
  for (const row of reservations as Array<{ baseQuantity: unknown; productId: string; warehouseId: string }>) {
    if (!branchWarehouseIds.has(String(row.warehouseId))) continue;
    reservedByProduct.set(
      String(row.productId),
      (reservedByProduct.get(String(row.productId)) ?? 0) + amount(row.baseQuantity),
    );
  }
  const promotionDiscountLak = amount(promotionDiscount._sum.promotionDiscount);
  const loyaltyRedeemedLak = amount(loyaltyRedeemed._sum.amountLak);
  const inventoryValueLak = Math.round(
    inventoryRows.reduce((total, balance) => total + inventoryBalanceValueLak(balance), 0),
  );
  const inventoryWarnings: string[] = [];
  const missingInventoryCosts = inventoryRows.some((balance) => {
    const units = balance.product.units ?? [];
    const baseUnit = units.find((unit) => unit.isBaseUnit) ?? units[0];
    const cost = baseUnit?.costPriceLak ?? balance.product.costPriceLak;
    return cost == null || !Number.isFinite(Number(cost));
  });
  if (missingInventoryCosts) {
    inventoryWarnings.push("Some inventory items are missing product cost; inventory value may be partial.");
  }
  const stockByProduct = new Map<string, { minStock: number; name: string; onHand: number }>();
  for (const balance of inventoryRows) {
    const productId = String(balance.productId);
    const current = stockByProduct.get(productId) ?? {
      minStock: amount(balance.product.minStock),
      name: balance.product.nameEn || balance.product.nameLo,
      onHand: 0,
    };
    current.onHand += amount(balance.quantity);
    stockByProduct.set(productId, current);
  }
  const stockRows = Array.from(stockByProduct.entries()).map(([productId, stock]) => ({
    available: availableStock(stock.onHand, reservedByProduct.get(productId) ?? 0),
    ...stock,
  }));
  const lowStockRows = stockRows.filter((row) => classifyStockNotification(row.available, row.minStock) === "low_stock");
  const outOfStockRows = stockRows.filter((row) => classifyStockNotification(row.available, row.minStock) === "out_of_stock");
  const lowStockItems = lowStockRows
    .map((row) => ({
      minStock: row.minStock,
      name: row.name,
      quantity: row.available,
    }))
    .sort((left, right) => left.quantity - right.quantity)
    .slice(0, 20);
  const membershipItems = (memberships as Array<Record<string, any>>).filter((subscription) =>
    subscription.customer?.status === "active" &&
    /month|year|day|week|time/i.test(String(subscription.plan?.subscriptionType ?? "")) &&
    membershipExpiringDays(subscription.endDate, now) !== null,
  );
  const promotionAlerts: DashboardAlert[] = [];
  for (const promotion of promotions as Array<Record<string, any>>) {
    if (!promotion.isActive) continue;
    const startsIn = promotionWindowDays(promotion.startDate, now);
    const endsIn = promotionWindowDays(promotion.endDate, now);
    if (startsIn !== null && new Date(promotion.startDate).getTime() >= now.getTime()) {
      promotionAlerts.push({
        code: "promotion_starting",
        href: "/promotions",
        message: "",
        severity: "info",
        title: "",
        type: "Promotion",
        value: String(startsIn),
      });
    } else if (endsIn !== null) {
      promotionAlerts.push({
        code: "promotion_ending",
        href: "/promotions",
        message: "",
        severity: "warning",
        title: "",
        type: "Promotion",
        value: String(endsIn),
      });
    }
  }
  const alerts: DashboardAlert[] = [
    lowStockRows.length > 0
      ? {
          code: "low_stock",
          href: "/inventory/reorder",
          message: "",
          severity: "warning" as const,
          title: "",
          type: "Inventory",
          value: String(lowStockRows.length),
        }
      : null,
    nearExpiryCount > 0
      ? {
          code: "near_expiry",
          href: "/inventory",
          message: "",
          severity: "warning" as const,
          title: "",
          type: "Expiry",
          value: String(nearExpiryCount),
        }
      : null,
    outOfStockRows.length > 0
      ? {
          code: "out_of_stock",
          href: "/inventory/reorder",
          message: "",
          severity: "critical" as const,
          title: "",
          type: "Inventory",
          value: String(outOfStockRows.length),
        }
      : null,
    ...membershipItems.map((subscription) => ({
      code: "membership_expiring" as const,
      href: "/membership-levels",
      message: "",
      severity: "warning" as const,
      title: "",
      type: "Membership",
      value: String(membershipExpiringDays(subscription.endDate, now) ?? ""),
    })),
    ...promotionAlerts,
  ].filter(Boolean) as DashboardAlert[];

  await timedDashboardLoad("secondary-complete", async () => undefined);

  return {
    alerts,
    cardPatch: {
      customerCreditDueLak: amount(customerCredit._sum.outstandingBalance),
      expiredProducts: expiredCount,
      inventoryValueLak,
      lowStockProducts: lowStockRows.length + outOfStockRows.length,
      loyaltyRedeemedLak,
      nearExpiryProducts: nearExpiryCount,
      promotionDiscountLak,
      supplierPayablesDueLak: amount(supplierPayables._sum.balanceAmount),
      voidCount,
    },
    dataStatus: {
      hasError: false,
      isPartial: inventoryWarnings.length > 0,
      warnings: inventoryWarnings,
    },
    lowStockItems,
    summaryPatch: {
      inventoryValueLak,
      loyaltyRedeemedLak,
      promotionDiscountLak,
      voidCount,
    },
    voidCount,
  };
}
