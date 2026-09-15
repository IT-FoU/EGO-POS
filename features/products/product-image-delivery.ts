import type { PosProduct } from "@/features/pos/types";
import {
  compactProductImageKey,
  displayableProductImageRef,
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

function resolveDisplayImage(raw: string | undefined, signed: Map<string, string>) {
  return deliveryFor(raw, signed) ?? displayableProductImageRef(raw);
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
    // Combined + Separate both need product main image signed — not only unitImageUrl.
    paths.push(...collectDeliveryPaths(product.productImageUrl));
    paths.push(...collectDeliveryPaths(product.unitImageUrl));
    paths.push(...collectDeliveryPaths(typeof product.imageKey === "string" && isProductStoragePath(product.imageKey) ? product.imageKey : undefined));
    for (const unit of product.units ?? []) {
      paths.push(...collectDeliveryPaths(unit.imageUrl));
    }
  }
  const signed = await signProductImagePaths(paths);

  return products.map((product) => {
    const units = (product.units ?? []).map((unit) => ({
      ...unit,
      imageUrl: resolveDisplayImage(unit.imageUrl, signed),
    }));
    const defaultUnit = units.find((unit) => unit.isDefaultSaleUnit) ?? units.find((unit) => unit.isBaseUnit) ?? units[0];
    const productMain = resolveDisplayImage(product.productImageUrl, signed);
    const unitFallback = resolveDisplayImage(product.unitImageUrl, signed);
    // Combined cards read unitImageUrl; prefer main product image, then unit/default, then legacy display refs.
    const combinedImage = productMain ?? unitFallback ?? defaultUnit?.imageUrl;

    return {
      ...product,
      imageKey: compactProductImageKey(product.imageKey),
      productImageUrl: productMain ?? displayableProductImageRef(product.productImageUrl),
      unitImageUrl: combinedImage,
      units,
    };
  });
}
