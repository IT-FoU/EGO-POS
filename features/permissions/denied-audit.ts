import { PLATFORM_AUDIT_ACTIONS, PLATFORM_TARGET_TYPES, createStoreActivityLog } from "@/features/audit/audit-log-service";
import { writePlatformAuditForUser } from "@/features/audit/platform-route-audit";
import type { CurrentStoreUser, StoreAction } from "@/features/permissions/store-permissions";
import type { CurrentPlatformUser } from "@/lib/auth/platform-user";
import type { PermissionContext, PlatformAction } from "@/features/permissions/platform-permissions";

export async function auditPlatformAccessDenied(
  currentUser: CurrentPlatformUser,
  attemptedAction: PlatformAction | string,
  context: PermissionContext = {},
) {
  try {
    await writePlatformAuditForUser({
      action: PLATFORM_AUDIT_ACTIONS.AUTH_ACCESS_DENIED,
      actor: currentUser,
      businessId: context.businessId ?? null,
      metadata: {
        attempted_action: attemptedAction,
        reason: context.reason,
        required_permission: context.requiredPermission ?? attemptedAction,
        route: context.route,
      },
      severity: "security",
      status: "denied",
      targetId: context.targetId ?? null,
      targetName: context.targetType ?? "Access denied",
      targetType: context.targetType ?? PLATFORM_TARGET_TYPES.SYSTEM,
    });
  } catch (error) {
    console.warn("[permission-audit] platform access denied audit write failed", error);
  }
}

export async function auditStoreAccessDenied(
  currentStoreUser: CurrentStoreUser | null | undefined,
  attemptedAction: StoreAction | string,
  context: PermissionContext & {
    amount?: number | string | null;
    currency?: string;
    deviceName?: string | null;
    terminalId?: string | null;
    terminalName?: string | null;
  } = {},
) {
  if (!currentStoreUser?.businessId) {
    return;
  }

  try {
    await createStoreActivityLog({
      action: attemptedAction,
      actorId: currentStoreUser.id ?? null,
      actorName: currentStoreUser.name,
      actorRole: currentStoreUser.role,
      amount: context.amount ?? null,
      branchId: currentStoreUser.branchId ?? null,
      businessId: currentStoreUser.businessId,
      currency: context.currency ?? "LAK",
      deviceName: context.deviceName ?? currentStoreUser.deviceName ?? null,
      metadata: {
        attempted_action: attemptedAction,
        reason: context.reason,
        required_permission: context.requiredPermission ?? attemptedAction,
        route: context.route,
      },
      status: "denied",
      targetId: context.targetId ?? null,
      targetName: context.targetType ?? "Access denied",
      targetType: context.targetType ?? "permission",
      terminalId: context.terminalId ?? currentStoreUser.terminalId ?? null,
      terminalName: context.terminalName ?? currentStoreUser.terminalName ?? null,
    });
  } catch (error) {
    console.warn("[permission-audit] store access denied audit write failed", error);
  }
}
