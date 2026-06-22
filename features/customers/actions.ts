"use server";

import { requireWritePermission, WRITE_PERMISSIONS, type WritePermissionKey } from "@/lib/auth/permissions";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import {
  archivePrismaCustomer,
  createPrismaCustomer,
  createPrismaCustomerPayment,
  updatePrismaCustomer,
} from "@/features/customers/prisma-repository";
import type { CustomerUpdateInput } from "@/features/customers/dto";

async function tenant(permission: WritePermissionKey) {
  return requireWritePermission(permission);
}

export async function createCustomerAction(input: Parameters<typeof createPrismaCustomer>[0]) {
  try { return writeSuccess(await createPrismaCustomer(input, await tenant(WRITE_PERMISSIONS.customersCreate))); } catch (error) { return writeFailure(error); }
}

export async function updateCustomerAction(customerId: string, input: CustomerUpdateInput) {
  try { return writeSuccess(await updatePrismaCustomer(customerId, input, await tenant(WRITE_PERMISSIONS.customersUpdate))); } catch (error) { return writeFailure(error); }
}

export async function archiveCustomerAction(customerId: string) {
  try { return writeSuccess(await archivePrismaCustomer(customerId, await tenant(WRITE_PERMISSIONS.customersUpdate))); } catch (error) { return writeFailure(error); }
}

export async function createCustomerPaymentAction(input: Parameters<typeof createPrismaCustomerPayment>[0]) {
  try { return writeSuccess(await createPrismaCustomerPayment(input, await tenant(WRITE_PERMISSIONS.customersPayment))); } catch (error) { return writeFailure(error); }
}
