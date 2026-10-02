import { requireSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { ThemeProvider } from "@/components/theme-provider";
import { loadBusinessPlanStatus } from "@/features/business-plan/load-business-plan-status";
import { AccountAccessDeniedError, requireActiveMembership } from "@/lib/auth/account-access";
import { tenantFromSession } from "@/lib/db/write-context";
import { isDemoMode } from "@/lib/demo-mode";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  let allowBackOfficeAccess = false;
  try {
    const access = await requireActiveMembership(tenantFromSession(session));
    allowBackOfficeAccess = access.allowBackOfficeAccess;
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      return (
        <ThemeProvider>
          <div className="min-h-screen bg-background p-6 text-foreground">
            <StoreAccessDenied />
          </div>
        </ThemeProvider>
      );
    }
    throw error;
  }
  const planStatus = session.user.activeCompanyId
    ? await loadBusinessPlanStatus(session.user.activeCompanyId)
    : null;

  return (
    <ThemeProvider>
      <DashboardShell allowBackOfficeAccess={allowBackOfficeAccess} demoMode={isDemoMode()} planStatus={planStatus} session={session}>
        {children}
      </DashboardShell>
    </ThemeProvider>
  );
}
