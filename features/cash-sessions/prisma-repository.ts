import { prisma } from "@/lib/db/prisma";
import {
  buildCashSessionTotals,
  calculateExpectedCash,
  calculateVariance,
  sumCashTransactions,
  summarizeSalePayments,
} from "@/features/cash-sessions/cash-session-calculator";
import type {
  CashMovementInput,
  CashSessionSummary,
  CloseCashSessionInput,
  OpenCashSessionInput,
} from "@/features/cash-sessions/types";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapSessionSummary(
  session: Record<string, any>,
  totals: ReturnType<typeof buildCashSessionTotals>,
): CashSessionSummary {
  const countedCashLak = session.closingCash == null ? null : amount(session.closingCash);
  const expectedCashLak = amount(session.expectedCash) || totals.expectedCashLak;
  const varianceLak =
    session.cashDifference == null
      ? countedCashLak == null
        ? null
        : calculateVariance(countedCashLak, expectedCashLak)
      : amount(session.cashDifference);

  return {
    ...totals,
    cashierId: session.cashierId,
    closedAt: session.closedAt ? new Date(session.closedAt).toISOString() : null,
    countedCashLak,
    expectedCashLak,
    id: session.id,
    openedAt: new Date(session.openedAt).toISOString(),
    status: session.closedAt ? "closed" : "open",
    varianceLak,
  };
}

async function loadSessionTotals(
  tx: Record<string, any>,
  session: Record<string, any>,
  endAt = new Date(),
) {
  const openedAt = new Date(session.openedAt);
  const saleWindow = {
    branchId: session.branchId,
    companyId: session.companyId,
    createdAt: { gte: openedAt, lte: endAt },
    createdBy: session.cashierId,
  };

  const [payments, refunds, cancelledSales] = await Promise.all([
    tx.salePayment.findMany({
      select: { amount: true, changeAmount: true, paymentMethod: true },
      where: {
        sale: {
          ...saleWindow,
          saleStatus: "completed",
        },
      },
    }),
    tx.refund.aggregate({
      _sum: { totalAmount: true },
      where: {
        companyId: session.companyId,
        createdAt: { gte: openedAt, lte: endAt },
        createdBy: session.cashierId,
      },
    }),
    tx.sale.findMany({
      include: { payments: true },
      where: {
        ...saleWindow,
        saleStatus: "cancelled",
      },
    }),
  ]);

  const paymentTotals = summarizeSalePayments(payments);
  const cashInLak = sumCashTransactions(session.transactions ?? [], "cash_in");
  const cashOutLak = sumCashTransactions(session.transactions ?? [], "cash_out");
  const refundLak = amount(refunds._sum.totalAmount);
  const voidCashLak = Math.round(
    cancelledSales.reduce((total: number, sale: Record<string, any>) => {
      const cashPayments = summarizeSalePayments(sale.payments ?? []);
      return total + cashPayments.cashSalesLak;
    }, 0),
  );

  return buildCashSessionTotals({
    cashInLak,
    cashOutLak,
    cashSalesLak: paymentTotals.cashSalesLak,
    nonCashSalesLak: paymentTotals.nonCashSalesLak,
    openingCashLak: amount(session.openingCash),
    refundLak,
    voidCashLak,
  });
}

async function getScopedSession(
  tx: Record<string, any>,
  tenant: TenantContext,
  sessionId: string,
  options?: { allowClosed?: boolean; requireOwner?: boolean },
) {
  const scope = await resolveTenantScope(tenant, tx);
  const session = await tx.cashSession.findFirst({
    include: { transactions: true },
    where: {
      companyId: tenant.companyId,
      id: sessionId,
      ...branchOwnedWhere(scope),
    },
  });

  if (!session) {
    throw new Error("Cash session was not found.");
  }

  if (!options?.allowClosed && session.closedAt) {
    throw new Error("Cash session is already closed.");
  }

  if (options?.requireOwner !== false && session.cashierId !== tenant.userId) {
    throw new PermissionDeniedError("pos.cash_session.manage");
  }

  return session;
}

export async function getOpenCashSession(tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const session = await db.cashSession.findFirst({
    include: { transactions: true },
    orderBy: { openedAt: "desc" },
    where: {
      branchId: scope.branchId,
      cashierId: tenant.userId,
      closedAt: null,
      companyId: tenant.companyId,
    },
  });

  if (!session) {
    return null;
  }

  const totals = await loadSessionTotals(db, session);
  return mapSessionSummary(session, totals);
}

export async function getCashSessionById(sessionId: string, tenant: TenantContext) {
  const scope = await resolveTenantScope(tenant);
  const session = await db.cashSession.findFirst({
    include: { transactions: true },
    where: {
      companyId: tenant.companyId,
      id: sessionId,
      ...branchOwnedWhere(scope),
    },
  });

  if (!session) {
    return null;
  }

  const totals = await loadSessionTotals(db, session, session.closedAt ?? new Date());
  return mapSessionSummary(session, totals);
}

export async function openCashSession(input: OpenCashSessionInput, tenant: TenantContext) {
  const openingCashLak = numberValue(input.openingCashLak);
  if (openingCashLak < 0) {
    throw new Error("Opening cash cannot be negative.");
  }

  return withTenantTransaction({
    action: "open",
    module: "cash_sessions",
    newData: input,
    tenant,
    write: async (tx) => {
      const scope = await resolveTenantScope(tenant, tx);
      const existing = await tx.cashSession.findFirst({
        where: {
          branchId: scope.branchId,
          cashierId: tenant.userId,
          closedAt: null,
          companyId: tenant.companyId,
        },
      });

      if (existing) {
        throw new Error("An open cash session already exists for this cashier.");
      }

      const session = await tx.cashSession.create({
        data: {
          branchId: scope.branchId,
          cashierId: tenant.userId,
          companyId: tenant.companyId,
          openingCash: openingCashLak,
        },
        include: { transactions: true },
      });

      const totals = await loadSessionTotals(tx, session);
      return mapSessionSummary(session, totals);
    },
  });
}

export async function recordCashSessionMovement(
  sessionId: string,
  type: "cash_in" | "cash_out",
  input: CashMovementInput,
  tenant: TenantContext,
) {
  const movementAmount = numberValue(input.amountLak);
  if (movementAmount <= 0) {
    throw new Error("Cash movement amount must be greater than zero.");
  }

  if (type === "cash_out" && !String(input.reason ?? "").trim()) {
    throw new Error("Cash out reason is required.");
  }

  return withTenantTransaction({
    action: type,
    module: "cash_sessions",
    newData: { sessionId, type, ...input },
    tenant,
    write: async (tx) => {
      const session = await getScopedSession(tx, tenant, sessionId);
      await tx.cashTransaction.create({
        data: {
          amount: movementAmount,
          companyId: tenant.companyId,
          createdBy: tenant.userId,
          reason: input.reason ?? null,
          sessionId: session.id,
          transactionType: type,
        },
      });

      const refreshed = await tx.cashSession.findFirstOrThrow({
        include: { transactions: true },
        where: { id: session.id },
      });
      const totals = await loadSessionTotals(tx, refreshed);
      return mapSessionSummary(refreshed, totals);
    },
  });
}

export async function closeCashSession(
  sessionId: string,
  input: CloseCashSessionInput,
  tenant: TenantContext,
) {
  const countedCashLak = numberValue(input.countedCashLak);
  if (countedCashLak < 0) {
    throw new Error("Counted cash cannot be negative.");
  }

  return withTenantTransaction({
    action: "close",
    module: "cash_sessions",
    newData: { sessionId, ...input },
    tenant,
    write: async (tx) => {
      const session = await getScopedSession(tx, tenant, sessionId);
      const closedAt = new Date();
      const totals = await loadSessionTotals(tx, session, closedAt);
      const expectedCashLak = calculateExpectedCash(totals);
      const varianceLak = calculateVariance(countedCashLak, expectedCashLak);

      const closed = await tx.cashSession.update({
        data: {
          cashDifference: varianceLak,
          closedAt,
          closingCash: countedCashLak,
          expectedCash: expectedCashLak,
        },
        include: { transactions: true },
        where: { id: session.id },
      });

      return mapSessionSummary(closed, {
        ...totals,
        expectedCashLak,
      });
    },
  });
}

export async function computeCashSessionTotalsForShift(
  session: Record<string, any>,
  endAt = new Date(),
) {
  return loadSessionTotals(db, session, endAt);
}

export async function assertOpenCashSessionForSale(tenant: TenantContext, tx: Record<string, any>) {
  const scope = await resolveTenantScope(tenant, tx);
  const session = await tx.cashSession.findFirst({
    where: {
      branchId: scope.branchId,
      cashierId: tenant.userId,
      closedAt: null,
      companyId: tenant.companyId,
    },
  });

  if (!session) {
    throw new Error("An open cash session is required before completing a sale.");
  }

  return session;
}
