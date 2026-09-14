"use server";

import { revalidatePath } from "next/cache";
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
  getPrismaUnitPricingDefaults,
  updatePrismaProduct,
  upsertPrismaBrand,
  upsertPrismaCategory,
  type ProductWriteInput,
  type BulkPriceUpdateInput,
} from "@/features/products/prisma-repository";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { searchBraveImages } from "@/features/products/brave-image-search";
import {
  BRAVE_SEARCH_API_KEY_ENV,
  IMAGE_SEARCH_PROVIDER,
  readBraveSearchApiKey,
  redactImageSearchSecrets,
  resolveImageSearchQuery,
  type ImageSearchSource,
} from "@/features/products/product-image-search";
import { bytesToBase64, importRemoteProductImageBytes } from "@/features/products/remote-image-import";
import { clearProductImages, uploadAndAttachProductImages } from "@/features/products/product-image-service";
import { ProductImageValidationError } from "@/lib/storage/image-validate";
import type { ProductListQuery } from "@/features/products/list-query";

function revalidateProductCataloguePaths() {
  revalidatePath("/products");
  revalidatePath("/products/new");
  revalidatePath("/products/categories");
  revalidatePath("/pos");
}

function readWorkerBinding(name: string) {
  try {
    const env = getCloudflareContext().env as Record<string, unknown>;
    const value = env[name];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function braveSearchApiKeyFromRuntime() {
  return readBraveSearchApiKey({
    [BRAVE_SEARCH_API_KEY_ENV]: readWorkerBinding(BRAVE_SEARCH_API_KEY_ENV) ?? process.env[BRAVE_SEARCH_API_KEY_ENV],
  });
}

async function tenant(permission: WritePermissionKey) {
  return requireWritePermission(permission);
}

function asUploadFile(value: FormDataEntryValue | null) {
  if (value instanceof Blob && value.size > 0) return value;
  return null;
}

export async function loadProductListAction(query: ProductListQuery = {}) {
  try {
    const tenant = await requireReadPermission(READ_PERMISSIONS.productsView);
    return writeSuccess(await getPrismaProductListPage(tenant, query));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function loadUnitPricingDefaultsAction() {
  try {
    return writeSuccess(await getPrismaUnitPricingDefaults(await requireReadPermission(READ_PERMISSIONS.productsView)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function createProductAction(input: ProductWriteInput) {
  try {
    const data = await createPrismaProduct(input, await tenant(WRITE_PERMISSIONS.productsCreate));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function updateProductAction(productId: string, input: Partial<ProductWriteInput>) {
  try {
    const data = await updatePrismaProduct(productId, input, await tenant(WRITE_PERMISSIONS.productsUpdate));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function uploadProductImageAction(productId: string, formData: FormData) {
  try {
    const main = asUploadFile(formData.get("main"));
    const thumb = asUploadFile(formData.get("thumb"));
    if (!main || !thumb) {
      throw new ProductImageValidationError("Image upload is empty.");
    }
    const assignToUnitId = String(formData.get("assignToUnitId") ?? "").trim() || undefined;
    const assignToUnitIds = formData.getAll("assignToUnitIds").map((value) => String(value).trim()).filter(Boolean);
    const setProductMainRaw = String(formData.get("setProductMain") ?? "true").trim().toLowerCase();
    const setProductMain = setProductMainRaw !== "false" && setProductMainRaw !== "0";
    return writeSuccess(await uploadAndAttachProductImages(productId, {
      assignToUnitId,
      assignToUnitIds,
      main,
      mainType: main.type,
      setProductMain,
      thumb,
      thumbType: thumb.type,
    }, await tenant(WRITE_PERMISSIONS.productsUpdate)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function searchProductImagesAction(input: {
  barcode?: string;
  productName?: string;
  source: ImageSearchSource;
}) {
  try {
    await requireReadPermission(READ_PERMISSIONS.productsView);
    const resolved = resolveImageSearchQuery(input.source, input);
    if (!resolved.ok) {
      throw new Error(resolved.reason === "empty-name" ? "Product name is required" : "Barcode is required");
    }
    const apiKey = braveSearchApiKeyFromRuntime();
    if (!apiKey) {
      return writeSuccess({
        configured: false,
        provider: IMAGE_SEARCH_PROVIDER,
        query: resolved.query,
        results: [],
        source: resolved.source,
      });
    }
    const results = await searchBraveImages(resolved.query, apiKey);
    return writeSuccess({
      configured: true,
      provider: IMAGE_SEARCH_PROVIDER,
      query: resolved.query,
      results,
      source: resolved.source,
    });
  } catch (error) {
    const message = redactImageSearchSecrets(error instanceof Error ? error.message : "Image search failed.");
    return writeFailure(new Error(message));
  }
}

export async function importRemoteProductImageAction(imageUrl: string) {
  try {
    await requireReadPermission(READ_PERMISSIONS.productsView);
    const imported = await importRemoteProductImageBytes(imageUrl);
    return writeSuccess({
      bytesBase64: bytesToBase64(imported.bytes),
      filename: imported.filename,
      mime: imported.mime,
      size: imported.size,
    });
  } catch (error) {
    return writeFailure(error);
  }
}

export async function clearProductImageAction(productId: string) {
  try {
    return writeSuccess(await clearProductImages(productId, await tenant(WRITE_PERMISSIONS.productsUpdate)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function archiveProductAction(productId: string) {
  try {
    const data = await archivePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsDelete));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function deleteProductAction(productId: string) {
  try {
    const data = await deletePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsDelete));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function duplicateProductAction(productId: string) {
  try {
    const data = await duplicatePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsCreate));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function bulkPriceUpdateAction(input: BulkPriceUpdateInput) {
  try {
    const data = await bulkUpdatePrismaProductPrices(input, await tenant(WRITE_PERMISSIONS.productsUpdate));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function upsertCategoryAction(input: { id?: string; nameEn?: string; nameLo: string; parentId?: string }) {
  try {
    const data = await upsertPrismaCategory(input, await tenant(WRITE_PERMISSIONS.categoriesManage));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function upsertBrandAction(input: { id?: string; name: string }) {
  try {
    const data = await upsertPrismaBrand(input, await tenant(WRITE_PERMISSIONS.productsUpdate));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function deleteCategoryAction(categoryId: string) {
  try {
    const data = await deletePrismaCategory(categoryId, await tenant(WRITE_PERMISSIONS.categoriesManage));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}
