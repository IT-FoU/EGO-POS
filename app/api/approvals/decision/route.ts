import { runWrite } from "@/lib/api/write-response";
import { WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { decideApprovalRequest } from "@/features/approvals/approval-engine";

export async function POST(request: Request) {
  return runWrite((tenant, body) => decideApprovalRequest(body, tenant), request, WRITE_PERMISSIONS.approvalsManage);
}
