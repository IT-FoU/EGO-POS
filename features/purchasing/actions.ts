"use server";

import { requireWritePermission, WRITE_PERMISSIONS, type PermissionKey } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { createPurchaseOrder, createSupplierPayment, receiveGoods } from "@/features/purchasing/prisma-repository";

async function tenant(permission: PermissionKey) {
  return requireWritePermission(permission);
}

export async function createPurchaseOrderAction(input: Parameters<typeof createPurchaseOrder>[0]) {
  try { return writeSuccess(await createPurchaseOrder(input, await tenant(WRITE_PERMISSIONS.purchasingCreate))); } catch (error) { return writeFailure(error); }
}

export async function receiveGoodsAction(input: Parameters<typeof receiveGoods>[0]) {
  try { return writeSuccess(await receiveGoods(input, await tenant(WRITE_PERMISSIONS.purchasingReceive))); } catch (error) { return writeFailure(error); }
}

export async function createSupplierPaymentAction(input: Parameters<typeof createSupplierPayment>[0]) {
  try { return writeSuccess(await createSupplierPayment(input, await tenant(WRITE_PERMISSIONS.purchasingPayment))); } catch (error) { return writeFailure(error); }
}
