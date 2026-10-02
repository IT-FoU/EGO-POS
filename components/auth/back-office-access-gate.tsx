import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { AccountAccessDeniedError, requireBackOfficeAccess } from "@/lib/auth/account-access";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export async function BackOfficeAccessGate({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  try {
    await requireBackOfficeAccess(tenantFromSession(session));
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) {
      return <StoreAccessDenied />;
    }
    throw error;
  }
  return <>{children}</>;
}
