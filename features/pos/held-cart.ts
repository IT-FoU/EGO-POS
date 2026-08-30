import { cartSubtotal } from "./pos-cart";
import type { HeldBillCartSnapshot, HeldSale, PosCartItem, PosProductUnit } from "./types";

function compactImageKey(value: unknown) {
  const key = String(value ?? "generic");
  if (!key || key.startsWith("data:") || key.startsWith("blob:") || key.length > 80) {
    return "generic";
  }
  return key;
}

function slimUnit(unit: PosProductUnit): PosProductUnit {
  return {
    allowManualUnitSelect: Boolean(unit.allowManualUnitSelect),
    barcode: String(unit.barcode ?? ""),
    conversionQty: Number(unit.conversionQty) || 1,
    costPriceLak: Number(unit.costPriceLak) || 0,
    id: String(unit.id),
    isBaseUnit: Boolean(unit.isBaseUnit),
    isDefaultSaleUnit: Boolean(unit.isDefaultSaleUnit),
    isPurchaseUnit: Boolean(unit.isPurchaseUnit),
    sellingPriceLak: Number(unit.sellingPriceLak) || 0,
    sortOrder: Number(unit.sortOrder) || 0,
    status: unit.status === "inactive" ? "inactive" : "active",
    unitName: String(unit.unitName ?? "Piece"),
  };
}

export function slimPosCartItem(item: PosCartItem): PosCartItem {
  return {
    barcode: String(item.barcode ?? ""),
    cartLineId: item.cartLineId,
    categoryId: item.categoryId,
    categoryName: String(item.categoryName ?? ""),
    conversionQty: Number(item.conversionQty) || 1,
    costPriceLak: Number(item.costPriceLak) || 0,
    id: String(item.id),
    imageKey: compactImageKey(item.imageKey),
    nameEn: String(item.nameEn ?? item.nameLo ?? "Product"),
    nameLo: String(item.nameLo ?? item.nameEn ?? "Product"),
    priceLak: Number(item.priceLak) || 0,
    pricingNote: item.pricingNote,
    productCode: item.productCode,
    quantity: Number(item.quantity) || 0,
    retailPriceLak: Number(item.retailPriceLak ?? item.priceLak) || 0,
    sku: String(item.sku ?? ""),
    stockQty: Number(item.stockQty) || 0,
    unitId: item.unitId,
    unitName: String(item.unitName ?? "Piece"),
    units: Array.isArray(item.units) ? item.units.map(slimUnit) : undefined,
  };
}

export function slimHeldSnapshot(snapshot: HeldBillCartSnapshot | null | undefined): HeldBillCartSnapshot | undefined {
  if (!snapshot) return undefined;
  const cartItems = Array.isArray(snapshot.cartItems) ? snapshot.cartItems.map(slimPosCartItem) : [];
  return {
    appliedPromotions: Array.isArray(snapshot.appliedPromotions) ? snapshot.appliedPromotions : [],
    cardAmount: Number(snapshot.cardAmount) || 0,
    cashAmount: Number(snapshot.cashAmount) || 0,
    cartItems,
    customer: snapshot.customer ?? null,
    discountAmount: Number(snapshot.discountAmount) || 0,
    discountPercent: Number(snapshot.discountPercent) || 0,
    membershipDiscountLak: Number(snapshot.membershipDiscountLak) || 0,
    note: snapshot.note,
    paymentMode: snapshot.paymentMode ?? "cash",
    qrAmount: Number(snapshot.qrAmount) || 0,
    redeemPoints: Number(snapshot.redeemPoints) || 0,
    taxAmount: Number(snapshot.taxAmount) || 0,
    taxEnabled: Boolean(snapshot.taxEnabled),
    taxRatePercent: Number(snapshot.taxRatePercent) || 0,
    transferAmount: Number(snapshot.transferAmount) || 0,
  };
}

export function heldSaleCartItems(sale: HeldSale | null | undefined): PosCartItem[] {
  const snapshotItems = sale?.snapshot?.cartItems;
  if (Array.isArray(snapshotItems) && snapshotItems.length > 0) {
    return snapshotItems.map(slimPosCartItem);
  }
  if (Array.isArray(sale?.items) && sale.items.length > 0) {
    return sale.items.map(slimPosCartItem);
  }
  return [];
}

export function hasRestorableHeldCart(sale: HeldSale | null | undefined) {
  return heldSaleCartItems(sale).length > 0;
}

export function pickRestorableHeldSale(serverSale: HeldSale | null | undefined, localSale: HeldSale) {
  return hasRestorableHeldCart(serverSale) ? (serverSale as HeldSale) : localSale;
}

export function restoreCartFromHeldSale(sale: HeldSale): PosCartItem[] {
  return heldSaleCartItems(sale).map((item, index) => ({
    ...item,
    cartLineId: `${item.id}:${item.unitId ?? "default"}:held-${sale.id}-${index}`,
  }));
}

export function heldCartSummary(items: PosCartItem[]) {
  return {
    headerCount: items.length,
    lineCount: items.length,
    quantity: items.reduce((total, item) => total + Number(item.quantity), 0),
    totalLak: cartSubtotal(items),
  };
}

export function snapshotContainsEmbeddedImages(snapshot: HeldBillCartSnapshot | null | undefined) {
  const raw = JSON.stringify(snapshot ?? {});
  return /data:image\//.test(raw);
}
