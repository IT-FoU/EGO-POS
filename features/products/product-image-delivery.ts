import type { PosProduct } from "@/features/pos/types";
import {
  compactProductImageKey,
  isEmbeddedImagePayload,
  isProductStoragePath,
  isRenderableImageUrl,
  thumbPathFromMain,
} from "@/lib/storage/product-image-ref";
import { signProductImagePaths } from "@/lib/storage/product-image-storage";

function deliveryFor(path: string | undefined, signed: Map<string, string>) {
  if (!path) return undefined;
  if (isRenderableImageUrl(path) && !isEmbeddedImagePayload(path)) return path;
  if (isProductStoragePath(path)) {
    const thumb = thumbPathFromMain(path);
    return signed.get(path) ?? (thumb ? signed.get(thumb) : undefined);
  }
  return undefined;
}

function collectDeliveryPaths(imageUrl?: string | null) {
  const paths: string[] = [];
  if (isProductStoragePath(imageUrl)) {
    paths.push(imageUrl);
    const thumb = thumbPathFromMain(imageUrl);
    if (thumb) paths.push(thumb);
  }
  return paths;
}

export async function attachProductImageDelivery<T extends { imageUrl?: string; units?: Array<{ imageUrl?: string }> }>(
  products: T[],
): Promise<T[]> {
  const paths = products.flatMap((product) => [
    ...collectDeliveryPaths(product.imageUrl),
    ...(product.units ?? []).flatMap((unit) => collectDeliveryPaths(unit.imageUrl)),
  ]);
  const signed = await signProductImagePaths(paths);

  return products.map((product) => {
    const mainPath = isProductStoragePath(product.imageUrl) ? product.imageUrl : undefined;
    const thumbPath = thumbPathFromMain(mainPath);
    const imageDisplayUrl = isEmbeddedImagePayload(product.imageUrl)
      ? product.imageUrl
      : deliveryFor(mainPath, signed);
    const imageThumbUrl = deliveryFor(thumbPath ?? mainPath, signed) ?? (isEmbeddedImagePayload(product.imageUrl) ? undefined : imageDisplayUrl);
    const units = (product.units ?? []).map((unit) => {
      const unitMain = isProductStoragePath(unit.imageUrl) ? unit.imageUrl : undefined;
      const unitThumb = thumbPathFromMain(unitMain);
      const unitDisplayUrl = isEmbeddedImagePayload(unit.imageUrl)
        ? unit.imageUrl
        : deliveryFor(unitMain, signed);
      const unitThumbUrl =
        deliveryFor(unitThumb ?? unitMain, signed) ??
        (isEmbeddedImagePayload(unit.imageUrl) ? undefined : unitDisplayUrl);
      return {
        ...unit,
        imageDisplayUrl: unitDisplayUrl,
        imageThumbUrl: unitThumbUrl,
      };
    });
    return {
      ...product,
      imageDisplayUrl,
      imageThumbUrl,
      units,
    };
  });
}

export async function attachPosProductImageDelivery(products: PosProduct[]): Promise<PosProduct[]> {
  const paths: string[] = [];
  for (const product of products) {
    paths.push(...collectDeliveryPaths(product.unitImageUrl));
    paths.push(...collectDeliveryPaths(typeof product.imageKey === "string" && isProductStoragePath(product.imageKey) ? product.imageKey : undefined));
    for (const unit of product.units ?? []) {
      paths.push(...collectDeliveryPaths(unit.imageUrl));
    }
  }
  const signed = await signProductImagePaths(paths);

  return products.map((product) => {
    const units = (product.units ?? []).map((unit) => {
      const unitThumb = thumbPathFromMain(unit.imageUrl) ?? (isProductStoragePath(unit.imageUrl) ? unit.imageUrl : undefined);
      const delivery = deliveryFor(unitThumb, signed);
      return {
        ...unit,
        imageUrl: isEmbeddedImagePayload(unit.imageUrl) ? undefined : delivery ?? (isRenderableImageUrl(unit.imageUrl) ? unit.imageUrl : undefined),
      };
    });
    const defaultUnit = units.find((unit) => unit.isDefaultSaleUnit) ?? units.find((unit) => unit.isBaseUnit) ?? units[0];
    const productThumb = thumbPathFromMain(product.unitImageUrl) ?? (isProductStoragePath(product.unitImageUrl) ? product.unitImageUrl : undefined);
    const fallbackThumb = defaultUnit?.imageUrl ?? deliveryFor(productThumb, signed);
    return {
      ...product,
      imageKey: compactProductImageKey(product.imageKey),
      unitImageUrl: isEmbeddedImagePayload(product.unitImageUrl)
        ? fallbackThumb
        : fallbackThumb ?? (isRenderableImageUrl(product.unitImageUrl) ? product.unitImageUrl : undefined),
      units,
    };
  });
}
