import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { AccountAccessDeniedError, requireBackOfficeAccess } from "@/lib/auth/account-access";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export default async function MembershipLevelsLayout({ children }: { children: React.ReactNode }) {
  if (isNextProductionBuildPhase()) {
    return <>{children}</>;
  }

  const session = await requireSession();
  try {
    await requireBackOfficeAccess(tenantFromSession(session));
  } catch (error) {
    if (error instanceof AccountAccessDeniedError) return <StoreAccessDenied />;
    throw error;
  }
  if (!canViewStoreNavigationItem(session.user.roles, "membership")) {
    return <StoreAccessDenied />;
  }

  return <>{children}</>;
}

