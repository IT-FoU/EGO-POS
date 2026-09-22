import { headers } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewFullStoreReports } from "@/features/permissions/store-ui-permissions";
import { canAccessOwnShiftReport } from "@/features/reports/own-shift-report-access";
import { requireSession } from "@/lib/auth/session";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { tenantFromSession } from "@/lib/db/write-context";

// R1: /reports/* uses REPORTS_VIEW_FULL (Owner + Manager).
// R7A surgical exception: /reports/shifts/own-history only for REPORTS_VIEW_OWN_SHIFT.
// Cashiers still cannot open Report Center or other report routes.

const OWN_SHIFT_HISTORY_PATH = "/reports/shifts/own-history";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (canViewFullStoreReports(session.user.roles)) {
    return <>{children}</>;
  }

  const pathname = (await headers()).get("x-igo-pathname") ?? "";
  const isOwnShiftHistory =
    pathname === OWN_SHIFT_HISTORY_PATH || pathname.startsWith(`${OWN_SHIFT_HISTORY_PATH}/`);
  if (isOwnShiftHistory) {
    const tenant = tenantFromSession(session);
    const role = await resolveStoreRoleFromTenant(tenant);
    if (canAccessOwnShiftReport(role)) {
      return <>{children}</>;
    }
  }

  return <StoreAccessDenied />;
}

