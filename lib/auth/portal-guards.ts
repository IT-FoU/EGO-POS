import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";
import { getAdminSession } from "@/lib/admin/session";
import { requireSetupAdminSession } from "@/lib/setup-admin/session";

export async function rejectMerchantSessionForAdminPortal() {
  const merchantSession = await getCurrentSession();

  if (merchantSession?.user) {
    redirect("/dashboard");
  }
}

export async function rejectSetupAdminSessionForSuperAdminPortal() {
  const { getSetupAdminSession } = await import("@/lib/setup-admin/session");
  const setupAdminSession = await getSetupAdminSession();

  if (setupAdminSession) {
    redirect("/ego-admin");
  }
}

export async function rejectSuperAdminSessionForEgoAdminPortal() {
  const superAdminSession = await getAdminSession();

  if (superAdminSession) {
    redirect("/super-admin");
  }
}

export async function requireSuperAdminPortalAccess() {
  await rejectMerchantSessionForAdminPortal();
  await rejectSetupAdminSessionForSuperAdminPortal();

  const { requireAdminSession } = await import("@/lib/admin/session");
  return requireAdminSession();
}

export async function requireEgoAdminPortalAccess() {
  await rejectMerchantSessionForAdminPortal();
  await rejectSuperAdminSessionForEgoAdminPortal();
  return requireSetupAdminSession();
}
