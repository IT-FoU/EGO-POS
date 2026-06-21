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

export type PermissionKey = (typeof WRITE_PERMISSIONS)[keyof typeof WRITE_PERMISSIONS];

export class PermissionDeniedError extends Error {
  constructor(permission: string) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

export async function assertPermission(tenant: TenantContext, permission: PermissionKey) {
  const grantedKeys = await getUserPermissionKeys(tenant);
  if (grantedKeys.includes("*")) {
    return;
  }

  const keysToCheck = permissionKeysForCheck(permission);
  if (keysToCheck.some((key) => grantedKeys.includes(key))) {
    return;
  }

  throw new PermissionDeniedError(permission);
}

export async function requireWritePermission(permission: PermissionKey) {
  const { requireSession } = await import("@/lib/auth/session");
  const tenant = tenantFromSession(await requireSession());
  await assertPermission(tenant, permission);
  return tenant;
}
