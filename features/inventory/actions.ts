"use server";

import { requireWritePermission, WRITE_PERMISSIONS, type WritePermissionKey } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { createStockAdjustment, createStockCount, createStockIn } from "@/features/inventory/prisma-repository";

async function tenant(permission: WritePermissionKey) {
  return requireWritePermission(permission);
}

export async function stockInAction(input: Parameters<typeof createStockIn>[0]) {
  try { return writeSuccess(await createStockIn(input, await tenant(WRITE_PERMISSIONS.inventoryStockIn))); } catch (error) { return writeFailure(error); }
}

export async function stockAdjustmentAction(input: Parameters<typeof createStockAdjustment>[0]) {
  try { return writeSuccess(await createStockAdjustment(input, await tenant(WRITE_PERMISSIONS.inventoryAdjust))); } catch (error) { return writeFailure(error); }
}

export async function stockCountAction(input: Parameters<typeof createStockCount>[0]) {
  try { return writeSuccess(await createStockCount(input, await tenant(WRITE_PERMISSIONS.inventoryCount))); } catch (error) { return writeFailure(error); }
}
