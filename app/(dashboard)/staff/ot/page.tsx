import { BackOfficeAccessGate } from "@/components/auth/back-office-access-gate";
import { OtApprovalsClient } from "@/features/ot/components/ot-approvals-client";

export default function StaffOtPage() {
  return (
    <BackOfficeAccessGate>
      <OtApprovalsClient />
    </BackOfficeAccessGate>
  );
}
