/**
 * POS read model (Phase 6).
 *
 * A single normalized read model shared by the online (SSR snapshot) and offline
 * (local replica) POS read adapters. The model reuses the Phase 5 reference
 * payload shapes so both sources produce identical reads. Contains only
 * POS-required, non-secret data.
 */

import type {
  CashSessionPayload,
  CategoryPayload,
  CustomerPayload,
  ProductPayload,
  ProductUnitPayload,
  PromotionPayload,
  SettingsPayload,
  StockLevelPayload,
  StoreContextPayload,
} from "../replica/reference-types";

export type {
  CashSessionPayload,
  CategoryPayload,
  CustomerPayload,
  ProductPayload,
  PromotionPayload,
  SettingsPayload,
  StockLevelPayload,
  StoreContextPayload,
};

export type PosReadSource = "online" | "offline";

export interface PosReadModel {
  storeContext: StoreContextPayload | null;
  settings: SettingsPayload | null;
  categories: CategoryPayload[];
  products: ProductPayload[];
  customers: CustomerPayload[];
  promotions: PromotionPayload[];
  stockLevels: StockLevelPayload[];
  cashSession: CashSessionPayload | null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** Loose structural view of the SSR `getPosSnapshot` result used by the mapper. */
export interface OnlineSnapshotInput {
  branchId?: string;
  branchName?: string;
  warehouseId?: string;
  products?: Array<Record<string, any>>;
  customers?: Array<Record<string, any>>;
  promotions?: Array<Record<string, any>>;
  cashSession?: Record<string, any> | null;
  receiptSettings?: Record<string, any> | null;
  loyaltySettings?: Record<string, any> | null;
  taxRatePercent?: number;
  taxInclusive?: boolean;
}

/**
 * Map the existing SSR POS snapshot into the normalized read model. Pure; used
 * by the online adapter so online reads are unchanged in meaning.
 */
export function posSnapshotToReadModel(snapshot: OnlineSnapshotInput): PosReadModel {
  const warehouseId = snapshot.warehouseId ?? null;

  const products: ProductPayload[] = (snapshot.products ?? []).map((product) => {
    const units: ProductUnitPayload[] = (product.units ?? []).map((unit: Record<string, any>) => ({
      unitId: str(unit.id),
      name: str(unit.unitName),
      factor: num(unit.conversionQty) || 1,
      priceLak: num(unit.sellingPriceLak),
      barcode: unit.barcode ? str(unit.barcode) : null,
    }));
    const barcodes = [product.barcode, ...units.map((u) => u.barcode)].filter(
      (b): b is string => typeof b === "string" && b.length > 0,
    );
    return {
      id: str(product.id),
      name: str(product.nameEn || product.nameLo),
      sku: product.sku ? str(product.sku) : null,
      categoryId: product.categoryId ?? null,
      retailPriceLak: num(product.priceLak),
      barcodes: [...new Set(barcodes)],
      units,
      stockDisplayMode: product.stockDisplayMode ?? null,
      imageUrl: product.unitImageUrl ?? null,
      isActive: true,
    };
  });

  const categorySeen = new Map<string, string>();
  for (const product of snapshot.products ?? []) {
    const id = product.categoryId;
    if (id && !categorySeen.has(id)) categorySeen.set(id, str(product.categoryName));
  }
  const categories: CategoryPayload[] = [...categorySeen].map(([id, name]) => ({
    id,
    name,
    parentId: null,
  }));

  const customers: CustomerPayload[] = (snapshot.customers ?? []).map((customer) => ({
    id: str(customer.id),
    code: str(customer.customerCode ?? customer.code),
    name: str(customer.name ?? customer.fullName),
    phone: customer.phone ? str(customer.phone) : null,
    membershipLevelId: customer.membershipLevelId ?? null,
    discountPercent: num(customer.discountPercent),
    pointsBalance: num(customer.pointsBalance),
  }));

  const promotions: PromotionPayload[] = (snapshot.promotions ?? []).map((promotion) => ({
    id: str(promotion.id),
    name: str(promotion.promotionName),
    version: 1,
    type: str(promotion.promotionType || "percentage"),
    status: str(promotion.status || "active"),
    effectiveFrom: promotion.startDate ?? null,
    effectiveTo: promotion.endDate ?? null,
    rules: {
      discountPercent: promotion.discountPercent ?? null,
      discountAmountLak: promotion.discountAmountLak ?? null,
      comboPriceLak: promotion.comboPriceLak ?? null,
    },
  }));

  const stockLevels: StockLevelPayload[] = (snapshot.products ?? []).map((product) => ({
    productId: str(product.id),
    warehouseId: warehouseId ?? "",
    available: num(product.stockQty),
    lots: [],
    terminalAllocatedQty: null,
  }));

  const cashSession: CashSessionPayload | null =
    snapshot.cashSession && snapshot.cashSession.sessionId
      ? {
          id: str(snapshot.cashSession.sessionId),
          status: str(snapshot.cashSession.status),
          openedAt: snapshot.cashSession.openedAt
            ? new Date(snapshot.cashSession.openedAt).toISOString()
            : null,
          openingFloatLak: num(snapshot.cashSession.openingCashLak),
        }
      : null;

  const settings: SettingsPayload = {
    taxRatePercent: num(snapshot.taxRatePercent),
    taxInclusive: Boolean(snapshot.taxInclusive),
    receiptPrefix: str(snapshot.receiptSettings?.receiptPrefix),
    receiptHeader: snapshot.receiptSettings?.receiptHeader ?? null,
    receiptFooter: snapshot.receiptSettings?.receiptFooter ?? null,
    loyaltyEnabled: Boolean(snapshot.loyaltySettings?.loyaltyEnabled),
    loyaltySpendPerPointLak:
      snapshot.loyaltySettings?.loyaltySpendPerPointLak == null
        ? null
        : num(snapshot.loyaltySettings.loyaltySpendPerPointLak),
    baseCurrency: "LAK",
  };

  const storeContext: StoreContextPayload | null =
    snapshot.branchId
      ? {
          companyId: "",
          companyName: "",
          branchId: str(snapshot.branchId),
          branchName: str(snapshot.branchName),
          warehouseId,
          terminalId: "",
          deviceId: "",
        }
      : null;

  return { storeContext, settings, categories, products, customers, promotions, stockLevels, cashSession };
}
