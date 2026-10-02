import { ModuleAccessGate } from "@/components/auth/module-access-gate";
import { OtApprovalsClient } from "@/features/ot/components/ot-approvals-client";

export default function StaffOtPage() {
  return (
    <ModuleAccessGate module="staff">
      <OtApprovalsClient />
    </ModuleAccessGate>
  );
}
