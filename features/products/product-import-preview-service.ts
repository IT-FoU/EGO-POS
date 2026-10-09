import { PermissionDeniedError } from "@/lib/auth/permissions";
import type { TenantContext } from "@/lib/db/write-context";
import type { LargeImportStore } from "@/features/products/product-import-large-store";
import { getLargeImportStore } from "@/features/products/product-import-large-store";
import { buildLargeImportPreview, type LargeImportPreview, type PreviewCatalogItem, type PreviewEdit, type PreviewFilter, type PreviewPageSize } from "@/features/products/product-import-preview";
import type { ImportProcessStore } from "@/features/products/product-import-process-store";
import { getImportProcessStore } from "@/features/products/product-import-process-store";
import type { EmbeddedImageAnchor } from "@/features/products/product-import-images";
import type { ProductImportColumnChoice } from "@/features/products/product-import";

export type BoundPreviewRequest = {
  choices?: ProductImportColumnChoice[];
  companyId: string;
  edits?: PreviewEdit[];
  filter?: PreviewFilter;
  includeImages?: boolean;
  mappedPage?: number;
  page?: number;
  pageSize?: PreviewPageSize;
  processId: string;
  sheetName: string;
  userId: string;
};

export async function readLargeImportPreview(
  processId: string,
  tenant: TenantContext,
  _request: {
    catalog: PreviewCatalogItem[];
    choices?: ProductImportColumnChoice[];
    edits?: PreviewEdit[];
    filter?: PreviewFilter;
    images?: EmbeddedImageAnchor[];
    includeImages?: boolean;
    mappedPage?: number;
    page?: number;
    pageSize?: PreviewPageSize;
    rows?: string[][];
    sheetName: string;
  },
  deps?: {
    now?: Date;
    preview?: (request: BoundPreviewRequest) => Promise<LargeImportPreview>;
    processes?: ImportProcessStore;
    uploads?: LargeImportStore;
  },
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
  if (!_request.rows) {
    if (!deps?.preview) throw new Error("preview_unavailable");
    return deps.preview({
      choices: _request.choices,
      companyId: tenant.companyId,
      edits: _request.edits,
      filter: _request.filter,
      includeImages: _request.includeImages,
      mappedPage: _request.mappedPage,
      page: _request.page,
      pageSize: _request.pageSize,
      processId,
      sheetName: _request.sheetName,
      userId: tenant.userId,
    });
  }
    return buildLargeImportPreview({
    catalog: _request.catalog,
    choices: _request.choices,
    edits: _request.edits,
    filter: _request.filter,
    images: _request.includeImages === false ? [] : _request.images,
    mappedPage: _request.mappedPage,
    page: _request.page,
    pageSize: _request.pageSize,
    rows: _request.rows,
    sheetName: _request.sheetName,
  });
}
