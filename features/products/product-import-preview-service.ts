import { PermissionDeniedError } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";
import type { LargeImportStore } from "@/features/products/product-import-large-store";
import { getLargeImportStore } from "@/features/products/product-import-large-store";
import { buildLargeImportPreview, type LargeImportPreview, type PreviewCatalogItem, type PreviewFilter, type PreviewPageSize } from "@/features/products/product-import-preview";
import type { ImportProcessStore } from "@/features/products/product-import-process-store";
import { getImportProcessStore } from "@/features/products/product-import-process-store";
import type { EmbeddedImageAnchor } from "@/features/products/product-import-images";
import type { ProductImportColumnChoice } from "@/features/products/product-import";

export class PreviewStoragePendingError extends Error {
  constructor() {
    super("preview_storage_pending");
  }
}

export async function readLargeImportPreview(
  processId: string,
  tenant: TenantContext,
  _request: {
    catalog: PreviewCatalogItem[];
    choices?: ProductImportColumnChoice[];
    filter?: PreviewFilter;
    images?: EmbeddedImageAnchor[];
    page?: number;
    pageSize?: PreviewPageSize;
    rows?: string[][];
    sheetName: string;
  },
  deps?: { now?: Date; processes?: ImportProcessStore; uploads?: LargeImportStore },
): Promise<LargeImportPreview> {
  const processes = deps?.processes ?? getImportProcessStore();
  const uploads = deps?.uploads ?? getLargeImportStore();
  const now = deps?.now ?? new Date();
  const process = await processes.get(processId);
  if (!process || process.companyId !== tenant.companyId || process.userId !== tenant.userId) {
    throw new PermissionDeniedError("products.create");
  }
  if (process.status === "cancelled" || process.status === "expired") throw new Error("preview_closed");
  if (process.status !== "ready") throw new Error("preview_not_ready");
  const upload = await uploads.get(process.uploadId);
  if (!upload || upload.companyId !== tenant.companyId || upload.status === "cancelled" || upload.status === "expired") {
    throw new Error("preview_closed");
  }
  if (Date.parse(upload.expiresAt) <= now.getTime()) throw new Error("preview_closed");
  if (!_request.rows) throw new PreviewStoragePendingError();
  return buildLargeImportPreview({
    catalog: _request.catalog,
    choices: _request.choices,
    filter: _request.filter,
    images: _request.images,
    page: _request.page,
    pageSize: _request.pageSize,
    rows: _request.rows,
    sheetName: _request.sheetName,
  });
}
