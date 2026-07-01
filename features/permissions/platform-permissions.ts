import type { CurrentPlatformUser, PlatformRole } from "@/lib/auth/platform-user";

export const PLATFORM_ROLES = {
  BILLING_ADMIN: "billing_admin",
  SUPER_ADMIN: "super_admin",
  SUPPORT_ADMIN: "support_admin",
  TEMPLATE_MANAGER: "template_manager",
} as const;

export type PlatformRoleId = (typeof PLATFORM_ROLES)[keyof typeof PLATFORM_ROLES] | PlatformRole;

export const PLATFORM_ACTIONS = {
  API_KEYS_MANAGE: "api_keys.manage",
  BUSINESS_ARCHIVE: "business.archive",
  BUSINESS_CREATE: "business.create",
  BUSINESS_DELETE: "business.delete",
  BUSINESS_REACTIVATE: "business.reactivate",
  BUSINESS_SUSPEND: "business.suspend",
  BUSINESS_VIEW: "business.view",
  FEATURE_TOGGLE: "feature.toggle",
  IMPERSONATE_END: "impersonate.end",
  IMPERSONATE_START: "impersonate.start",
  PLAN_CHANGE: "plan.change",
  PLAN_CUSTOM_OVERRIDE: "plan.custom_override",
  PLATFORM_AUDIT_LOGS_VIEW_ALL: "platform_audit_logs.view_all",
  PLATFORM_AUDIT_LOGS_VIEW_SCOPED: "platform_audit_logs.view_scoped",
  POS_TEMPLATE_ARCHIVE: "pos_template.archive",
  POS_TEMPLATE_DRAFT: "pos_template.draft",
  POS_TEMPLATE_PUBLISH: "pos_template.publish",
  POS_TEMPLATE_UPDATE: "pos_template.update",
  POS_TEMPLATE_VIEW: "pos_template.view",
  ROLES_EDIT: "roles.edit",
  SETTINGS_UPDATE: "settings.update",
  STORE_ACTIVITY_LOGS_VIEW_ALL: "store_activity_logs.view_all",
  STORE_ACTIVITY_LOGS_VIEW_ASSIGNED: "store_activity_logs.view_assigned",
  SUBSCRIPTION_CANCEL: "subscription.cancel",
  SUBSCRIPTION_DOWNGRADE: "subscription.downgrade",
  SUBSCRIPTION_EXTEND: "subscription.extend",
  SUBSCRIPTION_MARK_PAID: "subscription.mark_paid",
  SUBSCRIPTION_UPGRADE: "subscription.upgrade",
  USER_CREATE: "user.create",
  USER_DISABLE: "user.disable",
  USER_RESET_PASSWORD: "user.reset_password",
  USER_ROLE_CHANGE: "user.role_change",
  WEBHOOKS_MANAGE: "webhooks.manage",
} as const;

export type PlatformAction = (typeof PLATFORM_ACTIONS)[keyof typeof PLATFORM_ACTIONS];

export type PermissionContext = {
  assignedBusinessIds?: string[];
  businessId?: string;
  isStoreUserAction?: boolean;
  reason?: string;
  requiredPermission?: string;
  route?: string;
  targetId?: string;
  targetType?: string;
};

export class PermissionMatrixDeniedError extends Error {
  action: string;
  role: string;

  constructor(role: string, action: string) {
    super(`Permission denied: ${role} cannot perform ${action}`);
    this.name = "PermissionMatrixDeniedError";
    this.action = action;
    this.role = role;
  }
}

const allPlatformActions = Object.values(PLATFORM_ACTIONS);

const supportAdminAllowed = new Set<PlatformAction>([
  PLATFORM_ACTIONS.BUSINESS_CREATE,
  PLATFORM_ACTIONS.BUSINESS_SUSPEND,
  PLATFORM_ACTIONS.BUSINESS_REACTIVATE,
  PLATFORM_ACTIONS.BUSINESS_VIEW,
  PLATFORM_ACTIONS.IMPERSONATE_START,
  PLATFORM_ACTIONS.IMPERSONATE_END,
  // Future context check: support_admin can disable/reset store users only.
  PLATFORM_ACTIONS.USER_DISABLE,
  PLATFORM_ACTIONS.USER_RESET_PASSWORD,
  PLATFORM_ACTIONS.PLATFORM_AUDIT_LOGS_VIEW_SCOPED,
  PLATFORM_ACTIONS.STORE_ACTIVITY_LOGS_VIEW_ASSIGNED,
]);

const billingAdminAllowed = new Set<PlatformAction>([
  PLATFORM_ACTIONS.BUSINESS_VIEW,
  PLATFORM_ACTIONS.PLAN_CHANGE,
  PLATFORM_ACTIONS.PLAN_CUSTOM_OVERRIDE,
  PLATFORM_ACTIONS.FEATURE_TOGGLE,
  PLATFORM_ACTIONS.SUBSCRIPTION_UPGRADE,
  PLATFORM_ACTIONS.SUBSCRIPTION_DOWNGRADE,
  PLATFORM_ACTIONS.SUBSCRIPTION_EXTEND,
  PLATFORM_ACTIONS.SUBSCRIPTION_CANCEL,
  PLATFORM_ACTIONS.SUBSCRIPTION_MARK_PAID,
  PLATFORM_ACTIONS.PLATFORM_AUDIT_LOGS_VIEW_SCOPED,
]);

const templateManagerAllowed = new Set<PlatformAction>([
  PLATFORM_ACTIONS.POS_TEMPLATE_VIEW,
  PLATFORM_ACTIONS.POS_TEMPLATE_PUBLISH,
  PLATFORM_ACTIONS.POS_TEMPLATE_DRAFT,
  PLATFORM_ACTIONS.POS_TEMPLATE_ARCHIVE,
  PLATFORM_ACTIONS.POS_TEMPLATE_UPDATE,
  PLATFORM_ACTIONS.PLATFORM_AUDIT_LOGS_VIEW_SCOPED,
]);

export const PLATFORM_PERMISSION_MATRIX: Record<PlatformRoleId, ReadonlySet<PlatformAction> | "*"> = {
  [PLATFORM_ROLES.SUPER_ADMIN]: "*",
  [PLATFORM_ROLES.SUPPORT_ADMIN]: supportAdminAllowed,
  [PLATFORM_ROLES.BILLING_ADMIN]: billingAdminAllowed,
  [PLATFORM_ROLES.TEMPLATE_MANAGER]: templateManagerAllowed,
};

export function normalizePlatformPermissionRole(role: string | null | undefined): PlatformRoleId {
  const normalized = String(role ?? PLATFORM_ROLES.SUPER_ADMIN).trim().toLowerCase();
  return Object.values(PLATFORM_ROLES).includes(normalized as PlatformRoleId)
    ? (normalized as PlatformRoleId)
    : PLATFORM_ROLES.SUPER_ADMIN;
}

export function hasPlatformPermission(role: string | null | undefined, action: PlatformAction) {
  const permissions = PLATFORM_PERMISSION_MATRIX[normalizePlatformPermissionRole(role)];
  return permissions === "*" || permissions.has(action);
}

export function canPerformPlatformAction(
  currentUser: Pick<CurrentPlatformUser, "role"> | null | undefined,
  action: PlatformAction,
  context: PermissionContext = {},
) {
  if (!currentUser) return false;
  if (action === PLATFORM_ACTIONS.USER_DISABLE || action === PLATFORM_ACTIONS.USER_RESET_PASSWORD) {
    const role = normalizePlatformPermissionRole(currentUser.role);
    if (role === PLATFORM_ROLES.SUPPORT_ADMIN) {
      return context.isStoreUserAction === true;
    }
  }
  return hasPlatformPermission(currentUser.role, action);
}

export function requirePlatformPermission(
  currentUser: Pick<CurrentPlatformUser, "role"> | null | undefined,
  action: PlatformAction,
  context: PermissionContext = {},
) {
  if (!canPerformPlatformAction(currentUser, action, context)) {
    throw new PermissionMatrixDeniedError(currentUser?.role ?? "anonymous", action);
  }
}

export type PlatformAuditActionScope =
  | { type: "all" }
  | { allowedPrefixes: string[]; type: "scoped" }
  | { type: "none" };

export function getPlatformAuditActionScope(role: string | null | undefined): PlatformAuditActionScope {
  const normalized = normalizePlatformPermissionRole(role);
  if (normalized === PLATFORM_ROLES.SUPER_ADMIN) return { type: "all" };
  if (normalized === PLATFORM_ROLES.BILLING_ADMIN) {
    return { allowedPrefixes: ["plan.", "feature.toggle", "subscription.", "billing."], type: "scoped" };
  }
  if (normalized === PLATFORM_ROLES.TEMPLATE_MANAGER) {
    return { allowedPrefixes: ["pos_template."], type: "scoped" };
  }
  if (normalized === PLATFORM_ROLES.SUPPORT_ADMIN) {
    return {
      allowedPrefixes: ["business.", "auth.", "impersonate.", "user.disable", "user.reset_password"],
      type: "scoped",
    };
  }
  return { type: "none" };
}

export function canViewPlatformAuditAction(role: string | null | undefined, auditAction: string) {
  const scope = getPlatformAuditActionScope(role);
  if (scope.type === "all") return true;
  if (scope.type === "none") return false;
  return scope.allowedPrefixes.some((prefix) => auditAction === prefix || auditAction.startsWith(prefix));
}

export function getAllPlatformActions() {
  return allPlatformActions;
}
