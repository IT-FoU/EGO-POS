import { prisma } from "@/lib/db/prisma";
import {
  aggregateCashSessionLedger,
  assertCashOutWithinExpected,
  buildCashSessionTotals,
  calculateExpectedCash,
  calculateVariance,
  cashSessionLedgerLockKey,
} from "@/features/cash-sessions/cash-session-calculator";
import { CASH_SESSION_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import {
  assertDenominationTotalMatches,
  mergeClosingCountBreakdown,
  parseCashSessionCountBreakdown,
  parseDenominationCountMap,
} from "@/features/cash-sessions/denominations";
import type {
  CashMovementInput,
  CashSessionCountBreakdown,
  CashSessionSummary,
  CloseCashSessionInput,
  OpenCashSessionInput,
} from "@/features/cash-sessions/types";
import {
  assertOpenAttendanceForSale,
  createOpenAttendanceInTx,
} from "@/features/attendance/prisma-repository";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";
import { numberValue, withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function lockCashSessionLedger(tx: Record<string, any>, sessionId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cashSessionLedgerLockKey(sessionId)}))`;
}

function readCountBreakdown(raw: unknown): CashSessionCountBreakdown | null {
  try {
    return parseCashSessionCountBreakdown(raw);
  } catch {
    return null;
  }
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
    countBreakdown: readCountBreakdown(session.countBreakdown),
    countedCashLak,
    expectedCashLak,
    id: session.id,
    openedAt: new Date(session.openedAt).toISOString(),
    status: session.closedAt ? "closed" : "open",
    varianceLak,
  };
}

function totalsFromLoadedSessionRows(
  session: Record<string, any>,
  payments: Array<{ amount: unknown; changeAmount?: unknown; paymentMethod: string }>,
  refundRows: Array<Record<string, any>>,
  voidedPayments: Array<{ amount: unknown; changeAmount?: unknown; paymentMethod: string }> = [],
) {
  // Gross cash: qualifying sales (including refunded) + voided cash so formula can subtract voidCashLak explicitly.
  return aggregateCashSessionLedger({
    openingCashLak: amount(session.openingCash),
    payments,
    refundRows,
    transactions: session.transactions ?? [],
    voidedPayments,
  });
}

function parseSalePaymentJson(value: unknown): Array<{ amount: unknown; changeAmount?: unknown; paymentMethod: string }> {
  if (value == null) {
    return [];
  }
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((row) => ({
      amount: row?.amount,
      changeAmount: row?.changeAmount,
      paymentMethod: String(row?.paymentMethod ?? "cash"),
    }));
  } catch {
    return [];
  }
}

function inSessionWindow(value: Date, openedAt: Date, endAt: Date) {
  return value.getTime() >= openedAt.getTime() && value.getTime() <= endAt.getTime();
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

  const [payments, refundRows, voidedPayments] = await Promise.all([
    tx.salePayment.findMany({
      select: { amount: true, changeAmount: true, paymentMethod: true },
      where: {
        sale: {
          ...saleWindow,
          saleStatus: { in: [...CASH_SESSION_SALE_STATUSES] },
        },
      },
    }),
    tx.refund.findMany({
      include: { sale: { include: { payments: true } } },
      where: {
        companyId: session.companyId,
        createdAt: { gte: openedAt, lte: endAt },
        createdBy: session.cashierId,
      },
    }),
    tx.salePayment.findMany({
      select: { amount: true, changeAmount: true, paymentMethod: true },
      where: {
        sale: {
          ...saleWindow,
          saleStatus: "cancelled",
        },
      },
    }),
  ]);

  return totalsFromLoadedSessionRows(session, payments, refundRows as Array<Record<string, any>>, voidedPayments);
}

export async function computeCashSessionTotalsForShifts(
  shifts: Array<{ endAt?: Date; session: Record<string, any> }>,
  client: any = db,
) {
  const totals = new Map<string, ReturnType<typeof buildCashSessionTotals>>();
  if (shifts.length === 0) {
    return totals;
  }

  const companyId = String(shifts[0].session.companyId);
  const branchId = String(shifts[0].session.branchId);
  const cashierIds = Array.from(new Set(shifts.map((shift) => String(shift.session.cashierId))));
  const windows = shifts.map((shift) => ({
    cashierId: String(shift.session.cashierId),
    endAt: shift.endAt ?? new Date(),
    openedAt: new Date(shift.session.openedAt),
    session: shift.session,
  }));
  const minOpened = new Date(Math.min(...windows.map((window) => window.openedAt.getTime())));
  const maxEnd = new Date(Math.max(...windows.map((window) => window.endAt.getTime())));

  type CashTotalRow = {
    amount: unknown;
    changeAmount: unknown;
    kind: string | null;
    paymentAmount: unknown;
    paymentMethod: string | null;
    refundAmount: unknown;
    refundCreatedAt: Date | string | null;
    refundCreatedBy: string | null;
    refundId: string | null;
    refundMethod: string | null;
    rowKind: string;
    saleCreatedAt: Date | string | null;
    saleCreatedBy: string | null;
    salePayments: unknown;
    saleStatus: string | null;
    saleTotalAmount: unknown;
    totalAmount: unknown;
  };
  const rows = await client.$queryRaw<CashTotalRow[]>`
    SELECT
      'payment' AS "rowKind",
      sp.amount,
      sp.change_amount AS "changeAmount",
      sp.payment_method::text AS "paymentMethod",
      s.created_at AS "saleCreatedAt",
      s.created_by AS "saleCreatedBy",
      s.sale_status::text AS "saleStatus",
      s.total_amount AS "saleTotalAmount",
      NULL::timestamptz AS "refundCreatedAt",
      NULL::text AS "refundCreatedBy",
      NULL::text AS "refundId",
      NULL::text AS kind,
      NULL::numeric AS "paymentAmount",
      NULL::numeric AS "refundAmount",
      NULL::text AS "refundMethod",
      NULL::numeric AS "totalAmount",
      NULL::json AS "salePayments"
    FROM sale_payments sp
    JOIN sales s ON s.id = sp.sale_id
    WHERE s.company_id = ${companyId}
      AND s.branch_id = ${branchId}
      AND s.created_at >= ${minOpened}
      AND s.created_at <= ${maxEnd}
      AND s.created_by = ANY(${cashierIds})
      AND s.sale_status::text IN ('completed', 'partial_refunded', 'exchanged', 'adjusted', 'cancelled', 'refunded')
    UNION ALL
    SELECT
      'refund' AS "rowKind",
      NULL::numeric,
      NULL::numeric,
      NULL::text,
      NULL::timestamptz,
      NULL::text,
      s.sale_status::text,
      s.total_amount,
      r.created_at,
      r.created_by,
      r.id,
      r.kind::text,
      r.payment_amount,
      r.refund_amount,
      r.refund_method::text,
      r.total_amount,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'amount', sp.amount,
          'changeAmount', sp.change_amount,
          'paymentMethod', sp.payment_method
        )), '[]'::json)
        FROM sale_payments sp
        WHERE sp.sale_id = r.sale_id
      )
    FROM refunds r
    JOIN sales s ON s.id = r.sale_id
    WHERE r.company_id = ${companyId}
      AND r.created_at >= ${minOpened}
      AND r.created_at <= ${maxEnd}
      AND r.created_by = ANY(${cashierIds})
  `;

  for (const window of windows) {
    const windowPaymentRows = (rows as CashTotalRow[])
      .filter((row: CashTotalRow) => (
        row.rowKind === "payment"
        && String(row.saleCreatedBy ?? "") === window.cashierId
        && row.saleCreatedAt
        && inSessionWindow(new Date(row.saleCreatedAt), window.openedAt, window.endAt)
      ));
    const payments = windowPaymentRows
      .filter((row: CashTotalRow) => row.saleStatus !== "cancelled")
      .map((row: CashTotalRow) => ({
        amount: row.amount,
        changeAmount: row.changeAmount,
        paymentMethod: String(row.paymentMethod ?? "cash"),
      }));
    const voidedPayments = windowPaymentRows
      .filter((row: CashTotalRow) => row.saleStatus === "cancelled")
      .map((row: CashTotalRow) => ({
        amount: row.amount,
        changeAmount: row.changeAmount,
        paymentMethod: String(row.paymentMethod ?? "cash"),
      }));
    const refundRows = (rows as CashTotalRow[])
      .filter((row: CashTotalRow) => (
        row.rowKind === "refund"
        && String(row.refundCreatedBy ?? "") === window.cashierId
        && row.refundCreatedAt
        && inSessionWindow(new Date(row.refundCreatedAt), window.openedAt, window.endAt)
      ))
      .map((row: CashTotalRow) => ({
        id: row.refundId,
        kind: row.kind,
        paymentAmount: row.paymentAmount,
        refundAmount: row.refundAmount,
        refundMethod: row.refundMethod,
        sale: {
          payments: parseSalePaymentJson(row.salePayments),
          saleStatus: row.saleStatus,
          totalAmount: row.saleTotalAmount,
        },
        totalAmount: row.totalAmount,
      }));
    totals.set(String(window.session.id), totalsFromLoadedSessionRows(window.session, payments, refundRows, voidedPayments));
  }

  return totals;
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

export async function getOpenCashSession(
  tenant: TenantContext,
  options?: { client?: any; scope?: BranchScope },
) {
  const client = options?.client ?? db;
  const scope = options?.scope ?? (await resolveTenantScope(tenant, client));
  const session = await client.cashSession.findFirst({
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

  const totals = await loadSessionTotals(client, session);
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

  let openingBreakdown: ReturnType<typeof parseDenominationCountMap> | undefined;
  if (input.countBreakdown?.opening !== undefined) {
    openingBreakdown = parseDenominationCountMap(input.countBreakdown.opening, "Opening");
    assertDenominationTotalMatches(openingBreakdown, openingCashLak, "Opening");
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
          ...(openingBreakdown
            ? { countBreakdown: { opening: openingBreakdown } }
            : {}),
          openingCash: openingCashLak,
        },
        include: { transactions: true },
      });

      // R9A: Start Work must create attendance in the same transaction as cash open.
      await createOpenAttendanceInTx(tx, tenant, {
        branchId: scope.branchId,
        cashSessionId: session.id,
        note: input.note,
        startedAt: session.openedAt ? new Date(session.openedAt) : new Date(),
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
      await lockCashSessionLedger(tx, sessionId);
      const session = await getScopedSession(tx, tenant, sessionId);
      if (type === "cash_out") {
        const currentTotals = await loadSessionTotals(tx, session);
        assertCashOutWithinExpected(movementAmount, currentTotals.expectedCashLak);
      }
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

  let closingBreakdown: ReturnType<typeof parseDenominationCountMap> | undefined;
  if (input.countBreakdown?.closing !== undefined) {
    closingBreakdown = parseDenominationCountMap(input.countBreakdown.closing, "Closing");
    assertDenominationTotalMatches(closingBreakdown, countedCashLak, "Closing");
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

      const countBreakdown =
        closingBreakdown !== undefined
          ? mergeClosingCountBreakdown(session.countBreakdown, closingBreakdown)
          : undefined;

      const closed = await tx.cashSession.update({
        data: {
          cashDifference: varianceLak,
          closedAt,
          closingCash: countedCashLak,
          ...(countBreakdown ? { countBreakdown } : {}),
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
  client: any = db,
) {
  return loadSessionTotals(client, session, endAt);
}

async function findOpenCashSessionForCashier(tenant: TenantContext, tx: Record<string, any>) {
  const scope = await resolveTenantScope(tenant, tx);
  return tx.cashSession.findFirst({
    where: {
      branchId: scope.branchId,
      cashierId: tenant.userId,
      closedAt: null,
      companyId: tenant.companyId,
    },
  });
}

export async function assertOpenCashSessionForSale(tenant: TenantContext, tx: Record<string, any>) {
  const session = await findOpenCashSessionForCashier(tenant, tx);

  if (!session) {
    throw new Error("An open cash session is required before completing a sale.");
  }

  await assertOpenAttendanceForSale(tenant, tx, session.id);

  return session;
}

/** Cash refund / cash exchange drawer movement — never reuse the sale-completion message. */
export async function assertOpenCashSessionForCashRefund(tenant: TenantContext, tx: Record<string, any>) {
  const session = await findOpenCashSessionForCashier(tenant, tx);

  if (!session) {
    throw new Error("An open cash session is required before processing a cash refund.");
  }

  return session;
}

export async function assertOpenCashSessionForCashExchange(tenant: TenantContext, tx: Record<string, any>) {
  const session = await findOpenCashSessionForCashier(tenant, tx);

  if (!session) {
    throw new Error("An open cash session is required before processing a cash exchange.");
  }

  return session;
}
