"use server";

import { revalidatePath } from "next/cache";
import { requireFinePermission } from "@/lib/auth/fine-access";
import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession } from "@/lib/db/write-context";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import {
  deactivateStaffMember,
  decideApproval,
  reactivateStaffMember,
  saveApprovalRule,
  saveRolePermissions,
  saveStaffMember,
} from "@/features/access-control/prisma-repository";
import type {
  DecideApprovalInput,
  SaveApprovalRuleInput,
  SaveRolePermissionsInput,
  SaveStaffMemberInput,
} from "@/features/access-control/types";

function revalidateStaffPaths() {
  revalidatePath("/settings");
  revalidatePath("/pos");
}

export async function saveStaffMemberAction(input: SaveStaffMemberInput) {
  try {
    const data = await saveStaffMember(input, await staffTenant(input.id ? "staff.edit" : "staff.create"));
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

async function staffTenant(permission: string) {
  const tenant = tenantFromSession(await requireSession());
  await requireFinePermission(tenant, permission);
  return tenant;
}

export async function deactivateStaffMemberAction(membershipId: string) {
  try {
    const data = await deactivateStaffMember(membershipId, await staffTenant("staff.delete"));
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function reactivateStaffMemberAction(membershipId: string) {
  try {
    const data = await reactivateStaffMember(membershipId, await staffTenant("staff.delete"));
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function saveRolePermissionsAction(input: SaveRolePermissionsInput) {
  try {
    const data = await saveRolePermissions(input, await requireWritePermission(WRITE_PERMISSIONS.rolesManage));
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function saveApprovalRuleAction(input: SaveApprovalRuleInput) {
  try {
    const data = await saveApprovalRule(input, await requireWritePermission(WRITE_PERMISSIONS.approvalsManage));
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function decideApprovalAction(input: DecideApprovalInput) {
  try {
    const data = await decideApproval(input, await requireWritePermission(WRITE_PERMISSIONS.approvalsManage));
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}
