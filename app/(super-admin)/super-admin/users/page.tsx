import { AdminText, type AdminCopyKey } from "@/components/igo-admin/admin-i18n";
import { getAdminUsers } from "@/features/igo-admin/admin-data";
import { requireSuperAdminPortalAccess } from "@/lib/auth/portal-guards";

export const dynamic = "force-dynamic";

export default async function SuperAdminUsersPage() {
  await requireSuperAdminPortalAccess();
  const users = await getAdminUsers();

  return (
    <div className="grid gap-6">
      <section>
        <h1 className="text-3xl font-semibold tracking-normal"><AdminText k="userManagement" /></h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <AdminText k="platformUserControls" />
        </p>
      </section>
      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead className="bg-background text-left text-muted-foreground">
              <tr>
                <th className="p-4 font-semibold"><AdminText k="user" /></th>
                <th className="p-4 font-semibold"><AdminText k="businesses" /></th>
                <th className="p-4 font-semibold"><AdminText k="created" /></th>
                <th className="p-4 font-semibold"><AdminText k="status" /></th>
                <th className="p-4 font-semibold"><AdminText k="controls" /></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr className="border-t border-border" key={user.id}>
                  <td className="p-4">
                    <div className="font-semibold">{user.fullName}</div>
                    <div className="text-xs text-muted-foreground">{user.email ?? user.username}</div>
                  </td>
                  <td className="p-4">
                    {user.companies.map((entry: any) => entry.company.name).join(", ") || "-"}
                  </td>
                  <td className="p-4">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="p-4">{user.status}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {(["block", "unblock", "resetPassword"] as AdminCopyKey[]).map((key) => (
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
