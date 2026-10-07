import { buildBarcodeAudit, type BarcodeAuditProduct } from "@/features/products/barcode-audit";
import { resolveProductListFilter } from "@/features/products/list-query";
import { prisma } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/db/write-context";

const db = prisma as any;

export async function loadProductBarcodeAudit(tenant: TenantContext) {
  const resolved = await resolveProductListFilter(tenant, { insight: "all", search: "", status: "all" }, db);
  const products = await db.product.findMany({
    orderBy: [{ nameLo: "asc" }, { id: "asc" }],
    select: {
      barcode: true,
      id: true,
      nameEn: true,
      nameLo: true,
      sku: true,
      status: true,
      units: {
        orderBy: { sortOrder: "asc" as const },
        select: {
          allowManualUnitSelect: true,
          barcode: true,
          sortOrder: true,
          status: true,
          unitName: true,
        },
      },
    },
    where: {
      AND: [resolved.listWhere, { status: { not: "deleted" } }],
    },
  });
  return buildBarcodeAudit(products as BarcodeAuditProduct[]);
}
