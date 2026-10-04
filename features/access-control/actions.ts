"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { accountGateForPermission, requireAccountGate, requireActiveMembership } from "@/lib/auth/account-access";
import { grantExceedsActor } from "@/features/access-control/fine-permissions";
import { requireFinePermission } from "@/lib/auth/fine-access";
import { requireSettingsSectionEdit } from "@/lib/auth/module-access";
import { PermissionDeniedError, requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/session";
import { tenantFromSession, writeFailure, writeSuccess } from "@/lib/db/write-context";
import {
  deactivateStaffMember,
  decideApproval,
  deleteStaffMember,
  reactivateStaffMember,
  saveApprovalRule,
  saveCompanyStaffCreateDefault,
  saveRolePermissions,
  saveStaffMember,
  getUserPermissionKeys,
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
    const permission = input.id ? "staff.edit" : "staff.create";
    const access = await requireAccountGate(tenant, accountGateForPermission(permission));
    const actorKeys = access.isOwner ? ["*"] : await requireFinePermission(tenant, permission);
    const permissionMs = Date.now() - permissionStarted;
    const saved = await saveStaffMember(input, tenant, {
      allowBackOfficeAccess: access.allowBackOfficeAccess,
      allowPosAccess: access.allowPosAccess,
      effectiveUserId: access.userId,
      isOwner: access.isOwner,
      keys: actorKeys,
    });
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

export async function deleteStaffMemberAction(input: { membershipId: string; ownerPassword: string }) {
  try {
    const tenant = tenantFromSession(await requireSession());
    await requireAccountGate(tenant, "back-office");
    const data = await deleteStaffMember(input.membershipId, input.ownerPassword, tenant);
    after(() => {
      revalidateStaffPaths();
    });
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
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
    const tenant = await requireWritePermission(WRITE_PERMISSIONS.rolesManage);
    const access = await requireActiveMembership(tenant);
    const actorKeys = access.isOwner ? ["*"] : await getUserPermissionKeys(tenant);
    if (grantExceedsActor({
      actorBackOffice: access.allowBackOfficeAccess,
      actorKeys,
      actorPos: access.allowPosAccess,
      isOwner: access.isOwner,
      nextBackOffice: false,
      nextPos: false,
      roleKeys: input.permissions,
    })) {
      throw new PermissionDeniedError(WRITE_PERMISSIONS.rolesManage);
    }
    const data = await saveRolePermissions(input, tenant);
    revalidateStaffPaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function saveApprovalRuleAction(input: SaveApprovalRuleInput) {
  try {
    const tenant = tenantFromSession(await requireSession());
    await requireSettingsSectionEdit(tenant, "approval-rules");
    const data = await saveApprovalRule(input, tenant);
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
