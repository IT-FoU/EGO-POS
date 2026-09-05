/**
 * Offline cash-sale domain types (Phase 6A).
 *
 * Defines the immutable operation payload queued for sync and the local entities
 * persisted on the device: the sale (with items + cash payment + an immutable
 * receipt snapshot + audit metadata), and the local stock-consumption movements.
 *
 * This slice covers CASH sales only. No QR/transfer/card, no refunds/voids/
 * returns/holds, no cash movement, no sync application — those are later phases.
 */

import type { BaseLocalEntity } from "../types";

export type OfflinePaymentMethod = "cash";

/** A single sold line (immutable once committed). */
export interface OfflineSaleLine {
  lineId: string;
  productId: string;
  unitId: string | null;
  lotId: string | null;
  /** Quantity in SELL units. */
  quantity: number;
  /** Quantity in BASE units (quantity * conversionQty). */
  baseQuantity: number;
  conversionQty: number;
  unitPriceLak: number;
  lineTotalLak: number;
  /** Denormalized name for the immutable receipt snapshot. */
  name: string;
  unitName: string;
}

/** Cash payment for the sale (single tender in this slice). */
export interface OfflineCashPayment {
  method: OfflinePaymentMethod;
  paidCashLak: number;
  changeLak: number;
}

/** One terminal stock/lot consumption produced by the sale. */
export interface OfflineStockConsumption {
  productId: string;
  unitId: string | null;
  lotId: string | null;
  baseQuantity: number;
  allocationId: string;
  /** Optimistic base version of the allocation BEFORE this consumption. */
  allocationBaseVersionBefore: number;
}

/**
 * Immutable receipt snapshot: exactly what the customer's receipt shows. It is
 * frozen at commit time and MUST NOT be recomputed from current master data
 * (prices/promotions may change afterwards).
 */
export interface OfflineReceiptSnapshot {
  receiptReference: string;
  saleNo: string;
  createdAt: string;
  branchName: string;
  cashierName: string;
  customerName: string;
  paymentMode: OfflinePaymentMethod;
  lines: Array<{
    name: string;
    unitName: string;
    quantity: number;
    unitPriceLak: number;
    lineTotalLak: number;
  }>;
  subtotalLak: number;
  discountTotalLak: number;
  taxAmountLak: number;
  totalLak: number;
  paidCashLak: number;
  changeLak: number;
}

export interface OfflineSaleAudit {
  createdAt: string;
  actorUserId: string;
  deviceId: string;
  terminalId: string;
  policyVersion: number | null;
}

/**
 * The immutable payload carried by the `pos.sale.complete` operation envelope.
 * Everything the cloud needs to deterministically apply (or reject) the sale.
 */
export interface OfflineCashSalePayload {
  saleId: string;
  saleNo: string;
  receiptReference: string;
  companyId: string;
  branchId: string;
  warehouseId: string | null;
  terminalId: string;
  deviceId: string;
  actorUserId: string;
  cashSessionId: string;
  customerId: string | null;
  lines: OfflineSaleLine[];
  subtotalLak: number;
  promotionDiscountLak: number;
  manualDiscountLak: number;
  discountTotalLak: number;
  taxRatePercent: number;
  taxInclusive: boolean;
  taxAmountLak: number;
  totalLak: number;
  payment: OfflineCashPayment;
  stockConsumption: OfflineStockConsumption[];
  receiptSnapshot: OfflineReceiptSnapshot;
  audit: OfflineSaleAudit;
  createdAt: string;
}

/** Local persisted sale entity. Extends the base local record bookkeeping. */
export interface LocalSaleEntity extends BaseLocalEntity {
  saleNo: string;
  receiptReference: string;
  cashSessionId: string;
  customerId: string | null;
  operationId: string;
  status: "pending";
  lines: OfflineSaleLine[];
  payment: OfflineCashPayment;
  subtotalLak: number;
  discountTotalLak: number;
  taxAmountLak: number;
  totalLak: number;
  /** Immutable receipt snapshot — never recomputed from master data. */
  receiptSnapshot: OfflineReceiptSnapshot;
  audit: OfflineSaleAudit;
}

/** Local stock-movement entity (one per consumed line). */
export interface LocalStockMovementEntity extends BaseLocalEntity {
  saleId: string;
  operationId: string;
  productId: string;
  unitId: string | null;
  lotId: string | null;
  baseQuantity: number;
  direction: "out";
  reason: "pos_sale";
}
