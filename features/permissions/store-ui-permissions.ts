import {
  hasStorePermission,
  normalizeStoreRole,
  STORE_ACTIONS,
  STORE_ROLES,
  type StoreAction,
  type StoreRoleId,
} from "@/features/permissions/store-permissions";

type StoreRoleInput = string | string[] | null | undefined;

const rolePriority: StoreRoleId[] = [
  STORE_ROLES.OWNER,
  STORE_ROLES.MANAGER,
  STORE_ROLES.CASHIER,
];

export function resolveStoreUiRole(roleInput: StoreRoleInput): StoreRoleId {
  const roles = Array.isArray(roleInput) ? roleInput : [roleInput];
  const normalized = roles.map((role) => normalizeStoreRole(role));
  return rolePriority.find((role) => normalized.includes(role)) ?? STORE_ROLES.CASHIER;
}

export function canUseStoreAction(roleInput: StoreRoleInput, action: StoreAction) {
  return hasStorePermission(resolveStoreUiRole(roleInput), action);
}

/** True when cashier lacks elevated Return/Exchange/Void store actions and needs Manager/Owner PIN. */
export function needsPostSaleManagerPin(
  roleInput: StoreRoleInput,
  action: "return" | "exchange" | "void",
) {
  if (resolveStoreUiRole(roleInput) !== STORE_ROLES.CASHIER) {
    return false;
  }
  if (action === "void") {
    return !canUseStoreAction(roleInput, STORE_ACTIONS.SALE_VOID);
  }
  return !(
    canUseStoreAction(roleInput, STORE_ACTIONS.SALE_REFUND) &&
    canUseStoreAction(roleInput, STORE_ACTIONS.PAYMENT_REFUND)
  );
}

export function canUseAnyStoreAction(roleInput: StoreRoleInput, actions: StoreAction[]) {
  return actions.some((action) => canUseStoreAction(roleInput, action));
}

export function canViewStoreNavigationItem(roleInput: StoreRoleInput, key: string) {
  switch (key) {
    case "dashboard":
      return canUseStoreAction(roleInput, STORE_ACTIONS.REPORTS_VIEW_FULL);
    case "pos":
      return canUseStoreAction(roleInput, STORE_ACTIONS.SALE_COMPLETE);
    case "customers":
      return canUseAnyStoreAction(roleInput, [
        STORE_ACTIONS.CUSTOMER_CREATE,
        STORE_ACTIONS.CUSTOMER_UPDATE,
      ]);
    case "inventory":
      return canUseAnyStoreAction(roleInput, [
        STORE_ACTIONS.INVENTORY_ADJUST,
        STORE_ACTIONS.INVENTORY_COUNT,
        STORE_ACTIONS.INVENTORY_STOCK_IN,
        STORE_ACTIONS.INVENTORY_STOCK_OUT,
        STORE_ACTIONS.INVENTORY_TRANSFER,
      ]);
    case "products":
      return canUseAnyStoreAction(roleInput, [
        STORE_ACTIONS.PRODUCT_CREATE,
        STORE_ACTIONS.PRODUCT_UPDATE,
        STORE_ACTIONS.PRODUCT_DELETE,
        STORE_ACTIONS.PRODUCT_PRICE_CHANGE,
      ]);
    case "promotions":
      return canUseActionGroup(roleInput, "promotion-management");
    case "membership":
    case "purchasing":
    case "suppliers":
      return canUseAnyStoreAction(roleInput, [
        STORE_ACTIONS.INVENTORY_STOCK_IN,
        STORE_ACTIONS.INVENTORY_STOCK_OUT,
        STORE_ACTIONS.INVENTORY_TRANSFER,
      ]);
    case "reports":
      return canUseStoreAction(roleInput, STORE_ACTIONS.REPORTS_VIEW_FULL);
    case "settings":
      return canUseStoreAction(roleInput, STORE_ACTIONS.STAFF_MANAGE);
    default:
      return false;
  }
}

export function canUseActionGroup(roleInput: StoreRoleInput, group: "promotion-management") {
  if (group === "promotion-management") {
    return canUseStoreAction(roleInput, STORE_ACTIONS.PROMOTION_REVERSE);
  }
  return false;
}

export function canViewFullStoreReports(roleInput: StoreRoleInput) {
  return canUseStoreAction(roleInput, STORE_ACTIONS.REPORTS_VIEW_FULL);
}

export function canManageStoreSettings(roleInput: StoreRoleInput) {
  return canUseStoreAction(roleInput, STORE_ACTIONS.STAFF_MANAGE);
}

