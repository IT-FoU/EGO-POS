import { AdminText, type AdminCopyKey } from "@/components/igo-admin/admin-i18n";
import { getAdminBusinesses } from "@/features/igo-admin/admin-data";
import { requireSuperAdminPortalAccess } from "@/lib/auth/portal-guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminSubscriptionsPage() {
  await requireSuperAdminPortalAccess();
  const businesses = await getAdminBusinesses();

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-normal"><AdminText k="subscriptionManagement" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <AdminText k="subscriptionOverview" />
        </p>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        {businesses.map((business: any) => (
          <article className="rounded-md border border-border bg-card p-5" key={business.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{business.name}</h2>
                <p className="text-sm text-muted-foreground">
                  <AdminText k="currentPlan" />: {business.plan?.planName ?? <AdminText k="freePlan" />}
                </p>
              </div>
              <span className="rounded-md border border-border px-3 py-1 text-xs font-semibold">
                {business.status}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {(["upgrade", "downgrade", "unlockPremium"] as AdminCopyKey[]).map((key) => (
                <button
                  className="rounded-md border border-border px-3 py-2 text-xs font-semibold text-muted-foreground"
                  disabled
                  key={key}
                  type="button"
                >
                  <AdminText k={key} />
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
