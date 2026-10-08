export const PRODUCT_IMPORT_MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ZIP_ENTRIES = 400;
export const PRODUCT_IMPORT_MAX_ENTRY_UNCOMPRESSED = 8 * 1024 * 1024;
export const PRODUCT_IMPORT_MAX_ZIP_RATIO = 30;

export type ZipInspection =
  | { code?: undefined; entries: number; ok: true; uncompressedBytes: number }
  | { code: "malformed_file" | "unsafe_workbook"; ok: false };

export function inspectZipCentralDirectory(bytes: Uint8Array): ZipInspection {
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) return { code: "malformed_file", ok: false };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entryCount > PRODUCT_IMPORT_MAX_ZIP_ENTRIES) return { code: "unsafe_workbook", ok: false };
  if (directoryOffset > bytes.length || directorySize > bytes.length || directoryOffset + directorySize > bytes.length) {
    return { code: "malformed_file", ok: false };
  }

  let offset = directoryOffset;
  const end = directoryOffset + directorySize;
  let seen = 0;
  let uncompressed = 0;
  while (seen < entryCount) {
    if (offset + 46 > end) return { code: "malformed_file", ok: false };
    if (view.getUint32(offset, true) !== 0x02014b50) return { code: "malformed_file", ok: false };
    const compressed = view.getUint32(offset + 20, true);
    const rawSize = view.getUint32(offset + 24, true);
    if (compressed === 0xffffffff || rawSize === 0xffffffff) return { code: "unsafe_workbook", ok: false };
    if (rawSize > PRODUCT_IMPORT_MAX_ENTRY_UNCOMPRESSED) return { code: "unsafe_workbook", ok: false };
    uncompressed += rawSize;
    if (uncompressed > PRODUCT_IMPORT_MAX_UNCOMPRESSED_BYTES) return { code: "unsafe_workbook", ok: false };
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
    seen += 1;
  }
  if (bytes.length > 0 && uncompressed / bytes.length > PRODUCT_IMPORT_MAX_ZIP_RATIO) {
    return { code: "unsafe_workbook", ok: false };
  }
  return { entries: seen, ok: true, uncompressedBytes: uncompressed };
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  const start = Math.max(0, bytes.length - (22 + 0xffff));
  for (let index = bytes.length - 22; index >= start; index -= 1) {
    if (bytes[index] === 0x50 && bytes[index + 1] === 0x4b && bytes[index + 2] === 0x05 && bytes[index + 3] === 0x06) {
      return index;
    }
  }
  return -1;
}
