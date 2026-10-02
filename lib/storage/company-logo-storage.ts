import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { companyLogoBucket, isCompanyLogoObjectPath } from "@/lib/storage/company-logo-ref";
import { PRODUCT_IMAGE_CACHE_CONTROL, PRODUCT_IMAGE_SIGNED_URL_TTL_SECONDS } from "@/lib/storage/product-image-storage";
import { assertNoPublicSupabaseServiceRole, readSupabaseServiceRoleKey, readSupabaseUrl } from "@/lib/storage/supabase-admin";

export type CompanyLogoStorage = {
  remove(paths: string[]): Promise<void>;
  signedUrl(path: string): Promise<string | null>;
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
};

export class MemoryCompanyLogoStorage implements CompanyLogoStorage {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async upload(path: string, bytes: Uint8Array, contentType: string) {
    if (this.objects.has(path)) {
      throw new Error(`Logo object already exists: ${path}`);
    }
    this.objects.set(path, { bytes: new Uint8Array(bytes), contentType });
  }

  async remove(paths: string[]) {
    for (const path of paths) this.objects.delete(path);
  }

  async signedUrl(path: string) {
    return this.objects.has(path) ? `https://company-logos.local/${path}?sig=test` : null;
  }
}

class SupabaseCompanyLogoStorage implements CompanyLogoStorage {
  constructor(private readonly client: SupabaseClient) {}

  async upload(path: string, bytes: Uint8Array, contentType: string) {
    const { error } = await this.client.storage.from(companyLogoBucket()).upload(path, bytes, {
      cacheControl: PRODUCT_IMAGE_CACHE_CONTROL,
      contentType,
      upsert: false,
    });
    if (error) throw new Error(error.message || "Failed to upload company logo.");
  }

  async remove(paths: string[]) {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;
    const { error } = await this.client.storage.from(companyLogoBucket()).remove(unique);
    if (error) throw new Error(error.message || "Failed to delete company logo.");
  }

  async signedUrl(path: string) {
    const { data, error } = await this.client.storage
      .from(companyLogoBucket())
      .createSignedUrl(path, PRODUCT_IMAGE_SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  }
}

let storageOverride: CompanyLogoStorage | null = null;

export function setCompanyLogoStorageForTests(storage: CompanyLogoStorage | null) {
  storageOverride = storage;
}

export function getCompanyLogoStorage(): CompanyLogoStorage {
  if (storageOverride) return storageOverride;
  assertNoPublicSupabaseServiceRole();
  const url = readSupabaseUrl();
  const serviceRoleKey = readSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) {
    throw new Error("Company logo storage is not configured.");
  }
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return new SupabaseCompanyLogoStorage(client);
}

export async function signCompanyLogoUrl(path: string | null | undefined, companyId: string) {
  if (!path) return null;
  if (!isCompanyLogoObjectPath(path, companyId)) return null;
  try {
    if (!storageOverride && (!readSupabaseUrl() || !readSupabaseServiceRoleKey())) return null;
    return await getCompanyLogoStorage().signedUrl(path);
  } catch {
    return null;
  }
}
