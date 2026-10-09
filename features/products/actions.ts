"use server";

import { revalidatePath } from "next/cache";
import { writeFailure, writeSuccess } from "@/lib/db/write-context";
import { requireReadPermission, requireWritePermission, WRITE_PERMISSIONS, READ_PERMISSIONS, type WritePermissionKey } from "@/lib/auth/permissions";
import {
  archivePrismaProduct,
  bulkUpdatePrismaProductPrices,
  createPrismaProduct,
  deletePrismaBrand,
  deletePrismaCategory,
  deletePrismaProduct,
  duplicatePrismaProduct,
  permanentDeletePrismaProduct,
  getPrismaProductListIds,
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
import { deleteFailureCode } from "@/features/products/product-delete";
import { loadPermanentDeleteEligibility } from "@/features/products/product-delete-service";
import { ProductImageValidationError } from "@/lib/storage/image-validate";
import type { ProductListQuery } from "@/features/products/list-query";
import { importProductCsvBatch, importProductFileBatch, previewProductImport, previewProductImportFile } from "@/features/products/product-import-service";
import { PRODUCT_IMPORT_BATCH_SIZE, PRODUCT_IMPORT_MAX_CHARS, type ProductImportColumnChoice } from "@/features/products/product-import";
import { cancelLargeImportUpload, startLargeImportUpload, verifyLargeImportUpload } from "@/features/products/product-import-large-service";
import type { LargeImportPreview, PreviewFilter, PreviewPageSize } from "@/features/products/product-import-preview";
import { readLargeImportPreview, type BoundPreviewRequest } from "@/features/products/product-import-preview-service";
import { cancelImportProcess, readImportProcess, startImportProcess } from "@/features/products/product-import-process-service";
import { assertImportProcessId } from "@/features/products/product-import-process";
import { loadProductBarcodeAudit } from "@/features/products/barcode-audit-service";
import { loadBarcodePrintProducts } from "@/features/products/barcode-print-service";
import { applyBulkSellingPrices, loadBulkPriceProducts, type BulkPriceApplyLine, type BulkPriceJobAudit } from "@/features/products/bulk-price-service";
import { markShelfLabelsPrinted, type MarkPrintedLine } from "@/features/products/label-reprint-service";
import { FINE } from "@/features/access-control/fine-permissions";
import { requireFinePermission } from "@/lib/auth/fine-access";
import { buildProductExportFile, buildProductExportPreview, type ProductExportRequest } from "@/features/products/product-export-service";

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

export async function loadProductListIdsAction(query: ProductListQuery = {}) {
  try {
    const tenant = await requireReadPermission(READ_PERMISSIONS.productsView);
    return writeSuccess(await getPrismaProductListIds(tenant, query));
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
  query?: string;
  source: ImageSearchSource;
}) {
  try {
    await requireReadPermission(READ_PERMISSIONS.productsView);
    const manualQuery = String(input.query ?? "").trim();
    const resolved = manualQuery
      ? ({ ok: true as const, query: manualQuery, source: input.source })
      : resolveImageSearchQuery(input.source, input);
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
    return { error: deleteFailureCode(error), ok: false as const };
  }
}

export async function deleteProductAction(productId: string) {
  try {
    const data = await deletePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsDelete));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return { error: deleteFailureCode(error), ok: false as const };
  }
}

export async function loadPermanentDeleteEligibilityAction(productIds: string[]) {
  try {
    const data = await loadPermanentDeleteEligibility(productIds, await tenant(WRITE_PERMISSIONS.productsDelete));
    return writeSuccess(data);
  } catch (error) {
    return { error: deleteFailureCode(error), ok: false as const };
  }
}

export async function permanentDeleteProductAction(productId: string) {
  try {
    const data = await permanentDeletePrismaProduct(productId, await tenant(WRITE_PERMISSIONS.productsDelete));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return { error: deleteFailureCode(error), ok: false as const };
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

async function bulkPriceTenant() {
  const sessionTenant = await tenant(WRITE_PERMISSIONS.productsUpdate);
  await requireFinePermission(sessionTenant, FINE.productsChangePrice);
  return sessionTenant;
}

export async function searchBulkPriceProductsAction(input: { filtered?: ProductListQuery; productIds?: string[]; search?: string }) {
  try {
    return writeSuccess(await loadBulkPriceProducts(input, await bulkPriceTenant()));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function applyBulkSellingPricesAction(lines: BulkPriceApplyLine[], job?: BulkPriceJobAudit) {
  try {
    const data = await applyBulkSellingPrices(lines, await bulkPriceTenant(), job);
    if (data.updated > 0) revalidateProductCataloguePaths();
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

export async function previewProductImportAction(csvText: string) {
  try {
    const data = await previewProductImport(csvText, await tenant(WRITE_PERMISSIONS.productsCreate));
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function importProductsAction(csvText: string, options: { afterRow?: number; limit?: number } = {}) {
  try {
    const sessionTenant = await tenant(WRITE_PERMISSIONS.productsCreate);
    const data = await importProductCsvBatch(csvText, sessionTenant, {
      afterRow: Math.max(0, Number(options.afterRow) || 0),
      limit: Math.min(PRODUCT_IMPORT_BATCH_SIZE, Math.max(1, Number(options.limit) || PRODUCT_IMPORT_BATCH_SIZE)),
    });
    if (data.created > 0) revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function previewProductImportFileAction(input: { columns?: Array<{ field?: string | null; index?: number }>; fileBase64: string; fileName: string; sheetName?: string }) {
  try {
    const bytes = decodeProductImportFile(input.fileBase64);
    const data = await previewProductImportFile({
      bytes,
      columns: input.columns,
      fileName: input.fileName,
      sheetName: input.sheetName,
    }, await tenant(WRITE_PERMISSIONS.productsCreate));
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function importProductsFileAction(input: { afterRow?: number; columns?: Array<{ field?: string | null; index?: number }>; fileBase64: string; fileName: string; limit?: number; sheetName?: string }) {
  try {
    const sessionTenant = await tenant(WRITE_PERMISSIONS.productsCreate);
    const data = await importProductFileBatch({
      bytes: decodeProductImportFile(input.fileBase64),
      columns: input.columns,
      fileName: input.fileName,
      sheetName: input.sheetName,
    }, sessionTenant, {
      afterRow: Math.max(0, Number(input.afterRow) || 0),
      limit: Math.min(PRODUCT_IMPORT_BATCH_SIZE, Math.max(1, Number(input.limit) || PRODUCT_IMPORT_BATCH_SIZE)),
    });
    if (data.created > 0) revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function startLargeProductImportUploadAction(input: { byteSize: number; fileName: string; idempotencyKey: string }) {
  try {
    return writeSuccess(await startLargeImportUpload(input, await tenant(WRITE_PERMISSIONS.productsCreate)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function verifyLargeProductImportUploadAction(jobId: string) {
  try {
    return writeSuccess(await verifyLargeImportUpload(jobId, await tenant(WRITE_PERMISSIONS.productsCreate)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function cancelLargeProductImportUploadAction(jobId: string) {
  try {
    return writeSuccess(await cancelLargeImportUpload(jobId, await tenant(WRITE_PERMISSIONS.productsCreate)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function startLargeImportProcessAction(uploadId: string) {
  try {
    return writeSuccess(await startImportProcess(uploadId, await tenant(WRITE_PERMISSIONS.productsCreate), {
      sender: { send: sendImportProcessMessage },
    }));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function readLargeImportProcessAction(processId: string) {
  try {
    return writeSuccess(await readImportProcess(processId, await tenant(WRITE_PERMISSIONS.productsCreate)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function readLargeImportPreviewAction(input: {
  choices?: ProductImportColumnChoice[];
  filter?: PreviewFilter;
  mappedPage?: number;
  page?: number;
  pageSize?: PreviewPageSize;
  processId: string;
  sheetName: string;
}) {
  try {
    return writeSuccess(await readLargeImportPreview(input.processId, await tenant(WRITE_PERMISSIONS.productsCreate), {
      catalog: [],
      choices: input.choices,
      filter: input.filter,
      mappedPage: input.mappedPage,
      page: input.page,
      pageSize: input.pageSize,
      sheetName: input.sheetName,
    }, { preview: fetchBoundPreview }));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function cancelLargeImportProcessAction(processId: string) {
  try {
    return writeSuccess(await cancelImportProcess(processId, await tenant(WRITE_PERMISSIONS.productsCreate)));
  } catch (error) {
    return writeFailure(error);
  }
}

async function fetchBoundPreview(request: BoundPreviewRequest): Promise<LargeImportPreview> {
  const env = getCloudflareContext().env as {
    IMPORT_PREVIEW?: { fetch(input: string, init?: RequestInit): Promise<Response> };
    IMPORT_PREVIEW_TOKEN?: string;
  };
  if (!env.IMPORT_PREVIEW || !env.IMPORT_PREVIEW_TOKEN) throw new Error("preview_unavailable");
  const response = await env.IMPORT_PREVIEW.fetch("https://egopos-qa-import/preview", {
    body: JSON.stringify(request),
    headers: {
      authorization: `Bearer ${env.IMPORT_PREVIEW_TOKEN}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json() as { errorCode?: string; ok?: boolean; preview?: LargeImportPreview };
  if (!response.ok || !payload.ok || !payload.preview) throw new Error(payload.errorCode || "preview_unavailable");
  return payload.preview;
}

async function sendImportProcessMessage(processId: string) {
  const env = getCloudflareContext().env as { IMPORT_PROCESS_QUEUE?: { send(body: { processId: string }): Promise<unknown> } };
  if (!env.IMPORT_PROCESS_QUEUE) throw new Error("Import processing queue is not configured.");
  await env.IMPORT_PROCESS_QUEUE.send({ processId: assertImportProcessId(processId) });
}

function decodeProductImportFile(fileBase64: string) {
  const compact = fileBase64.replace(/\s/g, "");
  if (!compact || compact.length > Math.ceil(PRODUCT_IMPORT_MAX_CHARS * 4 / 3) + 8) {
    return new Uint8Array(PRODUCT_IMPORT_MAX_CHARS + 1);
  }
  const bytes = Buffer.from(compact, "base64");
  return bytes.byteLength > PRODUCT_IMPORT_MAX_CHARS ? new Uint8Array(PRODUCT_IMPORT_MAX_CHARS + 1) : bytes;
}

export async function markShelfLabelsPrintedAction(lines: MarkPrintedLine[]) {
  try {
    const sessionTenant = await requireReadPermission(READ_PERMISSIONS.productsView);
    await requireFinePermission(sessionTenant, "products.print");
    const data = await markShelfLabelsPrinted(lines, sessionTenant);
    if (data.cleared > 0) revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function searchBarcodePrintProductsAction(input: { productIds?: string[]; search?: string }) {
  try {
    const tenant = await requireReadPermission(READ_PERMISSIONS.productsView);
    await requireFinePermission(tenant, "products.print");
    return writeSuccess(await loadBarcodePrintProducts(input, tenant));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function auditProductBarcodesAction() {
  try {
    const data = await loadProductBarcodeAudit(await requireReadPermission(READ_PERMISSIONS.productsView));
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function previewProductExportAction(input: ProductExportRequest) {
  try {
    return writeSuccess(await buildProductExportPreview(input, await requireReadPermission(READ_PERMISSIONS.productsView)));
  } catch (error) {
    return writeFailure(error);
  }
}

export async function exportProductsAction(input: ProductExportRequest) {
  try {
    const data = await buildProductExportFile(input, await requireReadPermission(READ_PERMISSIONS.productsView));
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}

export async function deleteBrandAction(brandId: string) {
  try {
    const data = await deletePrismaBrand(brandId, await tenant(WRITE_PERMISSIONS.productsUpdate));
    revalidateProductCataloguePaths();
    return writeSuccess(data);
  } catch (error) {
    return writeFailure(error);
  }
}
