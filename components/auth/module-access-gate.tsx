import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import type { CanonicalModuleId } from "@/features/access-control/module-access";
import { AccountAccessDeniedError } from "@/lib/auth/account-access";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";

export async function ModuleAccessGate({
  children,
  module,
}: {
  children: React.ReactNode;
  module: CanonicalModuleId;
}) {
  const session = await requireSession();
  try {
    await requireModuleAccess(tenantFromSession(session), module);
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) return <StoreAccessDenied />;
    throw error;
  }
  return <>{children}</>;
}
