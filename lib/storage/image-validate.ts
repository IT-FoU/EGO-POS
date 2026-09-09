export const MAX_SOURCE_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MAIN_IMAGE_BYTES = 1_500_000;
export const MAX_THUMB_IMAGE_BYTES = 250_000;
export const MAIN_IMAGE_MAX_EDGE = 1600;
export const THUMB_IMAGE_MAX_EDGE = 400;

export const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedProductImageMime = (typeof ALLOWED_PRODUCT_IMAGE_MIME_TYPES)[number];

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const GIF_MAGIC = [0x47, 0x49, 0x46, 0x38];

export class ProductImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageValidationError";
  }
}

export function computeTargetSize(width: number, height: number, maxEdge: number) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const edge = Math.max(safeWidth, safeHeight);
  if (edge <= maxEdge) {
    return { height: safeHeight, width: safeWidth };
  }
  const scale = maxEdge / edge;
  return {
    height: Math.max(1, Math.round(safeHeight * scale)),
    width: Math.max(1, Math.round(safeWidth * scale)),
  };
}

function bytesOf(input: Uint8Array | ArrayBuffer | Buffer) {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

export function detectImageMimeFromMagicBytes(input: Uint8Array | ArrayBuffer | Buffer): AllowedProductImageMime | "image/gif" | undefined {
  const bytes = bytesOf(input);
  if (bytes.length < 12) return undefined;
  if (JPEG_MAGIC.every((value, index) => bytes[index] === value)) return "image/jpeg";
  if (PNG_MAGIC.every((value, index) => bytes[index] === value)) return "image/png";
  if (GIF_MAGIC.every((value, index) => bytes[index] === value)) return "image/gif";
  const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  return undefined;
}

function normalizeDeclaredMime(value?: string | null) {
  const mime = String(value ?? "").trim().toLowerCase();
  if (mime === "image/jpg") return "image/jpeg";
  return mime;
}

export function validateProductImageBytes(
  input: Uint8Array | ArrayBuffer | Buffer,
  options: {
    declaredMime?: string | null;
    kind: "source" | "main" | "thumb";
    filename?: string;
  },
) {
  const bytes = bytesOf(input);
  if (bytes.byteLength === 0) {
    throw new ProductImageValidationError("Image upload is empty.");
  }

  const maxBytes =
    options.kind === "thumb" ? MAX_THUMB_IMAGE_BYTES : options.kind === "main" ? MAX_MAIN_IMAGE_BYTES : MAX_SOURCE_IMAGE_BYTES;
  if (bytes.byteLength > maxBytes) {
    throw new ProductImageValidationError(
      options.kind === "source"
        ? "Image is too large. Maximum size is 5 MB."
        : options.kind === "thumb"
          ? "Thumbnail is too large."
          : "Optimized product image is too large.",
    );
  }

  const detected = detectImageMimeFromMagicBytes(bytes);
  if (detected === "image/gif") {
    throw new ProductImageValidationError("GIF images are not supported. Use JPEG, PNG, or WEBP.");
  }
  if (!detected || !ALLOWED_PRODUCT_IMAGE_MIME_TYPES.includes(detected)) {
    throw new ProductImageValidationError("Unsupported image type. Use JPEG, PNG, or WEBP.");
  }

  const declared = normalizeDeclaredMime(options.declaredMime);
  if (declared && declared !== detected && !ALLOWED_PRODUCT_IMAGE_MIME_TYPES.includes(declared as AllowedProductImageMime)) {
    throw new ProductImageValidationError("Unsupported image type. Use JPEG, PNG, or WEBP.");
  }
  if (declared && ALLOWED_PRODUCT_IMAGE_MIME_TYPES.includes(declared as AllowedProductImageMime) && declared !== detected) {
    throw new ProductImageValidationError("Image file type does not match the file contents.");
  }

  const filename = String(options.filename ?? "").toLowerCase();
  if (filename.endsWith(".gif")) {
    throw new ProductImageValidationError("GIF images are not supported. Use JPEG, PNG, or WEBP.");
  }

  return { bytes, mime: detected, size: bytes.byteLength };
}

export async function readUploadBytes(file: Blob | File | Uint8Array | ArrayBuffer) {
  if (file instanceof Uint8Array) return file;
  if (file instanceof ArrayBuffer) return new Uint8Array(file);
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}
