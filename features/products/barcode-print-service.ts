import type { BarcodePrintProduct } from "@/features/products/barcode-print";
import { resolveProductListFilter } from "@/features/products/list-query";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export async function loadBarcodePrintProducts(
  input: { productIds?: string[]; search?: string },
  tenant: TenantContext,
): Promise<BarcodePrintProduct[]> {
  const ids = Array.from(new Set((input.productIds ?? []).map((id) => id.trim()).filter(Boolean))).slice(0, 80);
  const search = input.search?.trim() ?? "";
  if (ids.length === 0 && !search) return [];
  const resolved = await resolveProductListFilter(tenant, {
    insight: "all",
    search: ids.length > 0 ? "" : search,
    status: "all",
  }, db);
  const products = await db.product.findMany({
    orderBy: [{ nameLo: "asc" }, { id: "asc" }],
    select: {
      barcode: true,
      id: true,
      labelReprintNeeded: true,
      nameEn: true,
      nameLo: true,
      sellingPriceLak: true,
      sku: true,
      units: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          allowManualUnitSelect: true,
          barcode: true,
          id: true,
          labelReprintNeeded: true,
          sellingPriceLak: true,
          status: true,
          unitName: true,
        },
      },
    },
    take: ids.length > 0 ? ids.length : 25,
    where: {
      AND: [
        resolved.listWhere,
        { status: { not: "deleted" } },
        ids.length > 0 ? { id: { in: ids } } : {},
      ],
    },
  });
  const rank = new Map(ids.map((id, index) => [id, index]));
  return products
    .map((product: Record<string, any>) => ({
      barcode: product.barcode ?? "",
      id: String(product.id),
      labelReprintNeeded: Boolean(product.labelReprintNeeded),
      nameEn: product.nameEn ?? "",
      nameLo: product.nameLo ?? "",
      sellingPriceLak: Number(product.sellingPriceLak ?? 0),
      sku: product.sku ?? "",
      units: (product.units ?? []).map((unit: Record<string, any>) => ({
        allowManualUnitSelect: unit.allowManualUnitSelect !== false,
        barcode: unit.barcode ?? "",
        id: String(unit.id ?? ""),
        labelReprintNeeded: Boolean(unit.labelReprintNeeded),
        sellingPriceLak: Number(unit.sellingPriceLak ?? 0),
        status: unit.status ?? "active",
        unitName: unit.unitName ?? "",
      })),
    }))
    .sort((left: BarcodePrintProduct, right: BarcodePrintProduct) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
}
