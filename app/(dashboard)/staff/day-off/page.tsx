import { ModuleAccessGate } from "@/components/auth/module-access-gate";
import { DayOffApprovalsClient } from "@/features/day-off/components/day-off-approvals-client";

export default function DayOffApprovalsPage() {
  return (
    <ModuleAccessGate module="staff">
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div>
        <h1 className="text-xl font-semibold">Day Off Approvals</h1>
        <p className="text-sm text-muted-foreground">Owner / Manager operational review</p>
      </div>
      <DayOffApprovalsClient />
    </div>
    </ModuleAccessGate>
  );
}
