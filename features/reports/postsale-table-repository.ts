import { prisma } from "@/lib/db/prisma";
import type { ReportFilterOptions } from "@/features/reports/report-filters";
import { getReportFilterOptions } from "@/features/reports/prisma-repository";
import {
  cashAndNoncashRefundLak,
  classifyRefundEventType,
  emptyPostSaleEventSummary,
  isMixedPayment,
  moneyLak,
  paymentLabelList,
  POSTSALE_TABLE_PAGE_SIZE,
  POSTSALE_TABLE_SCAN_LIMIT,
  refundAmountFromRow,
  summarizePostSaleEvents,
  type PostSaleEventSummary,
} from "@/features/reports/postsale-table-math";
import {
  resolvePostSaleTableRange,
  type PostSaleTableQuery,
} from "@/features/reports/postsale-table-query";
import {
  computeSaleReportMetrics,
  emptySalesTableSummary,
  paymentMethodsOnSale,
  summarizeSaleMetrics,
  type SalesTableSummary,
} from "@/features/reports/sales-table-math";
import type { TenantContext } from "@/lib/db/write-context";
import { resolveTenantScope, type BranchScope } from "@/lib/db/tenant-scope";

const db = prisma as any;

export type PostSaleLoadOptions = { allRows?: boolean };

export type PostSaleEventRow = {
  approverName: string;
  cashRefundLak: number;
  cashierName: string;
  eventAt: string;
  id: string;
  items: number;
  noncashRefundLak: number;
  originalSaleAt: string;
  originalTotalLak: number;
  paymentMethods: string[];
  reason: string;
  receipt: string;
  refundLak: number;
  saleId: string;
  status: string;
  stockRestoredBaseQty: number | null;
  type: string;
  voidLak: number;
};

export type PostSaleEventResult = {
  filterOptions: ReportFilterOptions & {
    approvers: Array<{ id: string; label: string }>;
  };
  page: number;
  pageCount: number;
  pageSize: number;
  query: PostSaleTableQuery;
  rows: PostSaleEventRow[];
  summary: PostSaleEventSummary;
  totalRow: {
    cashRefundLak: number;
    items: number;
    noncashRefundLak: number;
    originalTotalLak: number;
    refundLak: number;
    rowCount: number;
    voidLak: number;
  };
};

export type ReceiptSalesRow = {
  cashierName: string;
  createdAt: string;
  customerName: string;
  discountLak: number;
  grossLak: number;
  id: string;
  items: number;
  netLak: number;
  paymentLabel: string;
  paymentMethods: string[];
  receipt: string;
  refundLak: number;
  status: string;
  voidLak: number;
};

export type ReceiptSalesResult = {
  filterOptions: ReportFilterOptions;
  page: number;
  pageCount: number;
  pageSize: number;
  query: PostSaleTableQuery;
  rows: ReceiptSalesRow[];
  showCostProfit: boolean;
  summary: SalesTableSummary & {
    averageBillLak: number;
    cardLak: number;
    cashLak: number;
    qrLak: number;
    transferLak: number;
  };
  totalRow: {
    bills: number;
    discountLak: number;
    grossLak: number;
    items: number;
    netLak: number;
    refundLak: number;
    voidLak: number;
  };
};

function clientOf(client?: any) {
  return client ?? db;
}

function clampQuery(scope: BranchScope, query: PostSaleTableQuery): PostSaleTableQuery {
  const next = { ...query };
  if (!scope.isOwner) {
    next.branchId = scope.branchId;
  } else if (next.branchId && !scope.branchIds.includes(next.branchId)) {
    next.branchId = scope.branchId;
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

function receiptOf(sale: { receiptNo?: string | null; saleNo?: string | null }) {
  return String(sale.receiptNo || sale.saleNo || "—");
}

function matchesEventType(type: string, filter: PostSaleTableQuery["eventType"]) {
  if (filter === "all") return true;
  if (filter === "refund") return type === "partial_refund" || type === "full_refund" || type === "refund";
  return type === filter;
}

function compareEventRows(left: PostSaleEventRow, right: PostSaleEventRow, sort?: string, dir: "asc" | "desc" = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  const value = (row: PostSaleEventRow) => {
    switch (sort) {
      case "receipt":
        return row.receipt;
      case "cashier":
        return row.cashierName;
      case "type":
        return row.type;
      case "refund":
        return row.refundLak;
      case "void":
        return row.voidLak;
      case "status":
        return row.status;
      default:
        return row.eventAt;
    }
  };
  const a = value(left);
  const b = value(right);
  if (typeof a === "number" && typeof b === "number") return (a - b) * sign;
  return String(a).localeCompare(String(b), undefined, { sensitivity: "base" }) * sign;
}

export async function loadRefundVoidTable(
  tenant: TenantContext,
  query: PostSaleTableQuery,
  client?: any,
  options?: PostSaleLoadOptions,
): Promise<PostSaleEventResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const clamped = clampQuery(scope, query);
  const range = resolvePostSaleTableRange(clamped);
  const branchId = clamped.branchId ?? (scope.isOwner ? undefined : scope.branchId);
  const createdAtFilter: Record<string, Date> = {};
  if (range.dateFrom instanceof Date) createdAtFilter.gte = range.dateFrom;
  else if (typeof range.dateFrom === "string" && range.dateFrom) createdAtFilter.gte = new Date(range.dateFrom);
  if (range.dateTo instanceof Date) createdAtFilter.lte = range.dateTo;
  else if (typeof range.dateTo === "string" && range.dateTo) createdAtFilter.lte = new Date(range.dateTo);

  const saleWhereBase: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(branchId ? { branchId } : { branchId: { in: scope.branchIds } }),
  };
  if (clamped.receiptQuery) {
    saleWhereBase.OR = [
      { receiptNo: { contains: clamped.receiptQuery, mode: "insensitive" } },
      { saleNo: { contains: clamped.receiptQuery, mode: "insensitive" } },
    ];
  }

  const refundWhere: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
    ...(clamped.cashierId ? { createdBy: clamped.cashierId } : {}),
    ...(clamped.approverId ? { approvedBy: clamped.approverId } : {}),
    ...(clamped.paymentMethod ? { refundMethod: clamped.paymentMethod } : {}),
    sale: saleWhereBase,
  };

  const voidWhere: Record<string, unknown> = {
    ...saleWhereBase,
    saleStatus: "cancelled",
    ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
    ...(clamped.cashierId ? { createdBy: clamped.cashierId } : {}),
    ...(clamped.approverId ? { id: "__none__" } : {}),
  };

  const wantRefunds = clamped.eventType === "all" || clamped.eventType !== "void";
  const wantVoids = clamped.eventType === "all" || clamped.eventType === "void";

  const [refunds, voids] = await Promise.all([
    wantRefunds
      ? dbClient.refund.findMany({
          include: {
            items: { select: { quantity: true } },
            sale: {
              select: {
                createdAt: true,
                createdBy: true,
                id: true,
                payments: { select: { amount: true, changeAmount: true, paymentMethod: true } },
                receiptNo: true,
                saleNo: true,
                saleStatus: true,
                totalAmount: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: POSTSALE_TABLE_SCAN_LIMIT,
          where: refundWhere,
        })
      : Promise.resolve([]),
    wantVoids
      ? dbClient.sale.findMany({
          select: {
            createdAt: true,
            createdBy: true,
            id: true,
            payments: { select: { amount: true, changeAmount: true, paymentMethod: true } },
            receiptNo: true,
            saleNo: true,
            saleStatus: true,
            totalAmount: true,
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: "desc" },
          take: POSTSALE_TABLE_SCAN_LIMIT,
          where: voidWhere,
        })
      : Promise.resolve([]),
  ]);

  const saleIds = [
    ...new Set([
      ...(refunds as Array<{ saleId?: string; sale?: { id?: string } }>).map((row) => String(row.sale?.id ?? row.saleId ?? "")),
      ...(voids as Array<{ id: string }>).map((row) => String(row.id)),
    ].filter(Boolean)),
  ];

  const movements =
    saleIds.length > 0
      ? await dbClient.stockMovement.findMany({
          select: { afterQty: true, beforeQty: true, quantity: true, referenceId: true },
          where: {
            companyId: scope.companyId,
            referenceType: "sale",
            referenceId: { in: saleIds },
            movementType: { in: ["return", "damaged", "expired"] },
          },
        })
      : [];
  const restoredBySale = new Map<string, number>();
  for (const row of movements as Array<{ afterQty: unknown; beforeQty: unknown; quantity: unknown; referenceId: string }>) {
    const delta = moneyLak(row.afterQty) - moneyLak(row.beforeQty);
    const qty = delta !== 0 ? Math.abs(delta) : Math.abs(moneyLak(row.quantity));
    restoredBySale.set(String(row.referenceId), (restoredBySale.get(String(row.referenceId)) ?? 0) + qty);
  }

  const userIds = [
    ...new Set([
      ...(refunds as Array<{ approvedBy?: string | null; createdBy?: string | null; sale?: { createdBy?: string | null } }>).flatMap(
        (row) => [row.approvedBy, row.createdBy, row.sale?.createdBy],
      ),
      ...(voids as Array<{ createdBy?: string | null }>).map((row) => row.createdBy),
    ]
      .map((id) => String(id ?? ""))
      .filter(Boolean)),
  ];
  const names = await loadUserNames(dbClient, userIds);

  const mapped: PostSaleEventRow[] = [];
  for (const refund of refunds as Array<Record<string, any>>) {
    const sale = refund.sale;
    if (!sale) continue;
    const refundLak = refundAmountFromRow(refund);
    const type = classifyRefundEventType({
      kind: String(refund.kind ?? "refund"),
      refundAmountLak: refundLak,
      saleStatus: String(sale.saleStatus ?? ""),
      saleTotalLak: moneyLak(sale.totalAmount),
    });
    if (!matchesEventType(type, clamped.eventType)) continue;
    if (clamped.status && String(sale.saleStatus) !== clamped.status && String(refund.kind) !== clamped.status) continue;
    const { cashRefundLak, noncashRefundLak } = cashAndNoncashRefundLak({
      payments: sale.payments ?? [],
      refundAmountLak: refundLak,
      saleTotalLak: moneyLak(sale.totalAmount),
    });
    const items = (refund.items ?? []).reduce((sum: number, item: { quantity?: unknown }) => sum + moneyLak(item.quantity), 0);
    mapped.push({
      approverName: names.get(String(refund.approvedBy ?? "")) || (refund.approvedBy ? String(refund.approvedBy) : "—"),
      cashRefundLak,
      cashierName: names.get(String(refund.createdBy ?? sale.createdBy ?? "")) || "Cashier",
      eventAt: refund.createdAt instanceof Date ? refund.createdAt.toISOString() : String(refund.createdAt),
      id: `refund:${refund.id}`,
      items,
      noncashRefundLak,
      originalSaleAt: sale.createdAt instanceof Date ? sale.createdAt.toISOString() : String(sale.createdAt),
      originalTotalLak: moneyLak(sale.totalAmount),
      paymentMethods: paymentLabelList((sale.payments ?? []).map((payment: { paymentMethod?: string }) => String(payment.paymentMethod ?? "cash"))),
      reason: String(refund.reason ?? ""),
      receipt: receiptOf(sale),
      refundLak,
      saleId: String(sale.id),
      status: String(sale.saleStatus ?? type),
      stockRestoredBaseQty: restoredBySale.has(String(sale.id)) ? restoredBySale.get(String(sale.id))! : null,
      type,
      voidLak: 0,
    });
  }

  for (const sale of voids as Array<Record<string, any>>) {
    if (!matchesEventType("void", clamped.eventType)) continue;
    if (clamped.status && String(sale.saleStatus) !== clamped.status) continue;
    if (clamped.paymentMethod) {
      const methods = (sale.payments ?? []).map((payment: { paymentMethod?: string }) => String(payment.paymentMethod ?? ""));
      if (!methods.includes(clamped.paymentMethod)) continue;
    }
    mapped.push({
      approverName: "—",
      cashRefundLak: 0,
      cashierName: names.get(String(sale.createdBy ?? "")) || "Cashier",
      eventAt: sale.createdAt instanceof Date ? sale.createdAt.toISOString() : String(sale.createdAt),
      id: `void:${sale.id}`,
      items: Number(sale._count?.items ?? 0),
      noncashRefundLak: 0,
      originalSaleAt: sale.createdAt instanceof Date ? sale.createdAt.toISOString() : String(sale.createdAt),
      originalTotalLak: moneyLak(sale.totalAmount),
      paymentMethods: paymentLabelList((sale.payments ?? []).map((payment: { paymentMethod?: string }) => String(payment.paymentMethod ?? "cash"))),
      reason: "",
      receipt: receiptOf(sale),
      refundLak: 0,
      saleId: String(sale.id),
      status: "cancelled",
      stockRestoredBaseQty: restoredBySale.has(String(sale.id)) ? restoredBySale.get(String(sale.id))! : null,
      type: "void",
      voidLak: moneyLak(sale.totalAmount),
    });
  }

  mapped.sort((left, right) => compareEventRows(left, right, clamped.sort, clamped.dir));
  const summary = mapped.length ? summarizePostSaleEvents(mapped) : emptyPostSaleEventSummary();
  const pageSize = POSTSALE_TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(mapped.length / pageSize));
  const page = Math.min(Math.max(1, clamped.page), pageCount);
  const rows = options?.allRows ? mapped : mapped.slice((page - 1) * pageSize, page * pageSize);
  const filterOptions = await getReportFilterOptions(tenant, dbClient);
  const approverIds = [
    ...new Set((refunds as Array<{ approvedBy?: string | null }>).map((row) => String(row.approvedBy ?? "")).filter(Boolean)),
  ];

  return {
    filterOptions: {
      ...filterOptions,
      approvers: approverIds.map((id) => ({ id, label: names.get(id) || id })),
    },
    page,
    pageCount,
    pageSize,
    query: { ...clamped, page },
    rows,
    summary,
    totalRow: {
      cashRefundLak: summary.cashRefundLak,
      items: summary.itemsReturned,
      noncashRefundLak: summary.noncashRefundLak,
      originalTotalLak: mapped.reduce((sum, row) => sum + row.originalTotalLak, 0),
      refundLak: summary.refundAmountLak,
      rowCount: mapped.length,
      voidLak: summary.voidAmountLak,
    },
  };
}

async function resolveProductIdsForSearch(client: any, companyId: string, productQuery: string) {
  const q = productQuery.trim();
  if (!q) return [] as string[];
  const products = await client.product.findMany({
    select: { id: true },
    take: 500,
    where: {
      companyId,
      OR: [
        { barcode: { equals: q, mode: "insensitive" } },
        { nameEn: { contains: q, mode: "insensitive" } },
        { nameLo: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { units: { some: { barcode: { equals: q, mode: "insensitive" } } } },
      ],
    },
  });
  return (products as Array<{ id: string }>).map((row) => String(row.id));
}

export async function loadReceiptSalesTable(
  tenant: TenantContext,
  query: PostSaleTableQuery,
  client?: any,
  options?: PostSaleLoadOptions,
): Promise<ReceiptSalesResult> {
  const dbClient = clientOf(client);
  const scope = await resolveTenantScope(tenant, dbClient);
  const clamped = clampQuery(scope, query);
  const range = resolvePostSaleTableRange(clamped);
  const branchId = clamped.branchId ?? (scope.isOwner ? undefined : scope.branchId);
  const createdAtFilter: Record<string, Date> = {};
  if (range.dateFrom instanceof Date) createdAtFilter.gte = range.dateFrom;
  else if (typeof range.dateFrom === "string" && range.dateFrom) createdAtFilter.gte = new Date(range.dateFrom);
  if (range.dateTo instanceof Date) createdAtFilter.lte = range.dateTo;
  else if (typeof range.dateTo === "string" && range.dateTo) createdAtFilter.lte = new Date(range.dateTo);

  const productIds = clamped.productQuery
    ? await resolveProductIdsForSearch(dbClient, scope.companyId, clamped.productQuery)
    : [];

  const where: Record<string, unknown> = {
    companyId: scope.companyId,
    ...(branchId ? { branchId } : { branchId: { in: scope.branchIds } }),
    saleStatus: clamped.status
      ? clamped.status
      : { in: ["completed", "partial_refunded", "refunded", "cancelled", "exchanged", "adjusted"] },
    ...(Object.keys(createdAtFilter).length ? { createdAt: createdAtFilter } : {}),
    ...(clamped.cashierId ? { createdBy: clamped.cashierId } : {}),
    ...(clamped.paymentMethod ? { payments: { some: { paymentMethod: clamped.paymentMethod } } } : {}),
  };
  if (clamped.receiptQuery) {
    where.OR = [
      { receiptNo: { contains: clamped.receiptQuery, mode: "insensitive" } },
      { saleNo: { contains: clamped.receiptQuery, mode: "insensitive" } },
    ];
  }
  if (clamped.customerQuery) {
    where.customer = {
      OR: [
        { fullName: { contains: clamped.customerQuery, mode: "insensitive" } },
        { phone: { contains: clamped.customerQuery, mode: "insensitive" } },
      ],
    };
  }
  if (clamped.productQuery) {
    if (!productIds.length) {
      const filterOptions = await getReportFilterOptions(tenant, dbClient);
      return {
        filterOptions,
        page: 1,
        pageCount: 1,
        pageSize: POSTSALE_TABLE_PAGE_SIZE,
        query: { ...clamped, page: 1 },
        rows: [],
        showCostProfit: true,
        summary: {
          ...emptySalesTableSummary(),
          averageBillLak: 0,
          cardLak: 0,
          cashLak: 0,
          qrLak: 0,
          transferLak: 0,
        },
        totalRow: { bills: 0, discountLak: 0, grossLak: 0, items: 0, netLak: 0, refundLak: 0, voidLak: 0 },
      };
    }
    where.items = { some: { productId: { in: productIds } } };
  }

  const sales = await dbClient.sale.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      createdBy: true,
      customer: { select: { fullName: true, phone: true } },
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
    },
    take: POSTSALE_TABLE_SCAN_LIMIT,
    where,
  });

  const names = await loadUserNames(
    dbClient,
    (sales as Array<{ createdBy?: string | null }>).map((row) => String(row.createdBy ?? "")),
  );

  const decorated = (sales as Array<Record<string, any>>).map((sale) => {
    const facts = {
      createdAt: sale.createdAt instanceof Date ? sale.createdAt : new Date(sale.createdAt),
      createdBy: String(sale.createdBy ?? ""),
      discountAmount: sale.discountAmount,
      id: String(sale.id),
      items: (sale.items ?? []).map((item: Record<string, any>) => ({
        costPrice: item.costPrice,
        id: String(item.id),
        profitAmount: item.profitAmount,
        quantity: item.quantity,
      })),
      payments: (sale.payments ?? []).map((payment: Record<string, any>) => ({
        amount: payment.amount,
        changeAmount: payment.changeAmount,
        paymentMethod: String(payment.paymentMethod ?? "cash"),
      })),
      profitAmount: sale.profitAmount,
      receiptNo: sale.receiptNo ? String(sale.receiptNo) : null,
      refunds: sale.refunds ?? [],
      saleNo: String(sale.saleNo ?? ""),
      saleStatus: String(sale.saleStatus ?? ""),
      totalAmount: sale.totalAmount,
    };
    const metrics = computeSaleReportMetrics(facts);
    const methods = paymentMethodsOnSale(facts.payments);
    const row: ReceiptSalesRow = {
      cashierName: names.get(facts.createdBy) || "Cashier",
      createdAt: facts.createdAt.toISOString(),
      customerName: String(sale.customer?.fullName || sale.customer?.phone || "—"),
      discountLak: metrics.discountLak,
      grossLak: metrics.grossLak,
      id: facts.id,
      items: metrics.itemsDisplay,
      netLak: metrics.netLak,
      paymentLabel: isMixedPayment(methods) ? "mixed" : methods[0] || "cash",
      paymentMethods: methods,
      receipt: receiptOf(facts),
      refundLak: metrics.refundLak,
      status: facts.saleStatus,
      voidLak: metrics.voidLak,
    };
    return { metrics, payments: facts.payments, row };
  });

  const summaryBase = summarizeSaleMetrics(decorated.map((row) => row.metrics));
  let cashLak = 0;
  let qrLak = 0;
  let transferLak = 0;
  let cardLak = 0;
  for (const entry of decorated) {
    // Match R2 Payment Method report: include void tenders in method buckets.
    for (const payment of entry.payments) {
      const method = String(payment.paymentMethod ?? "cash");
      const tender =
        method === "cash" ? moneyLak(payment.amount) - moneyLak(payment.changeAmount) : moneyLak(payment.amount);
      if (method === "cash") cashLak += tender;
      else if (method === "qr") qrLak += tender;
      else if (method === "transfer") transferLak += tender;
      else if (method === "visa" || method === "mastercard" || method === "card") cardLak += tender;
    }
  }

  const sorted = decorated
    .map((row) => row.row)
    .sort((left, right) => {
      const sign = clamped.dir === "asc" ? 1 : -1;
      return (new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()) * sign;
    });
  const pageSize = POSTSALE_TABLE_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, clamped.page), pageCount);
  const rows = options?.allRows ? sorted : sorted.slice((page - 1) * pageSize, page * pageSize);
  const filterOptions = await getReportFilterOptions(tenant, dbClient);

  return {
    filterOptions,
    page,
    pageCount,
    pageSize,
    query: { ...clamped, page },
    rows,
    showCostProfit: true,
    summary: {
      ...summaryBase,
      averageBillLak: summaryBase.bills > 0 ? moneyLak(summaryBase.netLak / summaryBase.bills) : 0,
      cardLak: moneyLak(cardLak),
      cashLak: moneyLak(cashLak),
      qrLak: moneyLak(qrLak),
      transferLak: moneyLak(transferLak),
    },
    totalRow: {
      bills: summaryBase.bills,
      discountLak: summaryBase.discountLak,
      grossLak: summaryBase.grossLak,
      items: summaryBase.itemsSold,
      netLak: summaryBase.netLak,
      refundLak: summaryBase.refundLak,
      voidLak: summaryBase.voidLak,
    },
  };
}
