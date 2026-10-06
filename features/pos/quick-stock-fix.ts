import { permissionKeysForCheck } from "@/features/access-control/permission-catalog";
import type { PosCartItem, PosProduct, PosProductUnit } from "@/features/pos/types";

export const POS_QUICK_STOCK_FIX_PERMISSION = "pos.quick_stock_fix";

export function canUseQuickStockFix(keys: readonly string[] | null | undefined) {
  const granted = keys ?? [];
  if (granted.includes("*")) return true;
  const has = (permission: string) => permissionKeysForCheck(permission).some((key) => granted.includes(key));
  return has(POS_QUICK_STOCK_FIX_PERMISSION) || has("inventory.adjust");
}

/** Existing free-text adjustment reason. Not a second reason-code system. */
export const QUICK_STOCK_FIX_REASON = "Physical stock found / Temporary correction";

export const QUICK_STOCK_FIX_PRESETS = [1, 5, 10] as const;

export const QUICK_STOCK_FIX_QUANTITY_ERROR = "Quick stock fix quantity must be a positive whole number.";

export type QuickStockFixRequest = {
  availableBase: number;
  baseUnitName: string;
  conversionQty: number;
  productId: string;
  productName: string;
  requiredBase: number;
  saleUnitName: string;
  shortBase: number;
};

export function posBaseUnitName(product: PosProduct) {
  return product.units?.find((unit) => unit.isBaseUnit)?.unitName || "Piece";
}

export function quickStockFixNote(input: {
  conversionQty: number;
  saleUnitName: string;
  terminalCode?: string | null;
}) {
  const conversion = input.conversionQty > 0 ? input.conversionQty : 1;
  const unit = input.saleUnitName.trim() || "Piece";
  const terminal = input.terminalCode?.trim();
  const source = `POS Quick Stock Fix | ${unit} x${conversion}`;
  return terminal ? `${source} | terminal ${terminal}` : source;
}

export function parseQuickStockFixQuantity(value: unknown) {
  if (typeof value === "string" && value.trim() === "") {
    throw new Error(QUICK_STOCK_FIX_QUANTITY_ERROR);
  }
  const quantity = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(QUICK_STOCK_FIX_QUANTITY_ERROR);
  }
  return quantity;
}

export function cartBaseQtyForProduct(
  cart: Array<Pick<PosCartItem, "conversionQty" | "id" | "quantity">>,
  productId: string,
) {
  return cart.reduce((total, item) => {
    if (item.id !== productId) return total;
    const conversion = item.conversionQty && item.conversionQty > 0 ? item.conversionQty : 1;
    return total + item.quantity * conversion;
  }, 0);
}

export function quickStockFixShortage(input: {
  availableBase: number;
  cartBaseQty: number;
  conversionQty: number;
}) {
  const conversionQty = input.conversionQty > 0 ? input.conversionQty : 1;
  const availableBase = Math.max(0, Number(input.availableBase) || 0);
  const cartBaseQty = Math.max(0, Number(input.cartBaseQty) || 0);
  const requiredBase = cartBaseQty + conversionQty;
  const shortBase = Math.max(0, requiredBase - availableBase);
  return { availableBase, conversionQty, requiredBase, shortBase };
}

export function buildQuickStockFixRequest(input: {
  availableBase: number;
  cart: Array<Pick<PosCartItem, "conversionQty" | "id" | "quantity">>;
  product: PosProduct;
  productName: string;
  saleUnit: PosProductUnit;
}): QuickStockFixRequest | null {
  const conversionQty = input.saleUnit.conversionQty > 0 ? input.saleUnit.conversionQty : 1;
  const shortage = quickStockFixShortage({
    availableBase: input.availableBase,
    cartBaseQty: cartBaseQtyForProduct(input.cart, input.product.id),
    conversionQty,
  });
  if (shortage.shortBase <= 0) return null;
  return {
    ...shortage,
    baseUnitName: posBaseUnitName(input.product),
    productId: input.product.id,
    productName: input.productName,
    saleUnitName: input.saleUnit.unitName,
  };
}
