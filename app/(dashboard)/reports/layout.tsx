import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewFullStoreReports } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";

// R1: /reports/* still uses REPORTS_VIEW_FULL only (Owner + Manager).
// Cashiers keep Own Shift in POS via REPORTS_VIEW_OWN_SHIFT. No per-report grants.

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  if (!canViewFullStoreReports(session.user.roles)) {
    return <StoreAccessDenied />;
  }

  return <>{children}</>;
}

