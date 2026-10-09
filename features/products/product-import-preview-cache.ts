import type { EmbeddedImageAnchor } from "@/features/products/product-import-images";

export type CachedWorkbook = {
  images: EmbeddedImageAnchor[];
  rows: string[][];
};

const sheets = new Map<string, CachedWorkbook>();
const inflight = new Map<string, Promise<CachedWorkbook>>();
let downloads = 0;

export function resetPreviewCacheForTests() {
  sheets.clear();
  inflight.clear();
  downloads = 0;
}

export function previewCacheDownloads() {
  return downloads;
}

export async function loadCachedWorkbook(key: string, load: () => Promise<CachedWorkbook>) {
  if (!key) {
    downloads += 1;
    const loaded = await load();
    return { images: loaded.images, rows: loaded.rows, cacheHit: false };
  }
  const existing = sheets.get(key);
  if (existing) return { images: existing.images, rows: existing.rows, cacheHit: true };
  const current = inflight.get(key);
  if (current) {
    const shared = await current;
    return { images: shared.images, rows: shared.rows, cacheHit: true };
  }
  const promise = load().then((loaded) => {
    downloads += 1;
    sheets.clear();
    sheets.set(key, { images: loaded.images, rows: loaded.rows });
    return loaded;
  }).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  const loaded = await promise;
  return { images: loaded.images, rows: loaded.rows, cacheHit: false };
}
