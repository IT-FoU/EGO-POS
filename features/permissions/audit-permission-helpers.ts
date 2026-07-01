import {
  PLATFORM_ACTIONS,
  PLATFORM_ROLES,
  canViewPlatformAuditAction,
  getPlatformAuditActionScope,
  normalizePlatformPermissionRole,
  type PermissionContext,
} from "@/features/permissions/platform-permissions";

export type StoreActivityVisibility =
  | { type: "all" }
  | { limitation: string; type: "assigned" }
  | { type: "none" };

export { canViewPlatformAuditAction, getPlatformAuditActionScope };

export function canViewStoreActivityLogs(role: string | null | undefined, context: PermissionContext = {}) {
  const normalized = normalizePlatformPermissionRole(role);
  if (normalized === PLATFORM_ROLES.SUPER_ADMIN) {
    return true;
  }
  if (normalized === PLATFORM_ROLES.SUPPORT_ADMIN) {
    // support_assignments does not exist yet. Phase 2 should replace this with assignment-backed scoping.
    return Boolean(context.businessId && context.assignedBusinessIds?.includes(context.businessId));
  }
  return false;
}

export function getStoreActivityLogScope(role: string | null | undefined): StoreActivityVisibility {
  const normalized = normalizePlatformPermissionRole(role);
  if (normalized === PLATFORM_ROLES.SUPER_ADMIN) return { type: "all" };
  if (normalized === PLATFORM_ROLES.SUPPORT_ADMIN) {
    return {
      limitation: "support_admin store activity scoping requires support_assignments in a future phase.",
      type: "assigned",
    };
  }
  return { type: "none" };
}

export function canViewPlatformAuditPermissionAction(role: string | null | undefined, action: string) {
  if (action === PLATFORM_ACTIONS.PLATFORM_AUDIT_LOGS_VIEW_ALL) {
    return normalizePlatformPermissionRole(role) === PLATFORM_ROLES.SUPER_ADMIN;
  }
  if (action === PLATFORM_ACTIONS.PLATFORM_AUDIT_LOGS_VIEW_SCOPED) {
    return getPlatformAuditActionScope(role).type !== "none";
  }
  return false;
}
