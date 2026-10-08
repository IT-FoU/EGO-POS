import { createPrismaProduct, type ProductWriteInput } from "@/features/products/prisma-repository";
import { readProductImportFile } from "@/features/products/product-import-files";
import {
  evaluateProductImport,
  parseProductImportCsv,
  publicProductImportPreview,
  type ProductImportDraft,
  type ProductImportEvaluation,
  type ProductImportParseResult,
} from "@/features/products/product-import";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export async function previewProductImport(csvText: string, tenant: TenantContext) {
  const parsed = parseProductImportCsv(csvText);
  const catalog = await loadProductImportCatalog(tenant, parsed);
  return publicProductImportPreview(evaluateProductImport(parsed, catalog));
}

export async function importProductCsvBatch(
  csvText: string,
  tenant: TenantContext,
  options: { afterRow: number; limit: number },
) {
  return importParsedBatch(parseProductImportCsv(csvText), tenant, options);
}

export async function previewProductImportFile(
  input: { bytes: Uint8Array; fileName: string; sheetName?: string },
  tenant: TenantContext,
) {
  const read = await readProductImportFile(input);
  const catalog = await loadProductImportCatalog(tenant, read.parsed);
  return {
    ...publicProductImportPreview(evaluateProductImport(read.parsed, catalog)),
    format: read.format,
    selectedSheet: read.selectedSheet,
    sheets: read.sheets,
    skippedBlankRows: read.parsed.skippedBlankRows,
  };
}

export async function importProductFileBatch(
  input: { bytes: Uint8Array; fileName: string; sheetName?: string },
  tenant: TenantContext,
  options: { afterRow: number; limit: number },
) {
  const read = await readProductImportFile(input);
  const result = await importParsedBatch(read.parsed, tenant, options);
  return { ...result, format: read.format, selectedSheet: read.selectedSheet, sheets: read.sheets };
}

async function importParsedBatch(
  parsed: ProductImportParseResult,
  tenant: TenantContext,
  options: { afterRow: number; limit: number },
) {
  const catalog = await loadProductImportCatalog(tenant, parsed);
  const evaluation = evaluateProductImport(parsed, catalog);
  if (evaluation.fileIssues.some((issue) => issue.level === "error")) {
    return {
      blocked: true,
      created: 0,
      failed: 0,
      fileIssues: evaluation.fileIssues,
      nextAfterRow: options.afterRow,
      remaining: 0,
      rows: [] as ProductImportBatchRow[],
      warnings: 0,
    };
  }

  const importable = evaluation.rows.filter((row) => row.draft && row.rowNumber > options.afterRow);
  const batch = importable.slice(0, options.limit);
  const rows: ProductImportBatchRow[] = [];
  let created = 0;
  let failed = 0;
  let warnings = 0;

  for (const row of batch) {
    try {
      await createPrismaProduct(toProductWriteInput(row.draft!), tenant);
      created += 1;
      if (row.state === "warning") warnings += 1;
      rows.push({
        issues: row.issues,
        outcome: "created",
        productName: row.productName,
        rowNumber: row.rowNumber,
      });
    } catch (error) {
      failed += 1;
      rows.push({
        issues: [{ code: mapWriteError(error), detail: writeErrorDetail(error, row), level: "error" }],
        outcome: "failed",
        productName: row.productName,
        rowNumber: row.rowNumber,
      });
    }
  }

  return {
    blocked: false,
    created,
    failed,
    fileIssues: evaluation.fileIssues,
    nextAfterRow: batch[batch.length - 1]?.rowNumber ?? options.afterRow,
    remaining: Math.max(0, importable.length - batch.length),
    rows,
    warnings,
  };
}

type ProductImportBatchRow = {
  issues: ProductImportEvaluation["rows"][number]["issues"];
  outcome: "created" | "failed";
  productName: string;
  rowNumber: number;
};

async function loadProductImportCatalog(tenant: TenantContext, parsed: ReturnType<typeof parseProductImportCsv>) {
  const scope = await resolveTenantScope(tenant);
  const branchWhere = branchOwnedWhere(scope);
  const skus = uniqueValues(parsed.rows.flatMap((row) => [row.values.sku ?? ""]));
  const barcodes = uniqueValues(parsed.rows.flatMap((row) => [
    row.values.piece_barcode ?? "",
    row.values.pack_barcode ?? "",
    row.values.box_barcode ?? "",
  ]));

  const [skuRows, productBarcodes, unitBarcodes, categories, brands, suppliers] = await Promise.all([
    skus.length
      ? db.product.findMany({
          select: { sku: true },
          where: { companyId: scope.companyId, sku: { in: skus } },
        })
      : [],
    barcodes.length
      ? db.product.findMany({
          select: { barcode: true },
          where: { barcode: { in: barcodes }, companyId: scope.companyId },
        })
      : [],
    barcodes.length
      ? db.productUnit.findMany({
          select: { barcode: true },
          where: { barcode: { in: barcodes }, product: { companyId: scope.companyId } },
        })
      : [],
    db.category.findMany({
      select: { id: true, nameEn: true, nameLo: true },
      where: { companyId: scope.companyId, ...branchWhere },
    }),
    db.brand.findMany({
      select: { id: true, name: true },
      where: { companyId: scope.companyId },
    }),
    db.supplier.findMany({
      select: { companyName: true, id: true, name: true },
      where: { companyId: scope.companyId, status: { not: "inactive" }, ...branchWhere },
    }),
  ]);

  return {
    barcodes: uniqueValues([
      ...productBarcodes.map((row: { barcode?: string | null }) => row.barcode ?? ""),
      ...unitBarcodes.map((row: { barcode?: string | null }) => row.barcode ?? ""),
    ]),
    brands: brands.map((brand: { id: string; name: string }) => ({ id: brand.id, name: brand.name ?? "" })),
    categories: categories.map((category: { id: string; nameEn?: string | null; nameLo?: string | null }) => ({
      id: category.id,
      nameEn: category.nameEn ?? "",
      nameLo: category.nameLo ?? "",
    })),
    skus: uniqueValues(skuRows.map((row: { sku?: string | null }) => row.sku ?? "")),
    suppliers: suppliers.map((supplier: { companyName?: string | null; id: string; name?: string | null }) => ({
      companyName: supplier.companyName ?? "",
      id: supplier.id,
      name: supplier.name ?? "",
    })),
  };
}

function toProductWriteInput(draft: ProductImportDraft): ProductWriteInput {
  return draft;
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mapWriteError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("Permission denied")) return "permission_denied";
  if (message.includes("SKU already exists")) return "sku_exists";
  if (message.includes("Barcode already exists")) return "barcode_exists";
  return "write_failed";
}

function writeErrorDetail(error: unknown, row: { sku: string; trackedBarcodes: Array<{ barcode: string }> }) {
  const code = mapWriteError(error);
  if (code === "sku_exists") return row.sku;
  if (code === "barcode_exists") return row.trackedBarcodes.map((item) => item.barcode).join(", ");
  return error instanceof Error ? error.message : "Import failed";
}
