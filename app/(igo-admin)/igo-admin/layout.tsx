import Link from "next/link";
import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  LayoutDashboard,
  Shield,
  Users,
} from "lucide-react";
import { AdminLogoutButton } from "@/components/igo-admin/admin-logout-button";
import { AdminLanguageToggle, AdminText, type AdminCopyKey } from "@/components/igo-admin/admin-i18n";
import { getAdminSession } from "@/lib/admin/session";

const adminNavigation = [
  { href: "/igo-admin", icon: LayoutDashboard, labelKey: "dashboard" },
  { href: "/igo-admin/businesses", icon: Building2, labelKey: "businesses" },
  { href: "/igo-admin/users", icon: Users, labelKey: "users" },
  { href: "/igo-admin/subscriptions", icon: CreditCard, labelKey: "subscriptions" },
  { href: "/igo-admin/audit-logs", icon: Activity, labelKey: "auditLogs" },
];

export default async function IgoAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  if (!session) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="border-b border-border p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-md bg-primary text-lg font-bold text-primary-foreground">
              I
            </div>
            <div>
              <div className="text-lg font-semibold"><AdminText k="egoAdmin" /></div>
              <div className="text-xs text-muted-foreground"><AdminText k="platformManagement" /></div>
            </div>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-4">
          {adminNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground"
                href={item.href}
                key={item.href}
              >
                <Icon className="size-5" />
                <AdminText k={item.labelKey as AdminCopyKey} />
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm text-primary">
                <Shield className="size-4" />
                <AdminText k="headerRole" />
              </div>
              <div className="text-base font-semibold">{session.username}</div>
            </div>
            <div className="flex items-center gap-3">
              <AdminLanguageToggle />
              <AdminLogoutButton />
            </div>
          </div>
          <nav className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
            {adminNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground"
                  href={item.href}
                  key={item.href}
                >
                  <Icon className="size-4" />
                  <AdminText k={item.labelKey as AdminCopyKey} />
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
