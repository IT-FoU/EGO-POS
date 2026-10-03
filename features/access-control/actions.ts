"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
  saveCompanyStaffCreateDefault,
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

export async function saveStaffCreateDefaultAction(input: {
  allowBackOfficeAccess: boolean;
  allowPosAccess: boolean;
  branchId: string;
  kind: "cashier" | "manager";
  reset: boolean;
}) {
  try {
    const tenant = tenantFromSession(await requireSession());
    const data = await saveCompanyStaffCreateDefault(input, tenant);
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function saveStaffMemberAction(input: SaveStaffMemberInput) {
  const started = Date.now();
  try {
    const permissionStarted = Date.now();
    const tenant = tenantFromSession(await requireSession());
    const actorKeys = await requireFinePermission(tenant, input.id ? "staff.edit" : "staff.create");
    const permissionMs = Date.now() - permissionStarted;
    const saved = await saveStaffMember(input, tenant, actorKeys);
    const postStarted = Date.now();
    after(() => {
      revalidateStaffPaths();
    });
    const postWriteMs = Date.now() - postStarted;
    console.info(JSON.stringify({
      staffSaveTiming: {
        ...saved.timing,
        permissionMs,
        postWriteMs,
        totalMs: Date.now() - started,
      },
    }));
    return writeSuccess(saved.member);
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
