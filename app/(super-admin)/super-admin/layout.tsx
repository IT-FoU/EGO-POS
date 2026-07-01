import { EgoPosCenterShell } from "@/components/igo-admin/ego-pos-center";
import { getAdminSession } from "@/lib/admin/session";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  if (!session) {
    return <>{children}</>;
  }

  return <EgoPosCenterShell role={session.role} username={session.username}>{children}</EgoPosCenterShell>;
}
