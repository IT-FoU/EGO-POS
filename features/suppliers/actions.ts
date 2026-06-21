"use server";

import { requireWritePermission, WRITE_PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { archivePrismaSupplier, createPrismaSupplier, updatePrismaSupplier } from "@/features/suppliers/prisma-repository";
import type { SupplierUpdateInput } from "@/features/suppliers/dto";

async function tenant(permission: PermissionKey) {
  return requireWritePermission(permission);
}

export async function createSupplierAction(input: Parameters<typeof createPrismaSupplier>[0]) {
  try { return writeSuccess(await createPrismaSupplier(input, await tenant(WRITE_PERMISSIONS.suppliersCreate))); } catch (error) { return writeFailure(error); }
}

export async function updateSupplierAction(supplierId: string, input: SupplierUpdateInput) {
  try { return writeSuccess(await updatePrismaSupplier(supplierId, input, await tenant(WRITE_PERMISSIONS.suppliersUpdate))); } catch (error) { return writeFailure(error); }
}

export async function archiveSupplierAction(supplierId: string) {
  try { return writeSuccess(await archivePrismaSupplier(supplierId, await tenant(WRITE_PERMISSIONS.suppliersDelete))); } catch (error) { return writeFailure(error); }
}
