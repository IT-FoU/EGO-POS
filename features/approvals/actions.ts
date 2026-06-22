"use server";

import { revalidatePath } from "next/cache";
import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { createApprovalRequest, decideApprovalRequest, type DecideApprovalRequestInput } from "@/features/approvals/approval-engine";
import { APPROVAL_REQUESTER_PERMISSION } from "@/features/approvals/approval-config";
import type { CreateApprovalRequestInput } from "@/features/approvals/types";

function revalidateApprovalPaths() {
  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/inventory");
}

export async function createApprovalRequestAction(input: CreateApprovalRequestInput) {
  try {
    const permission = APPROVAL_REQUESTER_PERMISSION[input.ruleKey];
    if (!permission) {
      throw new Error(`Unknown approval rule "${input.ruleKey}".`);
    }
    const tenant = await requireWritePermission(permission);
    const data = await createApprovalRequest(input, tenant);
    revalidateApprovalPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function decideApprovalRequestAction(input: DecideApprovalRequestInput) {
  try {
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.approvalsManage);
    const data = await decideApprovalRequest(input, tenant);
    revalidateApprovalPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}
