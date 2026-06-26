import { AdminText } from "@/components/igo-admin/admin-i18n";
import { getAdminAuditLogs } from "@/features/igo-admin/admin-data";
import { requireSuperAdminPortalAccess } from "@/lib/auth/portal-guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminAuditLogsPage() {
  await requireSuperAdminPortalAccess();
  const logs = await getAdminAuditLogs();

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-normal"><AdminText k="auditLogs" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <AdminText k="platformActionsHistory" />
        </p>
      </section>
      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead className="bg-background text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-semibold"><AdminText k="time" /></th>
                <th className="p-4 font-semibold"><AdminText k="company" /></th>
                <th className="p-4 font-semibold"><AdminText k="user" /></th>
                <th className="p-4 font-semibold"><AdminText k="module" /></th>
                <th className="p-4 font-semibold"><AdminText k="action" /></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => (
                <tr className="border-t border-border" key={log.id}>
                  <td className="p-4">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="p-4">{log.company?.name ?? "-"}</td>
                  <td className="p-4">{log.user?.fullName ?? log.user?.username ?? "-"}</td>
                  <td className="p-4">{log.module}</td>
                  <td className="p-4">{log.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
