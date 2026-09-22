import { prisma } from "@/lib/db/prisma";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import { computeCashSessionTotalsForShifts } from "@/features/cash-sessions/prisma-repository";
import { parseCashSessionCountBreakdown } from "@/features/cash-sessions/denominations";
import type { CashSessionCountBreakdown } from "@/features/cash-sessions/types";
import {
  emptyShiftTableSummary,
  moneyLak,
  resolveShiftVariance,
  SHIFT_TABLE_PAGE_SIZE,
  SHIFT_TABLE_SCAN_LIMIT,
  summarizeShiftRows,
  totalRowFromSummary,
  type ShiftTableSummary,
  type ShiftTableTotalRow,
  type ShiftVarianceKind,
} from "@/features/reports/shift-table-math";
import { resolveShiftTableRange, type ShiftTableQuery } from "@/features/reports/shift-table-query";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

export type ShiftLoadOptions = { allRows?: boolean; ownUserId?: string };

export type ShiftTableRow = {
  branchId: string;
  branchName: string;
  cashInLak: number;
  cashOutLak: number;
  cashRefundsLak: number;
  cashVoidsLak: number;
  cashierId: string;
  cashierName: string;
  closedAt: string | null;
  countedCashLak: number | null;
  expectedDrawerLak: number;
  grossCashSalesLak: number;
  id: string;
  openedAt: string;
  openingCashLak: number;
  status: "open" | "closed";
  terminalName: string | null;
  varianceKind: ShiftVarianceKind;
  varianceLak: number | null;
};

export type ShiftTableResult = {
  filterOptions: ReportFilterOptions;
  mode: "summary" | "own-history";
  page: number;
  pageCount: number;
  pageSize: number;
  query: ShiftTableQuery;
  rows: ShiftTableRow[];
  summary: ShiftTableSummary;
  totalRow: ShiftTableTotalRow;
};

function clientOf(client?: any) {
  return client ?? db;
}

function clampQuery(scope: BranchScope, query: ShiftTableQuery, ownUserId?: string): ShiftTableQuery {
  const next = { ...query };
  if (!scope.isOwner) {
    next.branchId = scope.branchId;
  } else if (next.branchId && !scope.branchIds.includes(next.branchId)) {
    next.branchId = scope.branchId;
  }
  if (ownUserId) {
    next.cashierId = ownUserId;
  }
  return next;
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

function matchesVarianceFilter(kind: ShiftVarianceKind, filter: ShiftTableQuery["varianceStatus"]) {
  if (filter === "all") return true;
  if (filter === "balanced") return kind === "balanced";
  if (filter === "over") return kind === "over";
  if (filter === "short") return kind === "short";
  if (filter === "open") return kind === "open";
  return true;
}

async function loadShiftTable(
  tenant: TenantContext,
  query: ShiftTableQuery,
  mode: "summary" | "own-history",
  client?: any,
  options?: ShiftLoadOptions,
): Promise<ShiftTableResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const ownUserId = mode === "own-history" ? options?.ownUserId ?? tenant.userId : undefined;
  const clamped = clampQuery(scope, query, ownUserId);
  const range = resolveShiftTableRange(clamped);
  const branchId = clamped.branchId ?? (scope.isOwner ? undefined : scope.branchId);

  const openedAtFilter: Record<string, Date> = {};
  if (range.dateFrom instanceof Date) openedAtFilter.gte = range.dateFrom;
  else if (typeof range.dateFrom === "string" && range.dateFrom) openedAtFilter.gte = new Date(range.dateFrom);
  if (range.dateTo instanceof Date) openedAtFilter.lte = range.dateTo;
  else if (typeof range.dateTo === "string" && range.dateTo) openedAtFilter.lte = new Date(range.dateTo);

  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(branchId ? { branchId } : { branchId: { in: scope.branchIds } }),
    ...(Object.keys(openedAtFilter).length ? { openedAt: openedAtFilter } : {}),
    ...(clamped.cashierId ? { cashierId: clamped.cashierId } : {}),
  };
  if (clamped.status === "open") where.closedAt = null;
  if (clamped.status === "closed") where.closedAt = { not: null };
  if (clamped.sessionQuery) {
    where.id = { contains: clamped.sessionQuery, mode: "insensitive" };
  }

  const sessions = await dbClient.cashSession.findMany({
    include: {
      branch: { select: { id: true, name: true } },
      transactions: true,
    },
    orderBy: { openedAt: "desc" },
    take: SHIFT_TABLE_SCAN_LIMIT,
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
    for (const [id, totals] of groupTotals) {
      totalsById.set(id, totals);
    }
  }

  const names = await loadUserNames(
    dbClient,
    (sessions as Array<{ cashierId?: string }>).map((row) => String(row.cashierId ?? "")),
  );

  const mapped: ShiftTableRow[] = [];
  for (const session of sessions as Array<Record<string, any>>) {
    const totals = totalsById.get(String(session.id));
    if (!totals) continue;
    const status = session.closedAt ? ("closed" as const) : ("open" as const);
    const expectedDrawerLak =
      session.expectedCash != null && status === "closed"
        ? moneyLak(session.expectedCash)
        : moneyLak(totals.expectedCashLak);
    const countedCashLak = session.closingCash == null ? null : moneyLak(session.closingCash);
    const variance = resolveShiftVariance({
      closedAt: session.closedAt,
      countedCashLak,
      expectedCashLak: expectedDrawerLak,
      persistedVarianceLak: session.cashDifference == null ? null : moneyLak(session.cashDifference),
    });
    if (!matchesVarianceFilter(variance.kind, clamped.varianceStatus)) continue;

    mapped.push({
      branchId: String(session.branchId),
      branchName: String(session.branch?.name ?? "—"),
      cashInLak: moneyLak(totals.cashInLak),
      cashOutLak: moneyLak(totals.cashOutLak),
      cashRefundsLak: moneyLak(totals.refundLak),
      cashVoidsLak: moneyLak(totals.voidCashLak),
      cashierId: String(session.cashierId),
      cashierName: names.get(String(session.cashierId)) || "Cashier",
      closedAt: session.closedAt ? new Date(session.closedAt).toISOString() : null,
      countedCashLak,
      expectedDrawerLak,
      grossCashSalesLak: moneyLak(totals.cashSalesLak),
      id: String(session.id),
      openedAt: new Date(session.openedAt).toISOString(),
      openingCashLak: moneyLak(session.openingCash ?? totals.openingCashLak),
      status,
      terminalName: null,
      varianceKind: variance.kind,
      varianceLak: variance.varianceLak,
    });
  }

  mapped.sort((left, right) => {
    const sign = clamped.dir === "asc" ? 1 : -1;
    return (new Date(left.openedAt).getTime() - new Date(right.openedAt).getTime()) * sign;
  });

  const summary = mapped.length ? summarizeShiftRows(mapped) : emptyShiftTableSummary();
  const openingCashTotal = mapped.reduce((sum, row) => sum + row.openingCashLak, 0);
  const pageSize = SHIFT_TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(mapped.length / pageSize));
  const page = Math.min(Math.max(1, clamped.page), pageCount);
  const rows = options?.allRows ? mapped : mapped.slice((page - 1) * pageSize, page * pageSize);
  const filterOptions = await getReportFilterOptions(tenant, dbClient);

  return {
    filterOptions,
    mode,
    page,
    pageCount,
    pageSize,
    query: { ...clamped, page },
    rows,
    summary,
    totalRow: totalRowFromSummary(summary, openingCashTotal),
  };
}

export async function loadShiftSummaryTable(
  tenant: TenantContext,
  query: ShiftTableQuery,
  client?: any,
  options?: ShiftLoadOptions,
) {
  return loadShiftTable(tenant, query, "summary", client, options);
}

export async function loadOwnShiftHistoryTable(
  tenant: TenantContext,
  query: ShiftTableQuery,
  client?: any,
  options?: ShiftLoadOptions,
) {
  // Hard force authenticated user — ignore caller-supplied cashierId.
  return loadShiftTable(tenant, query, "own-history", client, {
    ...options,
    ownUserId: tenant.userId,
  });
}

export async function loadShiftDetail(
  tenant: TenantContext,
  shiftId: string,
  options?: { ownOnly?: boolean },
  client?: any,
) {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const session = await dbClient.cashSession.findFirst({
    include: {
      branch: { select: { id: true, name: true } },
      transactions: { orderBy: { createdAt: "asc" } },
    },
    where: {
      companyId: tenant.companyId,
      id: shiftId,
      branchId: { in: scope.branchIds },
      ...(options?.ownOnly ? { cashierId: tenant.userId } : {}),
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
  const expectedDrawerLak =
    session.expectedCash != null && session.closedAt
      ? moneyLak(session.expectedCash)
      : moneyLak(totals.expectedCashLak);
  const countedCashLak = session.closingCash == null ? null : moneyLak(session.closingCash);
  const variance = resolveShiftVariance({
    closedAt: session.closedAt,
    countedCashLak,
    expectedCashLak: expectedDrawerLak,
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
    cashInLak: moneyLak(totals.cashInLak),
    cashOutLak: moneyLak(totals.cashOutLak),
    cashRefundsLak: moneyLak(totals.refundLak),
    cashVoidsLak: moneyLak(totals.voidCashLak),
    cashierName: names.get(String(session.cashierId)) || "Cashier",
    closedAt: session.closedAt ? new Date(session.closedAt).toISOString() : null,
    countBreakdown,
    countedCashLak,
    expectedDrawerLak,
    grossCashSalesLak: moneyLak(totals.cashSalesLak),
    id: String(session.id),
    movements: (session.transactions ?? []).map((row: Record<string, any>) => ({
      amountLak: moneyLak(row.amount),
      createdAt: new Date(row.createdAt).toISOString(),
      reason: row.reason ? String(row.reason) : "",
      type: String(row.transactionType ?? ""),
    })),
    openedAt: new Date(session.openedAt).toISOString(),
    openingCashLak: moneyLak(session.openingCash ?? totals.openingCashLak),
    status: session.closedAt ? ("closed" as const) : ("open" as const),
    terminalName: null as string | null,
    varianceKind: variance.kind,
    varianceLak: variance.varianceLak,
  };
}
