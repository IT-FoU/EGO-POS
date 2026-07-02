import { computeCashRefundLak } from "@/features/cash-sessions/cash-session-calculator";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export type OwnShiftRecentBill = {
  amountLak: number;
  paymentMethod: string;
  receiptNo: string;
  saleNo: string;
  status: "paid" | "refunded" | "voided";
  time: string;
};

export type OwnShiftReport = {
  branchName: string | null;
  cashierName: string;
  cashDrawer: {
    cashInLak: number;
    cashOutLak: number;
    closingCashLak: number | null;
    expectedCashLak: number;
    openingCashLak: number;
    varianceLak: number | null;
  };
  closedAt: string | null;
  currency: "LAK";
  discountsLak: number;
  openedAt: string;
  paymentBreakdown: {
    cardLak: number;
    cashLak: number;
    qrLak: number;
    transferLak: number;
  };
  promotionUsageCount: number;
  recentBills: OwnShiftRecentBill[];
  refundTotalLak: number;
  shiftId: string;
  status: "open" | "closed";
  terminalName: string | null;
  totalBills: number;
  totalSalesLak: number;
  voidTotalLak: number;
};

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function paymentMethod(payments: Array<{ paymentMethod: string }>) {
  if (payments.length === 0) return "-";
  const methods = new Set(payments.map((payment) => payment.paymentMethod));
  return methods.size > 1 ? "mixed" : payments[0]?.paymentMethod ?? "-";
}

function saleStatus(status: string): OwnShiftRecentBill["status"] {
  if (status === "cancelled") return "voided";
  if (status === "refunded") return "refunded";
  return "paid";
}

export async function getOwnShiftReport(tenant: TenantContext, filters: { shiftId?: string } = {}) {
  const scope = await resolveTenantScope(tenant);
  const include = {
      branch: { select: { name: true } },
      transactions: true,
    };
  const baseWhere = {
      cashierId: tenant.userId,
      companyId: tenant.companyId,
      ...branchOwnedWhere(scope),
    };
  const session = filters.shiftId
    ? await db.cashSession.findFirst({
        include,
        where: { ...baseWhere, id: filters.shiftId },
      })
    : (await db.cashSession.findFirst({
        include,
        orderBy: { openedAt: "desc" },
        where: { ...baseWhere, closedAt: null },
      })) ??
      (await db.cashSession.findFirst({
        include,
        orderBy: { openedAt: "desc" },
        where: baseWhere,
      }));

  if (!session) {
    return null;
  }

  const openedAt = new Date(session.openedAt);
  const closedAt = session.closedAt ? new Date(session.closedAt) : null;
  const endAt = closedAt ?? new Date();
  const saleWindow = {
    branchId: session.branchId,
    companyId: tenant.companyId,
    createdAt: { gte: openedAt, lte: endAt },
    createdBy: tenant.userId,
  };

  const [cashier, sales, refunds] = await Promise.all([
    db.user.findFirst({
      select: { fullName: true, username: true },
      where: { id: tenant.userId },
    }),
    db.sale.findMany({
      include: {
        payments: true,
        promotionUsages: { select: { id: true } },
        refunds: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
      where: {
        ...saleWindow,
        saleStatus: { in: ["completed", "cancelled", "refunded"] },
      },
    }),
    db.refund.findMany({
      include: {
        sale: { include: { payments: true } },
      },
      where: {
        companyId: tenant.companyId,
        createdAt: { gte: openedAt, lte: endAt },
        createdBy: tenant.userId,
      },
    }),
  ]);

  let totalSalesLak = 0;
  let totalBills = 0;
  let discountsLak = 0;
  let promotionUsageCount = 0;
  let voidTotalLak = 0;
  let cashLak = 0;
  let transferLak = 0;
  let qrLak = 0;
  let cardLak = 0;

  for (const sale of sales) {
    const saleTotal = amount(sale.totalAmount);
    discountsLak += amount(sale.discountAmount);
    promotionUsageCount += sale.promotionUsages?.length ?? 0;

    if (sale.saleStatus === "cancelled") {
      voidTotalLak += saleTotal;
      continue;
    }

    if (sale.saleStatus === "completed") {
      totalSalesLak += saleTotal;
      totalBills += 1;
    }

    for (const payment of sale.payments ?? []) {
      const paymentAmount = amount(payment.amount);
      if (payment.paymentMethod === "cash") {
        cashLak += paymentAmount - amount(payment.changeAmount);
      } else if (payment.paymentMethod === "transfer") {
        transferLak += paymentAmount;
      } else if (payment.paymentMethod === "qr") {
        qrLak += paymentAmount;
      } else if (payment.paymentMethod === "visa" || payment.paymentMethod === "mastercard") {
        cardLak += paymentAmount;
      }
    }
  }

  const refundTotalLak = Math.round(refunds.reduce((total: number, refund: Record<string, any>) => total + amount(refund.totalAmount), 0));
  const refundCashLak = Math.round(
    refunds.reduce((total: number, refund: Record<string, any>) => {
      const sale = refund.sale ?? {};
      return total + computeCashRefundLak(sale.payments ?? [], amount(sale.totalAmount), amount(refund.totalAmount));
    }, 0),
  );
  const cashInLak = Math.round(
    (session.transactions ?? [])
      .filter((transaction: Record<string, any>) => transaction.transactionType === "cash_in")
      .reduce((total: number, transaction: Record<string, any>) => total + amount(transaction.amount), 0),
  );
  const cashOutLak = Math.round(
    (session.transactions ?? [])
      .filter((transaction: Record<string, any>) => transaction.transactionType === "cash_out")
      .reduce((total: number, transaction: Record<string, any>) => total + amount(transaction.amount), 0),
  );
  const openingCashLak = amount(session.openingCash);
  const expectedCashLak =
    session.expectedCash == null
      ? Math.round(openingCashLak + cashLak + cashInLak - cashOutLak - refundCashLak)
      : amount(session.expectedCash);
  const closingCashLak = session.closingCash == null ? null : amount(session.closingCash);
  const varianceLak =
    session.cashDifference == null
      ? closingCashLak == null
        ? null
        : Math.round(closingCashLak - expectedCashLak)
      : amount(session.cashDifference);

  return {
    branchName: session.branch?.name ?? null,
    cashierName: cashier?.fullName ?? cashier?.username ?? "Cashier",
    cashDrawer: {
      cashInLak,
      cashOutLak,
      closingCashLak,
      expectedCashLak,
      openingCashLak,
      varianceLak,
    },
    closedAt: iso(closedAt),
    currency: "LAK" as const,
    discountsLak: Math.round(discountsLak),
    openedAt: new Date(session.openedAt).toISOString(),
    paymentBreakdown: {
      cardLak: Math.round(cardLak),
      cashLak: Math.round(cashLak),
      qrLak: Math.round(qrLak),
      transferLak: Math.round(transferLak),
    },
    promotionUsageCount,
    recentBills: sales.slice(0, 10).map((sale: Record<string, any>) => ({
      amountLak: amount(sale.totalAmount),
      paymentMethod: paymentMethod(sale.payments ?? []),
      receiptNo: sale.receiptNo ? String(sale.receiptNo) : `RCPT-${sale.saleNo}`,
      saleNo: String(sale.saleNo),
      status: saleStatus(String(sale.saleStatus)),
      time: new Date(sale.createdAt).toISOString(),
    })),
    refundTotalLak,
    shiftId: session.id,
    status: closedAt ? "closed" as const : "open" as const,
    terminalName: null,
    totalBills,
    totalSalesLak: Math.round(totalSalesLak),
    voidTotalLak: Math.round(voidTotalLak),
  } satisfies OwnShiftReport;
}
