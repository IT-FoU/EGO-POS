import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/storage/product-image-ref";
import { assertNoPublicSupabaseServiceRole, readSupabaseServiceRoleKey, readSupabaseUrl } from "@/lib/storage/supabase-admin";

export const PRODUCT_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24;
export const PRODUCT_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type ProductImageObject = {
  bytes: Uint8Array;
  cacheControl?: string;
  contentType: string;
};

export type ProductImageStorage = {
  createSignedUrls(paths: string[], expiresInSeconds?: number): Promise<Map<string, string>>;
  publicUrl?(path: string): string;
  remove(paths: string[]): Promise<void>;
  upload(path: string, object: ProductImageObject, options?: { upsert?: boolean }): Promise<void>;
};

class MemoryProductImageStorage implements ProductImageStorage {
  readonly objects = new Map<string, ProductImageObject>();

  async upload(path: string, object: ProductImageObject, options?: { upsert?: boolean }) {
    if (!options?.upsert && this.objects.has(path)) {
      throw new Error(`Image object already exists: ${path}`);
    }
    this.objects.set(path, {
      bytes: new Uint8Array(object.bytes),
      cacheControl: object.cacheControl,
      contentType: object.contentType,
    });
  }

  async remove(paths: string[]) {
    for (const path of paths) {
      this.objects.delete(path);
    }
  }

  async createSignedUrls(paths: string[]) {
    const urls = new Map<string, string>();
    for (const path of paths) {
      if (this.objects.has(path)) {
        urls.set(path, `https://product-images.local/${path}?sig=test`);
      }
    }
    return urls;
  }

  publicUrl(path: string) {
    return `https://product-images.local/${path}`;
  }
}

class SupabaseProductImageStorage implements ProductImageStorage {
  constructor(private readonly client: SupabaseClient) {}

  async upload(path: string, object: ProductImageObject, options?: { upsert?: boolean }) {
    const { error } = await this.client.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, object.bytes, {
      cacheControl: object.cacheControl ?? PRODUCT_IMAGE_CACHE_CONTROL,
      contentType: object.contentType,
      upsert: options?.upsert ?? false,
    });
    if (error) {
      throw new Error(error.message || "Failed to upload product image.");
    }
  }

  async remove(paths: string[]) {
    const unique = [...new Set(paths.filter(Boolean))];
    if (unique.length === 0) return;
    const { error } = await this.client.storage.from(PRODUCT_IMAGE_BUCKET).remove(unique);
    if (error) {
      throw new Error(error.message || "Failed to delete product image.");
    }
  }

  async createSignedUrls(paths: string[], expiresInSeconds = PRODUCT_IMAGE_SIGNED_URL_TTL_SECONDS) {
    const unique = [...new Set(paths.filter(Boolean))];
    const urls = new Map<string, string>();
    for (let index = 0; index < unique.length; index += 50) {
      const chunk = unique.slice(index, index + 50);
      const { data, error } = await this.client.storage.from(PRODUCT_IMAGE_BUCKET).createSignedUrls(chunk, expiresInSeconds);
      if (error) {
        throw new Error(error.message || "Failed to sign product image URLs.");
      }
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl && !entry.error) {
          urls.set(entry.path, entry.signedUrl);
        }
      }
    }
    return urls;
  }

  publicUrl(path: string) {
    return this.client.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  }
}

const globalForProductImageStorage = globalThis as unknown as {
  productImageStorage?: ProductImageStorage;
};

let storageOverride: ProductImageStorage | null = null;

export function createMemoryProductImageStorage() {
  return new MemoryProductImageStorage();
}

export function setProductImageStorageForTests(storage: ProductImageStorage | null) {
  storageOverride = storage;
}

export function isProductImageStorageConfigured() {
  return Boolean(readSupabaseUrl() && readSupabaseServiceRoleKey()) || Boolean(storageOverride);
}

function createSupabaseProductImageStorage(): ProductImageStorage {
  assertNoPublicSupabaseServiceRole();
  const url = readSupabaseUrl();
  const serviceRoleKey = readSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) {
    throw new Error("Product image storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return new SupabaseProductImageStorage(client);
}

export function getProductImageStorage(): ProductImageStorage {
  if (storageOverride) return storageOverride;
  if (process.env.NODE_ENV !== "production") {
    globalForProductImageStorage.productImageStorage ??= createSupabaseProductImageStorage();
    return globalForProductImageStorage.productImageStorage;
  }
  return createSupabaseProductImageStorage();
}

export async function signProductImagePaths(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return new Map<string, string>();
  if (storageOverride) {
    return storageOverride.createSignedUrls(unique);
  }
  if (!readSupabaseUrl() || !readSupabaseServiceRoleKey()) {
    return new Map<string, string>();
  }
  try {
    return await getProductImageStorage().createSignedUrls(unique);
  } catch {
    return new Map<string, string>();
  }
}

export async function removeProductImageObjects(paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return;
  await getProductImageStorage().remove(unique);
}
