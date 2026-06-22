import { runWrite } from "@/lib/api/write-response";
import { assertPermission } from "@/lib/auth/permissions";
import { createApprovalRequest } from "@/features/approvals/approval-engine";
import { APPROVAL_REQUESTER_PERMISSION } from "@/features/approvals/approval-config";

export async function POST(request: Request) {
  return runWrite(async (tenant, body) => {
    const permission = APPROVAL_REQUESTER_PERMISSION[body?.ruleKey as keyof typeof APPROVAL_REQUESTER_PERMISSION];
    if (!permission) {
      throw new Error(`Unknown approval rule "${body?.ruleKey}".`);
    }
    await assertPermission(tenant, permission);
    return createApprovalRequest(body, tenant);
  }, request);
}
