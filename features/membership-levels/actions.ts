"use server";

import { revalidatePath } from "next/cache";
import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import {
  archivePrismaMembershipLevel,
  createPrismaMembershipLevel,
  deletePrismaMembershipLevel,
  updatePrismaMembershipLevel,
} from "@/features/membership-levels/prisma-repository";
import type { MembershipLevelCreateInput, MembershipLevelWriteInput } from "@/features/membership-levels/dto";

function revalidateMembershipLevelPaths() {
  revalidatePath("/membership-levels");
  revalidatePath("/customers");
  revalidatePath("/promotions");
}

export async function createMembershipLevelAction(input: MembershipLevelCreateInput) {
  try {
    const result = await createPrismaMembershipLevel(
      input,
      await requireWritePermission(WRITE_PERMISSIONS.membershipLevelsManage),
    );
    revalidateMembershipLevelPaths();
    return writeSuccess(result);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function updateMembershipLevelAction(membershipLevelId: string, input: MembershipLevelWriteInput) {
  try {
    const result = await updatePrismaMembershipLevel(
      membershipLevelId,
      input,
      await requireWritePermission(WRITE_PERMISSIONS.membershipLevelsManage),
    );
    revalidateMembershipLevelPaths();
    return writeSuccess(result);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function archiveMembershipLevelAction(membershipLevelId: string) {
  try {
    const result = await archivePrismaMembershipLevel(
      membershipLevelId,
      await requireWritePermission(WRITE_PERMISSIONS.membershipLevelsManage),
    );
    revalidateMembershipLevelPaths();
    return writeSuccess(result);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function deleteMembershipLevelAction(membershipLevelId: string) {
  try {
    const result = await deletePrismaMembershipLevel(
      membershipLevelId,
      await requireWritePermission(WRITE_PERMISSIONS.membershipLevelsManage),
    );
    revalidateMembershipLevelPaths();
    return writeSuccess(result);
  } catch (error) {
    return writeFailure(error);
  }
}
