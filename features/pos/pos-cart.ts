import type { PosCartItem, PosProduct, PosProductUnit } from "@/features/pos/types";

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

export function findPosScanMatch(products: PosProduct[], rawQuery: string) {
  const normalized = rawQuery.trim();
  if (!normalized) return null;

  const lower = normalized.toLowerCase();
  for (const product of products) {
    const unit = (product.units ?? []).find((item) => item.barcode === normalized && item.status !== "inactive");
    if (unit) {
      return { product, unit };
    }
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

export function productWithSaleUnit(product: PosProduct, unit: PosProductUnit): PosProduct {
  return {
    ...product,
    barcode: unit.barcode || product.barcode,
    conversionQty: unit.conversionQty,
    costPriceLak: unit.costPriceLak,
    priceLak: unit.sellingPriceLak,
    unitId: unit.id,
    unitImageUrl: unit.imageUrl || product.unitImageUrl,
    unitName: unit.unitName,
  };
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
