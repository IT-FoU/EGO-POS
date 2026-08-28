import { permissionKeysForCheck } from "@/features/access-control/permission-catalog";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { tenantFromSession, type TenantContext } from "@/lib/db/write-context";

export const WRITE_PERMISSIONS = {
  categoriesManage: "categories.manage",
  customersCreate: "customers.create",
  customersPayment: "customers.payment",
  customersUpdate: "customers.update",
  inventoryAdjust: "inventory.adjust",
  inventoryCount: "inventory.count",
  inventoryStockIn: "inventory.stock_in",
  membershipLevelsManage: "membership_levels.manage",
  posSell: "pos.sell",
  posCashSessionManage: "pos.cash_session.manage",
  productsCreate: "products.create",
  productsDelete: "products.delete",
  productsUpdate: "products.update",
  promotionsCreate: "promotions.create",
  promotionsDelete: "promotions.delete",
  promotionsUpdate: "promotions.update",
  promotionActivate: "promotion.activate",
  promotionAnalyticsView: "promotion.analytics.view",
  promotionApprove: "promotion.approve",
  promotionCouponManage: "promotion.coupon.manage",
  promotionCreate: "promotion.create",
  promotionDelete: "promotion.delete",
  promotionEdit: "promotion.edit",
  promotionNearExpiryManage: "promotion.nearExpiry.manage",
  promotionSlowMovingManage: "promotion.slowMoving.manage",
  promotionStackRulesManage: "promotion.stackRules.manage",
  promotionView: "promotion.view",
  purchasingCreate: "purchasing.create",
  purchasingEdit: "purchasing.edit",
  purchasingPayment: "purchasing.payment",
  purchasingReceive: "purchasing.receive",
  settingsManage: "settings.manage",
  staffManage: "staff.edit",
  rolesManage: "roles.manage",
  approvalsManage: "approvals.approve",
  suppliersCreate: "suppliers.create",
  suppliersDelete: "suppliers.delete",
  suppliersUpdate: "suppliers.update",
} as const;

export const READ_PERMISSIONS = {
  approvalsView: "approvals.view",
  customersView: "customers.view",
  dashboardView: "dashboard.view",
  posCashSessionView: "pos.cash_session.view",
  inventoryView: "inventory.view",
  membershipView: "membership.view",
  posView: "pos.view",
  productsView: "products.view",
  promotionsView: "promotions.view",
  purchasingView: "purchasing.view",
  reportsView: "reports.view",
  settingsView: "settings.view",
  staffView: "staff.view",
} as const;

export type WritePermissionKey = (typeof WRITE_PERMISSIONS)[keyof typeof WRITE_PERMISSIONS];
export type ReadPermissionKey = (typeof READ_PERMISSIONS)[keyof typeof READ_PERMISSIONS];
export type PermissionKey = WritePermissionKey | ReadPermissionKey;

export class PermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export async function assertPermission(tenant: TenantContext, permission: PermissionKey, client?: any) {
  const grantedKeys = await getUserPermissionKeys(tenant, client);
  if (grantedKeys.includes("*")) {
    return;
  }

  const keysToCheck = permissionKeysForCheck(permission);
  if (keysToCheck.some((key) => grantedKeys.includes(key))) {
    return;
  }

  throw new PermissionDeniedError(permission);
}

export async function requireWritePermission(permission: WritePermissionKey) {
  const { requireSession } = await import("@/lib/auth/session");
  const tenant = tenantFromSession(await requireSession());
  await assertPermission(tenant, permission);
  return tenant;
}

export async function requireReadPermission(permission: ReadPermissionKey) {
  const { requireSession } = await import("@/lib/auth/session");
  const tenant = tenantFromSession(await requireSession());
  await assertPermission(tenant, permission);
  return tenant;
}
