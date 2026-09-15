import type { PosCartItem, PosProduct, PosProductUnit } from "@/features/pos/types";
import { isRenderableImageUrl } from "@/lib/storage/product-image-ref";

export function maxSellQty(stockQty: number, conversionQty = 1) {
  const conversion = conversionQty > 0 ? conversionQty : 1;
  return Math.max(0, Math.floor(Number(stockQty) / conversion));
}

export function requiredBaseQty(quantity: number, conversionQty = 1) {
  const conversion = conversionQty > 0 ? conversionQty : 1;
  return quantity * conversion;
}

export function cartLineSubtotal(item: Pick<PosCartItem, "priceLak" | "quantity">) {
  return Number(item.priceLak) * Number(item.quantity);
}

export function cartSubtotal(items: Array<Pick<PosCartItem, "priceLak" | "quantity">>) {
  return items.reduce((total, item) => total + cartLineSubtotal(item), 0);
}

export function filterPosCatalogue(products: PosProduct[], query: string, category = "All") {
  const normalized = query.trim().toLowerCase();
  return products.filter((product) => {
    const categoryMatch = category === "All" || product.categoryName === category;
    if (!normalized) return categoryMatch;
    const barcode = query.trim();
    const queryMatch =
      product.nameEn.toLowerCase().includes(normalized) ||
      product.nameLo.toLowerCase().includes(normalized) ||
      product.sku.toLowerCase().includes(normalized) ||
      (product.productCode ?? "").toLowerCase().includes(normalized) ||
      product.barcode.includes(barcode) ||
      (product.units ?? []).some((unit) => unit.barcode.includes(barcode));
    return categoryMatch && queryMatch;
  });
}

export function findPosScanMatch(products: PosProduct[], rawQuery: string): {
  conflict?: boolean;
  matches?: Array<{ product: PosProduct; unit: PosProductUnit }>;
  product: PosProduct;
  unit?: PosProductUnit;
} | null {
  const normalized = rawQuery.trim();
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  const unitMatches: Array<{ product: PosProduct; unit: PosProductUnit }> = [];
  for (const product of products) {
    const unit = (product.units ?? []).find((item) => item.barcode === normalized && item.status !== "inactive");
    if (unit) {
      unitMatches.push({ product, unit });
    }
  }
  if (unitMatches.length > 1) {
    return {
      conflict: true,
      matches: unitMatches,
      product: unitMatches[0]!.product,
      unit: unitMatches[0]!.unit,
    };
  }
  if (unitMatches.length === 1) {
    return unitMatches[0]!;
  }

  for (const product of products) {
    if (product.barcode === normalized) {
      return { product, unit: undefined };
    }
    if (product.sku.toLowerCase() === lower || product.productCode?.toLowerCase() === lower) {
      return { product, unit: undefined };
    }
  }
  return null;
}

export function defaultPosSaleUnit(product: PosProduct): PosProductUnit | undefined {
  const units = (product.units ?? []).filter((unit) => unit.status !== "inactive" && unit.allowManualUnitSelect !== false);
  return units.find((unit) => unit.isDefaultSaleUnit) ?? units.find((unit) => unit.isBaseUnit) ?? units[0];
}

export function resolvePosSaleUnits(product: PosProduct): PosProductUnit[] {
  const units = (product.units ?? []).filter((unit) => unit.status !== "inactive" && unit.allowManualUnitSelect !== false);
  if (units.length === 0) {
    return [{
      allowManualUnitSelect: true,
      barcode: product.barcode,
      conversionQty: 1,
      costPriceLak: product.costPriceLak ?? 0,
      id: `${product.id}-default-unit`,
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      isPurchaseUnit: true,
      sellingPriceLak: product.priceLak,
      sortOrder: 0,
      status: "active",
      unitName: product.unitName,
    }];
  }
  return units;
}

export function resolveUnitCardImageUrl(product: PosProduct, unit: PosProductUnit) {
  if (isRenderableImageUrl(unit.imageUrl)) return unit.imageUrl;
  if (isRenderableImageUrl(product.productImageUrl)) return product.productImageUrl;
  if (isRenderableImageUrl(product.unitImageUrl)) return product.unitImageUrl;
  return undefined;
}

export function productWithSaleUnit(product: PosProduct, unit: PosProductUnit): PosProduct {
  return {
    ...product,
    barcode: unit.barcode || product.barcode,
    conversionQty: unit.conversionQty,
    costPriceLak: unit.costPriceLak,
    priceLak: unit.sellingPriceLak,
    unitId: unit.id,
    unitImageUrl: resolveUnitCardImageUrl(product, unit),
    unitName: unit.unitName,
  };
}

/** Expand catalogue products into per-unit sellable cards (enabled/sellable units only). */
export function expandPosSellableUnitCards(products: PosProduct[]): PosProduct[] {
  const cards: PosProduct[] = [];
  for (const product of products) {
    const saleUnits = resolvePosSaleUnits(product);
    for (const unit of saleUnits) {
      cards.push(productWithSaleUnit(product, unit));
    }
  }
  return cards;
}

export function projectPosCatalogueCards(
  products: PosProduct[],
  mode: "separate" | "combined",
): PosProduct[] {
  return mode === "separate" ? expandPosSellableUnitCards(products) : products;
}

export type AddPosCartResult = {
  added: boolean;
  capped: boolean;
  cart: PosCartItem[];
  reason?: "out_of_stock" | "stock_limit";
};

export function addPosCartLine(
  cart: PosCartItem[],
  pricedProduct: PosCartItem,
): AddPosCartResult {
  const conversionQty = pricedProduct.conversionQty ?? 1;
  const limit = maxSellQty(pricedProduct.stockQty, conversionQty);
  if (limit < 1) {
    return { added: false, capped: false, cart, reason: "out_of_stock" };
  }

  const existing = cart.find((item) => item.id === pricedProduct.id && item.unitId === pricedProduct.unitId);
  if (existing) {
    if (existing.quantity >= limit) {
      return { added: false, capped: true, cart, reason: "stock_limit" };
    }
    return {
      added: true,
      capped: existing.quantity + 1 >= limit,
      cart: cart.map((item) =>
        item.id === pricedProduct.id && item.unitId === pricedProduct.unitId
          ? { ...item, quantity: existing.quantity + 1 }
          : item,
      ),
    };
  }

  return {
    added: true,
    capped: false,
    cart: [
      ...cart,
      {
        ...pricedProduct,
        cartLineId: `${pricedProduct.id}:${pricedProduct.unitId ?? "default"}`,
        quantity: 1,
      },
    ],
  };
}

export function planPosCartAdd(
  cart: PosCartItem[],
  product: PosProduct,
  selectedUnit?: PosProductUnit,
  pricedOverrides: Partial<PosCartItem> = {},
): {
  line: PosCartItem;
  maxSellableQty: number;
  requestedBaseQty: number;
  requestedSellQty: number;
  result: AddPosCartResult;
  saleUnit: PosProductUnit;
} {
  const saleUnit = selectedUnit ?? resolvePosSaleUnits(product)[0]!;
  const unitProduct = productWithSaleUnit(product, saleUnit);
  const conversionQty = Number(saleUnit?.conversionQty ?? unitProduct.conversionQty ?? 1);
  const requestedSellQty = 1;
  const line: PosCartItem = {
    ...unitProduct,
    ...pricedOverrides,
    conversionQty,
    id: product.id,
    quantity: requestedSellQty,
    retailPriceLak: pricedOverrides.retailPriceLak ?? unitProduct.priceLak,
    stockQty: product.stockQty,
    unitId: saleUnit?.id ?? unitProduct.unitId,
    unitName: saleUnit?.unitName ?? unitProduct.unitName,
  };
  return {
    line,
    maxSellableQty: maxSellQty(product.stockQty, conversionQty),
    requestedBaseQty: requiredBaseQty(requestedSellQty, conversionQty),
    requestedSellQty,
    result: addPosCartLine(cart, line),
    saleUnit,
  };
}

export function updatePosCartQuantity(
  cart: PosCartItem[],
  productId: string,
  quantity: number,
  unitId?: string,
) {
  return cart.map((item) => {
    if (item.id !== productId || item.unitId !== unitId) return item;
    const limit = maxSellQty(item.stockQty, item.conversionQty ?? 1);
    if (limit < 1) return { ...item, quantity: 1 };
    return { ...item, quantity: Math.max(1, Math.min(quantity, limit)) };
  });
}

export function removePosCartLine(cart: PosCartItem[], productId: string, unitId?: string) {
  return cart.filter((item) => !(item.id === productId && item.unitId === unitId));
}

export function cartExceedsStock(cart: PosCartItem[], products: PosProduct[]) {
  const soldByProduct = cart.reduce<Record<string, number>>((totals, item) => {
    totals[item.id] = (totals[item.id] ?? 0) + requiredBaseQty(item.quantity, item.conversionQty ?? 1);
    return totals;
  }, {});

  for (const [productId, soldQty] of Object.entries(soldByProduct)) {
    const product = products.find((item) => item.id === productId);
    if (!product) return `Product was not found. Sale was not completed.`;
    if (soldQty > product.stockQty) {
      return `Insufficient stock for ${product.nameEn}. Available ${product.stockQty}, requested ${soldQty}.`;
    }
  }
  return null;
}
