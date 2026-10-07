import { recordEssentialActivity } from "@/features/store-activity/record-essential-activity";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { withTenantTransaction, type TenantContext } from "@/lib/db/write-context";

const MARK_LIMIT = 200;

export type LabelReprintTarget = {
  legacy: boolean;
  productId: string;
  unitId: string;
};

export type MarkPrintedLine = {
  observedPriceLak: number;
  productId: string;
  unitId: string;
  unitName: string;
};

export type MarkPrintedResult = {
  cleared: number;
  conflicts: number;
  failed: number;
  printedAt: string;
  results: Array<{
    productId: string;
    reason: string;
    sku: string;
    status: "cleared" | "conflict" | "failed";
    unitName: string;
  }>;
};

/** Sets the reprint flag only. The previous print timestamp stays as the last successful print. */
export async function markShelfLabelReprintNeeded(tx: any, target: LabelReprintTarget) {
  if (target.legacy || !target.unitId) {
    await tx.product.update({
      data: { labelReprintNeeded: true },
      where: { id: target.productId },
    });
    return;
  }
  await tx.productUnit.update({
    data: { labelReprintNeeded: true },
    where: { id: target.unitId },
  });
}

export async function markShelfLabelsPrinted(lines: MarkPrintedLine[], tenant: TenantContext): Promise<MarkPrintedResult> {
  const unique = dedupe(lines).slice(0, MARK_LIMIT);
  return withTenantTransaction({
    action: "shelf_label_printed",
    module: "products",
    newData: { count: unique.length, source: "shelf_label_print" },
    tenant,
    write: (tx) => writeMarkedLabels(tx, unique, tenant),
  });
}

async function writeMarkedLabels(tx: any, lines: MarkPrintedLine[], tenant: TenantContext): Promise<MarkPrintedResult> {
  const scope = await resolveTenantScope(tenant, tx);
  const printedAt = new Date();
  const productIds = Array.from(new Set(lines.map((line) => line.productId)));
  const products = productIds.length === 0
    ? []
    : await tx.product.findMany({
      select: {
        id: true,
        sellingPriceLak: true,
        sku: true,
        units: {
          select: {
            id: true,
            sellingPriceLak: true,
            unitName: true,
          },
        },
      },
      where: {
        companyId: tenant.companyId,
        id: { in: productIds },
        status: { not: "deleted" },
        ...branchOwnedWhere(scope),
      },
    });
  const byId = new Map(products.map((product: { id: string }) => [product.id, product]));
  const results: MarkPrintedResult["results"] = [];

  for (const line of lines) {
    const product = byId.get(line.productId) as {
      id: string;
      sellingPriceLak: unknown;
      sku: string | null;
      units: Array<{ id: string; sellingPriceLak: unknown; unitName: string }>;
    } | undefined;
    if (!product) {
      results.push({ productId: line.productId, reason: "missing", sku: "", status: "failed", unitName: line.unitName });
      continue;
    }
    const legacy = product.units.length === 0;
    const unit = legacy ? null : product.units.find((item) => item.id === line.unitId);
    if (!legacy && !unit) {
      results.push({ productId: product.id, reason: "missing", sku: product.sku ?? "", status: "failed", unitName: line.unitName });
      continue;
    }
    const current = Math.round(Number(legacy ? product.sellingPriceLak : unit?.sellingPriceLak));
    if (current !== Math.round(Number(line.observedPriceLak))) {
      results.push({ productId: product.id, reason: "price_changed", sku: product.sku ?? "", status: "conflict", unitName: legacy ? "Piece" : String(unit?.unitName ?? line.unitName) });
      continue;
    }
    if (legacy) {
      await tx.product.update({
        data: { labelPrintedAt: printedAt, labelReprintNeeded: false },
        where: { id: product.id },
      });
    } else {
      await tx.productUnit.update({
        data: { labelPrintedAt: printedAt, labelReprintNeeded: false },
        where: { id: unit?.id },
      });
    }
    results.push({ productId: product.id, reason: "", sku: product.sku ?? "", status: "cleared", unitName: legacy ? "Piece" : String(unit?.unitName ?? line.unitName) });
  }

  const cleared = results.filter((row) => row.status === "cleared").length;
  if (cleared > 0) {
    await recordEssentialActivity(tx, {
      action: "product.update",
      after: { labelReprintNeeded: false },
      before: { labelReprintNeeded: true },
      branchId: scope.branchId,
      companyId: tenant.companyId,
      entityId: results.find((row) => row.status === "cleared")?.productId ?? null,
      entityType: "product",
      metadata: {
        cleared,
        labelPrintedAt: printedAt.toISOString(),
        source: "shelf_label_print",
      },
      module: "products",
      summary: "Mark as Printed",
      userId: tenant.userId,
    });
  }

  return {
    cleared,
    conflicts: results.filter((row) => row.status === "conflict").length,
    failed: results.filter((row) => row.status === "failed").length,
    printedAt: printedAt.toISOString(),
    results,
  };
}

function dedupe(lines: MarkPrintedLine[]) {
  const seen = new Set<string>();
  const next: MarkPrintedLine[] = [];
  for (const line of lines) {
    const key = `${line.productId}:${line.unitId || line.unitName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(line);
  }
  return next;
}
