import { StoreAccessDenied } from "@/components/permissions/store-access-denied";
import { MembershipLevelsClient } from "@/features/membership-levels/components/membership-levels-client";
import { getMembershipLevels } from "@/features/membership-levels/membership-level-service";
import { canViewStoreNavigationItem } from "@/features/permissions/store-ui-permissions";
import { requireSession } from "@/lib/auth/session";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export const dynamic = "force-dynamic";

export default async function MembershipLevelsPage() {
  if (isNextProductionBuildPhase()) {
    return <MembershipLevelsClient levels={[]} />;
  }

  const session = await requireSession();
  if (!canViewStoreNavigationItem(session.user.roles, "membership")) {
    return <StoreAccessDenied />;
  }

  const levels = await getMembershipLevels();

  return <MembershipLevelsClient levels={levels} />;
}
