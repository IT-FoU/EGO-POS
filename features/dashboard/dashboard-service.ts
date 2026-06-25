import { computeCashSessionTotalsForShift } from "@/features/cash-sessions/prisma-repository";
import { getPrismaReportsSnapshot } from "@/features/reports/prisma-repository";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";

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
  period: {
    end: string;
    key: DashboardRangeKey;
    label: string;
    start: string;
  };
  shift: {
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
  topProducts: TopSellingProduct[];
};

function emptySnapshot(): DashboardSnapshot {
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
    period: {
      end: end.toISOString(),
      key: "today",
      label,
      start: start.toISOString(),
    },
    shift: {
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
    topProducts: [],
  };
}

function startOfDay(date = new Date()) {
  const start = new Date();
  start.setTime(date.getTime());
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfWeek(date = new Date()) {
  const start = startOfDay(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + mondayOffset);
  return start;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date = new Date()) {
  return new Date(date.getFullYear(), 0, 1);
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

export async function getMiniMartDashboardSnapshot(
  range: DashboardDateRange = { key: "today" },
): Promise<DashboardSnapshot> {
  const { requireSession } = await import("@/lib/auth/session");
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView);
  return getPrismaDashboardSnapshot(tenant, range);
}

export async function getPrismaDashboardSnapshot(
  tenant: TenantContext,
  range: DashboardDateRange,
): Promise<DashboardSnapshot> {
  await assertPermission(tenant, READ_PERMISSIONS.dashboardView);
  const { end, label, start } = resolveDateRange(range);
  const nearExpiryEnd = plusDays(start, 30);
  const deadStockCutoff = plusDays(new Date(), -30);
  const historicalStart = plusDays(start, -30);
  const branchWhere = tenant.branchId ? { branchId: tenant.branchId } : {};
  const warehouseWhere = tenant.warehouseId ? { warehouseId: tenant.warehouseId } : {};

  const [
    sales,
    salePayments,
    inventoryBalances,
    nearExpiryLots,
    expiredLots,
    customerCredit,
    supplierPayables,
    currentShift,
    todayShifts,
    deadStockProducts,
    historicalSales,
    saleItemPromotionRows,
    loyaltyRedeemLedger,
    refunds,
    voidCount,
    reportsSnapshot,
  ] = await Promise.all([
      prisma.sale.findMany({
        include: {
          items: {
            include: {
              product: {
                select: {
                  nameEn: true,
                  nameLo: true,
                },
              },
            },
          },
        },
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          createdAt: { gte: start, lt: end },
          saleStatus: "completed",
        },
      }),
      prisma.salePayment.findMany({
        include: {
          sale: {
            select: {
              branchId: true,
              companyId: true,
            },
          },
        },
        where: {
          paymentDate: { gte: start, lt: end },
          sale: {
            ...branchWhere,
            companyId: tenant.companyId,
          },
        },
      }),
      prisma.inventoryBalance.findMany({
        include: {
          product: {
            select: {
              minStock: true,
              nameEn: true,
              nameLo: true,
            },
          },
        },
        where: {
          ...warehouseWhere,
          companyId: tenant.companyId,
        },
      }),
      prisma.inventoryLot.findMany({
        include: {
          product: {
            select: {
              nameEn: true,
              nameLo: true,
            },
          },
        },
        where: {
          ...warehouseWhere,
          companyId: tenant.companyId,
          expiryDate: { gte: start, lt: nearExpiryEnd },
          quantity: { gt: 0 },
        },
      }),
      prisma.inventoryLot.findMany({
        where: {
          ...warehouseWhere,
          companyId: tenant.companyId,
          expiryDate: { lt: start },
          quantity: { gt: 0 },
        },
      }),
      prisma.customer.aggregate({
        _sum: { outstandingBalance: true },
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          outstandingBalance: { gt: 0 },
          status: "active",
        },
      }),
      prisma.supplierPayable.aggregate({
        _sum: { balanceAmount: true },
        where: {
          companyId: tenant.companyId,
        },
      }),
      prisma.cashSession.findFirst({
        include: { transactions: true },
        orderBy: { openedAt: "desc" },
        where: {
          ...branchWhere,
          cashierId: tenant.userId,
          closedAt: null,
          companyId: tenant.companyId,
        },
      }),
      prisma.cashSession.findMany({
        include: { transactions: true },
        orderBy: { openedAt: "asc" },
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          openedAt: { gte: start, lt: end },
        },
      }),
      prisma.product.count({
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          isActive: true,
          saleItems: {
            none: {
              sale: {
                createdAt: { gte: deadStockCutoff },
                saleStatus: "completed",
              },
            },
          },
        },
      }),
      prisma.sale.findMany({
        select: { totalAmount: true },
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          createdAt: { gte: historicalStart, lt: start },
          saleStatus: "completed",
        },
      }),
      prisma.saleItem.findMany({
        select: { promotionDiscount: true },
        where: {
          sale: {
            ...branchWhere,
            companyId: tenant.companyId,
            createdAt: { gte: start, lt: end },
            saleStatus: "completed",
          },
        },
      }),
      prisma.loyaltyPointLedger.findMany({
        select: { amountLak: true },
        where: {
          companyId: tenant.companyId,
          createdAt: { gte: start, lt: end },
          pointType: "redeem",
        },
      }),
      prisma.refund.findMany({
        select: { totalAmount: true },
        where: {
          companyId: tenant.companyId,
          createdAt: { gte: start, lt: end },
          sale: branchWhere,
        },
      }),
      prisma.sale.count({
        where: {
          ...branchWhere,
          companyId: tenant.companyId,
          createdAt: { gte: start, lt: end },
          saleStatus: "cancelled",
        },
      }),
      getPrismaReportsSnapshot(tenant, {
        branchId: tenant.branchId || undefined,
        dateFrom: start,
        datePreset: "custom",
        dateTo: new Date(end.getTime() - 1),
        warehouseId: tenant.warehouseId || undefined,
      }),
    ]);

    const grossSalesLak = sales.reduce((total, sale) => total + amount(sale.subtotal), 0);
    const discountLak = sales.reduce((total, sale) => total + amount(sale.discountAmount), 0);
    const promotionDiscountLak = saleItemPromotionRows.reduce((total, row) => total + amount(row.promotionDiscount), 0);
    const loyaltyRedeemedLak = loyaltyRedeemLedger.reduce((total, row) => total + amount(row.amountLak), 0);
    const salesTodayLak = amount(reportsSnapshot.analytics.totalRevenue);
    const profitTodayLak = amount(reportsSnapshot.analytics.totalProfit);
    const cogsLak = amount(reportsSnapshot.cogsLak);
    const refundLak = refunds.reduce((total, row) => total + amount(row.totalAmount), 0);
    const netSalesLak = Math.max(salesTodayLak - refundLak, 0);
    const inventoryValueLak = amount(reportsSnapshot.hub.inventoryValueLak);
    const itemsSoldToday = sales.reduce(
      (total, sale) => total + sale.items.reduce((sum, item) => sum + amount(item.quantity), 0),
      0,
    );
    const cashSalesLak = salePayments
      .filter((payment) => payment.paymentMethod === "cash")
      .reduce((total, payment) => total + amount(payment.amount), 0);
    const qrTransferSalesLak = salePayments
      .filter((payment) => payment.paymentMethod === "qr" || payment.paymentMethod === "transfer")
      .reduce((total, payment) => total + amount(payment.amount), 0);
    const selectedDays = Math.max(Math.ceil((end.getTime() - start.getTime()) / 86_400_000), 1);
    const historicalAverageLak =
      historicalSales.reduce((total, sale) => total + amount(sale.totalAmount), 0) / 30;
    const selectedDailyAverageLak = salesTodayLak / selectedDays;
    const lowSalesPercent =
      historicalAverageLak > 0 && selectedDailyAverageLak < historicalAverageLak
        ? Math.round(((historicalAverageLak - selectedDailyAverageLak) / historicalAverageLak) * 100)
        : 0;
    const lowStockProducts = inventoryBalances.filter(
      (balance) => amount(balance.quantity) <= amount(balance.product.minStock),
    );
    const cashOutLak =
      currentShift?.transactions
        .filter((transaction) => transaction.transactionType === "cash_out")
        .reduce((total, transaction) => total + amount(transaction.amount), 0) ?? 0;
    const openingCashLak = amount(currentShift?.openingCash);
    const currentShiftTotals = currentShift
      ? await computeCashSessionTotalsForShift(currentShift)
      : null;
    const expectedCashLak = currentShiftTotals?.expectedCashLak ?? openingCashLak;
    const hourlySales = emptySnapshot().hourlySales.map((point, hour) => ({
      ...point,
      salesLak: sales
        .filter((sale) => sale.createdAt.getHours() === hour)
        .reduce((total, sale) => total + amount(sale.totalAmount), 0),
    }));
    const topProductMap = new Map<string, TopSellingProduct>();
    for (const sale of sales) {
      for (const item of sale.items) {
        const name = item.product.nameEn || item.product.nameLo;
        const current = topProductMap.get(name) ?? { name, quantity: 0, totalLak: 0 };
        current.quantity += amount(item.quantity);
        current.totalLak += amount(item.totalAmount);
        topProductMap.set(name, current);
      }
    }
    const topProducts = Array.from(topProductMap.values())
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 10);
    const paymentBreakdown = salePayments
      .reduce<Map<string, number>>((totals, payment) => {
        const method = String(payment.paymentMethod ?? "cash");
        totals.set(method, (totals.get(method) ?? 0) + amount(payment.amount));
        return totals;
      }, new Map());
    const shiftSummaries = await Promise.all(
      todayShifts.map(async (shift) => {
        const shiftEnd = shift.closedAt ?? new Date();
        const totals = await computeCashSessionTotalsForShift(shift, shiftEnd);
        const counted = amount(shift.closingCash);
        const expectedCashLak = amount(shift.expectedCash) || totals.expectedCashLak;
        return {
          cashierId: shift.cashierId,
          closedAt: shift.closedAt?.toISOString() ?? null,
          countedCashLak: counted,
          differenceLak: amount(shift.cashDifference) || counted - expectedCashLak,
          expectedCashLak,
          openedAt: shift.openedAt.toISOString(),
          openingCashLak: amount(shift.openingCash),
          status: shift.closedAt ? "closed" : "open",
        } satisfies ShiftSummary;
      }),
    );
    const closeDayExpectedCashLak = shiftSummaries.length > 0
      ? shiftSummaries.reduce((total, shift) => total + shift.expectedCashLak, 0)
      : expectedCashLak;
    const alerts: DashboardAlert[] = [
      deadStockProducts > 0
        ? {
            href: "/inventory",
            message: "Products not sold for more than 30 days",
            severity: "warning",
            title: "Dead Stock",
            type: "Inventory",
            value: String(deadStockProducts),
          }
        : null,
      lowSalesPercent > 0
        ? {
            href: "/reports/sales",
            message: "Sales lower than expected",
            severity: "warning",
            title: "Low Sales Warning",
            type: "Sales",
            value: `${lowSalesPercent}% below average`,
          }
        : null,
      lowStockProducts.length > 0
        ? {
            href: "/inventory",
            message: `${lowStockProducts.length} products need stock review.`,
            severity: "warning",
            title: "Low stock",
            type: "Inventory",
            value: String(lowStockProducts.length),
          }
        : null,
      nearExpiryLots.length > 0
        ? {
            href: "/inventory",
            message: `${nearExpiryLots.length} lots expire within 30 days.`,
            severity: "warning",
            title: "Near expiry",
            type: "Expiry",
            value: String(nearExpiryLots.length),
          }
        : null,
      expiredLots.length > 0
        ? {
            href: "/inventory",
            message: `${expiredLots.length} expired lots should be reviewed.`,
            severity: "critical",
            title: "Expired products",
            type: "Expiry",
            value: String(expiredLots.length),
          }
        : null,
      amount(supplierPayables._sum.balanceAmount) > 0
        ? {
            href: "/purchasing/payables",
            message: `${amount(supplierPayables._sum.balanceAmount).toLocaleString("en-US")} LAK due to suppliers.`,
            severity: "warning",
            title: "Supplier due",
            type: "Payables",
            value: formatLak(amount(supplierPayables._sum.balanceAmount)),
          }
        : null,
      amount(customerCredit._sum.outstandingBalance) > 0
        ? {
            href: "/customers",
            message: `${amount(customerCredit._sum.outstandingBalance).toLocaleString("en-US")} LAK customer credit outstanding.`,
            severity: "info",
            title: "Customer credit due",
            type: "Credit",
            value: formatLak(amount(customerCredit._sum.outstandingBalance)),
          }
        : null,
      shiftSummaries.some((shift) => shift.differenceLak !== 0)
        ? {
            href: "/dashboard",
            message: "Cash count does not match expected amount",
            severity: "critical",
            title: "Cash Difference",
            type: "Cash",
            value: formatLak(shiftSummaries.reduce((total, shift) => total + shift.differenceLak, 0)),
          }
        : null,
    ].filter(Boolean) as DashboardAlert[];

    return {
      alerts,
      cards: {
        cashDrawerExpectedLak: expectedCashLak,
        cogsLak,
        customerCreditDueLak: amount(customerCredit._sum.outstandingBalance),
        discountLak,
        expiredProducts: expiredLots.length,
        grossSalesLak,
        inventoryValueLak,
        itemsSoldToday,
        lowStockProducts: lowStockProducts.length,
        loyaltyRedeemedLak,
        netSalesLak,
        nearExpiryProducts: nearExpiryLots.length,
        profitTodayLak,
        promotionDiscountLak,
        refundLak,
        salesTodayLak,
        supplierPayablesDueLak: amount(supplierPayables._sum.balanceAmount),
        totalBillsToday: sales.length,
        voidCount,
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
        totalBills: sales.length,
        totalSalesLak: salesTodayLak,
        voidCount,
      },
      hourlySales,
      paymentBreakdown: Array.from(paymentBreakdown.entries()).map(([method, totalLak]) => ({ method, totalLak })),
      period: {
        end: end.toISOString(),
        key: range.key,
        label,
        start: start.toISOString(),
      },
      shift: {
        cashOutLak,
        cashSalesLak,
        expectedCashLak,
        openedAt: currentShift?.openedAt.toISOString() ?? null,
        openingCashLak,
        qrTransferSalesLak,
        status: currentShift ? "open" : "not_started",
      },
      summary: {
        cogsLak,
        discountLak,
        grossSalesLak,
        inventoryValueLak,
        loyaltyRedeemedLak,
        netSalesLak,
        promotionDiscountLak,
        refundLak,
        voidCount,
      },
      topProducts,
    };
}
