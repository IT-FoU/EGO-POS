import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  isTempImportObjectPath,
  largeImportTusEndpoint,
  PRODUCT_IMPORT_TEMP_BUCKET,
  PRODUCT_IMPORT_XLSX_MIME,
} from "@/features/products/product-import-large";
import { assertNoPublicSupabaseServiceRole, readSupabaseServiceRoleKey, readSupabaseUrl } from "@/lib/storage/supabase-admin";

export type LargeImportStorage = {
  authorizeUpload(path: string): Promise<{ token: string; tusEndpoint: string }>;
  readPrefix(path: string, bytes: number): Promise<Uint8Array | null>;
  readSize(path: string): Promise<number | null>;
  remove(paths: string[]): Promise<void>;
};

let storageOverride: LargeImportStorage | null = null;

export function setLargeImportStorageForTests(storage: LargeImportStorage | null) {
  storageOverride = storage;
}

export function getLargeImportStorage() {
  if (storageOverride) return storageOverride;
  return createSupabaseLargeImportStorage();
}

function createSupabaseLargeImportStorage(): LargeImportStorage {
  assertNoPublicSupabaseServiceRole();
  const url = readSupabaseUrl();
  const serviceRoleKey = readSupabaseServiceRoleKey();
  if (!url || !serviceRoleKey) throw new Error("Temporary import storage is not configured.");
  const client = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return new SupabaseLargeImportStorage(client, url, serviceRoleKey);
}

class SupabaseLargeImportStorage implements LargeImportStorage {
  constructor(
    private readonly client: SupabaseClient,
    private readonly projectUrl: string,
    private readonly serviceRoleKey: string,
  ) {}

  async authorizeUpload(path: string) {
    assertTempPath(path);
    const signed = await this.client.storage.from(PRODUCT_IMPORT_TEMP_BUCKET).createSignedUploadUrl(path);
    if (signed.error || !signed.data?.token) throw new Error(signed.error?.message || "Upload authorization failed.");
    return { token: signed.data.token, tusEndpoint: largeImportTusEndpoint(this.projectUrl) };
  }

  async readSize(path: string) {
    assertTempPath(path);
    const response = await this.request("HEAD", path);
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error("Temporary file could not be checked.");
    const length = Number(response.headers.get("content-length"));
    return Number.isFinite(length) ? length : null;
  }

  async readPrefix(path: string, bytes: number) {
    assertTempPath(path);
    const response = await this.request("GET", path, { Range: `bytes=0-${Math.max(0, bytes - 1)}` });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok && response.status !== 206) throw new Error("Temporary file could not be checked.");
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > bytes) throw new Error("Temporary file check was not bounded.");
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > bytes) throw new Error("Temporary file check was not bounded.");
    return buffer;
  }

  async remove(paths: string[]) {
    const unique = [...new Set(paths.filter(isTempImportObjectPath))];
    if (unique.length === 0) return;
    const { error } = await this.client.storage.from(PRODUCT_IMPORT_TEMP_BUCKET).remove(unique);
    if (error) throw new Error(error.message);
  }

  private request(method: "GET" | "HEAD", path: string, extraHeaders?: HeadersInit) {
    const url = `${this.projectUrl.replace(/\/+$/, "")}/storage/v1/object/${PRODUCT_IMPORT_TEMP_BUCKET}/${path}`;
    return fetch(url, {
      method,
      headers: {
        apikey: this.serviceRoleKey,
        authorization: `Bearer ${this.serviceRoleKey}`,
        ...(extraHeaders ?? {}),
      },
    });
  }
}

function assertTempPath(path: string) {
  if (!isTempImportObjectPath(path)) throw new Error("Temporary import path is invalid.");
}
