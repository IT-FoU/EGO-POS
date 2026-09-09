import { isEmbeddedImagePayload, isProductStoragePath } from "@/lib/storage/product-image-ref";

export const OMITTED_EMBEDDED_IMAGE = "[omitted-embedded-image]";

const IMAGE_KEY_PATTERN = /image|logo|photo|thumbnail|avatar|picture/i;

function redactString(value: string) {
  if (isEmbeddedImagePayload(value)) {
    return OMITTED_EMBEDDED_IMAGE;
  }
  return value;
}

export function sanitizeAuditData(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeAuditData(entry));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === "string" && IMAGE_KEY_PATTERN.test(key) && isEmbeddedImagePayload(entry)) {
        output[key] = isProductStoragePath(entry) ? entry : OMITTED_EMBEDDED_IMAGE;
        continue;
      }
      output[key] = sanitizeAuditData(entry);
    }
    return output;
  }
  return value;
}

export function auditContainsEmbeddedImage(value: unknown): boolean {
  if (typeof value === "string") {
    return isEmbeddedImagePayload(value);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => auditContainsEmbeddedImage(entry));
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((entry) => auditContainsEmbeddedImage(entry));
  }
  return false;
}
