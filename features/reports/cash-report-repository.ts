/**
 * R7B Cash Shift Count + Cash In/Out repositories.
 * One closing count per CashSession (no multi-count event table).
 * Cash movements always link via CashTransaction.sessionId.
 */
import { prisma } from "@/lib/db/prisma";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import { computeCashSessionTotalsForShifts } from "@/features/cash-sessions/prisma-repository";
import { parseCashSessionCountBreakdown } from "@/features/cash-sessions/denominations";
import type { CashSessionCountBreakdown } from "@/features/cash-sessions/types";
import {
  CASH_REPORT_PAGE_SIZE,
  CASH_REPORT_SCAN_LIMIT,
  cashCountTotalFromSummary,
  cashMovementTotalFromSummary,
  emptyCashCountSummary,
  emptyCashMovementSummary,
  moneyLak,
  resolveCountVariance,
  summarizeCashCountRows,
  summarizeCashMovements,
  type CashCountSummary,
  type CashCountTotalRow,
  type CashMovementSummary,
  type CashMovementTotalRow,
  type ShiftVarianceKind,
} from "@/features/reports/cash-report-math";
import {
  resolveCashReportRange,
  type CashCountTableQuery,
  type CashMovementTableQuery,
} from "@/features/reports/cash-report-query";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

export type CashLoadOptions = { allRows?: boolean };

export type CashCountRow = {
  branchId: string;
  branchName: string;
  countedAt: string | null;
  countedById: string;
  countedByName: string;
  countedCashLak: number | null;
  expectedCashLak: number;
  hasDenominationBreakdown: boolean;
  id: string;
  note: string | null;
  status: "open" | "closed";
  terminalName: string | null;
  varianceKind: ShiftVarianceKind;
  varianceLak: number | null;
};

export type CashCountTableResult = {
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: CashCountTableQuery;
  rows: CashCountRow[];
  summary: CashCountSummary;
  totalRow: CashCountTotalRow;
};

export type CashMovementRow = {
  actorId: string | null;
  actorName: string;
  amountLak: number;
  branchId: string;
  branchName: string;
  createdAt: string;
  id: string;
  note: string | null;
  reason: string;
  reference: string | null;
  sessionId: string | null;
  terminalName: string | null;
  type: "cash_in" | "cash_out";
};

export type CashMovementTableResult = {
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: CashMovementTableQuery;
  rows: CashMovementRow[];
  summary: CashMovementSummary;
  totalRow: CashMovementTotalRow;
};

function clientOf(client?: any) {
  return client ?? db;
}

function clampBranch(scope: BranchScope, branchId?: string) {
  if (!scope.isOwner) return scope.branchId;
  if (branchId && scope.branchIds.includes(branchId)) return branchId;
  return undefined;
}

async function loadUserNames(client: any, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, string>();
  const users = await client.user.findMany({
    select: { fullName: true, id: true, username: true },
    where: { id: { in: unique } },
  });
  return new Map<string, string>(
    (users as Array<{ fullName?: string | null; id: string; username?: string | null }>).map((user) => [
      user.id,
      String(user.fullName || user.username || user.id),
    ]),
  );
}

function matchesVariance(kind: ShiftVarianceKind, filter: CashCountTableQuery["varianceStatus"]) {
  if (filter === "all") return true;
  return kind === filter;
}

function toDate(value: Date | string | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

export async function loadCashCountTable(
  tenant: TenantContext,
  query: CashCountTableQuery,
  client?: any,
  options?: CashLoadOptions,
): Promise<CashCountTableResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const branchId = clampBranch(scope, query.branchId);
  const range = resolveCashReportRange(query);

  const closedAtFilter: Record<string, Date> = {};
  const openedAtFilter: Record<string, Date> = {};
  const from = toDate(range.dateFrom);
  const to = toDate(range.dateTo);
  // Count report dates on closedAt when closed; open sessions use openedAt window.
  if (from) {
    closedAtFilter.gte = from;
    openedAtFilter.gte = from;
  }
  if (to) {
    closedAtFilter.lte = to;
    openedAtFilter.lte = to;
  }

  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(branchId ? { branchId } : { branchId: { in: scope.branchIds } }),
    ...(query.cashierId ? { cashierId: query.cashierId } : {}),
  };
  if (query.status === "open") {
    where.closedAt = null;
    if (Object.keys(openedAtFilter).length) where.openedAt = openedAtFilter;
  } else if (query.status === "closed") {
    where.closedAt = { not: null, ...(Object.keys(closedAtFilter).length ? closedAtFilter : {}) };
  } else if (Object.keys(closedAtFilter).length) {
    where.OR = [
      { closedAt: { not: null, ...closedAtFilter } },
      { closedAt: null, ...(Object.keys(openedAtFilter).length ? { openedAt: openedAtFilter } : {}) },
    ];
  }
  if (query.sessionQuery) {
    where.id = { contains: query.sessionQuery, mode: "insensitive" };
  }

  const sessions = await dbClient.cashSession.findMany({
    include: { branch: { select: { id: true, name: true } } },
    orderBy: [{ closedAt: "desc" }, { openedAt: "desc" }],
    take: CASH_REPORT_SCAN_LIMIT,
    where,
  });

  const byBranch = new Map<string, Array<{ endAt: Date; session: Record<string, any> }>>();
  for (const session of sessions as Array<Record<string, any>>) {
    const key = String(session.branchId);
    const list = byBranch.get(key) ?? [];
    list.push({
      endAt: session.closedAt ? new Date(session.closedAt) : new Date(),
      session,
    });
    byBranch.set(key, list);
  }

  const totalsById = new Map<string, Awaited<ReturnType<typeof computeCashSessionTotalsForShifts>> extends Map<string, infer V> ? V : never>();
  for (const [, group] of byBranch) {
    const groupTotals = await computeCashSessionTotalsForShifts(group, dbClient);
    for (const [id, totals] of groupTotals) totalsById.set(id, totals);
  }

  const names = await loadUserNames(
    dbClient,
    (sessions as Array<{ cashierId?: string }>).map((row) => String(row.cashierId ?? "")),
  );

  const mapped: CashCountRow[] = [];
  for (const session of sessions as Array<Record<string, any>>) {
    const totals = totalsById.get(String(session.id));
    if (!totals) continue;
    const status = session.closedAt ? ("closed" as const) : ("open" as const);
    const expectedCashLak =
      session.expectedCash != null && status === "closed"
        ? moneyLak(session.expectedCash)
        : moneyLak(totals.expectedCashLak);
    const countedCashLak = session.closingCash == null ? null : moneyLak(session.closingCash);
    const variance = resolveCountVariance({
      closedAt: session.closedAt,
      countedCashLak,
      expectedCashLak,
      persistedVarianceLak: session.cashDifference == null ? null : moneyLak(session.cashDifference),
    });
    if (!matchesVariance(variance.kind, query.varianceStatus)) continue;

    let hasDenominationBreakdown = false;
    try {
      const breakdown = parseCashSessionCountBreakdown(session.countBreakdown);
      hasDenominationBreakdown = Boolean(breakdown?.closing && Object.keys(breakdown.closing).length);
    } catch {
      hasDenominationBreakdown = false;
    }

    mapped.push({
      branchId: String(session.branchId),
      branchName: String(session.branch?.name ?? "—"),
      countedAt: session.closedAt ? new Date(session.closedAt).toISOString() : null,
      countedById: String(session.cashierId),
      countedByName: names.get(String(session.cashierId)) || "Cashier",
      countedCashLak,
      expectedCashLak,
      hasDenominationBreakdown,
      id: String(session.id),
      note: null,
      status,
      terminalName: null,
      varianceKind: variance.kind,
      varianceLak: variance.varianceLak,
    });
  }

  const summary = mapped.length ? summarizeCashCountRows(mapped) : emptyCashCountSummary();
  const pageSize = CASH_REPORT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(mapped.length / pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const rows = options?.allRows ? mapped : mapped.slice((page - 1) * pageSize, page * pageSize);
  const filterOptions = await getReportFilterOptions(tenant, dbClient);

  return {
    filterOptions,
    page,
    pageCount,
    pageSize,
    query: { ...query, page },
    rows,
    summary,
    totalRow: cashCountTotalFromSummary(summary),
  };
}

export async function loadCashCountDetail(tenant: TenantContext, sessionId: string, client?: any) {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const session = await dbClient.cashSession.findFirst({
    include: { branch: { select: { id: true, name: true } } },
    where: {
      companyId: tenant.companyId,
      id: sessionId,
      branchId: { in: scope.branchIds },
    },
  });
  if (!session) return null;

  const totalsMap = await computeCashSessionTotalsForShifts(
    [{ endAt: session.closedAt ? new Date(session.closedAt) : new Date(), session }],
    dbClient,
  );
  const totals = totalsMap.get(String(session.id));
  if (!totals) return null;
  const names = await loadUserNames(dbClient, [String(session.cashierId)]);
  const expectedCashLak =
    session.expectedCash != null && session.closedAt
      ? moneyLak(session.expectedCash)
      : moneyLak(totals.expectedCashLak);
  const countedCashLak = session.closingCash == null ? null : moneyLak(session.closingCash);
  const variance = resolveCountVariance({
    closedAt: session.closedAt,
    countedCashLak,
    expectedCashLak,
    persistedVarianceLak: session.cashDifference == null ? null : moneyLak(session.cashDifference),
  });

  let countBreakdown: CashSessionCountBreakdown | null = null;
  try {
    countBreakdown = parseCashSessionCountBreakdown(session.countBreakdown);
  } catch {
    countBreakdown = null;
  }

  return {
    branchName: String(session.branch?.name ?? "—"),
    countBreakdown,
    countedAt: session.closedAt ? new Date(session.closedAt).toISOString() : null,
    countedByName: names.get(String(session.cashierId)) || "Cashier",
    countedCashLak,
    expectedCashLak,
    id: String(session.id),
    note: null as string | null,
    status: session.closedAt ? ("closed" as const) : ("open" as const),
    terminalName: null as string | null,
    varianceKind: variance.kind,
    varianceLak: variance.varianceLak,
  };
}

export async function loadCashMovementTable(
  tenant: TenantContext,
  query: CashMovementTableQuery,
  client?: any,
  options?: CashLoadOptions,
): Promise<CashMovementTableResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const branchId = clampBranch(scope, query.branchId);
  const range = resolveCashReportRange(query);
  const from = toDate(range.dateFrom);
  const to = toDate(range.dateTo);

  const sessionWhere: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(branchId ? { branchId } : { branchId: { in: scope.branchIds } }),
  };
  if (query.sessionQuery) {
    sessionWhere.id = { contains: query.sessionQuery, mode: "insensitive" };
  }

  const createdAt: Record<string, Date> = {};
  if (from) createdAt.gte = from;
  if (to) createdAt.lte = to;

  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    session: sessionWhere,
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(query.type !== "all" ? { transactionType: query.type } : {}),
    ...(query.actorId ? { createdBy: query.actorId } : {}),
    ...(query.reasonQuery
      ? { reason: { contains: query.reasonQuery, mode: "insensitive" } }
      : {}),
  };
  if (query.amountMin != null || query.amountMax != null) {
    where.amount = {
      ...(query.amountMin != null ? { gte: query.amountMin } : {}),
      ...(query.amountMax != null ? { lte: query.amountMax } : {}),
    };
  }

  const rowsRaw = await dbClient.cashTransaction.findMany({
    include: {
      session: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: CASH_REPORT_SCAN_LIMIT,
    where,
  });

  const names = await loadUserNames(
    dbClient,
    (rowsRaw as Array<{ createdBy?: string | null }>).map((row) => String(row.createdBy ?? "")),
  );

  const mapped: CashMovementRow[] = (rowsRaw as Array<Record<string, any>>).map((row) => ({
    actorId: row.createdBy ? String(row.createdBy) : null,
    actorName: row.createdBy ? names.get(String(row.createdBy)) || "User" : "—",
    amountLak: moneyLak(row.amount),
    branchId: String(row.session?.branchId ?? ""),
    branchName: String(row.session?.branch?.name ?? "—"),
    createdAt: new Date(row.createdAt).toISOString(),
    id: String(row.id),
    note: null,
    reason: row.reason ? String(row.reason) : "",
    reference: null,
    sessionId: row.sessionId ? String(row.sessionId) : null,
    terminalName: null,
    type: String(row.transactionType) === "cash_out" ? ("cash_out" as const) : ("cash_in" as const),
  }));

  const summary = mapped.length ? summarizeCashMovements(mapped) : emptyCashMovementSummary();
  const pageSize = CASH_REPORT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(mapped.length / pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const rows = options?.allRows ? mapped : mapped.slice((page - 1) * pageSize, page * pageSize);
  const filterOptions = await getReportFilterOptions(tenant, dbClient);

  return {
    filterOptions,
    page,
    pageCount,
    pageSize,
    query: { ...query, page },
    rows,
    summary,
    totalRow: cashMovementTotalFromSummary(summary),
  };
}

export async function loadCashMovementDetail(tenant: TenantContext, movementId: string, client?: any) {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const row = await dbClient.cashTransaction.findFirst({
    include: {
      session: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
    where: {
      companyId: tenant.companyId,
      id: movementId,
      session: { branchId: { in: scope.branchIds } },
    },
  });
  if (!row) return null;
  const names = await loadUserNames(dbClient, [String(row.createdBy ?? "")]);
  return {
    actorName: row.createdBy ? names.get(String(row.createdBy)) || "User" : "—",
    amountLak: moneyLak(row.amount),
    branchName: String(row.session?.branch?.name ?? "—"),
    createdAt: new Date(row.createdAt).toISOString(),
    id: String(row.id),
    note: null as string | null,
    reason: row.reason ? String(row.reason) : "",
    reference: null as string | null,
    sessionId: row.sessionId ? String(row.sessionId) : null,
    terminalName: null as string | null,
    type: String(row.transactionType) === "cash_out" ? ("cash_out" as const) : ("cash_in" as const),
  };
}
