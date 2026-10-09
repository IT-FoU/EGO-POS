import { inflateSync } from "node:zlib";
import { decode, encode } from "jpeg-js";

export const PREVIEW_IMAGE_SOURCE_MAX_BYTES = 2 * 1024 * 1024;
export const PREVIEW_IMAGE_MAX_PIXELS = 1_000_000;
export const PREVIEW_THUMB_EDGE = 36;
const THUMB_JPEG_QUALITY = 40;
const THUMB_OUTPUT_MAX_BYTES = 12_000;

type Raster = { height: number; rgba: Uint8Array; width: number };

export function downscalePreviewImage(bytes: Uint8Array): string | null {
  try {
    if (bytes.byteLength === 0 || bytes.byteLength > PREVIEW_IMAGE_SOURCE_MAX_BYTES) return null;
    const raster = decodeRaster(bytes);
    if (!raster) return null;
    const edge = PREVIEW_THUMB_EDGE;
    const rgba = scaleNearest(raster, edge);
    const encoded = encode({ data: rgba, height: edge, width: edge }, THUMB_JPEG_QUALITY);
    if (encoded.data.byteLength === 0 || encoded.data.byteLength > THUMB_OUTPUT_MAX_BYTES) return null;
    return `data:image/jpeg;base64,${Buffer.from(encoded.data).toString("base64")}`;
  } catch {
    return null;
  }
}

function decodeRaster(bytes: Uint8Array): Raster | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return decodePng(bytes);
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return decodeJpeg(bytes);
  return null;
}

function decodeJpeg(bytes: Uint8Array): Raster | null {
  const image = decode(bytes, { formatAsRGBA: true, maxMemoryUsageInMB: 32, maxResolutionInMP: 1, useTArray: true });
  if (image.width < 1 || image.height < 1 || image.width * image.height > PREVIEW_IMAGE_MAX_PIXELS) return null;
  return { height: image.height, rgba: image.data, width: image.width };
}

function decodePng(bytes: Uint8Array): Raster | null {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((value, index) => bytes[index] !== value)) return null;
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const chunks: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4] ?? 0, bytes[offset + 5] ?? 0, bytes[offset + 6] ?? 0, bytes[offset + 7] ?? 0);
    const start = offset + 8;
    if (length < 0 || start + length + 4 > bytes.length) return null;
    if (type === "IHDR") {
      width = readU32(bytes, start);
      height = readU32(bytes, start + 4);
      bitDepth = bytes[start + 8] ?? 0;
      colorType = bytes[start + 9] ?? 0;
      interlace = bytes[start + 12] ?? 0;
    } else if (type === "IDAT") {
      chunks.push(Buffer.from(bytes.subarray(start, start + length)));
    } else if (type === "IEND") {
      break;
    }
    offset = start + length + 4;
  }
  if (interlace !== 0 || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) return null;
  if (width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > PREVIEW_IMAGE_MAX_PIXELS) return null;
  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(chunks));
  if (raw.length < height * (stride + 1)) return null;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const dest = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y === 0 ? null : pixels.subarray((y - 1) * stride, y * stride);
    unfilter(filter, src, dest, previous, channels);
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const source = index * channels;
    const target = index * 4;
    rgba[target] = pixels[source] ?? 0;
    rgba[target + 1] = pixels[source + 1] ?? pixels[source] ?? 0;
    rgba[target + 2] = pixels[source + 2] ?? pixels[source] ?? 0;
    rgba[target + 3] = channels === 4 ? pixels[source + 3] ?? 255 : 255;
  }
  return { height, rgba, width };
}

function unfilter(filter: number, src: Uint8Array, dest: Uint8Array, previous: Uint8Array | null, channels: number) {
  for (let index = 0; index < src.length; index += 1) {
    const left = index >= channels ? dest[index - channels] ?? 0 : 0;
    const up = previous?.[index] ?? 0;
    const upperLeft = index >= channels ? previous?.[index - channels] ?? 0 : 0;
    const raw = src[index] ?? 0;
    if (filter === 1) dest[index] = (raw + left) & 255;
    else if (filter === 2) dest[index] = (raw + up) & 255;
    else if (filter === 3) dest[index] = (raw + Math.floor((left + up) / 2)) & 255;
    else if (filter === 4) dest[index] = (raw + paeth(left, up, upperLeft)) & 255;
    else dest[index] = raw;
  }
}

function paeth(left: number, up: number, upperLeft: number) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  if (upDistance <= diagonal) return up;
  return upperLeft;
}

function scaleNearest(raster: Raster, edge: number) {
  const rgba = new Uint8Array(edge * edge * 4);
  for (let y = 0; y < edge; y += 1) {
    const sourceY = Math.min(raster.height - 1, Math.floor((y * raster.height) / edge));
    for (let x = 0; x < edge; x += 1) {
      const sourceX = Math.min(raster.width - 1, Math.floor((x * raster.width) / edge));
      const source = (sourceY * raster.width + sourceX) * 4;
      const target = (y * edge + x) * 4;
      rgba.set(raster.rgba.subarray(source, source + 4), target);
    }
  }
  return rgba;
}

function readU32(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
}
