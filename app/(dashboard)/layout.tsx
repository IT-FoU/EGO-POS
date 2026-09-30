import { requireSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { loadBusinessPlanStatus } from "@/features/business-plan/load-business-plan-status";
import { isDemoMode } from "@/lib/demo-mode";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const planStatus = session.user.activeCompanyId
    ? await loadBusinessPlanStatus(session.user.activeCompanyId)
    : null;

  return (
    <ThemeProvider>
      <DashboardShell demoMode={isDemoMode()} planStatus={planStatus} session={session}>
        {children}
      </DashboardShell>
    </ThemeProvider>
  );
}
