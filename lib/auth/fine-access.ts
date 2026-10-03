import { allowsFine, FINE, fineKeyForPosAction, redactSensitiveFields, reportRangeNeedsHistorical, reportVisibility, type SensitiveVisibility } from "@/features/access-control/fine-permissions";
import { isCanonicalModuleEnabled, moduleForPermissionKey } from "@/features/access-control/module-access";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { accountGateForPermission, requireAccountGate } from "@/lib/auth/account-access";
import { PermissionDeniedError } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";

export async function readFineKeys(tenant: TenantContext, client?: any) {
  return getUserPermissionKeys(tenant, client);
}

export async function requireFinePermission(tenant: TenantContext, key: string, client?: any) {
  await requireAccountGate(tenant, accountGateForPermission(key), client);
  const keys = await getUserPermissionKeys(tenant, client);
  if (keys.includes("*")) return keys;
  const moduleId = moduleForPermissionKey(key);
  if (moduleId && !isCanonicalModuleEnabled(moduleId, keys)) {
    throw new PermissionDeniedError(key);
  }
  if (!allowsFine(keys, key)) {
    throw new PermissionDeniedError(key);
  }
  return keys;
}

export async function requirePosFineAction(tenant: TenantContext, action: string, client?: any) {
  const key = fineKeyForPosAction(action);
  if (!key) return;
  await requireFinePermission(tenant, key, client);
}

export async function readReportVisibility(tenant: TenantContext, client?: any): Promise<SensitiveVisibility> {
  return reportVisibility(await getUserPermissionKeys(tenant, client));
}

export async function assertReportQueryAllowed(
  tenant: TenantContext,
  input: { dateFrom?: Date | null; datePreset?: string | null },
  client?: any,
) {
  const keys = await getUserPermissionKeys(tenant, client);
  if (keys.includes("*")) return keys;
  const visibility = reportVisibility(keys);
  const historical = reportRangeNeedsHistorical(input);
  if (historical && !visibility.historical) throw new PermissionDeniedError(FINE.reportsHistorical);
  if (!historical && !visibility.today) throw new PermissionDeniedError(FINE.reportsToday);
  return keys;
}

export async function redactReportPayload<T>(tenant: TenantContext, payload: T, client?: any) {
  const visibility = reportVisibility(await getUserPermissionKeys(tenant, client));
  if (visibility.cost && visibility.profit && visibility.margin) return payload;
  return redactSensitiveFields(payload, visibility);
}

export async function requireReportExport(tenant: TenantContext, client?: any) {
  await requireFinePermission(tenant, FINE.reportsExport, client);
}

export { FINE };
