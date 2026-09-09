"use server";

import { requireReadPermission, requireWritePermission, READ_PERMISSIONS, WRITE_PERMISSIONS } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { completePrismaSale, listSellablePosProducts } from "@/features/pos/prisma-repository";

export async function completeSaleAction(input: Parameters<typeof completePrismaSale>[0]) {
  try {
    return writeSuccess(await completePrismaSale(input, await requireWritePermission(WRITE_PERMISSIONS.posSell)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function loadPosCatalogueAction() {
  try {
    return writeSuccess(await listSellablePosProducts(await requireReadPermission(READ_PERMISSIONS.posView)));
  } catch (error) {
    return writeFailure(error);
  }
}
