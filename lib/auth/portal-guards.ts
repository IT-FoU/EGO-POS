import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getSetupAdminSession } from "@/lib/setup-admin/session";

export async function rejectMerchantSessionForAdminPortal() {
  const merchantSession = await getCurrentSession();

  if (merchantSession?.user) {
    redirect("/dashboard");
  }
}

export async function rejectSetupAdminSessionForSuperAdminPortal() {
  const setupAdminSession = await getSetupAdminSession();

  if (setupAdminSession) {
    redirect("/ego-admin");
  }
}

export async function requireSuperAdminPortalAccess() {
  await rejectMerchantSessionForAdminPortal();
  await rejectSetupAdminSessionForSuperAdminPortal();

  const { requireAdminSession } = await import("@/lib/admin/session");
  return requireAdminSession();
}
