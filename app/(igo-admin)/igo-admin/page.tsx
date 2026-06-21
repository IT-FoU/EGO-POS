import { BarChart3, Building2, PauseCircle, Sparkles, Users } from "lucide-react";
import { AdminText, type AdminCopyKey } from "@/components/igo-admin/admin-i18n";
import { getAdminDashboardSnapshot } from "@/features/igo-admin/admin-data";
import { requireAdminSession } from "@/lib/admin/session";

const cards = [
  { icon: Building2, key: "totalBusinesses", labelKey: "totalBusinesses" },
  { icon: Users, key: "totalUsers", labelKey: "totalUsers" },
  { icon: BarChart3, key: "activeBusinesses", labelKey: "activeBusinesses" },
  { icon: PauseCircle, key: "suspendedBusinesses", labelKey: "suspendedBusinesses" },
  { icon: Sparkles, key: "newRegistrations", labelKey: "newRegistrations" },
] as const;

export const dynamic = "force-dynamic";

export default async function IgoAdminDashboardPage() {
  await requireAdminSession();
  const snapshot = await getAdminDashboardSnapshot();

  return (
    <div className="grid gap-6">
      <section>
        <p className="text-sm font-semibold text-primary"><AdminText k="egoSuperAdmin" /></p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal"><AdminText k="platformDashboard" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <AdminText k="platformOverview" />
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="rounded-md border border-border bg-card p-5" key={card.key}>
              <div className="grid size-10 place-items-center rounded-md bg-background text-primary">
                <Icon className="size-5" />
              </div>
              <div className="mt-4 text-2xl font-semibold">{snapshot[card.key]}</div>
              <div className="text-sm text-muted-foreground"><AdminText k={card.labelKey as AdminCopyKey} /></div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
