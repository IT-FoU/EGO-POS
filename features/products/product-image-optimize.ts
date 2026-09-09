"use client";

import {
  ALLOWED_PRODUCT_IMAGE_MIME_TYPES,
  computeTargetSize,
  MAX_SOURCE_IMAGE_BYTES,
  MAIN_IMAGE_MAX_EDGE,
  ProductImageValidationError,
  THUMB_IMAGE_MAX_EDGE,
  validateProductImageBytes,
} from "@/lib/storage/image-validate";

export async function optimizeProductImageFile(file: File) {
  if (!file || file.size === 0) {
    throw new ProductImageValidationError("Image upload is empty.");
  }
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new ProductImageValidationError("Image is too large. Maximum size is 5 MB.");
  }

  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const source = validateProductImageBytes(sourceBytes, {
    declaredMime: file.type,
    filename: file.name,
    kind: "source",
  });

  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    throw new ProductImageValidationError("Image optimization is not available in this browser.");
  }

  const bitmap = await createImageBitmap(new Blob([new Uint8Array(source.bytes)], { type: source.mime }));
  try {
    const main = await rasterizeImage(bitmap, MAIN_IMAGE_MAX_EDGE, 0.82, "main.webp");
    const thumb = await rasterizeImage(bitmap, THUMB_IMAGE_MAX_EDGE, 0.8, "thumb.webp");
    return { main, sourceMime: source.mime, thumb };
  } finally {
    bitmap.close();
  }
}

async function rasterizeImage(bitmap: ImageBitmap, maxEdge: number, quality: number, filename: string) {
  const size = computeTargetSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new ProductImageValidationError("Image optimization is not available in this browser.");
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob =
    (await canvasToBlob(canvas, "image/webp", quality)) ??
    (await canvasToBlob(canvas, "image/jpeg", quality));
  if (!blob) {
    throw new ProductImageValidationError("Could not optimize the selected image.");
  }
  const type = blob.type === "image/webp" || blob.type === "image/jpeg" ? blob.type : "image/jpeg";
  return new File([blob], filename.replace(/\.webp$/i, type === "image/jpeg" ? ".jpg" : ".webp"), { type });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

export function isAllowedProductImageFile(file: File) {
  const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
  return ALLOWED_PRODUCT_IMAGE_MIME_TYPES.includes(mime as (typeof ALLOWED_PRODUCT_IMAGE_MIME_TYPES)[number]);
}
