import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export default async function MembershipLevelsLayout({ children }: { children: React.ReactNode }) {
  if (isNextProductionBuildPhase()) {
    return <>{children}</>;
  }

  const session = await requireSession();
  if (!canViewStoreNavigationItem(session.user.roles, "membership")) {
    return <StoreAccessDenied />;
  }

  return <>{children}</>;
}

