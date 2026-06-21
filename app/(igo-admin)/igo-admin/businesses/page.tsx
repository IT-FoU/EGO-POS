import { AdminText, type AdminCopyKey } from "@/components/igo-admin/admin-i18n";
import { getAdminBusinesses } from "@/features/igo-admin/admin-data";
import { requireAdminSession } from "@/lib/admin/session";

export const dynamic = "force-dynamic";

export default async function IgoAdminBusinessesPage() {
  await requireAdminSession();
  const businesses = await getAdminBusinesses();

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-normal"><AdminText k="businessManagement" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <AdminText k="viewBusinessControls" />
        </p>
      </section>
      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-background text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-semibold"><AdminText k="business" /></th>
                <th className="p-4 font-semibold"><AdminText k="owner" /></th>
                <th className="p-4 font-semibold"><AdminText k="template" /></th>
                <th className="p-4 font-semibold"><AdminText k="plan" /></th>
                <th className="p-4 font-semibold"><AdminText k="mainBranch" /></th>
                <th className="p-4 font-semibold"><AdminText k="created" /></th>
                <th className="p-4 font-semibold"><AdminText k="status" /></th>
                <th className="p-4 font-semibold"><AdminText k="controls" /></th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business: any) => (
                <tr className="border-t border-border" key={business.id}>
                  <td className="p-4 font-semibold">{business.name}</td>
                  <td className="p-4">
                    <div>{business.owner?.fullName ?? <AdminText k="unassigned" />}</div>
                    <div className="text-xs text-muted-foreground">
                      {business.owner?.email ?? business.owner?.username ?? "-"}
                    </div>
                  </td>
                  <td className="p-4"><AdminText k="miniMart" /></td>
                  <td className="p-4">{business.plan?.planName ?? <AdminText k="freePlan" />}</td>
                  <td className="p-4">{business.branches[0]?.name ?? "-"}</td>
                  <td className="p-4">{new Date(business.createdAt).toLocaleDateString()}</td>
                  <td className="p-4">
                    <span className="rounded-md bg-success/15 px-2 py-1 text-xs font-semibold text-success">
                      {business.status}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {(["suspend", "activate", "delete", "restore"] as AdminCopyKey[]).map((key) => (
                        <button
                          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground"
                          disabled
                          key={key}
                          type="button"
                        >
                          <AdminText k={key} />
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
