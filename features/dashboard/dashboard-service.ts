import { computeCashSessionTotalsForShift } from "@/features/cash-sessions/prisma-repository";
import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import { getPrismaDashboardSalesKpis } from "@/features/reports/prisma-repository";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";
import {
  businessHour,
  startOfBusinessDay,
  startOfBusinessMonth,
  startOfBusinessWeek,
  startOfBusinessYear,
} from "@/lib/datetime/business-timezone";

export type DashboardAlertSeverity = "info" | "warning" | "critical";

export type DashboardAlert = {
  href?: string;
  message: string;
  severity: DashboardAlertSeverity;
  title: string;
  type: string;
  value?: string;
};

export type TodaySalesPoint = {
  hour: string;
  salesLak: number;
};

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

export type DashboardDateRange = {
  end?: Date;
  key: DashboardRangeKey;
  start?: Date;
};

export type ShiftSummary = {
  cashierId: string;
  closedAt: string | null;
  countedCashLak: number;
  differenceLak: number;
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
  lowStockItems: DashboardLowStockItem[];
  recentSales: DashboardRecentSale[];
  period: {
    end: string;
    key: DashboardRangeKey;
    label: string;
    start: string;
  };
  shift: {
    cashInLak: number;
    cashOutLak: number;
    cashSalesLak: number;
    expectedCashLak: number;
    openedAt: string | null;
    openingCashLak: number;
    qrTransferSalesLak: number;
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
      salesLak: 0,
    })),
    lowStockItems: [],
    recentSales: [],
    period: {
      end: end.toISOString(),
      key: "today",
      label,
      start: start.toISOString(),
    },
    shift: {
      cashInLak: 0,
      cashOutLak: 0,
      cashSalesLak: 0,
      expectedCashLak: 0,
      openedAt: null,
      openingCashLak: 0,
      qrTransferSalesLak: 0,
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

/*
 * Dashboard calculation contract
 * - Revenue, transaction count, profit, COGS, payment totals, and top products
 *   come from getPrismaDashboardSalesKpis, which reuses the same sale filters and
 *   netReportLifecycle netting as Reports. Dashboard must not subtract refunds
 *   again from already-netted revenue.
 * - PERF-07: critical path is permission → scope → sales KPIs → cash sessions →
 *   cash-session totals. Secondary inventory/alert/history queries must not start
 *   until that path completes (PrismaPg max:1 serializes all queries).
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

type DashBalance = {
  product: {
    costPriceLak: unknown;
    minStock: unknown;
    nameEn: string;
    nameLo: string;
    units?: Array<{ costPriceLak: unknown; isBaseUnit?: boolean }>;
  };
  quantity: unknown;
};

type DashTxn = { amount: unknown; transactionType: string };

export async function getPrismaDashboardCriticalSnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any = prisma,
): Promise<DashboardSnapshot> {
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView, client);
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

export async function getPrismaDashboardSnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
  client: any = prisma,
): Promise<DashboardSnapshot> {
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView, client);
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
  const scope = await timedDashboardLoad("scope", () => resolveTenantScope(tenant, client));
  const { end, label, start } = resolveDateRange(range);
  const dateTo = new Date(end.getTime() - 1);
  const branchWhere = { branchId: scope.branchId };

  const salesKpis = await timedDashboardLoad("critical-sales-kpis", () =>
    getPrismaDashboardSalesKpis(scope, { dateFrom: start, dateTo }, db),
  );

  const [currentShift, todayShifts] = await timedDashboardLoad("critical-cash-sessions", () =>
    Promise.all([
      db.cashSession.findFirst({
        include: { transactions: true },
        orderBy: { openedAt: "desc" },
        where: {
          ...branchWhere,
          cashierId: tenant.userId,
          closedAt: null,
          companyId: tenant.companyId,
        },
      }),
      db.cashSession.findMany({
        include: { transactions: true },
        orderBy: { openedAt: "asc" },
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          openedAt: { gte: start, lt: end },
        },
      }),
    ]),
  );

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
  const shiftTotalsEntries = await timedDashboardLoad("critical-cash-totals", () =>
    Promise.all(
      Array.from(shiftsForTotals.values()).map(async (shift) => {
        const shiftEnd = shift.closedAt ?? new Date();
        const totals = await computeCashSessionTotalsForShift(shift, shiftEnd, db);
        return [String(shift.id), totals] as const;
      }),
    ),
  );
  await timedDashboardLoad("critical-complete", async () => undefined);
  const totalsByShiftId = new Map(shiftTotalsEntries);
  const currentShiftTotals = currentShift ? totalsByShiftId.get(String(currentShift.id)) ?? null : null;
  const expectedCashLak = currentShiftTotals?.expectedCashLak ?? openingCashLak;
  const hourlySales = emptySnapshot().hourlySales.map((point, hour) => ({
    ...point,
    salesLak: salesKpis.nettedSales
      .filter((sale) => businessHour(sale.createdAt) === hour)
      .reduce((total, sale) => total + amount(sale.totalAmount), 0),
  }));
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
  const shiftSummaries: ShiftSummary[] = (todayShifts as Array<Record<string, any>>).map((shift) => {
    const totals = totalsByShiftId.get(String(shift.id));
    const counted = amount(shift.closingCash);
    const shiftExpectedCashLak = amount(shift.expectedCash) || totals?.expectedCashLak || 0;
    return {
      cashierId: shift.cashierId,
      closedAt: shift.closedAt?.toISOString() ?? null,
      countedCashLak: counted,
      differenceLak: amount(shift.cashDifference) || counted - shiftExpectedCashLak,
      expectedCashLak: shiftExpectedCashLak,
      openedAt: shift.openedAt.toISOString(),
      openingCashLak: amount(shift.openingCash),
      status: shift.closedAt ? "closed" : "open",
    };
  });
  const closeDayExpectedCashLak = shiftSummaries.length > 0
    ? shiftSummaries.reduce((total, shift) => total + shift.expectedCashLak, 0)
    : expectedCashLak;

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
      cashCountedLak: shiftSummaries.reduce((total, shift) => total + shift.countedCashLak, 0),
      cashSalesLak,
      differenceLak: shiftSummaries.reduce((total, shift) => total + shift.differenceLak, 0),
      expectedCashLak: closeDayExpectedCashLak,
      profitLak: profitTodayLak,
      qrTransferSalesLak,
      refundLak,
      shiftSummaries,
      totalBills: amount(salesKpis.totalTransactions),
      totalSalesLak: salesTodayLak,
      voidCount: 0,
    },
    hourlySales,
    lowStockItems: [],
    paymentBreakdown,
    currencyBreakdown,
    period: {
      end: end.toISOString(),
      key: range.key,
      label,
      start: start.toISOString(),
    },
    recentSales,
    shift: {
      cashInLak,
      cashOutLak,
      cashSalesLak: currentShiftTotals?.cashSalesLak ?? 0,
      expectedCashLak,
      openedAt: currentShift?.openedAt.toISOString() ?? null,
      openingCashLak,
      qrTransferSalesLak: currentShiftTotals?.nonCashSalesLak ?? 0,
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
  const nearExpiryEnd = plusDays(start, 30);
  const deadStockCutoff = plusDays(new Date(), -30);
  const historicalStart = plusDays(start, -30);
  const branchWhere = { branchId: scope.branchId };
  const warehouseWhere = { warehouseId: scope.warehouseId };
  const reportSaleWhere = {
    ...branchWhere,
    companyId: tenant.companyId,
    createdAt: { gte: start, lt: end },
    saleStatus: { in: [...REPORT_SALE_STATUSES] },
  };

  const [
    inventoryBalances,
    nearExpiryCount,
    expiredCount,
    customerCredit,
    supplierPayables,
    deadStockProducts,
    historicalSales,
    promotionDiscount,
    loyaltyRedeemed,
    voidCount,
  ] = await timedDashboardLoad("secondary-reads", () =>
    Promise.all([
      db.inventoryBalance.findMany({
        select: {
          quantity: true,
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
          ...warehouseWhere,
          companyId: tenant.companyId,
        },
      }),
      db.inventoryLot.count({
        where: {
          ...warehouseWhere,
          companyId: tenant.companyId,
          expiryDate: { gte: start, lt: nearExpiryEnd },
          quantity: { gt: 0 },
        },
      }),
      db.inventoryLot.count({
        where: {
          ...warehouseWhere,
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
      db.product.count({
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          isActive: true,
          saleItems: {
            none: {
              sale: {
                createdAt: { gte: deadStockCutoff },
                saleStatus: { in: [...REPORT_SALE_STATUSES] },
              },
            },
          },
        },
      }),
      db.sale.aggregate({
        _sum: { totalAmount: true },
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          createdAt: { gte: historicalStart, lt: start },
          saleStatus: { in: [...REPORT_SALE_STATUSES] },
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
    ]),
  );

  const inventoryRows = inventoryBalances as DashBalance[];
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
  const selectedDays = Math.max(Math.ceil((end.getTime() - start.getTime()) / 86_400_000), 1);
  const historicalAverageLak = amount(historicalSales._sum.totalAmount) / 30;
  const selectedDailyAverageLak = context.salesTodayLak / selectedDays;
  const lowSalesPercent =
    historicalAverageLak > 0 && selectedDailyAverageLak < historicalAverageLak
      ? Math.round(((historicalAverageLak - selectedDailyAverageLak) / historicalAverageLak) * 100)
      : 0;
  const lowStockProducts = inventoryRows.filter(
    (balance) => amount(balance.quantity) <= amount(balance.product.minStock),
  );
  const lowStockItems = lowStockProducts
    .map((balance) => ({
      minStock: amount(balance.product.minStock),
      name: balance.product.nameEn || balance.product.nameLo,
      quantity: amount(balance.quantity),
    }))
    .sort((left, right) => left.quantity - right.quantity)
    .slice(0, 20);
  const shiftSummaries = context.shiftSummaries;
  const alerts: DashboardAlert[] = [
    deadStockProducts > 0
      ? {
          href: "/inventory",
          message: "Products not sold for more than 30 days",
          severity: "warning" as const,
          title: "Dead Stock",
          type: "Inventory",
          value: String(deadStockProducts),
        }
      : null,
    lowSalesPercent > 0
      ? {
          href: "/reports/sales",
          message: "Sales lower than expected",
          severity: "warning" as const,
          title: "Low Sales Warning",
          type: "Sales",
          value: `${lowSalesPercent}% below average`,
        }
      : null,
    lowStockProducts.length > 0
      ? {
          href: "/inventory",
          message: `${lowStockProducts.length} products need stock review.`,
          severity: "warning" as const,
          title: "Low stock",
          type: "Inventory",
          value: String(lowStockProducts.length),
        }
      : null,
    nearExpiryCount > 0
      ? {
          href: "/inventory",
          message: `${nearExpiryCount} lots expire within 30 days.`,
          severity: "warning" as const,
          title: "Near expiry",
          type: "Expiry",
          value: String(nearExpiryCount),
        }
      : null,
    expiredCount > 0
      ? {
          href: "/inventory",
          message: `${expiredCount} expired lots should be reviewed.`,
          severity: "critical" as const,
          title: "Expired products",
          type: "Expiry",
          value: String(expiredCount),
        }
      : null,
    amount(supplierPayables._sum.balanceAmount) > 0
      ? {
          href: "/purchasing/payables",
          message: `${amount(supplierPayables._sum.balanceAmount).toLocaleString("en-US")} LAK due to suppliers.`,
          severity: "warning" as const,
          title: "Supplier due",
          type: "Payables",
          value: formatLak(amount(supplierPayables._sum.balanceAmount)),
        }
      : null,
    amount(customerCredit._sum.outstandingBalance) > 0
      ? {
          href: "/customers",
          message: `${amount(customerCredit._sum.outstandingBalance).toLocaleString("en-US")} LAK customer credit outstanding.`,
          severity: "info" as const,
          title: "Customer credit due",
          type: "Credit",
          value: formatLak(amount(customerCredit._sum.outstandingBalance)),
        }
      : null,
    shiftSummaries.some((shift) => shift.differenceLak !== 0)
      ? {
          href: "/dashboard",
          message: "Cash count does not match expected amount",
          severity: "critical" as const,
          title: "Cash Difference",
          type: "Cash",
          value: formatLak(shiftSummaries.reduce((total, shift) => total + shift.differenceLak, 0)),
        }
      : null,
  ].filter(Boolean) as DashboardAlert[];

  await timedDashboardLoad("secondary-complete", async () => undefined);

  return {
    alerts,
    cardPatch: {
      customerCreditDueLak: amount(customerCredit._sum.outstandingBalance),
      expiredProducts: expiredCount,
      inventoryValueLak,
      lowStockProducts: lowStockProducts.length,
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
