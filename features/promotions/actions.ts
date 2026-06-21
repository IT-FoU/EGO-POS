"use server";

import { requireWritePermission, WRITE_PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { archivePrismaPromotion, createPrismaPromotion, updatePrismaPromotion } from "@/features/promotions/prisma-repository";
import type { PromotionUpdateInput } from "@/features/promotions/dto";

async function tenant(permission: PermissionKey) {
  return requireWritePermission(permission);
}

export async function createPromotionAction(input: Parameters<typeof createPrismaPromotion>[0]) {
  try { return writeSuccess(await createPrismaPromotion(input, await tenant(WRITE_PERMISSIONS.promotionsCreate))); } catch (error) { return writeFailure(error); }
}

export async function updatePromotionAction(promotionId: string, input: PromotionUpdateInput) {
  try { return writeSuccess(await updatePrismaPromotion(promotionId, input, await tenant(WRITE_PERMISSIONS.promotionsUpdate))); } catch (error) { return writeFailure(error); }
}

export async function archivePromotionAction(promotionId: string) {
  try { return writeSuccess(await archivePrismaPromotion(promotionId, await tenant(WRITE_PERMISSIONS.promotionsDelete))); } catch (error) { return writeFailure(error); }
}
