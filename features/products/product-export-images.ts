import { thumbPathFromMain } from "@/lib/storage/product-image-ref";
import { downloadProductImageObject } from "@/lib/storage/product-image-storage";
import { PRODUCT_EXPORT_EMBED_LIMIT, safeImagePath, type ProductExportField, type ProductExportSource } from "@/features/products/product-export";

export type PreparedExportImage = {
  buffer: Uint8Array;
  extension: "gif" | "jpeg" | "png";
  height: number;
  width: number;
};

const DISPLAY_EDGE = 64;
const DOWNLOAD_CONCURRENCY = 4;

export async function loadExportThumbnails(products: ProductExportSource[], fields: readonly ProductExportField[]) {
  const images = new Map<string, PreparedExportImage>();
  if (!fields.includes("productImage") && !fields.includes("unitImage")) return images;
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const product of products) {
    if (fields.includes("productImage")) pushPath(paths, seen, product.imageUrl);
    if (fields.includes("unitImage")) {
      for (const unit of product.units ?? []) pushPath(paths, seen, unit.imageUrl);
    }
  }
  await mapPool(paths.slice(0, PRODUCT_EXPORT_EMBED_LIMIT), DOWNLOAD_CONCURRENCY, async (path) => {
    const bytes = await downloadThumbnail(path);
    if (!bytes) return;
    const prepared = await prepareExportThumbnail(bytes);
    if (prepared) images.set(path, prepared);
  });
  return images;
}

export async function prepareExportThumbnail(bytes: Uint8Array): Promise<PreparedExportImage | null> {
  const kind = imageKind(bytes);
  if (kind === "jpeg" || kind === "png" || kind === "gif") {
    const size = kind === "png" ? pngSize(bytes) : kind === "gif" ? gifSize(bytes) : jpegSize(bytes);
    const fitted = fit(size?.width ?? DISPLAY_EDGE, size?.height ?? DISPLAY_EDGE);
    return { buffer: bytes, extension: kind, height: fitted.height, width: fitted.width };
  }
  if (kind !== "webp") return null;
  try {
    const decoded = await decodeWebp(bytes);
    if (!decoded) return null;
    const fitted = fit(decoded.width, decoded.height);
    const scaled = downsample(decoded.data, decoded.width, decoded.height, DISPLAY_EDGE);
    const jpeg = await encodeJpeg(scaled.data, scaled.width, scaled.height);
    return { buffer: jpeg, extension: "jpeg", height: fitted.height, width: fitted.width };
  } catch {
    return null;
  }
}

async function downloadThumbnail(path: string) {
  const thumb = thumbPathFromMain(path) || path;
  const first = await downloadProductImageObject(thumb);
  if (first) return first;
  if (thumb !== path) return downloadProductImageObject(path);
  return null;
}

function pushPath(paths: string[], seen: Set<string>, value?: string) {
  const path = safeImagePath(value);
  if (!path || seen.has(path)) return;
  seen.add(path);
  paths.push(path);
}

async function mapPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      await worker(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
}

function imageKind(bytes: Uint8Array): "gif" | "jpeg" | "png" | "webp" | "unknown" {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "gif";
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  return "unknown";
}

function pngSize(bytes: Uint8Array) {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint32(20), width: view.getUint32(16) };
}

function gifSize(bytes: Uint8Array) {
  if (bytes.length < 10) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { height: view.getUint16(8, true), width: view.getUint16(6, true) };
}

function jpegSize(bytes: Uint8Array) {
  let offset = 2;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1] ?? 0;
    const length = view.getUint16(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function fit(width: number, height: number) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const scale = Math.min(DISPLAY_EDGE / safeWidth, DISPLAY_EDGE / safeHeight, 1);
  return { height: Math.max(1, Math.round(safeHeight * scale)), width: Math.max(1, Math.round(safeWidth * scale)) };
}

function downsample(rgba: Uint8Array, width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  if (scale === 1) return { data: rgba, height, width };
  const nextWidth = Math.max(1, Math.round(width * scale));
  const nextHeight = Math.max(1, Math.round(height * scale));
  const data = new Uint8Array(nextWidth * nextHeight * 4);
  for (let y = 0; y < nextHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(x / scale));
      const source = (sourceY * width + sourceX) * 4;
      const target = (y * nextWidth + x) * 4;
      data[target] = rgba[source] ?? 255;
      data[target + 1] = rgba[source + 1] ?? 255;
      data[target + 2] = rgba[source + 2] ?? 255;
      data[target + 3] = 255;
    }
  }
  return { data, height: nextHeight, width: nextWidth };
}

async function decodeWebp(bytes: Uint8Array): Promise<{ data: Uint8Array; height: number; width: number } | null> {
  const webp = await import("@jsquash/webp");
  const image = await webp.decode(new Uint8Array(bytes).buffer);
  if (!image?.data || !image.width || !image.height) return null;
  return { data: new Uint8Array(image.data), height: image.height, width: image.width };
}

async function encodeJpeg(rgba: Uint8Array, width: number, height: number) {
  const flattened = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const alpha = rgba[index * 4 + 3] ?? 255;
    const blend = alpha / 255;
    flattened[index * 4] = Math.round((rgba[index * 4] ?? 255) * blend + 255 * (1 - blend));
    flattened[index * 4 + 1] = Math.round((rgba[index * 4 + 1] ?? 255) * blend + 255 * (1 - blend));
    flattened[index * 4 + 2] = Math.round((rgba[index * 4 + 2] ?? 255) * blend + 255 * (1 - blend));
    flattened[index * 4 + 3] = 255;
  }
  const jpeg = await import("jpeg-js");
  const encoded = jpeg.encode({ data: flattened, height, width }, 70);
  return encoded.data;
}
