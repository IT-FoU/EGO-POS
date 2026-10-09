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
  bytes?: Uint8Array;
  mediaName?: string;
  topRow: number | null;
  uncompressedSize?: number;
};

export type AssignedEmbeddedImage = {
  reason: ProductImportEmbeddedImage["reason"];
  rowNumber: number | null;
  source?: Uint8Array;
  status: "mapped" | "review";
};

export function assignEmbeddedImages(images: EmbeddedImageAnchor[], dataRowNumbers: number[]): AssignedEmbeddedImage[] {
  const dataRows = new Set(dataRowNumbers);
  const pending = new Map<number, EmbeddedImageAnchor[]>();
  const review: AssignedEmbeddedImage[] = [];
  for (const image of images) {
    if (image.topRow === null || !Number.isInteger(image.topRow) || image.topRow < 0) {
      review.push(assigned(null, "unassigned"));
      continue;
    }
    const start = image.topRow + 1;
    const end = image.bottomRow === null ? start : image.bottomRow;
    const covered = [...dataRows].filter((row) => row >= start && row <= end).sort((left, right) => left - right);
    if (covered.length === 0) {
      review.push(assigned(null, "unassigned"));
      continue;
    }
    if (covered.length > 1) {
      for (const row of covered) review.push(assigned(row, "spanned"));
      continue;
    }
    const group = pending.get(covered[0] ?? 0) ?? [];
    group.push(image);
    pending.set(covered[0] ?? 0, group);
  }
  const mapped: AssignedEmbeddedImage[] = [];
  for (const [rowNumber, group] of pending) {
    if (group.length > 1) {
      review.push(...group.map(() => assigned(rowNumber, "ambiguous")));
      continue;
    }
    const image = group[0];
    if (image?.bytes && image.bytes.byteLength === 0) {
      review.push(assigned(rowNumber, "oversized"));
      continue;
    }
    mapped.push({ reason: null, rowNumber, source: image?.bytes, status: "mapped" });
  }
  return [...mapped, ...review].sort((left, right) => (left.rowNumber ?? 9999) - (right.rowNumber ?? 9999));
}

export function singleMappedImageRow(image: EmbeddedImageAnchor, dataRowNumbers: number[]) {
  const assignedImage = assignEmbeddedImages([image], dataRowNumbers)[0];
  return assignedImage?.status === "mapped" ? assignedImage.rowNumber : null;
}

export function classifyEmbeddedImages(images: EmbeddedImageAnchor[], dataRowNumbers: number[]): ProductImportEmbeddedImage[] {
  const review: ProductImportEmbeddedImage[] = [];
  const mapped: ProductImportEmbeddedImage[] = [];
  let previewBytes = 0;
  for (const image of assignEmbeddedImages(images, dataRowNumbers)) {
    if (image.status !== "mapped" || !image.source?.byteLength) {
      review.push(reviewed(image.rowNumber, image.reason ?? "unsupported"));
      continue;
    }
    const mime = detectImageMimeFromMagicBytes(image.source);
    if (!mime || mime === "image/gif") {
      review.push(reviewed(image.rowNumber, "unsupported"));
      continue;
    }
    if (image.source.byteLength > MAX_SOURCE_IMAGE_BYTES || previewBytes + image.source.byteLength > PRODUCT_IMPORT_IMAGE_PREVIEW_BUDGET) {
      review.push(reviewed(image.rowNumber, "oversized"));
      continue;
    }
    previewBytes += image.source.byteLength;
    mapped.push({
      dataUrl: `data:${mime};base64,${Buffer.from(image.source).toString("base64")}`,
      mime,
      reason: null,
      rowNumber: image.rowNumber,
      status: "mapped",
    });
  }
  return [...mapped, ...review].sort((left, right) => (left.rowNumber ?? 9999) - (right.rowNumber ?? 9999));
}

function assigned(rowNumber: number | null, reason: AssignedEmbeddedImage["reason"]): AssignedEmbeddedImage {
  return { reason, rowNumber, status: "review" };
}

function reviewed(rowNumber: number | null, reason: ProductImportEmbeddedImage["reason"]): ProductImportEmbeddedImage {
  return { dataUrl: null, mime: null, reason, rowNumber, status: "review" };
}
