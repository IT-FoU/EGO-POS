/**
 * Map a POS read model into the exact props the existing `PosPageClient`
 * consumes (Phase 6.1). This lets the SAME POS UI render from either the online
 * SSR snapshot or the offline local replica — no duplicate POS app.
 *
 * Offline props use a restrictive read-only permission policy so write actions
 * (checkout/hold/void/etc.) are blocked by the existing permission gate; this
 * phase does not implement offline writes.
 *
 * Pure module (types only) — deterministically testable.
 */

import type {
  PosCashSessionContext,
  PosCustomer,
  PosLoyaltySettings,
  PosProduct,
  PosProductUnit,
  PosPromotion,
  PosReceiptSettings,
  QrBank,
} from "@/features/pos/types";
import type {
  PosPermissionAction,
  PosPermissionPolicy,
  PosRole,
} from "@/features/pos/permissions";
import type { PosReadModel } from "./pos-read-types";

export const POS_PERMISSION_ACTIONS: PosPermissionAction[] = [
  "create_sale",
  "hold_bill",
  "resume_bill",
  "void_bill",
  "refund_bill",
  "apply_discount",
  "manual_price_override",
  "delete_item_from_bill",
  "delete_sale",
  "duplicate_sale",
  "edit_sale_customer",
  "edit_sale_note",
  "edit_sale_payment",
  "reprint_receipt",
  "view_receipt",
  "view_recent_sales",
  "cash_in",
  "cash_out",
  "split_payment",
  "multi_currency_payment",
];

export interface PosClientContext {
  branchId: string;
  branchName: string;
  warehouseId: string;
  cashierName: string;
  terminalId?: string;
}

/**
 * A read-only POS permission policy: every write action is denied so the shared
 * POS UI renders read-only offline. `view_receipt`/`view_recent_sales` are also
 * denied here because recent-sales/receipt lookups require the network.
 */
export function restrictedReadOnlyPosPolicy(ctx: PosClientContext): PosPermissionPolicy {
  const permissions = Object.fromEntries(
    POS_PERMISSION_ACTIONS.map((action) => [action, false]),
  ) as Record<PosPermissionAction, boolean>;
  const role: PosRole = "Cashier";
  return {
    role,
    userId: "offline-readonly",
    username: "offline",
    displayName: ctx.cashierName || "Offline",
    branchName: ctx.branchName,
    assignedTerminal: ctx.terminalId ?? "POS-01",
    maxDiscountPercent: 0,
    permissions,
    approvalRules: {},
    refundOwnerThresholdLak: 0,
  };
}

/** The exact prop object consumed by `PosPageClient`. */
export interface PosClientData {
  branchId: string;
  branchName: string;
  cashierName: string;
  cashSession: PosCashSessionContext;
  customers: PosCustomer[];
  loyaltySettings: PosLoyaltySettings;
  nextSaleNo: string;
  posPermissionPolicy: PosPermissionPolicy;
  products: PosProduct[];
  promotionBanners: string[];
  promotions: PosPromotion[];
  qrBanks: QrBank[];
  readOnly: boolean;
  receiptSettings: PosReceiptSettings;
  taxInclusive: boolean;
  taxRatePercent: number;
  warehouseId: string;
}

function toPosProductUnit(unit: {
  unitId: string;
  name: string;
  factor: number;
  priceLak: number;
  barcode: string | null;
}): PosProductUnit {
  return {
    allowManualUnitSelect: true,
    barcode: unit.barcode ?? "",
    conversionQty: unit.factor,
    costPriceLak: 0,
    id: unit.unitId,
    isBaseUnit: unit.factor === 1,
    isDefaultSaleUnit: unit.factor === 1,
    isPurchaseUnit: false,
    sellingPriceLak: unit.priceLak,
    sortOrder: 0,
    status: "active",
    unitName: unit.name,
  };
}

/**
 * Convert a read model + context into `PosPageClient` props. `readOnly` (default
 * true for offline) applies the restrictive policy.
 */
export function posReadModelToPosClientProps(
  model: PosReadModel,
  ctx: PosClientContext,
  options: { readOnly?: boolean; policy?: PosPermissionPolicy } = {},
): PosClientData {
  const categoryNameById = new Map(model.categories.map((c) => [c.id, c.name]));
  const stockByProduct = new Map(model.stockLevels.map((s) => [s.productId, s.available]));

  const products: PosProduct[] = model.products
    .filter((product) => product.isActive)
    .map((product) => {
      const units = product.units.map(toPosProductUnit);
      const defaultUnit = units[0];
      return {
        id: product.id,
        barcode: product.barcodes[0] ?? "",
        sku: product.sku ?? "",
        productCode: product.sku ?? "",
        nameLo: product.name,
        nameEn: product.name,
        categoryId: product.categoryId ?? undefined,
        categoryName: product.categoryId ? categoryNameById.get(product.categoryId) ?? "" : "",
        imageKey: product.imageUrl ?? "generic",
        unitName: defaultUnit?.unitName ?? "Piece",
        unitId: defaultUnit?.id,
        units,
        priceLak: product.retailPriceLak,
        conversionQty: defaultUnit?.conversionQty ?? 1,
        stockQty: stockByProduct.get(product.id) ?? 0,
      };
    });

  const customers: PosCustomer[] = model.customers.map((customer) => ({
    id: customer.id,
    customerCode: customer.code,
    name: customer.name,
    phone: customer.phone ?? "",
    membershipNumber: customer.code,
    membershipType: "Monthly",
    membershipStatus: "Active",
    membershipExpiry: "",
    membershipLevelId: customer.membershipLevelId ?? undefined,
    pointsBalance: customer.pointsBalance,
    discountPercent: customer.discountPercent,
  }));

  const promotions: PosPromotion[] = model.promotions.map((promotion) => {
    const rules = (promotion.rules ?? {}) as Record<string, unknown>;
    return {
      categories: [],
      endDate: promotion.effectiveTo ?? "",
      id: promotion.id,
      isActive: promotion.status === "active",
      membershipLevels: [],
      priority: typeof rules.priority === "number" ? rules.priority : 0,
      products: [],
      promotionName: promotion.name,
      promotionType: promotion.type,
      startDate: promotion.effectiveFrom ?? "",
      status: promotion.status,
      discountPercent: typeof rules.discountPercent === "number" ? rules.discountPercent : undefined,
      discountAmountLak:
        typeof rules.discountAmountLak === "number" ? rules.discountAmountLak : undefined,
      comboPriceLak: typeof rules.comboPriceLak === "number" ? rules.comboPriceLak : undefined,
    };
  });

  const cashSession: PosCashSessionContext = model.cashSession
    ? {
        cashInLak: 0,
        cashOutLak: 0,
        cashSalesLak: 0,
        expectedCashLak: 0,
        nonCashSalesLak: 0,
        openedAt: model.cashSession.openedAt,
        openingCashLak: model.cashSession.openingFloatLak,
        sessionId: model.cashSession.id,
        status: model.cashSession.status === "open" ? "open" : "not_started",
      }
    : {
        cashInLak: 0,
        cashOutLak: 0,
        cashSalesLak: 0,
        expectedCashLak: 0,
        nonCashSalesLak: 0,
        openedAt: null,
        openingCashLak: 0,
        sessionId: null,
        status: "not_started",
      };

  const settings = model.settings;
  const receiptSettings: PosReceiptSettings = {
    companyName: model.storeContext?.companyName ?? "",
    receiptPrefix: settings?.receiptPrefix ?? "",
    receiptHeader: settings?.receiptHeader ?? undefined,
    receiptFooter: settings?.receiptFooter ?? undefined,
    receiptPrintMode: "ask_every_time",
    showLogoOnReceipt: true,
    showTaxOnReceipt: true,
  };
  const loyaltySettings: PosLoyaltySettings = {
    loyaltyEnabled: settings?.loyaltyEnabled ?? false,
    loyaltyMinRedeemPoints: 0,
    loyaltyPointValueLak: 0,
    loyaltySpendPerPointLak: settings?.loyaltySpendPerPointLak ?? 0,
  };

  const readOnly = options.readOnly ?? true;
  const policy = options.policy ?? (readOnly ? restrictedReadOnlyPosPolicy(ctx) : undefined);
  if (!policy) {
    throw new Error("A permission policy is required when readOnly is false");
  }

  return {
    branchId: ctx.branchId,
    branchName: ctx.branchName,
    cashierName: ctx.cashierName,
    cashSession,
    customers,
    loyaltySettings,
    nextSaleNo: "",
    posPermissionPolicy: policy,
    products,
    promotionBanners: promotions.filter((p) => p.isActive).map((p) => p.promotionName).filter(Boolean),
    promotions,
    qrBanks: [] as QrBank[],
    readOnly,
    receiptSettings,
    taxInclusive: settings?.taxInclusive ?? false,
    taxRatePercent: settings?.taxRatePercent ?? 0,
    warehouseId: ctx.warehouseId,
  };
}
