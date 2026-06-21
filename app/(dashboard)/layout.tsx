import { requireSession } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ThemeProvider } from "@/components/theme-provider";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <ThemeProvider>
      <DashboardShell demoMode={process.env.IGO_DEMO_MODE === "true"} session={session}>
        {children}
      </DashboardShell>
    </ThemeProvider>
  );
}
