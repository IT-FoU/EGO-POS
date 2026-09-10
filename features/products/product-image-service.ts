import { prisma } from "@/lib/db/prisma";
import { sanitizeAuditData } from "@/lib/audit/sanitize-audit-data";
import type { TenantContext } from "@/lib/db/write-context";
import { withTenantTransaction } from "@/lib/db/write-context";
import { branchOwnedWhere, resolveTenantScope } from "@/lib/db/tenant-scope";
import { mapPrismaProduct } from "@/features/products/dto-mapper";
import { attachProductImageDelivery } from "@/features/products/product-image-delivery";
import {
  buildProductImagePaths,
  collectImageStoragePaths,
  isProductStoragePath,
  persistableProductImageUrl,
  thumbPathFromMain,
} from "@/lib/storage/product-image-ref";
import { PRODUCT_IMAGE_CACHE_CONTROL, getProductImageStorage, removeProductImageObjects } from "@/lib/storage/product-image-storage";
import { readUploadBytes, validateProductImageBytes } from "@/lib/storage/image-validate";

const db = prisma as any;

async function writeProductImageChange<T>(options: {
  action: string;
  client?: any;
  newData?: unknown;
  oldData?: unknown;
  tenant: TenantContext;
  write: (tx: any) => Promise<T>;
}) {
  if (!options.client || options.client === db) {
    return withTenantTransaction({
      action: options.action,
      module: "products",
      newData: options.newData,
      oldData: options.oldData,
      tenant: options.tenant,
      write: options.write,
    });
  }

  return options.client.$transaction(async (tx: any) => {
    const result = await options.write(tx);
    await tx.auditLog.create({
      data: {
        action: options.action,
        companyId: options.tenant.companyId,
        module: "products",
        newData: options.newData === undefined ? undefined : sanitizeAuditData(JSON.parse(JSON.stringify(options.newData))),
        oldData: options.oldData === undefined ? undefined : sanitizeAuditData(JSON.parse(JSON.stringify(options.oldData))),
        userId: options.tenant.userId,
      },
    });
    return result;
  });
}

export type ProductImageUploadInput = {
  assignToUnitId?: string;
  assignToUnitIds?: string[];
  main: Blob | File | Uint8Array;
  mainType?: string;
  thumb: Blob | File | Uint8Array;
  thumbType?: string;
};

async function loadScopedProduct(productId: string, tenant: TenantContext, client: any = db) {
  const scope = await resolveTenantScope(tenant, client);
  return client.product.findFirst({
    include: { units: { orderBy: { sortOrder: "asc" } } },
    where: { companyId: scope.companyId, id: productId, ...branchOwnedWhere(scope) },
  });
}

export async function uploadAndAttachProductImages(
  productId: string,
  input: ProductImageUploadInput,
  tenant: TenantContext,
  client: any = db,
) {
  const existing = await loadScopedProduct(productId, tenant, client);
  if (!existing) {
    throw new Error("Product was not found.");
  }

  const main = validateProductImageBytes(await readUploadBytes(input.main), {
    declaredMime: input.mainType ?? (input.main as File).type,
    filename: (input.main as File).name,
    kind: "main",
  });
  const thumb = validateProductImageBytes(await readUploadBytes(input.thumb), {
    declaredMime: input.thumbType ?? (input.thumb as File).type,
    filename: (input.thumb as File).name,
    kind: "thumb",
  });

  const existingUnitIds = new Set(existing.units.map((unit: { id: string }) => unit.id));
  const assignToUnitIds = [...new Set([
    ...(input.assignToUnitId ? [input.assignToUnitId] : []),
    ...(input.assignToUnitIds ?? []),
  ])].filter((unitId) => existingUnitIds.has(unitId));
  const previousPaths = collectImageStoragePaths({
    imageUrl: existing.imageUrl,
    units: existing.units.filter((unit: { id: string; imageUrl?: string | null }) => {
      if (assignToUnitIds.includes(unit.id)) return true;
      return Boolean(existing.imageUrl && unit.imageUrl === existing.imageUrl);
    }),
  });
  const previousProductPaths = collectImageStoragePaths({ imageUrl: existing.imageUrl });
  const paths = buildProductImagePaths({
    companyId: tenant.companyId,
    productId: existing.id,
  });

  persistableProductImageUrl(paths.mainPath, { companyId: tenant.companyId, productId: existing.id });

  const storage = getProductImageStorage();
  await storage.upload(paths.mainPath, {
    bytes: main.bytes,
    cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
    contentType: main.mime,
  });
  try {
    await storage.upload(paths.thumbPath, {
      bytes: thumb.bytes,
      cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      contentType: thumb.mime,
    });
  } catch (error) {
    await storage.remove([paths.mainPath]).catch(() => undefined);
    throw error;
  }

  let saved;
  try {
    saved = await writeProductImageChange({
      action: "update_image",
      client,
      newData: { imageUrl: paths.mainPath, productId: existing.id, thumbPath: paths.thumbPath, unitIds: assignToUnitIds },
      oldData: { imageUrl: existing.imageUrl, productId: existing.id },
      tenant,
      write: async (tx) => {
        const current = await loadScopedProduct(productId, tenant, tx);
        if (!current) {
          throw new Error("Product was not found.");
        }
        const previousProductPath = typeof current.imageUrl === "string" ? current.imageUrl : undefined;
        await tx.product.update({
          data: { imageUrl: paths.mainPath },
          where: { id: current.id },
        });
        if (assignToUnitIds.length > 0) {
          await tx.productUnit.updateMany({
            data: { imageUrl: paths.mainPath },
            where: { id: { in: assignToUnitIds }, productId: current.id },
          });
        }
        if (previousProductPath && previousProductPath !== paths.mainPath) {
          await tx.productUnit.updateMany({
            data: { imageUrl: paths.mainPath },
            where: { imageUrl: previousProductPath, productId: current.id },
          });
        }
        const updated = await tx.product.findFirstOrThrow({
          include: { brand: true, category: true, supplier: true, units: { orderBy: { sortOrder: "asc" } } },
          where: { id: current.id },
        });
        return mapPrismaProduct(updated);
      },
    });
  } catch (error) {
    await storage.remove([paths.mainPath, paths.thumbPath]).catch(() => undefined);
    throw error;
  }

  const remaining = new Set(collectImageStoragePaths(saved));
  const obsolete = [...previousPaths, ...previousProductPaths].filter((path) => !remaining.has(path));
  await removeProductImageObjects([...new Set(obsolete)]).catch(() => undefined);

  const [withDelivery] = await attachProductImageDelivery([saved]);
  return withDelivery;
}

export async function clearProductImages(productId: string, tenant: TenantContext, client: any = db) {
  const existing = await loadScopedProduct(productId, tenant, client);
  if (!existing) {
    throw new Error("Product was not found.");
  }
  const previousPaths = collectImageStoragePaths(existing);
  const saved = await writeProductImageChange({
    action: "clear_image",
    client,
    newData: { imageUrl: null, productId: existing.id },
    oldData: { imageUrl: existing.imageUrl, productId: existing.id },
    tenant,
    write: async (tx) => {
      await tx.product.update({ data: { imageUrl: null }, where: { id: existing.id } });
      await tx.productUnit.updateMany({ data: { imageUrl: null }, where: { productId: existing.id } });
      const updated = await tx.product.findFirstOrThrow({
        include: { brand: true, category: true, supplier: true, units: { orderBy: { sortOrder: "asc" } } },
        where: { id: existing.id },
      });
      return mapPrismaProduct(updated);
    },
  });
  await removeProductImageObjects(previousPaths).catch(() => undefined);
  const [withDelivery] = await attachProductImageDelivery([saved]);
  return withDelivery;
}

export async function cleanupHardDeletedProductImages(product: { imageUrl?: string | null; units?: Array<{ imageUrl?: string | null }> }) {
  await removeProductImageObjects(collectImageStoragePaths(product)).catch(() => undefined);
}

export function storedThumbPath(imageUrl?: string | null) {
  return isProductStoragePath(imageUrl) ? thumbPathFromMain(imageUrl) : undefined;
}
