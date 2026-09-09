export const PRODUCT_IMAGE_BUCKET = "product-images";
export const PRODUCT_IMAGE_PATH_PREFIX = "products/";
export const MAIN_IMAGE_FILENAME = "main.webp";
export const THUMB_IMAGE_FILENAME = "thumb.webp";

const DATA_URI_PATTERN = /^data:/i;
const BLOB_URL_PATTERN = /^blob:/i;
const HTTP_URL_PATTERN = /^https?:\/\//i;
const BASE64_PREFIX_PATTERN = /^[A-Za-z0-9+/]{80,}={0,2}$/;

export type ProductImagePathScope = {
  companyId: string;
  productId: string;
  unitId?: string;
  version?: string;
};

export function isDataUri(value?: string | null) {
  return Boolean(value && DATA_URI_PATTERN.test(value));
}

export function isBlobUrl(value?: string | null) {
  return Boolean(value && BLOB_URL_PATTERN.test(value));
}

export function isHttpUrl(value?: string | null) {
  return Boolean(value && HTTP_URL_PATTERN.test(value));
}

export function isEmbeddedImagePayload(value?: string | null) {
  if (!value) return false;
  if (isDataUri(value) || isBlobUrl(value)) return true;
  if (value.startsWith("data:image")) return true;
  return value.length > 8_000 && BASE64_PREFIX_PATTERN.test(value.slice(0, 200).replace(/\s/g, ""));
}

export type ProductStoragePath = string & { readonly __productStoragePath: true };

export function isProductStoragePath(value?: string | null): value is ProductStoragePath {
  if (!value) return false;
  return value.startsWith(PRODUCT_IMAGE_PATH_PREFIX) && !isHttpUrl(value) && !isEmbeddedImagePayload(value);
}

export function isRenderableImageUrl(value?: string | null) {
  return Boolean(value && (isHttpUrl(value) || isDataUri(value) || isBlobUrl(value)));
}

export function thumbPathFromMain(mainPath?: string | null) {
  if (!mainPath || !isProductStoragePath(mainPath)) return undefined;
  if (mainPath.endsWith(`/${THUMB_IMAGE_FILENAME}`)) return mainPath;
  if (mainPath.endsWith(`/${MAIN_IMAGE_FILENAME}`)) {
    return `${mainPath.slice(0, -MAIN_IMAGE_FILENAME.length)}${THUMB_IMAGE_FILENAME}`;
  }
  return mainPath;
}

export function buildProductImagePaths(scope: ProductImagePathScope) {
  const version = scope.version ?? Date.now().toString(36);
  const unitSegment = scope.unitId ? `/units/${scope.unitId}` : "";
  const folder = `${PRODUCT_IMAGE_PATH_PREFIX}${scope.companyId}/${scope.productId}${unitSegment}/${version}`;
  return {
    folder,
    mainPath: `${folder}/${MAIN_IMAGE_FILENAME}`,
    thumbPath: `${folder}/${THUMB_IMAGE_FILENAME}`,
    version,
  };
}

export function assertProductImagePathScope(
  path: string,
  expected: { companyId: string; productId?: string; unitId?: string },
) {
  if (!isProductStoragePath(path)) {
    throw new Error("Product image path is invalid.");
  }
  const parts = path.split("/");
  // products / {companyId} / {productId} / ...
  const companyId = parts[1];
  const productId = parts[2];
  if (!companyId || companyId !== expected.companyId) {
    throw new Error("Product image path is not allowed for this company.");
  }
  if (expected.productId && productId !== expected.productId) {
    throw new Error("Product image path is not allowed for this product.");
  }
  if (expected.unitId) {
    const unitsIndex = parts.indexOf("units");
    if (unitsIndex < 0 || parts[unitsIndex + 1] !== expected.unitId) {
      throw new Error("Product image path is not allowed for this unit.");
    }
  }
  return path;
}

export function persistableProductImageUrl(
  value: unknown,
  expected: { companyId: string; productId: string },
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error("Product image reference is invalid.");
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isEmbeddedImagePayload(trimmed)) {
    throw new Error("Product images cannot be stored as embedded data. Upload the image file instead.");
  }
  if (isProductStoragePath(trimmed)) {
    return assertProductImagePathScope(trimmed, expected);
  }
  throw new Error("Product image reference is invalid.");
}

export function rejectEmbeddedProductImage(value: unknown, label = "Product image") {
  if (typeof value === "string" && isEmbeddedImagePayload(value)) {
    throw new Error(`${label} cannot be stored as embedded data. Upload the image file instead.`);
  }
}

export function collectImageStoragePaths(product: {
  imageUrl?: string | null;
  units?: Array<{ imageUrl?: string | null }>;
}) {
  const paths = new Set<string>();
  const add = (value?: string | null) => {
    if (isProductStoragePath(value)) {
      paths.add(value);
      const thumb = thumbPathFromMain(value);
      if (thumb) paths.add(thumb);
    }
  };
  add(product.imageUrl);
  for (const unit of product.units ?? []) {
    add(unit.imageUrl);
  }
  return [...paths];
}

export function compactProductImageKey(value?: string | null) {
  const key = String(value ?? "generic");
  if (!key || isEmbeddedImagePayload(key) || isProductStoragePath(key) || isHttpUrl(key) || key.length > 80) {
    return "generic";
  }
  return key;
}

export function preferredProductThumbUrl(product: {
  imageThumbUrl?: string;
  imageDisplayUrl?: string;
  imageUrl?: string;
  units?: Array<{ imageThumbUrl?: string; imageDisplayUrl?: string; imageUrl?: string; isDefaultSaleUnit?: boolean; isBaseUnit?: boolean }>;
}) {
  if (isRenderableImageUrl(product.imageThumbUrl) && !isEmbeddedImagePayload(product.imageThumbUrl)) {
    return product.imageThumbUrl;
  }
  const defaultUnit = product.units?.find((unit) => unit.isDefaultSaleUnit) ?? product.units?.find((unit) => unit.isBaseUnit);
  if (isRenderableImageUrl(defaultUnit?.imageThumbUrl) && !isEmbeddedImagePayload(defaultUnit?.imageThumbUrl)) {
    return defaultUnit?.imageThumbUrl;
  }
  if (isRenderableImageUrl(product.imageDisplayUrl) && !isEmbeddedImagePayload(product.imageDisplayUrl)) {
    return product.imageDisplayUrl;
  }
  if (isRenderableImageUrl(product.imageUrl)) {
    return product.imageUrl;
  }
  return undefined;
}

export function preferredProductDisplayUrl(product: {
  imageDisplayUrl?: string;
  imageUrl?: string;
  imageThumbUrl?: string;
}) {
  if (isRenderableImageUrl(product.imageDisplayUrl)) return product.imageDisplayUrl;
  if (isRenderableImageUrl(product.imageUrl)) return product.imageUrl;
  if (isRenderableImageUrl(product.imageThumbUrl)) return product.imageThumbUrl;
  return undefined;
}

export function productHasImageRef(product: {
  imageUrl?: string;
  imageDisplayUrl?: string;
  imageThumbUrl?: string;
  units?: Array<{ imageUrl?: string; imageDisplayUrl?: string; imageThumbUrl?: string }>;
}) {
  if (product.imageThumbUrl || product.imageDisplayUrl || isProductStoragePath(product.imageUrl) || isRenderableImageUrl(product.imageUrl)) {
    return true;
  }
  return (product.units ?? []).some((unit) => unit.imageThumbUrl || unit.imageDisplayUrl || isProductStoragePath(unit.imageUrl) || isRenderableImageUrl(unit.imageUrl));
}
