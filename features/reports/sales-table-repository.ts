import { prisma } from "@/lib/db/prisma";
import { REPORT_SALE_STATUSES } from "@/features/pos/post-sale-shared";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import {
  addSalesTableSummaries,
  accumulatePaymentMethod,
  computeSaleReportMetrics,
  emptyPaymentMethodTotals,
  emptySalesTableSummary,
  isCardPaymentMethod,
  moneyLak,
  netTenderLak,
  paymentMethodsOnSale,
  summarizeSaleMetrics,
  SALES_TABLE_PAGE_SIZE,
  SALES_TABLE_SCAN_LIMIT,
  type PaymentMethodTotals,
  type SaleReportFacts,
  type SaleReportPaymentFact,
  type SalesTableSummary,
} from "@/features/reports/sales-table-math";
import {
  resolveSalesTableRange,
  type SalesTableQuery,
} from "@/features/reports/sales-table-query";
import {
  businessDayLabel,
  businessMonthLabel,
  endOfBusinessMonth,
  startOfBusinessMonth,
} from "@/lib/datetime/business-timezone";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

function clampSalesTableQuery(scope: BranchScope, query: SalesTableQuery): SalesTableQuery {
  const next = { ...query };
  if (!scope.isOwner) {
    next.branchId = scope.branchId;
  } else if (next.branchId && !scope.branchIds.includes(next.branchId)) {
    next.branchId = scope.branchId;
  }
  return next;
}

function buildSalesTableWhere(scope: BranchScope, query: SalesTableQuery, options?: { ignorePaymentMethod?: boolean }) {
  const range = resolveSalesTableRange(query);
  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    branchId: query.branchId ?? scope.branchId,
    saleStatus: query.status ? query.status : { in: [...REPORT_SALE_STATUSES, "cancelled"] },
  };
  if (range.dateFrom || range.dateTo) {
    where.createdAt = {
      ...(range.dateFrom ? { gte: range.dateFrom instanceof Date ? range.dateFrom : new Date(range.dateFrom) } : {}),
      ...(range.dateTo ? { lte: range.dateTo instanceof Date ? range.dateTo : new Date(range.dateTo) } : {}),
    };
  }
  if (query.cashierId) where.createdBy = query.cashierId;
  if (query.paymentMethod && !options?.ignorePaymentMethod) {
    where.payments = { some: { paymentMethod: query.paymentMethod } };
  }
  if (query.receiptQuery) {
    where.OR = [
      { receiptNo: { contains: query.receiptQuery, mode: "insensitive" } },
      { saleNo: { contains: query.receiptQuery, mode: "insensitive" } },
    ];
  }
  return where;
}

const saleFactSelect = {
  createdAt: true,
  createdBy: true,
  discountAmount: true,
  id: true,
  items: { select: { costPrice: true, id: true, profitAmount: true, quantity: true } },
  payments: { select: { amount: true, changeAmount: true, paymentMethod: true } },
  profitAmount: true,
  receiptNo: true,
  refunds: {
    select: {
      exchangeItems: { select: { costPrice: true, productId: true, quantity: true, totalAmount: true } },
      items: { select: { amount: true, productId: true, quantity: true, saleItemId: true } },
      kind: true,
      paymentAmount: true,
      refundAmount: true,
      totalAmount: true,
    },
  },
  saleNo: true,
  saleStatus: true,
  totalAmount: true,
} as const;

function mapSaleFact(row: Record<string, any>): SaleReportFacts {
  return {
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    createdBy: String(row.createdBy ?? ""),
    discountAmount: row.discountAmount,
    id: String(row.id),
    items: (row.items ?? []).map((item: Record<string, any>) => ({
      costPrice: item.costPrice,
      id: String(item.id),
      profitAmount: item.profitAmount,
      quantity: item.quantity,
    })),
    payments: (row.payments ?? []).map((payment: Record<string, any>) => ({
      amount: payment.amount,
      changeAmount: payment.changeAmount,
      paymentMethod: String(payment.paymentMethod ?? "cash"),
    })),
    profitAmount: row.profitAmount,
    receiptNo: row.receiptNo ? String(row.receiptNo) : null,
    refunds: row.refunds ?? [],
    saleNo: String(row.saleNo ?? ""),
    saleStatus: String(row.saleStatus ?? ""),
    totalAmount: row.totalAmount,
  };
}

async function loadCashierNames(client: any, userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  const users = await client.user.findMany({
    select: { fullName: true, id: true, username: true },
    where: { id: { in: unique } },
  });
  return new Map<string, string>(
    users.map((user: { fullName?: string | null; id: string; username?: string | null }) => [
      user.id,
      String(user.fullName || user.username || "Cashier"),
    ]),
  );
}

async function loadSaleFacts(
  scope: BranchScope,
  query: SalesTableQuery,
  client: any,
): Promise<{ cashiers: Map<string, string>; sales: SaleReportFacts[] }> {
  const where = buildSalesTableWhere(scope, query);
  const count = await client.sale.count({ where });
  if (count > SALES_TABLE_SCAN_LIMIT) {
    throw new Error("SALES_TABLE_TOO_LARGE");
  }
  const rows = await client.sale.findMany({
    orderBy: { createdAt: "desc" },
    select: saleFactSelect,
    where,
  });
  const sales = rows.map(mapSaleFact);
  const cashiers = await loadCashierNames(client, sales.map((sale: SaleReportFacts) => sale.createdBy));
  return { cashiers, sales };
}

function receiptLabel(sale: SaleReportFacts) {
  return sale.receiptNo || sale.saleNo;
}

export type DailySalesTableRow = {
  cashierName: string;
  costLak: number;
  createdAt: string;
  discountLak: number;
  grossLak: number;
  id: string;
  items: number;
  netLak: number;
  paymentMethods: string[];
  profitLak: number;
  receipt: string;
  refundLak: number;
  status: string;
  voidLak: number;
};

export type DailySalesTableResult = {
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: SalesTableQuery;
  rows: DailySalesTableRow[];
  showCostProfit: boolean;
  summary: SalesTableSummary;
  totalRow: DailySalesTableRow;
  truncated: boolean;
};

function compareDailyRows(left: DailySalesTableRow, right: DailySalesTableRow, sort?: string, dir: "asc" | "desc" = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const numeric = (a: number, b: number) => (a - b) * sign;
  switch (sort) {
    case "receipt":
      return left.receipt.localeCompare(right.receipt) * sign;
    case "cashier":
      return left.cashierName.localeCompare(right.cashierName) * sign;
    case "items":
      return numeric(left.items, right.items);
    case "gross":
      return numeric(left.grossLak, right.grossLak);
    case "discount":
      return numeric(left.discountLak, right.discountLak);
    case "refund":
      return numeric(left.refundLak, right.refundLak);
    case "void":
      return numeric(left.voidLak, right.voidLak);
    case "net":
      return numeric(left.netLak, right.netLak);
    case "payment":
      return left.paymentMethods.join("+").localeCompare(right.paymentMethods.join("+")) * sign;
    case "cost":
      return numeric(left.costLak, right.costLak);
    case "profit":
      return numeric(left.profitLak, right.profitLak);
    case "status":
      return left.status.localeCompare(right.status) * sign;
    default:
      return (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * sign;
  }
}

export async function loadDailySalesTable(
  tenant: TenantContext,
  query: SalesTableQuery,
  client: any = db,
): Promise<DailySalesTableResult> {
  const scope = await resolveTenantScope(tenant, client);
  const clamped = clampSalesTableQuery(scope, query);
  const [facts, filterOptions] = await Promise.all([
    loadSaleFacts(scope, clamped, client),
    getReportFilterOptions(tenant, client),
  ]);
  const decorated = facts.sales.map((sale) => {
    const metrics = computeSaleReportMetrics(sale);
    const row: DailySalesTableRow = {
      cashierName: facts.cashiers.get(sale.createdBy) ?? "Cashier",
      costLak: metrics.costLak,
      createdAt: sale.createdAt.toISOString(),
      discountLak: metrics.discountLak,
      grossLak: metrics.grossLak,
      id: sale.id,
      items: metrics.itemsDisplay,
      netLak: metrics.netLak,
      paymentMethods: paymentMethodsOnSale(sale.payments),
      profitLak: metrics.profitLak,
      receipt: receiptLabel(sale),
      refundLak: metrics.refundLak,
      status: sale.saleStatus,
      voidLak: metrics.voidLak,
    };
    return { metrics, row };
  });
  const summary = summarizeSaleMetrics(decorated.map((row) => row.metrics));
  const sorted = decorated.map((row) => row.row).sort((left, right) => compareDailyRows(left, right, clamped.sort, clamped.dir));
  const pageSize = SALES_TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(clamped.page, pageCount);
  const start = (page - 1) * pageSize;
  const rows = sorted.slice(start, start + pageSize);
  return {
    filterOptions,
    page,
    pageCount,
    pageSize,
    query: { ...clamped, page },
    rows,
    showCostProfit: true,
    summary,
    totalRow: {
      cashierName: "",
      costLak: summary.costLak,
      createdAt: "",
      discountLak: summary.discountLak,
      grossLak: summary.grossLak,
      id: "total",
      items: summary.itemsSold,
      netLak: summary.netLak,
      paymentMethods: [],
      profitLak: summary.profitLak,
      receipt: "",
      refundLak: summary.refundLak,
      status: "",
      voidLak: summary.voidLak,
    },
    truncated: false,
  };
}

export type MonthlySalesTableRow = SalesTableSummary & {
  cardLak: number;
  cashLak: number;
  date: string;
  qrLak: number;
  transferLak: number;
};

export type MonthlySalesTableResult = {
  filterOptions: ReportFilterOptions;
  month: string;
  query: SalesTableQuery;
  rows: MonthlySalesTableRow[];
  showCostProfit: boolean;
  summary: SalesTableSummary & PaymentMethodTotals;
};

export async function loadMonthlySalesTable(
  tenant: TenantContext,
  query: SalesTableQuery,
  client: any = db,
): Promise<MonthlySalesTableResult> {
  const scope = await resolveTenantScope(tenant, client);
  const clamped: SalesTableQuery = {
    ...clampSalesTableQuery(scope, query),
    date: undefined,
    datePreset: "custom",
  };
  if (!clamped.month) {
    clamped.month = businessMonthLabel(new Date());
  }
  const range = resolveSalesTableRange(clamped);
  const monthStart = startOfBusinessMonth(
    range.dateFrom instanceof Date ? range.dateFrom : range.dateFrom ? new Date(range.dateFrom) : new Date(),
  );
  clamped.dateFrom = monthStart;
  clamped.dateTo = endOfBusinessMonth(monthStart);
  const [facts, filterOptions] = await Promise.all([
    loadSaleFacts(scope, clamped, client),
    getReportFilterOptions(tenant, client),
  ]);

  const byDay = new Map<string, MonthlySalesTableRow>();
  const bump = (date: string) => {
    const current = byDay.get(date) ?? {
      ...emptySalesTableSummary(),
      cardLak: 0,
      cashLak: 0,
      date,
      qrLak: 0,
      transferLak: 0,
    };
    byDay.set(date, current);
    return current;
  };

  for (const sale of facts.sales) {
    const metrics = computeSaleReportMetrics(sale);
    const day = bump(businessDayLabel(sale.createdAt));
    const next = addSalesTableSummaries(day, {
      bills: metrics.qualifying ? 1 : 0,
      costLak: metrics.costLak,
      discountLak: metrics.qualifying ? metrics.discountLak : 0,
      grossLak: metrics.grossLak,
      itemsSold: metrics.itemsSold,
      netLak: metrics.netLak,
      profitLak: metrics.profitLak,
      refundLak: metrics.refundLak,
      voidLak: metrics.voidLak,
    });
    Object.assign(day, next);
    for (const payment of sale.payments) {
      if (isVoidSaleStatusSafe(sale.saleStatus)) continue;
      const amount = netTenderLak(payment);
      const method = String(payment.paymentMethod ?? "cash");
      if (method === "cash") day.cashLak += amount;
      else if (method === "qr") day.qrLak += amount;
      else if (method === "transfer") day.transferLak += amount;
      else if (isCardPaymentMethod(method)) day.cardLak += amount;
    }
  }

  const rows = [...byDay.values()].sort((left, right) => left.date.localeCompare(right.date));
  const summary = rows.reduce(
    (acc, row) => {
      const next = addSalesTableSummaries(acc, row);
      acc.bills = next.bills;
      acc.costLak = next.costLak;
      acc.discountLak = next.discountLak;
      acc.grossLak = next.grossLak;
      acc.itemsSold = next.itemsSold;
      acc.netLak = next.netLak;
      acc.profitLak = next.profitLak;
      acc.refundLak = next.refundLak;
      acc.voidLak = next.voidLak;
      acc.cashLak += row.cashLak;
      acc.qrLak += row.qrLak;
      acc.transferLak += row.transferLak;
      acc.cardLak += row.cardLak;
      acc.totalPaidLak += row.cashLak + row.qrLak + row.transferLak + row.cardLak;
      return acc;
    },
    {
      ...emptySalesTableSummary(),
      ...emptyPaymentMethodTotals(),
    },
  );

  return {
    filterOptions,
    month: clamped.month,
    query: clamped,
    rows,
    showCostProfit: true,
    summary,
  };
}

function isVoidSaleStatusSafe(status: string) {
  return status === "cancelled";
}

export type PaymentMethodTableRow = {
  cashierName: string;
  createdAt: string;
  id: string;
  paymentAmountLak: number;
  paymentMethod: string;
  receipt: string;
  refundLak: number;
  saleId: string;
  saleTotalLak: number;
  status: string;
};

export type PaymentMethodTableResult = {
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: SalesTableQuery;
  rows: PaymentMethodTableRow[];
  summary: PaymentMethodTotals;
  totalRefundLak: number;
  totalSaleLak: number;
};

function comparePaymentRows(left: PaymentMethodTableRow, right: PaymentMethodTableRow, sort?: string, dir: "asc" | "desc" = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const numeric = (a: number, b: number) => (a - b) * sign;
  switch (sort) {
    case "receipt":
      return left.receipt.localeCompare(right.receipt) * sign;
    case "cashier":
      return left.cashierName.localeCompare(right.cashierName) * sign;
    case "paymentMethod":
      return left.paymentMethod.localeCompare(right.paymentMethod) * sign;
    case "paymentAmount":
      return numeric(left.paymentAmountLak, right.paymentAmountLak);
    case "saleTotal":
      return numeric(left.saleTotalLak, right.saleTotalLak);
    case "refund":
      return numeric(left.refundLak, right.refundLak);
    case "status":
      return left.status.localeCompare(right.status) * sign;
    default:
      return (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * sign;
  }
}

export async function loadPaymentMethodSalesTable(
  tenant: TenantContext,
  query: SalesTableQuery,
  client: any = db,
): Promise<PaymentMethodTableResult> {
  const scope = await resolveTenantScope(tenant, client);
  const clamped = clampSalesTableQuery(scope, query);
  const saleWhere = buildSalesTableWhere(scope, clamped, { ignorePaymentMethod: true });
  const count = await client.sale.count({ where: saleWhere });
  if (count > SALES_TABLE_SCAN_LIMIT) {
    throw new Error("SALES_TABLE_TOO_LARGE");
  }
  const [saleRows, filterOptions] = await Promise.all([
    client.sale.findMany({
      orderBy: { createdAt: "desc" },
      select: saleFactSelect,
      where: saleWhere,
    }),
    getReportFilterOptions(tenant, client),
  ]);
  const sales = saleRows.map(mapSaleFact);
  const cashiers = await loadCashierNames(client, sales.map((sale: SaleReportFacts) => sale.createdBy));
  const summary = emptyPaymentMethodTotals();
  const seenSales = new Set<string>();
  const allRows: PaymentMethodTableRow[] = [];
  let totalRefundLak = 0;
  let totalSaleLak = 0;

  for (const sale of sales) {
    const metrics = computeSaleReportMetrics(sale);
    const payments = sale.payments.filter((payment: SaleReportPaymentFact) => {
      if (!clamped.paymentMethod) return true;
      return String(payment.paymentMethod ?? "cash") === clamped.paymentMethod;
    });
    if (payments.length === 0) continue;
    if (!seenSales.has(sale.id)) {
      seenSales.add(sale.id);
      summary.bills += 1;
      totalRefundLak += metrics.refundLak;
      totalSaleLak += moneyLak(sale.totalAmount);
    }
    payments.forEach((payment: SaleReportPaymentFact, index: number) => {
      const amount = netTenderLak(payment);
      const method = String(payment.paymentMethod ?? "cash");
      accumulatePaymentMethod(summary, method, amount);
      allRows.push({
        cashierName: cashiers.get(sale.createdBy) ?? "Cashier",
        createdAt: sale.createdAt.toISOString(),
        id: `${sale.id}:${index}:${method}`,
        paymentAmountLak: amount,
        paymentMethod: method,
        receipt: receiptLabel(sale),
        refundLak: index === 0 ? metrics.refundLak : 0,
        saleId: sale.id,
        saleTotalLak: index === 0 ? moneyLak(sale.totalAmount) : 0,
        status: sale.saleStatus,
      });
    });
  }

  const sorted = allRows.sort((left, right) => comparePaymentRows(left, right, clamped.sort, clamped.dir));
  const pageSize = SALES_TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(clamped.page, pageCount);
  const start = (page - 1) * pageSize;
  return {
    filterOptions,
    page,
    pageCount,
    pageSize,
    query: { ...clamped, page },
    rows: sorted.slice(start, start + pageSize),
    summary,
    totalRefundLak,
    totalSaleLak,
  };
}
