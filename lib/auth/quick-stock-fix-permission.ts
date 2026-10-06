import { permissionKeysForCheck } from "@/features/access-control/permission-catalog";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { POS_QUICK_STOCK_FIX_PERMISSION } from "@/features/pos/quick-stock-fix";
import { assertPermission, PermissionDeniedError, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";

function hasGranted(keys: readonly string[], permission: string) {
  return permissionKeysForCheck(permission).some((key) => keys.includes(key));
}

export async function assertQuickStockFixPermission(tenant: TenantContext) {
  const grantedKeys = await getUserPermissionKeys(tenant);
  if (grantedKeys.includes("*")) {
    await assertPermission(tenant, WRITE_PERMISSIONS.inventoryAdjust);
    return;
  }
  if (hasGranted(grantedKeys, WRITE_PERMISSIONS.posQuickStockFix)) {
    await assertPermission(tenant, WRITE_PERMISSIONS.posQuickStockFix);
    return;
  }
  if (hasGranted(grantedKeys, WRITE_PERMISSIONS.inventoryAdjust)) {
    await assertPermission(tenant, WRITE_PERMISSIONS.inventoryAdjust);
    return;
  }
  throw new PermissionDeniedError(POS_QUICK_STOCK_FIX_PERMISSION);
}
