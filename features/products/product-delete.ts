export const PRODUCT_DELETE_BLOCK_REASONS = [
  "HAS_TRANSACTION_HISTORY",
  "HAS_STOCK",
  "NEEDS_RECOUNT",
  "HAS_LOTS",
  "HAS_RESERVATION",
  "NOT_DELETED",
  "REFERENCED_RECORD",
  "TEMPORARILY_UNAVAILABLE",
] as const;

export type ProductDeleteBlockReason = (typeof PRODUCT_DELETE_BLOCK_REASONS)[number];

export type PermanentDeleteFacts = {
  hasActiveReservations: boolean;
  hasAdjustments: boolean;
  hasGoodsReceiptItems: boolean;
  hasHoldBillItems: boolean;
  hasLotAllocations: boolean;
  hasLots: boolean;
  hasMovements: boolean;
  hasNonZeroStock: boolean;
  hasPurchaseItems: boolean;
  hasRefundExchangeItems: boolean;
  hasRefundItems: boolean;
  hasSaleItems: boolean;
  hasStockTransferItems: boolean;
  needsRecount: boolean;
  status: string;
};

export class ProductDeleteBlockedError extends Error {
  readonly reason: ProductDeleteBlockReason;

  constructor(reason: ProductDeleteBlockReason) {
    super(reason);
    this.name = "ProductDeleteBlockedError";
    this.reason = reason;
  }
}

export function isProductDeleteBlockReason(value: string): value is ProductDeleteBlockReason {
  return (PRODUCT_DELETE_BLOCK_REASONS as readonly string[]).includes(value);
}

/** First delete is always a soft delete. Permanent delete is a separate step. */
export function permanentDeleteBlockReason(facts: PermanentDeleteFacts): ProductDeleteBlockReason | null {
  if (facts.status !== "deleted") return "NOT_DELETED";
  if (facts.hasActiveReservations) return "HAS_RESERVATION";
  if (facts.hasLots || facts.hasLotAllocations) return "HAS_LOTS";
  if (
    facts.hasSaleItems
    || facts.hasRefundItems
    || facts.hasRefundExchangeItems
    || facts.hasMovements
    || facts.hasAdjustments
    || facts.hasPurchaseItems
    || facts.hasGoodsReceiptItems
    || facts.hasStockTransferItems
    || facts.hasHoldBillItems
  ) {
    return "HAS_TRANSACTION_HISTORY";
  }
  if (facts.hasNonZeroStock) return "HAS_STOCK";
  if (facts.needsRecount) return "NEEDS_RECOUNT";
  return null;
}

export function deleteFailureCode(error: unknown): string {
  if (error instanceof ProductDeleteBlockedError) return error.reason;
  const message = error instanceof Error ? error.message : "";
  if (isProductDeleteBlockReason(message)) return message;
  if (message.includes("Unable to start a transaction") || message.includes("P2028")) return "TEMPORARILY_UNAVAILABLE";
  if (message.includes("Foreign key constraint") || message.includes("P2003") || message.includes("violates")) return "REFERENCED_RECORD";
  if (message === "Product was not found.") return message;
  return "TEMPORARILY_UNAVAILABLE";
}
