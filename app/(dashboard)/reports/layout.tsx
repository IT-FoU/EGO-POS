import { headers } from "next/headers";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { allowsFine, FINE } from "@/features/access-control/fine-permissions";
import { ReportExportProvider } from "@/features/reports/components/report-export-gate";
import { getUserPermissionKeys } from "@/features/access-control/prisma-repository";
import { canViewFullStoreReports } from "@/features/permissions/store-ui-permissions";
import { canAccessOwnShiftReport } from "@/features/reports/own-shift-report-access";
import { AccountAccessDeniedError } from "@/lib/auth/account-access";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { requireSession } from "@/lib/auth/session";
import { resolveStoreRoleFromTenant } from "@/lib/auth/store-permission-guard";
import { tenantFromSession } from "@/lib/db/write-context";

// Report center opens for Owner, Manager, or a role with Today or Historical sales.
// Own Shift History remains available when that is the only reports path.

const OWN_SHIFT_HISTORY_PATH = "/reports/shifts/own-history";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  try {
    await requireModuleAccess(tenantFromSession(session), "reports");
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) return <StoreAccessDenied />;
    throw error;
  }
  const tenant = tenantFromSession(session);
  const keys = await getUserPermissionKeys(tenant);
  const reportBody = (body: React.ReactNode) => (
    <ReportExportProvider allowed={allowsFine(keys, FINE.reportsExport)}>{body}</ReportExportProvider>
  );
  if (canViewFullStoreReports(session.user.roles) || allowsFine(keys, FINE.reportsToday) || allowsFine(keys, FINE.reportsHistorical)) {
    return reportBody(children);
  }

  const pathname = (await headers()).get("x-igo-pathname") ?? "";
  const isOwnShiftHistory =
    pathname === OWN_SHIFT_HISTORY_PATH || pathname.startsWith(`${OWN_SHIFT_HISTORY_PATH}/`);
  if (isOwnShiftHistory) {
    const role = await resolveStoreRoleFromTenant(tenant);
    if (canAccessOwnShiftReport(role)) {
      return reportBody(children);
    }
  }

  return <StoreAccessDenied />;
}

