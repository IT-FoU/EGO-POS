import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/session";

export async function rejectMerchantSessionForAdminPortal() {
  const merchantSession = await getCurrentSession();

  if (merchantSession?.user) {
    redirect("/dashboard");
  }
}
