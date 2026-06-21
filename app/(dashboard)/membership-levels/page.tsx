import { MembershipLevelsClient } from "@/features/membership-levels/components/membership-levels-client";
import { getMembershipLevels } from "@/features/membership-levels/membership-level-service";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export const dynamic = "force-dynamic";

export default async function MembershipLevelsPage() {
  const levels = isNextProductionBuildPhase() ? [] : await getMembershipLevels();

  return <MembershipLevelsClient levels={levels} />;
}
