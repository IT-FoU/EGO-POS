import assert from "node:assert/strict";
import {
  PLATFORM_ACTIONS,
  canPerformPlatformAction,
  hasPlatformPermission,
} from "../features/permissions/platform-permissions";
import {
  STORE_ACTIONS,
  canPerformStoreAction,
  hasStorePermission,
} from "../features/permissions/store-permissions";
import {
  canViewPlatformAuditAction,
  canViewStoreActivityLogs,
} from "../features/permissions/audit-permission-helpers";
import {
  canViewFullStoreReports,
  canViewStoreNavigationItem,
  resolveStoreUiRole,
} from "../features/permissions/store-ui-permissions";
import { isManagerPinApprovalEligible } from "../lib/auth/store-manager-approval";

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
check("manager can sale.refund", hasStorePermission("manager", STORE_ACTIONS.SALE_REFUND));
check("manager can inventory.adjust", hasStorePermission("manager", STORE_ACTIONS.INVENTORY_ADJUST));
check("manager can reports.view_full", hasStorePermission("manager", STORE_ACTIONS.REPORTS_VIEW_FULL));
check("cashier can sale.complete", canPerformStoreAction({ role: "cashier" }, STORE_ACTIONS.SALE_COMPLETE));
check("cashier can customer.create", canPerformStoreAction({ role: "cashier" }, STORE_ACTIONS.CUSTOMER_CREATE));
check("cashier cannot sale.void", !hasStorePermission("cashier", STORE_ACTIONS.SALE_VOID));
check("cashier cannot sale.refund", !hasStorePermission("cashier", STORE_ACTIONS.SALE_REFUND));
check("cashier cannot inventory.adjust", !hasStorePermission("cashier", STORE_ACTIONS.INVENTORY_ADJUST));
check("cashier cannot product.price_change", !hasStorePermission("cashier", STORE_ACTIONS.PRODUCT_PRICE_CHANGE));
check("cashier cannot reports.view_full", !hasStorePermission("cashier", STORE_ACTIONS.REPORTS_VIEW_FULL));
check("cashier manager PIN override eligible for refund bundle", isManagerPinApprovalEligible([STORE_ACTIONS.SALE_REFUND, STORE_ACTIONS.PAYMENT_REFUND]));
check("cashier manager PIN override eligible for void bundle", isManagerPinApprovalEligible([STORE_ACTIONS.SALE_VOID, STORE_ACTIONS.PROMOTION_REVERSE]));
check("cashier manager PIN override not eligible for inventory", !isManagerPinApprovalEligible([STORE_ACTIONS.INVENTORY_ADJUST]));
check("cashier manager PIN override not eligible for customer credit", !isManagerPinApprovalEligible([STORE_ACTIONS.CUSTOMER_CREDIT_UPDATE]));
check("UI resolves mixed store roles to owner privilege", resolveStoreUiRole(["Cashier", "Owner"]) === "owner");
check("cashier UI can see POS navigation", canViewStoreNavigationItem("cashier", "pos"));
check("cashier UI cannot see Products navigation", !canViewStoreNavigationItem("cashier", "products"));
check("cashier UI cannot see full Reports", !canViewFullStoreReports("cashier"));
check("manager UI can see Inventory navigation", canViewStoreNavigationItem("manager", "inventory"));
check("billing_admin audit scope allows subscription action", canViewPlatformAuditAction("billing_admin", "subscription.mark_paid"));
check("billing_admin audit scope rejects store activity action", !canViewPlatformAuditAction("billing_admin", "store_activity_logs.view_all"));
check("template_manager audit scope allows pos_template action", canViewPlatformAuditAction("template_manager", "pos_template.update"));
check("template_manager audit scope rejects business action", !canViewPlatformAuditAction("template_manager", "business.create"));
check("support_admin denied business.delete", !canPerformPlatformAction({ role: "support_admin" }, PLATFORM_ACTIONS.BUSINESS_DELETE));
check("super_admin allowed plan.change", canPerformPlatformAction({ role: "super_admin" }, PLATFORM_ACTIONS.PLAN_CHANGE));
check("billing_admin denied store activity logs all", !canViewStoreActivityLogs("billing_admin", { businessId: "biz_1" }));
check("template_manager denied store activity logs all", !canViewStoreActivityLogs("template_manager", { businessId: "biz_1" }));
