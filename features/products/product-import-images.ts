import { detectImageMimeFromMagicBytes, MAX_SOURCE_IMAGE_BYTES } from "@/lib/storage/image-validate";

export const PRODUCT_IMPORT_IMAGE_PREVIEW_BUDGET = 1_000_000;

export type ProductImportEmbeddedImage = {
  dataUrl: string | null;
  mime: string | null;
  reason: "ambiguous" | "oversized" | "spanned" | "unassigned" | "unsupported" | null;
  rowNumber: number | null;
  status: "mapped" | "review";
};

export type EmbeddedImageAnchor = {
  bottomRow: number | null;
  bytes: Uint8Array;
  topRow: number | null;
};

export function classifyEmbeddedImages(images: EmbeddedImageAnchor[], dataRowNumbers: number[]): ProductImportEmbeddedImage[] {
  const dataRows = new Set(dataRowNumbers);
  const pending = new Map<number, EmbeddedImageAnchor[]>();
  const review: ProductImportEmbeddedImage[] = [];

  for (const image of images) {
    if (image.topRow === null || !Number.isInteger(image.topRow) || image.topRow < 0) {
      review.push(reviewed(null, "unassigned"));
      continue;
    }
    const rowNumber = image.topRow + 1;
    const spansRows = image.bottomRow !== null && image.bottomRow > image.topRow + 1;
    if (spansRows) {
      review.push(reviewed(dataRows.has(rowNumber) ? rowNumber : null, "spanned"));
      continue;
    }
    if (!dataRows.has(rowNumber)) {
      review.push(reviewed(null, "unassigned"));
      continue;
    }
    const group = pending.get(rowNumber) ?? [];
    group.push(image);
    pending.set(rowNumber, group);
  }

  const mapped: ProductImportEmbeddedImage[] = [];
  let previewBytes = 0;
  for (const [rowNumber, group] of pending) {
    if (group.length > 1) {
      review.push(...group.map(() => reviewed(rowNumber, "ambiguous")));
      continue;
    }
    const image = group[0]!;
    const mime = detectImageMimeFromMagicBytes(image.bytes);
    if (!mime || mime === "image/gif") {
      review.push(reviewed(rowNumber, "unsupported"));
      continue;
    }
    if (image.bytes.byteLength === 0 || image.bytes.byteLength > MAX_SOURCE_IMAGE_BYTES) {
      review.push(reviewed(rowNumber, "oversized"));
      continue;
    }
    const canPreview = previewBytes + image.bytes.byteLength <= PRODUCT_IMPORT_IMAGE_PREVIEW_BUDGET;
    if (!canPreview) {
      review.push(reviewed(rowNumber, "oversized"));
      continue;
    }
    previewBytes += image.bytes.byteLength;
    mapped.push({
      dataUrl: `data:${mime};base64,${Buffer.from(image.bytes).toString("base64")}`,
      mime,
      reason: null,
      rowNumber,
      status: "mapped",
    });
  }

  return [...mapped, ...review].sort((left, right) => (left.rowNumber ?? 9999) - (right.rowNumber ?? 9999));
}

function reviewed(rowNumber: number | null, reason: ProductImportEmbeddedImage["reason"]): ProductImportEmbeddedImage {
  return { dataUrl: null, mime: null, reason, rowNumber, status: "review" };
}
