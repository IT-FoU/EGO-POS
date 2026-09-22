/**
 * R3 product-report accounting.
 * Reuses R2 / STEP9 sale lifecycle. Does not invent a second model.
 *
 * Sale statuses:
 * - completed / partial_refunded / refunded / exchanged / adjusted → Gross from original sale
 * - cancelled → Void only (no Gross/Net/Cost/Profit)
 * Hold bills are never sales.
 *
 * Qty Sold = original transaction qty on qualifying sales (+ exchange replacement qty)
 * Refund Qty = refunded/restored qty
 * Void Qty = cancelled original qty
 * Net Qty = Qty Sold − Refund Qty
 * Base Qty = transaction qty × sold-unit conversionQty (for cross-unit totals)
 * Gross / Refund / Void / Net / Cost / Profit allocate so product sums match R2 sale metrics.
 * Cost uses sale-item / exchange-item cost_price snapshots only.
 */
import { refundAmountOf } from "@/features/reports/report-lifecycle";
import {
  computeSaleReportMetrics,
  isVoidSaleStatus,
  moneyLak,
  type SaleReportFacts,
} from "@/features/reports/sales-table-math";

export const PRODUCT_TABLE_PAGE_SIZE = 50;
export const PRODUCT_TABLE_SCAN_LIMIT = 5000;
export const PRODUCT_RANK_METRICS = ["units", "net", "profit", "bills"] as const;
export type ProductRankMetric = (typeof PRODUCT_RANK_METRICS)[number];
export const PRODUCT_PERFORMANCE_VIEWS = ["best", "slow"] as const;
export type ProductPerformanceView = (typeof PRODUCT_PERFORMANCE_VIEWS)[number];
export const PRODUCT_TOP_N_OPTIONS = [10, 20, 50, 100] as const;

export function qtyNum(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function conversionQtyOf(value: unknown) {
  const parsed = qtyNum(value);
  return parsed > 0 ? parsed : 1;
}

export function allocateRounded(total: number, weights: number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((weight) => (total * weight) / sum);
  const values = raw.map((value) => Math.floor(value + 1e-9));
  let leftover = total - values.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ frac: value - values[index], index }))
    .sort((left, right) => right.frac - left.frac);
  for (const item of order) {
    if (leftover === 0) break;
    const step = leftover > 0 ? 1 : -1;
    values[item.index] += step;
    leftover -= step;
  }
  return values;
}

export type ProductLineInput = {
  conversionQty: number;
  costPrice: unknown;
  id: string;
  productId: string;
  profitAmount: unknown;
  quantity: unknown;
  totalAmount: unknown;
  unitId?: string | null;
};

export type ProductLineMetrics = {
  baseQty: number;
  bills: number;
  costLak: number;
  extraNetLak: number;
  grossLak: number;
  lastSoldAt?: string;
  netLak: number;
  netQty: number;
  productId: string;
  profitLak: number;
  qtySold: number;
  refundLak: number;
  refundQty: number;
  saleId: string;
  unitId?: string;
  voidLak: number;
  voidQty: number;
};

function emptyLine(productId: string, saleId: string, unitId?: string): ProductLineMetrics {
  return {
    baseQty: 0,
    bills: 0,
    costLak: 0,
    extraNetLak: 0,
    grossLak: 0,
    netLak: 0,
    netQty: 0,
    productId,
    profitLak: 0,
    qtySold: 0,
    refundLak: 0,
    refundQty: 0,
    saleId,
    unitId,
    voidLak: 0,
    voidQty: 0,
  };
}

function ensureLine(map: Map<string, ProductLineMetrics>, productId: string, saleId: string, unitId?: string) {
  const current = map.get(productId) ?? emptyLine(productId, saleId, unitId);
  if (unitId && !current.unitId) current.unitId = unitId;
  map.set(productId, current);
  return current;
}

export function computeProductLinesForSale(
  sale: SaleReportFacts,
  items: ProductLineInput[],
): ProductLineMetrics[] {
  const metrics = computeSaleReportMetrics(sale);
  const map = new Map<string, ProductLineMetrics>();
  const itemById = new Map(items.map((item) => [item.id, item]));
  const weights = items.map((item) => Math.max(moneyLak(item.totalAmount), 0));
  const grossParts = allocateRounded(metrics.grossLak, weights);
  const voidParts = allocateRounded(metrics.voidLak, weights);
  const originalCostWeights = items.map((item) => moneyLak(item.costPrice) * qtyNum(item.quantity));
  const originalProfitWeights = items.map((item) => moneyLak(item.profitAmount));

  items.forEach((item, index) => {
    const line = ensureLine(map, item.productId, sale.id, item.unitId ?? undefined);
    const qty = qtyNum(item.quantity);
    const base = qty * conversionQtyOf(item.conversionQty);
    if (isVoidSaleStatus(sale.saleStatus)) {
      line.voidQty += qty;
      line.voidLak += voidParts[index] ?? 0;
      return;
    }
    if (!metrics.qualifying) return;
    line.qtySold += qty;
    line.baseQty += base;
    line.grossLak += grossParts[index] ?? 0;
    line.costLak += originalCostWeights[index] ?? 0;
    line.profitLak += originalProfitWeights[index] ?? 0;
    line.bills = 1;
    line.lastSoldAt = sale.createdAt instanceof Date ? sale.createdAt.toISOString() : String(sale.createdAt);
  });

  if (!metrics.qualifying) {
    return [...map.values()].map(finalizeLine);
  }

  const refundTargets: Array<{ amount: number; item?: ProductLineInput; productId: string; qty: number; unitId?: string }> = [];
  for (const refund of sale.refunds) {
    const kind = String(refund.kind ?? "refund");
    const headerRefund = refundAmountOf(refund);
    const rows = Array.isArray(refund.items) ? refund.items : [];
    const rowAmounts = rows.map((row: Record<string, unknown>) => moneyLak(row.amount));
    const rowSum = rowAmounts.reduce((sum, value) => sum + value, 0);
    const scaled = rowSum > 0 ? allocateRounded(headerRefund, rowAmounts) : allocateRounded(
      headerRefund,
      rows.map((row: Record<string, unknown>) => {
        const item = itemById.get(String(row.saleItemId ?? ""));
        return item ? Math.max(moneyLak(item.totalAmount), 1) : 1;
      }),
    );
    rows.forEach((row: Record<string, unknown>, index) => {
      const item = itemById.get(String(row.saleItemId ?? ""));
      refundTargets.push({
        amount: scaled[index] ?? moneyLak(row.amount),
        item,
        productId: String(row.productId || item?.productId || ""),
        qty: qtyNum(row.quantity),
        unitId: item?.unitId ?? undefined,
      });
    });
    if (kind !== "refund") {
      const exchanges = Array.isArray(refund.exchangeItems) ? refund.exchangeItems : [];
      const extraParts = allocateRounded(
        moneyLak(refund.paymentAmount),
        exchanges.map((row: Record<string, unknown>) => Math.max(moneyLak(row.totalAmount), 0)),
      );
      exchanges.forEach((row: Record<string, unknown>, exchangeIndex: number) => {
        const productId = String(row.productId ?? "");
        if (!productId) return;
        const qty = qtyNum(row.quantity);
        const conversion = conversionQtyOf(row.conversionQty);
        const line = ensureLine(map, productId, sale.id, row.unitId ? String(row.unitId) : undefined);
        const lineTotal = moneyLak(row.totalAmount);
        const lineCost = moneyLak(row.costPrice) * qty;
        line.qtySold += qty;
        line.baseQty += qty * conversion;
        // Extra net is the persisted customer payment, not replacement face value.
        // That keeps product Net = Gross + payment − refund, same as R2.
        line.extraNetLak += extraParts[exchangeIndex] ?? 0;
        line.costLak += lineCost;
        line.profitLak += lineTotal - lineCost;
        line.bills = 1;
        line.lastSoldAt = sale.createdAt instanceof Date ? sale.createdAt.toISOString() : String(sale.createdAt);
      });
    }
  }

  for (const target of refundTargets) {
    if (!target.productId) continue;
    const line = ensureLine(map, target.productId, sale.id, target.unitId);
    line.refundQty += target.qty;
    line.refundLak += target.amount;
    if (target.item) {
      const originalQty = qtyNum(target.item.quantity) || 1;
      const share = target.qty / originalQty;
      line.costLak -= moneyLak(target.item.costPrice) * target.qty;
      line.profitLak -= moneyLak(Math.round(moneyLak(target.item.profitAmount) * share));
    }
  }

  return [...map.values()].map(finalizeLine);
}

function finalizeLine(line: ProductLineMetrics): ProductLineMetrics {
  line.netQty = line.qtySold - line.refundQty;
  if (line.voidQty > 0 && line.qtySold === 0) {
    line.netLak = 0;
    return line;
  }
  line.netLak = moneyLak(line.grossLak - line.refundLak + line.extraNetLak);
  line.costLak = moneyLak(line.costLak);
  line.profitLak = moneyLak(line.profitLak);
  line.grossLak = moneyLak(line.grossLak);
  line.refundLak = moneyLak(line.refundLak);
  line.voidLak = moneyLak(line.voidLak);
  line.netLak = moneyLak(line.netLak);
  return line;
}

export type ProductReportSummary = {
  baseQty: number;
  bills: number;
  categoriesSold: number;
  costLak: number;
  grossLak: number;
  netLak: number;
  netQty: number;
  productsSold: number;
  profitLak: number;
  qtySold: number;
  refundLak: number;
  refundQty: number;
  voidLak: number;
  voidQty: number;
};

export function emptyProductReportSummary(): ProductReportSummary {
  return {
    baseQty: 0,
    bills: 0,
    categoriesSold: 0,
    costLak: 0,
    grossLak: 0,
    netLak: 0,
    netQty: 0,
    productsSold: 0,
    profitLak: 0,
    qtySold: 0,
    refundLak: 0,
    refundQty: 0,
    voidLak: 0,
    voidQty: 0,
  };
}

export function addProductLineToBucket<T extends {
  baseQty: number;
  billIds: Set<string>;
  costLak: number;
  grossLak: number;
  lastSoldAt?: string;
  netLak: number;
  netQty: number;
  profitLak: number;
  qtySold: number;
  refundLak: number;
  refundQty: number;
  voidLak: number;
  voidQty: number;
}>(bucket: T, line: ProductLineMetrics) {
  bucket.baseQty += line.baseQty;
  bucket.costLak += line.costLak;
  bucket.grossLak += line.grossLak;
  bucket.netLak += line.netLak;
  bucket.netQty += line.netQty;
  bucket.profitLak += line.profitLak;
  bucket.qtySold += line.qtySold;
  bucket.refundLak += line.refundLak;
  bucket.refundQty += line.refundQty;
  bucket.voidLak += line.voidLak;
  bucket.voidQty += line.voidQty;
  if (line.bills > 0) bucket.billIds.add(line.saleId);
  if (line.lastSoldAt && (!bucket.lastSoldAt || line.lastSoldAt > bucket.lastSoldAt)) {
    bucket.lastSoldAt = line.lastSoldAt;
  }
  return bucket;
}

export function summarizeProductLines(lines: ProductLineMetrics[], productCount = 0, categoryCount = 0): ProductReportSummary {
  const billIds = new Set<string>();
  const summary = emptyProductReportSummary();
  for (const line of lines) {
    summary.baseQty += line.baseQty;
    summary.costLak += line.costLak;
    summary.grossLak += line.grossLak;
    summary.netLak += line.netLak;
    summary.netQty += line.netQty;
    summary.profitLak += line.profitLak;
    summary.qtySold += line.qtySold;
    summary.refundLak += line.refundLak;
    summary.refundQty += line.refundQty;
    summary.voidLak += line.voidLak;
    summary.voidQty += line.voidQty;
    if (line.bills > 0) billIds.add(line.saleId);
  }
  summary.bills = billIds.size;
  summary.productsSold = productCount;
  summary.categoriesSold = categoryCount;
  summary.costLak = moneyLak(summary.costLak);
  summary.grossLak = moneyLak(summary.grossLak);
  summary.netLak = moneyLak(summary.netLak);
  summary.profitLak = moneyLak(summary.profitLak);
  summary.refundLak = moneyLak(summary.refundLak);
  summary.voidLak = moneyLak(summary.voidLak);
  return summary;
}
