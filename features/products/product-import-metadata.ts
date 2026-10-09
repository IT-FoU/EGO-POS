import { open, type FileHandle } from "node:fs/promises";
import { createInflateRaw } from "node:zlib";
import { Readable } from "node:stream";
import {
  IMPORT_METADATA_IMAGE_SKIP_BYTES,
  IMPORT_METADATA_MAX_COMPRESSED_BYTES,
  IMPORT_METADATA_MAX_ENTRIES,
  IMPORT_METADATA_MAX_ENTRY_BYTES,
  IMPORT_METADATA_MAX_RATIO,
  IMPORT_METADATA_MAX_SHEET_NAME,
  IMPORT_METADATA_MAX_SHEETS_STORED,
  IMPORT_METADATA_MAX_UNCOMPRESSED_BYTES,
  IMPORT_PROCESS_MEMORY_STOP_BYTES,
  IMPORT_PROCESS_TIME_LIMIT_MS,
  type ImportProcessSheet,
} from "./product-import-process";

export class MetadataReadError extends Error {
  constructor(readonly code: "malformed_file" | "memory_limit" | "time_limit" | "unsafe_workbook") {
    super(code);
  }
}

export type WorkbookMetadata = {
  durationMs: number;
  entryCount: number;
  oversizedImages: number;
  peakMemoryBytes: number;
  rowCount: number;
  sheetCount: number;
  sheets: ImportProcessSheet[];
  uncompressedBytes: number;
};

type ZipEntry = {
  compressedSize: number;
  flags: number;
  localOffset: number;
  method: number;
  name: string;
  uncompressedSize: number;
};

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export async function readWorkbookMetadata(filePath: string, options?: {
  memoryBytes?: () => number;
  now?: () => number;
}): Promise<WorkbookMetadata> {
  const started = (options?.now ?? Date.now)();
  const memoryBytes = options?.memoryBytes ?? (() => process.memoryUsage().rss);
  let peak = memoryBytes();
  const file = await open(filePath, "r");
  try {
    const size = (await file.stat()).size;
    if (size < 22 || size > IMPORT_METADATA_MAX_COMPRESSED_BYTES) throw new MetadataReadError("unsafe_workbook");
    const entries = await readCentralDirectory(file, size);
    let uncompressed = 0;
    for (const entry of entries) {
      if ((entry.flags & 1) !== 0 || (entry.method !== 0 && entry.method !== 8)) throw new MetadataReadError("unsafe_workbook");
      if (entry.name.includes("..") || entry.name.startsWith("/") || entry.name.startsWith("\\")) throw new MetadataReadError("unsafe_workbook");
      if (entry.uncompressedSize > IMPORT_METADATA_MAX_ENTRY_BYTES) throw new MetadataReadError("unsafe_workbook");
      uncompressed += entry.uncompressedSize;
      if (uncompressed > IMPORT_METADATA_MAX_UNCOMPRESSED_BYTES) throw new MetadataReadError("unsafe_workbook");
    }
    if (size > 0 && uncompressed / size > IMPORT_METADATA_MAX_RATIO) throw new MetadataReadError("unsafe_workbook");

    const workbook = await readSmallEntry(file, entries.find((entry) => entry.name === "xl/workbook.xml"));
    const rels = await readSmallEntry(file, entries.find((entry) => entry.name === "xl/_rels/workbook.xml.rels"));
    const sheets = plannedSheets(entries, workbook, rels);
    const stored: ImportProcessSheet[] = [];
    let rowCount = 0;
    let oversizedImages = 0;
    for (const entry of entries) {
      assertBudget(started, memoryBytes);
      peak = Math.max(peak, memoryBytes());
      if (entry.name.startsWith("xl/media/")) {
        if (entry.compressedSize > IMPORT_METADATA_IMAGE_SKIP_BYTES) oversizedImages += 1;
        continue;
      }
    }
    for (const sheet of sheets) {
      assertBudget(started, memoryBytes);
      const rows = await countRows(file, sheet.entry);
      rowCount += rows;
      if (stored.length < IMPORT_METADATA_MAX_SHEETS_STORED) {
        stored.push({ name: sheet.name.slice(0, IMPORT_METADATA_MAX_SHEET_NAME), rows });
      }
      peak = Math.max(peak, memoryBytes());
    }
    return {
      durationMs: (options?.now ?? Date.now)() - started,
      entryCount: entries.length,
      oversizedImages,
      peakMemoryBytes: peak,
      rowCount,
      sheetCount: sheets.length,
      sheets: stored,
      uncompressedBytes: uncompressed,
    };
  } finally {
    await file.close();
  }
}

function assertBudget(started: number, memoryBytes: () => number) {
  if (Date.now() - started > IMPORT_PROCESS_TIME_LIMIT_MS) throw new MetadataReadError("time_limit");
  if (memoryBytes() > IMPORT_PROCESS_MEMORY_STOP_BYTES) throw new MetadataReadError("memory_limit");
}

function plannedSheets(entries: ZipEntry[], workbook: string | null, rels: string | null) {
  const worksheets = entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry.name));
  const names = sheetNames(workbook, rels);
  if (names.length === 0) {
    return worksheets.map((entry) => ({ entry, name: entry.name.split("/").pop() || "Sheet" }));
  }
  return names.map((sheet) => {
    const entry = worksheets.find((item) => item.name.toLowerCase() === sheet.target.toLowerCase() || item.name.toLowerCase().endsWith("/" + sheet.target.toLowerCase()));
    return entry ? { entry, name: sheet.name } : null;
  }).filter((sheet): sheet is { entry: ZipEntry; name: string } => Boolean(sheet));
}

function sheetNames(workbook: string | null, rels: string | null) {
  if (!workbook) return [];
  const targets = new Map<string, string>();
  if (rels) {
    for (const match of rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
      targets.set(match[1] ?? "", (match[2] ?? "").replace(/^\//, ""));
    }
  }
  const sheets: Array<{ name: string; target: string }> = [];
  for (const match of workbook.matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    const target = targets.get(match[2] ?? "") ?? "";
    sheets.push({ name: decodeXml(match[1] ?? "Sheet"), target });
  }
  return sheets;
}

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
}

async function readCentralDirectory(file: FileHandle, size: number) {
  const tailLength = Math.min(size, 22 + 0xffff);
  const tail = await readExact(file, size - tailLength, tailLength);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === EOCD) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new MetadataReadError("malformed_file");
  let entryCount = tail.readUInt16LE(eocd + 10);
  let directorySize = tail.readUInt32LE(eocd + 12);
  let directoryOffset = tail.readUInt32LE(eocd + 16);
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    const locator = eocd >= 20 ? tail.readUInt32LE(eocd - 20) : 0;
    if (locator !== ZIP64_LOCATOR) throw new MetadataReadError("malformed_file");
    const zip64Offset = Number(tail.readBigUInt64LE(eocd - 12));
    const zip64 = await readExact(file, zip64Offset, 56);
    if (zip64.readUInt32LE(0) !== ZIP64_EOCD) throw new MetadataReadError("malformed_file");
    entryCount = Number(zip64.readBigUInt64LE(32));
    directorySize = Number(zip64.readBigUInt64LE(40));
    directoryOffset = Number(zip64.readBigUInt64LE(48));
  }
  if (entryCount > IMPORT_METADATA_MAX_ENTRIES || directoryOffset < 0 || directorySize < 0 || directoryOffset + directorySize > size) {
    throw new MetadataReadError("unsafe_workbook");
  }
  const directory = await readExact(file, directoryOffset, directorySize);
  const entries: ZipEntry[] = [];
  let offset = 0;
  for (let seen = 0; seen < entryCount; seen += 1) {
    if (offset + 46 > directory.length || directory.readUInt32LE(offset) !== CENTRAL) throw new MetadataReadError("malformed_file");
    const flags = directory.readUInt16LE(offset + 8);
    const method = directory.readUInt16LE(offset + 10);
    let compressedSize = directory.readUInt32LE(offset + 20);
    let uncompressedSize = directory.readUInt32LE(offset + 24);
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);
    let localOffset = directory.readUInt32LE(offset + 42);
    const name = directory.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    const extra = directory.subarray(offset + 46 + nameLength, offset + 46 + nameLength + extraLength);
    const zip64 = readZip64Extra(extra, uncompressedSize, compressedSize, localOffset);
    uncompressedSize = zip64.uncompressedSize;
    compressedSize = zip64.compressedSize;
    localOffset = zip64.localOffset;
    entries.push({ compressedSize, flags, localOffset, method, name, uncompressedSize });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZip64Extra(extra: Buffer, uncompressedSize: number, compressedSize: number, localOffset: number) {
  let cursor = 0;
  while (cursor + 4 <= extra.length) {
    const id = extra.readUInt16LE(cursor);
    const length = extra.readUInt16LE(cursor + 2);
    const start = cursor + 4;
    if (id === 1) {
      let value = start;
      if (uncompressedSize === 0xffffffff) {
        uncompressedSize = Number(extra.readBigUInt64LE(value));
        value += 8;
      }
      if (compressedSize === 0xffffffff) {
        compressedSize = Number(extra.readBigUInt64LE(value));
        value += 8;
      }
      if (localOffset === 0xffffffff) localOffset = Number(extra.readBigUInt64LE(value));
      if (value - start > length) throw new MetadataReadError("malformed_file");
    }
    cursor = start + length;
  }
  if (uncompressedSize === 0xffffffff || compressedSize === 0xffffffff || localOffset === 0xffffffff) {
    throw new MetadataReadError("malformed_file");
  }
  return { compressedSize, localOffset, uncompressedSize };
}

async function readSmallEntry(file: FileHandle, entry: ZipEntry | undefined) {
  if (!entry) return null;
  if (entry.uncompressedSize > 2 * 1024 * 1024) throw new MetadataReadError("unsafe_workbook");
  const bytes = await readEntry(file, entry);
  return bytes.toString("utf8");
}

async function countRows(file: FileHandle, entry: ZipEntry) {
  let rows = 0;
  let pending = "";
  const hold = 5;
  await readEntryStream(file, entry, (chunk) => {
    const text = pending + chunk.toString("utf8");
    const scanLength = Math.max(0, text.length - hold);
    let index = 0;
    while (index < scanLength) {
      const found = text.indexOf("<row", index);
      if (found < 0 || found >= scanLength) break;
      const next = text[found + 4];
      if (next === " " || next === ">" || next === "/") rows += 1;
      index = found + 4;
    }
    pending = text.slice(scanLength);
  });
  let index = 0;
  while (index < pending.length) {
    const found = pending.indexOf("<row", index);
    if (found < 0) break;
    const next = pending[found + 4];
    if (next === " " || next === ">" || next === "/") rows += 1;
    index = found + 4;
  }
  return rows;
}

async function readEntry(file: FileHandle, entry: ZipEntry) {
  const chunks: Buffer[] = [];
  await readEntryStream(file, entry, (chunk) => {
    chunks.push(Buffer.from(chunk));
  });
  return Buffer.concat(chunks);
}

async function readEntryStream(file: FileHandle, entry: ZipEntry, onChunk: (chunk: Buffer) => void) {
  const header = await readExact(file, entry.localOffset, 30);
  if (header.readUInt32LE(0) !== LOCAL) throw new MetadataReadError("malformed_file");
  const nameLength = header.readUInt16LE(26);
  const extraLength = header.readUInt16LE(28);
  const dataOffset = entry.localOffset + 30 + nameLength + extraLength;
  const compressed = await readExact(file, dataOffset, entry.compressedSize);
  if (entry.method === 0) {
    if (compressed.length > entry.uncompressedSize) throw new MetadataReadError("unsafe_workbook");
    onChunk(compressed);
    return;
  }
  const inflater = createInflateRaw();
  let produced = 0;
  inflater.on("data", (chunk: Buffer) => {
    produced += chunk.length;
    if (produced > entry.uncompressedSize || produced > IMPORT_METADATA_MAX_ENTRY_BYTES) {
      inflater.destroy(new MetadataReadError("unsafe_workbook"));
      return;
    }
    onChunk(chunk);
  });
  await new Promise<void>((resolve, reject) => {
    inflater.on("error", reject);
    inflater.on("finish", resolve);
    Readable.from(compressed).on("error", reject).pipe(inflater);
  });
}

async function readExact(file: FileHandle, position: number, length: number) {
  if (length < 0 || position < 0) throw new MetadataReadError("malformed_file");
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await file.read(buffer, 0, length, position);
  if (bytesRead !== length) throw new MetadataReadError("malformed_file");
  return buffer;
}
