import assert from "node:assert/strict";
import {
  PLATFORM_ACTIONS,
  STORE_ACTIONS,
  canPerformPlatformAction,
  canPerformStoreAction,
  canViewPlatformAuditAction,
  hasPlatformPermission,
  hasStorePermission,
} from "../features/permissions";

function check(name: string, value: boolean) {
  assert.equal(value, true, name);
  console.log(`✓ ${name}`);
}

check("super_admin can perform all platform actions", hasPlatformPermission("super_admin", PLATFORM_ACTIONS.BUSINESS_DELETE));
check("support_admin can business.view", hasPlatformPermission("support_admin", PLATFORM_ACTIONS.BUSINESS_VIEW));
check("support_admin cannot plan.change", !hasPlatformPermission("support_admin", PLATFORM_ACTIONS.PLAN_CHANGE));
check("billing_admin can subscription.mark_paid", hasPlatformPermission("billing_admin", PLATFORM_ACTIONS.SUBSCRIPTION_MARK_PAID));
check("billing_admin cannot store_activity_logs.view_all", !hasPlatformPermission("billing_admin", PLATFORM_ACTIONS.STORE_ACTIVITY_LOGS_VIEW_ALL));
check("template_manager can pos_template.update", hasPlatformPermission("template_manager", PLATFORM_ACTIONS.POS_TEMPLATE_UPDATE));
check("template_manager cannot business.create", !hasPlatformPermission("template_manager", PLATFORM_ACTIONS.BUSINESS_CREATE));
check("support_admin user.disable requires store user context", !canPerformPlatformAction({ role: "support_admin" }, PLATFORM_ACTIONS.USER_DISABLE));
check("support_admin user.disable allowed for future store user context", canPerformPlatformAction({ role: "support_admin" }, PLATFORM_ACTIONS.USER_DISABLE, { isStoreUserAction: true }));

check("owner can sale.refund", hasStorePermission("owner", STORE_ACTIONS.SALE_REFUND));
check("manager can inventory.adjust", hasStorePermission("manager", STORE_ACTIONS.INVENTORY_ADJUST));
check("cashier can sale.complete", canPerformStoreAction({ role: "cashier" }, STORE_ACTIONS.SALE_COMPLETE));
check("cashier cannot sale.refund", !hasStorePermission("cashier", STORE_ACTIONS.SALE_REFUND));
check("cashier cannot inventory.adjust", !hasStorePermission("cashier", STORE_ACTIONS.INVENTORY_ADJUST));
check("billing_admin audit scope allows subscription action", canViewPlatformAuditAction("billing_admin", "subscription.mark_paid"));
check("billing_admin audit scope rejects store activity action", !canViewPlatformAuditAction("billing_admin", "store_activity_logs.view_all"));
check("template_manager audit scope allows pos_template action", canViewPlatformAuditAction("template_manager", "pos_template.update"));
check("template_manager audit scope rejects business action", !canViewPlatformAuditAction("template_manager", "business.create"));
