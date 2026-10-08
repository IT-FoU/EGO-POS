import { BULK_PRICE_BATCH_SIZE, BULK_PRICE_MAX_LINES, classifyBulkLine, shelfLabelReprintCandidate, type BulkPriceProductSource } from "@/features/products/bulk-price";
import { markShelfLabelReprintNeeded } from "@/features/products/label-reprint-service";
import { resolveProductListFilter, type ProductListQuery } from "@/features/products/list-query";
import { recordEssentialActivity } from "@/features/store-activity/record-essential-activity";
import { prisma } from "@/lib/db/prisma";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { withTenantTransaction, type TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export type BulkPriceApplyLine = {
  expectedPriceLak: number;
  newPriceLak: number;
  productId: string;
  unitId: string;
};

export type BulkPriceJobAudit = {
  mode: "amount" | "percent";
  roundManual: boolean;
  roundingOverrideLak: number | null;
};

export type BulkPriceApplyResult = {
  conflict: number;
  failed: number;
  results: Array<{
    newPriceLak: number | null;
    oldPriceLak: number | null;
    productId: string;
    reason: string;
    sku: string;
    status: "updated" | "skipped" | "failed" | "conflict";
    unitId: string;
    unitName: string;
  }>;
  skipped: number;
  updated: number;
};

export async function loadBulkPriceProducts(
  input: { filtered?: ProductListQuery; productIds?: string[]; search?: string },
  tenant: TenantContext,
): Promise<BulkPriceProductSource[]> {
  const ids = Array.from(new Set((input.productIds ?? []).map((id) => id.trim()).filter(Boolean))).slice(0, BULK_PRICE_MAX_LINES);
  const search = input.search?.trim() ?? "";
  const filtered = input.filtered;
  if (ids.length === 0 && !search && !filtered) return [];
  const resolved = await resolveProductListFilter(tenant, filtered ? {
    ...filtered,
    page: 1,
    pageSize: BULK_PRICE_MAX_LINES,
  } : {
    insight: "all",
    search: ids.length > 0 ? "" : search,
    status: "all",
  }, db);
  const products = await db.product.findMany({
    orderBy: [{ nameLo: "asc" }, { id: "asc" }],
    select: {
      costPriceLak: true,
      id: true,
      nameEn: true,
      nameLo: true,
      sellingPriceLak: true,
      sku: true,
      units: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          allowManualUnitSelect: true,
          barcode: true,
          costPriceLak: true,
          id: true,
          isBaseUnit: true,
          isDefaultSaleUnit: true,
          roundingLak: true,
          sellingPriceLak: true,
          status: true,
          unitName: true,
        },
      },
    },
    take: ids.length > 0 ? ids.length : BULK_PRICE_MAX_LINES,
    where: {
      AND: [
        resolved.listWhere,
        { status: { not: "deleted" } },
        ids.length > 0 ? { id: { in: ids } } : {},
      ],
    },
  });
  return products.map((product: Record<string, any>) => ({
    costPriceLak: product.costPriceLak == null ? null : Number(product.costPriceLak),
    id: String(product.id),
    nameEn: product.nameEn ?? "",
    nameLo: product.nameLo ?? "",
    sellingPriceLak: Number(product.sellingPriceLak ?? 0),
    sku: product.sku ?? "",
    units: (product.units ?? []).map((unit: Record<string, any>) => ({
      allowManualUnitSelect: unit.allowManualUnitSelect !== false,
      barcode: unit.barcode ?? "",
      costPriceLak: unit.costPriceLak == null ? null : Number(unit.costPriceLak),
      id: String(unit.id),
      isBaseUnit: Boolean(unit.isBaseUnit),
      isDefaultSaleUnit: Boolean(unit.isDefaultSaleUnit),
      roundingLak: Number(unit.roundingLak ?? 0),
      sellingPriceLak: Number(unit.sellingPriceLak ?? 0),
      status: unit.status ?? "active",
      unitName: unit.unitName ?? "",
    })),
  }));
}

export async function applyBulkSellingPrices(lines: BulkPriceApplyLine[], tenant: TenantContext, job?: BulkPriceJobAudit): Promise<BulkPriceApplyResult> {
  const unique = new Map<string, BulkPriceApplyLine>();
  for (const line of lines) {
    const productId = line.productId.trim();
    if (!productId) continue;
    unique.set(`${productId}:${line.unitId.trim()}`, {
      expectedPriceLak: Math.round(Number(line.expectedPriceLak)),
      newPriceLak: Math.round(Number(line.newPriceLak)),
      productId,
      unitId: line.unitId.trim(),
    });
  }
  const queued = Array.from(unique.values()).slice(0, BULK_PRICE_MAX_LINES);
  const results: BulkPriceApplyResult["results"] = [];
  for (let index = 0; index < queued.length; index += BULK_PRICE_BATCH_SIZE) {
    const batch = queued.slice(index, index + BULK_PRICE_BATCH_SIZE);
    const batchResults = await withTenantTransaction({
      action: "bulk_price_update",
      module: "products",
      newData: {
        lines: batch.map((line) => ({
          expectedPriceLak: line.expectedPriceLak,
          newPriceLak: line.newPriceLak,
          productId: line.productId,
          unitId: line.unitId,
        })),
        mode: job?.mode ?? null,
        roundManual: Boolean(job?.roundManual),
        roundingOverrideLak: job?.roundingOverrideLak ?? null,
        source: "Bulk Price Update",
      },
      tenant,
      write: async (tx) => {
        const scope = await resolveTenantScope(tenant, tx);
        const written = [];
        for (const line of batch) {
          written.push(await applyBulkLine(tx, scope, tenant, line));
        }
        const updated = written.filter((row) => row.status === "updated").length;
        if (updated > 0) {
          await recordEssentialActivity(tx, {
            action: "product.update",
            branchId: scope.branchId,
            companyId: tenant.companyId,
            entityType: "product",
            metadata: {
              mode: job?.mode ?? "percent",
              roundManual: Boolean(job?.roundManual),
              roundingOverrideLak: job?.roundingOverrideLak ?? null,
              labelReprintNeeded: true,
              source: "bulk_price_update",
              updated,
            },
            module: "products",
            summary: "Bulk Price Update",
            userId: tenant.userId,
          });
        }
        return written;
      },
    });
    results.push(...batchResults);
  }
  return {
    conflict: results.filter((row) => row.status === "conflict").length,
    failed: results.filter((row) => row.status === "failed").length,
    results,
    skipped: results.filter((row) => row.status === "skipped").length,
    updated: results.filter((row) => row.status === "updated").length,
  };
}

async function applyBulkLine(tx: any, scope: Awaited<ReturnType<typeof resolveTenantScope>>, tenant: TenantContext, line: BulkPriceApplyLine) {
  const product = await tx.product.findFirst({
    select: {
      id: true,
      sellingPriceLak: true,
      sku: true,
      units: {
        select: {
          allowManualUnitSelect: true,
          id: true,
          isDefaultSaleUnit: true,
          sellingPriceLak: true,
          status: true,
          unitName: true,
        },
      },
    },
    where: {
      companyId: tenant.companyId,
      id: line.productId,
      status: { not: "deleted" },
      ...branchOwnedWhere(scope),
    },
  });
  if (!product) {
    return row(line, "failed", "missing", "", "", null, null);
  }
  const legacy = product.units.length === 0;
  const unit = legacy ? null : product.units.find((item: { id: string }) => item.id === line.unitId);
  if (!legacy && !unit) {
    return row(line, "failed", "missing", product.sku ?? "", "", null, null);
  }
  if (legacy && line.unitId) {
    return row(line, "failed", "missing", product.sku ?? "", "Piece", null, null);
  }
  const enabled = legacy || ((unit.status ?? "active") !== "inactive" && unit.allowManualUnitSelect !== false);
  const current = Math.round(Number(legacy ? product.sellingPriceLak : unit.sellingPriceLak));
  const status = classifyBulkLine({
    currentPriceLak: current,
    enabled,
    expectedPriceLak: line.expectedPriceLak,
    found: true,
    newPriceLak: line.newPriceLak,
  });
  const unitName = legacy ? "Piece" : String(unit.unitName ?? "");
  if (status !== "updated") {
    const reason = status === "conflict" ? "price changed after preview" : status === "skipped" && !enabled ? "disabled" : status === "skipped" ? "unchanged" : "invalid";
    return row(line, status, reason, product.sku ?? "", unitName, current, null);
  }
  if (legacy) {
    await tx.product.update({ data: { sellingPriceLak: line.newPriceLak }, where: { id: product.id } });
  } else {
    await tx.productUnit.update({ data: { sellingPriceLak: line.newPriceLak }, where: { id: unit.id } });
    if (unit.isDefaultSaleUnit && Math.round(Number(product.sellingPriceLak)) !== line.newPriceLak) {
      await tx.product.update({ data: { sellingPriceLak: line.newPriceLak }, where: { id: product.id } });
      await tx.productPriceHistory.create({
        data: history(tenant, product.id, Math.round(Number(product.sellingPriceLak)), line.newPriceLak, null, null, "bulk_product_price"),
      });
    }
  }
  await tx.productPriceHistory.create({
    data: history(tenant, product.id, current, line.newPriceLak, legacy ? null : unit.id, unitName, "bulk_selling_price"),
  });
  await markShelfLabelReprintNeeded(tx, shelfLabelReprintCandidate({
    legacy,
    productId: product.id,
    unitId: legacy ? "" : String(unit.id),
  }));
  return row(line, "updated", "", product.sku ?? "", unitName, current, line.newPriceLak);
}

function history(tenant: TenantContext, productId: string, oldPrice: number, newPrice: number, unitId: string | null, unitName: string | null, changeType: string) {
  return {
    changeType,
    changedBy: tenant.userId,
    companyId: tenant.companyId,
    newPrice,
    oldPrice,
    productId,
    unitId,
    unitName,
  };
}

function row(
  line: BulkPriceApplyLine,
  status: BulkPriceApplyResult["results"][number]["status"],
  reason: string,
  sku: string,
  unitName: string,
  oldPriceLak: number | null,
  newPriceLak: number | null,
) {
  return {
    newPriceLak,
    oldPriceLak,
    productId: line.productId,
    reason,
    sku,
    status,
    unitId: line.unitId,
    unitName,
  };
}
