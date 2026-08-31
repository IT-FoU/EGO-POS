export const STOCK_COUNT_CHANGED_MESSAGE =
  "Stock changed while you were counting. Refresh and recount before saving.";
export const STOCK_COUNT_LOT_UNSUPPORTED_MESSAGE =
  "This product has lot/expiry inventory. Use a lot-aware inventory workflow; Stock Count is not supported yet.";

export type InventoryCountConflictCode = "INVENTORY_CHANGED" | "INVENTORY_LOT_COUNT_UNSUPPORTED";

export class InventoryCountConflictError extends Error {
  readonly code: InventoryCountConflictCode;

  constructor(code: InventoryCountConflictCode, message: string) {
    super(message);
    this.name = "InventoryCountConflictError";
    this.code = code;
  }
}

export function stockCountQuantitiesMatch(left: number, right: number) {
  return Math.abs(left - right) < 1e-9;
}
