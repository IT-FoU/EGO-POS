"use server";

import { requireWritePermission, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { completePrismaSale } from "@/features/pos/prisma-repository";

export async function completeSaleAction(input: Parameters<typeof completePrismaSale>[0]) {
  try {
    return writeSuccess(await completePrismaSale(input, await requireWritePermission(WRITE_PERMISSIONS.posSell)));
  } catch (error) {
    return writeFailure(error);
  }
}
