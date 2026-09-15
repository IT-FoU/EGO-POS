import { prisma } from "@/lib/db/prisma";
import { resolveTenantScope } from "@/lib/db/tenant-scope";
import type { TenantContext } from "@/lib/db/write-context";

export async function listBranchFavoriteProductIds(tenant: TenantContext, client: any = prisma) {
  const scope = await resolveTenantScope(tenant, client);
  const rows = await client.branchFavoriteProduct.findMany({
    select: { productId: true },
    where: {
      branchId: scope.branchId,
      companyId: scope.companyId,
    },
  });
  return rows.map((row: { productId: string }) => row.productId);
}

export async function setBranchFavoriteProduct(
  input: { favorite: boolean; productId: string },
  tenant: TenantContext,
) {
  const scope = await resolveTenantScope(tenant);
  const productId = String(input.productId ?? "").trim();
  if (!productId) {
    throw new Error("Product id is required.");
  }

  const product = await prisma.product.findFirst({
    select: { id: true, isActive: true },
    where: {
      companyId: scope.companyId,
      id: productId,
    },
  });
  if (!product) {
    throw new Error("Product not found in this store.");
  }
  if (!product.isActive) {
    throw new Error("Inactive products cannot be favorited.");
  }

  if (input.favorite) {
    await prisma.branchFavoriteProduct.upsert({
      create: {
        branchId: scope.branchId,
        companyId: scope.companyId,
        createdBy: tenant.userId ?? null,
        productId,
      },
      update: {},
      where: {
        branchId_productId: {
          branchId: scope.branchId,
          productId,
        },
      },
    });
  } else {
    await prisma.branchFavoriteProduct.deleteMany({
      where: {
        branchId: scope.branchId,
        companyId: scope.companyId,
        productId,
      },
    });
  }

  return {
    favorite: input.favorite,
    productId,
  };
}
