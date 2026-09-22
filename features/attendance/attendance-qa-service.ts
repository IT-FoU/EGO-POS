import { cookies } from "next/headers";
import { PermissionMatrixDeniedError } from "@/features/permissions/platform-permissions";
import { STORE_ACTIONS } from "@/features/permissions/store-permissions";
import { canViewFullStoreReports } from "@/features/permissions/store-ui-permissions";
import { loadAttendanceQaRows } from "@/features/attendance/attendance-qa";
import { requireSession } from "@/lib/auth/session";
import { assertPermission, READ_PERMISSIONS } from "@/lib/auth/permissions";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { tenantFromSession } from "@/lib/db/write-context";
import { getServerLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locale";

export async function getAttendanceQaLocale() {
  const cookieStore = await cookies();
  return getServerLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getAttendanceQaPageData(searchParams: Record<string, string | string[] | undefined>) {
  const session = await requireSession();
  const tenant = tenantFromSession(session);
  await assertPermission(tenant, READ_PERMISSIONS.reportsView);
  const role = await resolveStoreRoleFromTenant(tenant);
  if (!canViewFullStoreReports(role)) {
    throw new PermissionMatrixDeniedError(role, STORE_ACTIONS.REPORTS_VIEW_FULL);
  }

  const pick = (key: string) => {
    const value = searchParams[key];
    return typeof value === "string" ? value : undefined;
  };

  return loadAttendanceQaRows(tenant, {
    branchId: pick("branchId"),
    date: pick("date"),
    status: pick("status"),
    userId: pick("userId"),
  });
}
