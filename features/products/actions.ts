"use server";

import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { requireReadPermission, requireWritePermission, WRITE_PERMISSIONS, READ_PERMISSIONS, type WritePermissionKey } from "@/lib/auth/permissions";
import {
  archivePrismaProduct,
  bulkUpdatePrismaProductPrices,
  createPrismaProduct,
  deletePrismaCategory,
  deletePrismaProduct,
  duplicatePrismaProduct,
  getPrismaProductListPage,
  updatePrismaProduct,
  upsertPrismaCategory,
  type ProductWriteInput,
  type BulkPriceUpdateInput,
} from "@/features/products/prisma-repository";
import type { ProductListQuery } from "@/features/products/list-query";

async function tenant(permission: WritePermissionKey) {
  return requireWritePermission(permission);
}

export async function loadProductListAction(query: ProductListQuery = {}) {
  try {
    const tenant = await requireReadPermission(READ_PERMISSIONS.productsView);
    return writeSuccess(await getPrismaProductListPage(tenant, query));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function createProductAction(input: ProductWriteInput) {
  try { return writeSuccess(await createPrismaProduct(input, await tenant(WRITE_PERMISSIONS.productsCreate))); } catch (error) { return writeFailure(error); }
}

export async function updateProductAction(productId: string, input: Partial<ProductWriteInput>) {
  try { return writeSuccess(await updatePrismaProduct(productId, input, await tenant(WRITE_PERMISSIONS.productsUpdate))); } catch (error) { return writeFailure(error); }
}

export async function archiveProductAction(productId: string) {
  try { return writeSuccess(await archivePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsDelete))); } catch (error) { return writeFailure(error); }
}

export async function deleteProductAction(productId: string) {
  try { return writeSuccess(await deletePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsDelete))); } catch (error) { return writeFailure(error); }
}

export async function duplicateProductAction(productId: string) {
  try { return writeSuccess(await duplicatePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsCreate))); } catch (error) { return writeFailure(error); }
}

export async function bulkPriceUpdateAction(input: BulkPriceUpdateInput) {
  try { return writeSuccess(await bulkUpdatePrismaProductPrices(input, await tenant(WRITE_PERMISSIONS.productsUpdate))); } catch (error) { return writeFailure(error); }
}

export async function upsertCategoryAction(input: { id?: string; nameEn?: string; nameLo: string; parentId?: string }) {
  try { return writeSuccess(await upsertPrismaCategory(input, await tenant(WRITE_PERMISSIONS.categoriesManage))); } catch (error) { return writeFailure(error); }
}

export async function deleteCategoryAction(categoryId: string) {
  try { return writeSuccess(await deletePrismaCategory(categoryId, await tenant(WRITE_PERMISSIONS.categoriesManage))); } catch (error) { return writeFailure(error); }
}
