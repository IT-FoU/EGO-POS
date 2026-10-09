import { rmSync } from "node:fs";
import type { EmbeddedImageAnchor } from "@/features/products/product-import-images";
import { IMPORT_PROCESS_MEMORY_STOP_BYTES } from "@/features/products/product-import-process";

export type CachedWorkbook = {
  directory?: string;
  filePath?: string;
  images: EmbeddedImageAnchor[];
  rows: string[][];
};

let downloads = 0;

export function previewCacheDownloads() {
  return downloads;
}

const sheets = new Map<string, CachedWorkbook>();
const loading = new Map<string, Promise<CachedWorkbook>>();

export function resetPreviewCacheForTests() {
  for (const workbook of sheets.values()) removeDirectory(workbook.directory);
  sheets.clear();
  loading.clear();
  downloads = 0;
}

export async function loadCachedWorkbook(
  key: string,
  load: () => Promise<CachedWorkbook>,
) {
  if (!key) return { ...(await load()), cacheHit: false };
  const cached = sheets.get(key);
  if (cached) return { ...cached, cacheHit: true };
  const current = loading.get(key);
  if (current) return { ...(await current), cacheHit: true };
  const promise = load().then((workbook) => {
    if (process.memoryUsage().heapUsed > IMPORT_PROCESS_MEMORY_STOP_BYTES) {
      removeDirectory(workbook.directory);
      sheets.clear();
      throw new Error("memory_limit");
    }
    for (const previous of sheets.values()) {
      if (previous.directory && previous.directory !== workbook.directory) removeDirectory(previous.directory);
    }
    sheets.clear();
    downloads += 1;
    if (key) sheets.set(key, workbook);
    return workbook;
  }).finally(() => loading.delete(key));
  loading.set(key, promise);
  return { ...(await promise), cacheHit: false };
}

function removeDirectory(directory: string | undefined) {
  if (!directory) return;
  try {
    rmSync(directory, { force: true, recursive: true });
  } catch {
    // The next request recreates its own temporary workbook.
  }
}
