import { PRODUCT_IMAGE_BUCKET } from "@/lib/storage/product-image-ref";

const COMPANY_LOGO_PATH = /^companies\/([A-Za-z0-9_-]+)\/logo\/[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

export function companyLogoObjectPath(companyId: string, fileId: string, extension: "jpg" | "png" | "webp") {
  if (!/^[A-Za-z0-9_-]+$/.test(companyId) || !/^[A-Za-z0-9_-]+$/.test(fileId)) {
    throw new Error("Company logo path is invalid.");
  }
  return `companies/${companyId}/logo/${fileId}.${extension}`;
}

export function logoExtensionForMime(mime: "image/jpeg" | "image/png" | "image/webp"): "jpg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Rejects any path that is not this company's logo object. */
export function assertCompanyLogoPath(path: string, companyId: string) {
  const match = COMPANY_LOGO_PATH.exec(path);
  if (!match || match[1] !== companyId || path.includes("..")) {
    throw new Error("Company logo path is outside this company.");
  }
  return path;
}

export function isCompanyLogoObjectPath(path: string | null | undefined, companyId?: string) {
  if (!path) return false;
  const match = COMPANY_LOGO_PATH.exec(path);
  if (!match || path.includes("..")) return false;
  return companyId ? match[1] === companyId : true;
}

export function companyLogoBucket() {
  return PRODUCT_IMAGE_BUCKET;
}
