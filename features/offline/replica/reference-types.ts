/**
 * Reference-data replica types (Phase 5).
 *
 * The minimum Mini Mart reference data required to safely prepare offline POS.
 * Every reference record is versioned and tombstone-aware, and carries its
 * tenant/branch/warehouse scope so isolation can be enforced on apply. Payloads
 * are POS-facing and contain NO secrets, tokens, passwords, admin data, or
 * unrelated reports.
 */

/** Reference entity kinds included in the offline POS replica. */
export const ReferenceEntityType = {
  /** company/store + branch + warehouse + terminal context (singleton). */
  storeContext: "store_context",
  /** POS policy / security snapshot (singleton, non-secret). */
  securitySnapshot: "security_snapshot",
  /** store/receipt/tax/currency/loyalty settings (singleton). */
  settings: "settings",
  category: "category",
  product: "product",
  customer: "customer",
  promotion: "promotion",
  qrBank: "qr_bank",
  /** read-only stock/lot/expiry snapshot, respecting terminal allocation. */
  stockLevel: "stock_level",
  /** active cash-session context (singleton, if a session is open). */
  cashSession: "cash_session",
} as const;

export type ReferenceEntityTypeValue =
  (typeof ReferenceEntityType)[keyof typeof ReferenceEntityType];

/** Deterministic apply/order priority (context/policy/settings first). */
export const REFERENCE_TYPE_ORDER: ReferenceEntityTypeValue[] = [
  ReferenceEntityType.storeContext,
  ReferenceEntityType.securitySnapshot,
  ReferenceEntityType.settings,
  ReferenceEntityType.category,
  ReferenceEntityType.product,
  ReferenceEntityType.customer,
  ReferenceEntityType.promotion,
  ReferenceEntityType.qrBank,
  ReferenceEntityType.stockLevel,
  ReferenceEntityType.cashSession,
];

/** Scope carried by every reference entity for isolation checks. */
export interface ReferenceScope {
  companyId: string;
  branchId: string | null;
  warehouseId: string | null;
}

/** A single reference entity as delivered by bootstrap/delta (Phase 4 contract). */
export interface ReferenceEntity<TPayload = unknown> {
  entityType: ReferenceEntityTypeValue;
  entityId: string;
  version: number;
  deleted: boolean;
  scope: ReferenceScope;
  payload: TPayload;
}

// ---- POS-facing payload shapes (minimum required) ----

export interface StoreContextPayload {
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  warehouseId: string | null;
  terminalId: string;
  deviceId: string;
}

export interface SettingsPayload {
  taxRatePercent: number;
  taxInclusive: boolean;
  receiptPrefix: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  loyaltyEnabled: boolean;
  loyaltySpendPerPointLak: number | null;
  baseCurrency: string;
}

export interface CategoryPayload {
  id: string;
  name: string;
  parentId: string | null;
}

export interface ProductUnitPayload {
  unitId: string;
  name: string;
  factor: number;
  priceLak: number;
  barcode: string | null;
}

export interface ProductPayload {
  id: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  retailPriceLak: number;
  barcodes: string[];
  units: ProductUnitPayload[];
  stockDisplayMode: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

export interface CustomerPayload {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  membershipLevelId: string | null;
  discountPercent: number;
  pointsBalance: number;
}

export interface PromotionPayload {
  id: string;
  name: string;
  version: number;
  type: string;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** Only fields safe to evaluate offline; server remains authoritative. */
  rules: unknown;
}

export interface QrBankPayload {
  id: string;
  bankName: string;
  shortCode: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface StockLotPayload {
  lotId: string;
  quantity: number;
  expiryDate: string | null;
}

export interface StockLevelPayload {
  productId: string;
  warehouseId: string;
  available: number;
  lots: StockLotPayload[];
  /** Terminal sellable lease for this device, when one exists (Phase 3). */
  terminalAllocatedQty: number | null;
}

export interface CashSessionPayload {
  id: string;
  status: string;
  openedAt: string | null;
  openingFloatLak: number;
}
