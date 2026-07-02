import { PermissionMatrixDeniedError, type PermissionContext } from "@/features/permissions/platform-permissions";

export const STORE_ROLES = {
  CASHIER: "cashier",
  MANAGER: "manager",
  OWNER: "owner",
} as const;

export type StoreRoleId = (typeof STORE_ROLES)[keyof typeof STORE_ROLES];

export const STORE_ACTIONS = {
  CUSTOMER_CREATE: "customer.create",
  CUSTOMER_CREDIT_UPDATE: "customer.credit_update",
  CUSTOMER_UPDATE: "customer.update",
  INVENTORY_ADJUST: "inventory.adjust",
  INVENTORY_COUNT: "inventory.count",
  INVENTORY_STOCK_IN: "inventory.stock_in",
  INVENTORY_STOCK_OUT: "inventory.stock_out",
  INVENTORY_TRANSFER: "inventory.transfer",
  PAYMENT_RECEIVE: "payment.receive",
  PAYMENT_REFUND: "payment.refund",
  PRODUCT_CREATE: "product.create",
  PRODUCT_DELETE: "product.delete",
  PRODUCT_PRICE_CHANGE: "product.price_change",
  PRODUCT_UPDATE: "product.update",
  PROMOTION_APPLY: "promotion.apply",
  PROMOTION_REVERSE: "promotion.reverse",
  REPORTS_VIEW_FULL: "reports.view_full",
  REPORTS_VIEW_OWN_SHIFT: "reports.view_own_shift",
  SALE_COMPLETE: "sale.complete",
  SALE_REFUND: "sale.refund",
  SALE_VOID: "sale.void",
  SHIFT_CLOSE: "shift.close",
  SHIFT_OPEN: "shift.open",
  STAFF_MANAGE: "staff.manage",
  STORE_ACTIVITY_LOGS_VIEW_OWN_STORE: "store_activity_logs.view_own_store",
  SUBSCRIPTION_BILLING_CHANGE: "subscription_billing.change",
  SUBSCRIPTION_BILLING_VIEW: "subscription_billing.view",
} as const;

export type StoreAction = (typeof STORE_ACTIONS)[keyof typeof STORE_ACTIONS];

export type CurrentStoreUser = {
  branchId?: string | null;
  businessId: string;
  deviceName?: string | null;
  id?: string | null;
  name: string;
  role: StoreRoleId | string;
  terminalId?: string | null;
  terminalName?: string | null;
};

const allStoreActions = Object.values(STORE_ACTIONS);

const managerAllowed = new Set<StoreAction>([
  STORE_ACTIONS.SALE_COMPLETE,
  STORE_ACTIONS.SALE_VOID,
  STORE_ACTIONS.SALE_REFUND,
  STORE_ACTIONS.SHIFT_OPEN,
  STORE_ACTIONS.SHIFT_CLOSE,
  STORE_ACTIONS.INVENTORY_ADJUST,
  STORE_ACTIONS.INVENTORY_STOCK_IN,
  STORE_ACTIONS.INVENTORY_STOCK_OUT,
  STORE_ACTIONS.INVENTORY_TRANSFER,
  STORE_ACTIONS.INVENTORY_COUNT,
  STORE_ACTIONS.PRODUCT_CREATE,
  STORE_ACTIONS.PRODUCT_UPDATE,
  STORE_ACTIONS.PRODUCT_DELETE,
  STORE_ACTIONS.PRODUCT_PRICE_CHANGE,
  STORE_ACTIONS.CUSTOMER_CREATE,
  STORE_ACTIONS.CUSTOMER_UPDATE,
  STORE_ACTIONS.CUSTOMER_CREDIT_UPDATE,
  STORE_ACTIONS.PAYMENT_RECEIVE,
  STORE_ACTIONS.PAYMENT_REFUND,
  STORE_ACTIONS.PROMOTION_APPLY,
  STORE_ACTIONS.PROMOTION_REVERSE,
  STORE_ACTIONS.STAFF_MANAGE,
  STORE_ACTIONS.REPORTS_VIEW_FULL,
  STORE_ACTIONS.STORE_ACTIVITY_LOGS_VIEW_OWN_STORE,
]);

const cashierAllowed = new Set<StoreAction>([
  STORE_ACTIONS.SALE_COMPLETE,
  STORE_ACTIONS.SHIFT_OPEN,
  STORE_ACTIONS.SHIFT_CLOSE,
  STORE_ACTIONS.CUSTOMER_CREATE,
  STORE_ACTIONS.CUSTOMER_UPDATE,
  STORE_ACTIONS.PAYMENT_RECEIVE,
  STORE_ACTIONS.PROMOTION_APPLY,
  STORE_ACTIONS.REPORTS_VIEW_OWN_SHIFT,
]);

export const STORE_PERMISSION_MATRIX: Record<StoreRoleId, ReadonlySet<StoreAction> | "*"> = {
  [STORE_ROLES.OWNER]: "*",
  [STORE_ROLES.MANAGER]: managerAllowed,
  [STORE_ROLES.CASHIER]: cashierAllowed,
};

export function normalizeStoreRole(role: string | null | undefined): StoreRoleId {
  const normalized = String(role ?? STORE_ROLES.CASHIER).trim().toLowerCase();
  return Object.values(STORE_ROLES).includes(normalized as StoreRoleId)
    ? (normalized as StoreRoleId)
    : STORE_ROLES.CASHIER;
}

export function hasStorePermission(role: string | null | undefined, action: StoreAction) {
  const permissions = STORE_PERMISSION_MATRIX[normalizeStoreRole(role)];
  return permissions === "*" || permissions.has(action);
}

export function canPerformStoreAction(
  currentStoreUser: Pick<CurrentStoreUser, "role"> | null | undefined,
  action: StoreAction,
  _context: PermissionContext = {},
) {
  return Boolean(currentStoreUser && hasStorePermission(currentStoreUser.role, action));
}

export function requireStorePermission(
  currentStoreUser: Pick<CurrentStoreUser, "role"> | null | undefined,
  action: StoreAction,
  context: PermissionContext = {},
) {
  if (!canPerformStoreAction(currentStoreUser, action, context)) {
    throw new PermissionMatrixDeniedError(currentStoreUser?.role ?? "anonymous", action);
  }
}

export function getAllStoreActions() {
  return allStoreActions;
}

// Cashier refund/void remains denied here; the POS API can accept a separate audited manager PIN override.
