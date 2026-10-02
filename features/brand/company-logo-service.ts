import { randomUUID } from "node:crypto";
import { validateProductImageBytes, type AllowedProductImageMime } from "@/lib/storage/image-validate";
import {
  assertCompanyLogoPath,
  companyLogoObjectPath,
  isCompanyLogoObjectPath,
  logoExtensionForMime,
} from "@/lib/storage/company-logo-ref";
import { getCompanyLogoStorage, type CompanyLogoStorage } from "@/lib/storage/company-logo-storage";

export async function storeReplacementLogo(input: {
  bytes: Uint8Array;
  companyId: string;
  declaredMime?: string | null;
  persistPath: (path: string) => Promise<void>;
  previousPath?: string | null;
  storage?: CompanyLogoStorage;
}) {
  const storage = input.storage ?? getCompanyLogoStorage();
  const validated = validateProductImageBytes(input.bytes, {
    declaredMime: input.declaredMime,
    kind: "source",
  });
  const mime = validated.mime as AllowedProductImageMime;
  const nextPath = assertCompanyLogoPath(
    companyLogoObjectPath(input.companyId, randomUUID(), logoExtensionForMime(mime)),
    input.companyId,
  );
  await storage.upload(nextPath, validated.bytes, mime);
  try {
    await input.persistPath(nextPath);
  } catch (error) {
    await storage.remove([nextPath]).catch(() => undefined);
    throw error;
  }
  const previous = input.previousPath?.trim();
  if (previous && previous !== nextPath && isCompanyLogoObjectPath(previous, input.companyId)) {
    await storage.remove([previous]).catch(() => undefined);
  }
  return nextPath;
}

export async function clearStoredLogo(input: {
  clearPath: () => Promise<string | null>;
  companyId: string;
  storage?: CompanyLogoStorage;
}) {
  const storage = input.storage ?? getCompanyLogoStorage();
  const previous = await input.clearPath();
  if (previous && isCompanyLogoObjectPath(previous, input.companyId)) {
    await storage.remove([previous]).catch(() => undefined);
  }
}
