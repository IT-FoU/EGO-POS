import { PermissionMatrixDeniedError } from "@/features/permissions/platform-permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { computeCashRefundLak } from "@/features/cash-sessions/cash-session-calculator";
import { parseCashSessionCountBreakdown } from "@/features/cash-sessions/denominations";
import type { CashSessionCountBreakdown } from "@/features/cash-sessions/types";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";
import {
  canAccessOwnShiftReport,
  canViewBranchShiftReports,
} from "@/features/reports/own-shift-report-access";

const db = prisma as any;

/** Bounded recent branch history — do not load unlimited sessions. */
export const BRANCH_SHIFT_LIST_LIMIT = 40;

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
  cashierId: string;
  cashierName: string;
  cashDrawer: {
    cashInLak: number;
    cashOutLak: number;
    /** Counted / closing cash from Cash Shift Count. */
    closingCashLak: number | null;
    countBreakdown: CashSessionCountBreakdown | null;
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
    nonCashLak: number;
    qrLak: number;
    transferLak: number;
  };
  promotionUsageCount: number;
  recentBills: OwnShiftRecentBill[];
  /** Cash portion of refunds used in expected-cash formula. */
  refundCashLak: number;
  refundTotalLak: number;
  shiftId: string;
  status: "open" | "closed";
  terminalName: string | null;
  totalBills: number;
  totalSalesLak: number;
  /** Cash component of voided sales — subtracted from Expected Cash via gross cashSalesLak. */
  voidCashLak: number;
  voidTotalLak: number;
};

export type BranchShiftSessionRow = {
  cashierId: string;
  cashierName: string;
  closedAt: string | null;
  closingCashLak: number | null;
  expectedCashLak: number | null;
  id: string;
  openedAt: string;
  openingCashLak: number;
  status: "open" | "closed";
  varianceLak: number | null;
};

export type OwnShiftCapabilities = {
  canViewBranch: boolean;
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

async function requireOwnShiftAccess(tenant: TenantContext) {
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!canAccessOwnShiftReport(role)) {
    throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT);
  }
  return {
    canViewBranch: canViewBranchShiftReports(role),
    role,
  };
}

async function buildReportFromSession(
  tenant: TenantContext,
  session: Record<string, any>,
): Promise<OwnShiftReport> {
  const cashierId = String(session.cashierId);
  const openedAt = new Date(session.openedAt);
  const closedAt = session.closedAt ? new Date(session.closedAt) : null;
  const endAt = closedAt ?? new Date();
  const saleWindow = {
    branchId: session.branchId,
    companyId: tenant.companyId,
    createdAt: { gte: openedAt, lte: endAt },
    createdBy: cashierId,
  };

  const [cashier, sales, refunds] = await Promise.all([
    db.user.findFirst({
      select: { fullName: true, username: true },
      where: { id: cashierId },
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
        saleStatus: { in: ["completed", "cancelled", "refunded", "partial_refunded", "exchanged", "adjusted"] },
      },
    }),
    db.refund.findMany({
      include: {
        sale: { include: { payments: true } },
      },
      where: {
        companyId: tenant.companyId,
        createdAt: { gte: openedAt, lte: endAt },
        createdBy: cashierId,
      },
    }),
  ]);

  let totalSalesLak = 0;
  let totalBills = 0;
  let discountsLak = 0;
  let promotionUsageCount = 0;
  let voidTotalLak = 0;
  let voidCashLak = 0;
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
      for (const payment of sale.payments ?? []) {
        if (payment.paymentMethod === "cash") {
          voidCashLak += amount(payment.amount) - amount(payment.changeAmount);
        }
      }
      continue;
    }

    totalSalesLak += saleTotal;
    totalBills += 1;
    for (const refund of sale.refunds ?? []) {
      if (String(refund.kind ?? "refund") === "exchange") {
        totalSalesLak += amount(refund.paymentAmount) - amount(refund.refundAmount);
      }
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

  voidCashLak = Math.round(voidCashLak);

  const refundTotalLak = Math.round(
    refunds.reduce((total: number, refund: Record<string, any>) => total + amount(refund.totalAmount), 0),
  );
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
  // Formula: opening + grossCash + cashIn - cashOut - refundCash - voidCash
  // grossCash = cashLak (active) + voidCashLak, so net = opening + cashLak + cashIn - cashOut - refundCash
  const expectedCashLak =
    session.expectedCash == null
      ? Math.round(openingCashLak + cashLak + voidCashLak + cashInLak - cashOutLak - refundCashLak - voidCashLak)
      : amount(session.expectedCash);
  const closingCashLak = session.closingCash == null ? null : amount(session.closingCash);
  const varianceLak =
    session.cashDifference == null
      ? closingCashLak == null
        ? null
        : Math.round(closingCashLak - expectedCashLak)
      : amount(session.cashDifference);

  const nonCashLak = Math.round(transferLak + qrLak + cardLak);

  return {
    branchName: session.branch?.name ?? null,
    cashierId,
    cashierName: cashier?.fullName ?? cashier?.username ?? "Cashier",
    cashDrawer: {
      cashInLak,
      cashOutLak,
      closingCashLak,
      countBreakdown: (() => {
        try {
          return parseCashSessionCountBreakdown(session.countBreakdown);
        } catch {
          return null;
        }
      })(),
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
      nonCashLak,
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
    refundCashLak,
    refundTotalLak,
    shiftId: session.id,
    status: closedAt ? ("closed" as const) : ("open" as const),
    terminalName: null,
    totalBills,
    totalSalesLak: Math.round(totalSalesLak),
    voidCashLak,
    voidTotalLak: Math.round(voidTotalLak),
  } satisfies OwnShiftReport;
}

const sessionInclude = {
  branch: { select: { name: true } },
  transactions: true,
};

/**
 * MY SHIFT: current open session for the actor, else most recent closed own session.
 * Optional shiftId: own session always; other cashier only when canViewBranch.
 */
export async function getOwnShiftReport(
  tenant: TenantContext,
  filters: { shiftId?: string } = {},
): Promise<OwnShiftReport | null> {
  const access = await requireOwnShiftAccess(tenant);
  const scope = await resolveTenantScope(tenant);

  const session = filters.shiftId
    ? await db.cashSession.findFirst({
        include: sessionInclude,
        where: {
          companyId: tenant.companyId,
          id: filters.shiftId,
          ...branchOwnedWhere(scope),
          ...(access.canViewBranch ? {} : { cashierId: tenant.userId }),
        },
      })
    : (await db.cashSession.findFirst({
        include: sessionInclude,
        orderBy: { openedAt: "desc" },
        where: {
          cashierId: tenant.userId,
          closedAt: null,
          companyId: tenant.companyId,
          ...branchOwnedWhere(scope),
        },
      })) ??
      (await db.cashSession.findFirst({
        include: sessionInclude,
        orderBy: { openedAt: "desc" },
        where: {
          cashierId: tenant.userId,
          companyId: tenant.companyId,
          ...branchOwnedWhere(scope),
        },
      }));

  if (!session) {
    return null;
  }

  if (!access.canViewBranch && String(session.cashierId) !== String(tenant.userId)) {
    throw new PermissionMatrixDeniedError(access.role, STORE_ACTIONS.REPORTS_VIEW_FULL);
  }

  return buildReportFromSession(tenant, session);
}

/** BRANCH SHIFTS list — Manager/Owner branch (or Owner company) scope, bounded. */
export async function listBranchShiftSessions(
  tenant: TenantContext,
): Promise<{ capabilities: OwnShiftCapabilities; sessions: BranchShiftSessionRow[] }> {
  const access = await requireOwnShiftAccess(tenant);
  if (!access.canViewBranch) {
    throw new PermissionMatrixDeniedError(access.role, STORE_ACTIONS.REPORTS_VIEW_FULL);
  }

  const scope = await resolveTenantScope(tenant);
  const rows = await db.cashSession.findMany({
    include: {
      // CashSession has no cashier relation in schema — resolve names separately.
    },
    orderBy: { openedAt: "desc" },
    take: BRANCH_SHIFT_LIST_LIMIT,
    where: {
      companyId: tenant.companyId,
      ...branchOwnedWhere(scope),
    },
  });

  const cashierIds = [...new Set(rows.map((row: { cashierId: string }) => String(row.cashierId)))];
  const cashiers = cashierIds.length
    ? await db.user.findMany({
        select: { fullName: true, id: true, username: true },
        where: { id: { in: cashierIds } },
      })
    : [];
  const cashierNameById = new Map(
    cashiers.map((user: { fullName?: string | null; id: string; username?: string | null }) => [
      String(user.id),
      user.fullName ?? user.username ?? "Cashier",
    ]),
  );

  const sessions: BranchShiftSessionRow[] = rows.map((row: Record<string, any>) => {
    const closedAt = row.closedAt ? new Date(row.closedAt) : null;
    return {
      cashierId: String(row.cashierId),
      cashierName: cashierNameById.get(String(row.cashierId)) ?? "Cashier",
      closedAt: iso(closedAt),
      closingCashLak: row.closingCash == null ? null : amount(row.closingCash),
      expectedCashLak: row.expectedCash == null ? null : amount(row.expectedCash),
      id: String(row.id),
      openedAt: new Date(row.openedAt).toISOString(),
      openingCashLak: amount(row.openingCash),
      status: closedAt ? ("closed" as const) : ("open" as const),
      varianceLak: row.cashDifference == null ? null : amount(row.cashDifference),
    };
  });

  return {
    capabilities: {
      canViewBranch: true,
    },
    sessions,
  };
}

export async function getOwnShiftCapabilities(tenant: TenantContext): Promise<OwnShiftCapabilities> {
  const access = await requireOwnShiftAccess(tenant);
  return {
    canViewBranch: access.canViewBranch,
  };
}
