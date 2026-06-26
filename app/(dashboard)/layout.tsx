import { requireSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ThemeProvider } from "@/components/theme-provider";
import { isDemoMode } from "@/lib/demo-mode";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <ThemeProvider>
      <DashboardShell demoMode={isDemoMode()} session={session}>
        {children}
      </DashboardShell>
    </ThemeProvider>
  );
}
