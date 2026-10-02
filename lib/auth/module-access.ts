import { assertPermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import {
  isCanonicalModuleEnabled,
  landingPathForAccess,
  visibleNavigationKeys,
  type CanonicalModuleId,
} from "@/features/access-control/module-access";
import { AccountAccessDeniedError, requireActiveMembership, requireBackOfficeAccess } from "@/lib/auth/account-access";
import type { TenantContext } from "@/lib/db/write-context";

async function accessContext(tenant: TenantContext) {
  const access = await requireActiveMembership(tenant);
  const keys = access.isOwner ? ["*"] : await getUserPermissionKeys(tenant);
  return { access, keys };
}

export async function requireModuleAccess(tenant: TenantContext, moduleId: CanonicalModuleId) {
  const { access, keys } = await accessContext(tenant);
  if (moduleId === "pos") {
    if (!access.allowPosAccess) throw new AccountAccessDeniedError();
  } else if (!access.allowBackOfficeAccess) {
    throw new AccountAccessDeniedError();
  }
  if (access.isOwner || isCanonicalModuleEnabled(moduleId, keys)) return access;
  throw new AccountAccessDeniedError();
}

export async function requireAnyModuleAccess(tenant: TenantContext, moduleIds: CanonicalModuleId[]) {
  const { access, keys } = await accessContext(tenant);
  if (!access.allowBackOfficeAccess) throw new AccountAccessDeniedError();
  if (access.isOwner || moduleIds.some((moduleId) => isCanonicalModuleEnabled(moduleId, keys))) return access;
  throw new AccountAccessDeniedError();
}

const STAFF_SETTINGS_SECTIONS = new Set(["approval-rules", "day-off", "ot", "staff"]);

export async function requireSettingsDestination(tenant: TenantContext, section: string) {
  if (section === "roles") {
    await requireBackOfficeAccess(tenant);
    await assertPermission(tenant, WRITE_PERMISSIONS.rolesManage);
    return;
  }
  if (section === "index") {
    await requireAnyModuleAccess(tenant, ["settings", "staff"]);
    return;
  }
  if (STAFF_SETTINGS_SECTIONS.has(section)) {
    await requireModuleAccess(tenant, "staff");
    return;
  }
  await requireModuleAccess(tenant, "settings");
}

export async function readNavigationAccess(tenant: TenantContext) {
  const { access, keys } = await accessContext(tenant);
  return {
    allowBackOfficeAccess: access.allowBackOfficeAccess,
    allowPosAccess: access.allowPosAccess,
    keys,
    landingPath: landingPathForAccess({
      allowBackOfficeAccess: access.allowBackOfficeAccess,
      allowPosAccess: access.allowPosAccess,
      isOwner: access.isOwner,
      keys,
    }),
    visibleNavKeys: visibleNavigationKeys({
      allowBackOfficeAccess: access.allowBackOfficeAccess,
      allowPosAccess: access.allowPosAccess,
      isOwner: access.isOwner,
      keys,
    }),
  };
}
