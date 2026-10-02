import { ModuleAccessGate } from "@/components/auth/module-access-gate";
import { isNextProductionBuildPhase } from "@/lib/build/build-phase";

export default async function MembershipLevelsLayout({ children }: { children: React.ReactNode }) {
  if (isNextProductionBuildPhase()) {
    return <>{children}</>;
  }

  return <ModuleAccessGate module="membership">{children}</ModuleAccessGate>;
}
