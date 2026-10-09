import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import type { EmbeddedImageAnchor } from "@/features/products/product-import-images";
import { IMPORT_METADATA_MAX_COMPRESSED_BYTES, IMPORT_METADATA_MAX_ENTRIES } from "@/features/products/product-import-process";

const PREVIEW_ENTRY_MAX_BYTES = 64 * 1024 * 1024;
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const EOCD = 0x06054b50;

type ZipEntry = { compressedSize: number; localOffset: number; method: number; name: string; uncompressedSize: number };

export async function readWorkbookPreviewSource(filePath: string, sheetName: string) {
  const file = await open(filePath, "r");
  try {
    const size = (await file.stat()).size;
    if (size < 22 || size > IMPORT_METADATA_MAX_COMPRESSED_BYTES) throw new Error("unsafe_workbook");
    const entries = await readCentralDirectory(file, size);
    const workbook = textEntry(file, entries, "xl/workbook.xml");
    const rels = textEntry(file, entries, "xl/_rels/workbook.xml.rels");
    const sheetPath = sheetPathForName(entries, await workbook, await rels, sheetName);
    const shared = parseSharedStrings(await textEntry(file, entries, "xl/sharedStrings.xml"));
    const sheetXml = await textEntry(file, entries, sheetPath);
    const rows = parseSheetRows(sheetXml ?? "", shared);
    const images = await readAnchors(file, entries, sheetPath);
    return { images, rows, sheetName };
  } finally {
    await file.close();
  }
}

async function readAnchors(file: Awaited<ReturnType<typeof open>>, entries: ZipEntry[], sheetPath: string): Promise<EmbeddedImageAnchor[]> {
  const sheetRels = await textEntry(file, entries, sheetPath.replace("worksheets/", "worksheets/_rels/") + ".rels");
  const drawingTarget = /Target="([^"]*drawing[^"]*)"/.exec(sheetRels ?? "")?.[1];
  if (!drawingTarget) return [];
  const drawingPath = normalizeZipPath(sheetPath, drawingTarget);
  const drawing = await textEntry(file, entries, drawingPath);
  const drawingRels = await textEntry(file, entries, drawingPath.replace("drawings/", "drawings/_rels/") + ".rels");
  const targets = new Map<string, string>();
  for (const match of (drawingRels ?? "").matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    targets.set(match[1] ?? "", normalizeZipPath(drawingPath, match[2] ?? ""));
  }
  const anchors: EmbeddedImageAnchor[] = [];
  for (const block of (drawing ?? "").matchAll(/<xdr:(?:twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g)) {
    const xml = block[0];
    const from = Number(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(xml)?.[1]);
    const to = Number(/<xdr:to>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/.exec(xml)?.[1]);
    const embed = /r:embed="([^"]+)"/.exec(xml)?.[1] ?? "";
    const media = targets.get(embed);
    const entry = media ? entries.find((item) => item.name === media) : undefined;
    const bytes = entry && entry.uncompressedSize <= 32 * 1024 ? await readEntry(file, entry) : new Uint8Array();
    anchors.push({
      bottomRow: Number.isFinite(to) ? to : null,
      bytes,
      topRow: Number.isFinite(from) ? from : null,
    });
  }
  return anchors;
}

function sheetPathForName(entries: ZipEntry[], workbook: string | null, rels: string | null, sheetName: string) {
  const targets = new Map<string, string>();
  for (const match of (rels ?? "").matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) targets.set(match[1] ?? "", match[2] ?? "");
  for (const match of (workbook ?? "").matchAll(/<sheet\b[^>]*name="([^"]*)"[^>]*r:id="([^"]+)"/g)) {
    if ((match[1] ?? "") !== sheetName) continue;
    const target = (targets.get(match[2] ?? "") ?? "").replace(/^\//, "");
    return target.startsWith("xl/") ? target : `xl/${target}`;
  }
  const fallback = entries.find((entry) => entry.name.toLowerCase() === "xl/worksheets/sheet1.xml");
  if (!fallback) throw new Error("malformed_file");
  return fallback.name;
}

function parseSharedStrings(xml: string | null) {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...((match[1] ?? "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g))].map((item) => item[1] ?? "").join("")),
  );
}

function parseSheetRows(xml: string, shared: string[]) {
  const rows: string[][] = [];
  for (const match of xml.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(match[1]);
    const cells: string[] = [];
    for (const cell of (match[2] ?? "").matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? "";
      const body = cell[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
      const column = ref ? columnIndex(ref) : cells.length;
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? "";
      let value = "";
      if (type === "inlineStr") value = decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1] ?? "").join(""));
      else if (type === "s") value = shared[Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "")] ?? "";
      else value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      while (cells.length < column) cells.push("");
      cells[column] = value;
    }
    while (rows.length < rowNumber - 1) rows.push([]);
    rows[rowNumber - 1] = cells;
  }
  return rows;
}

function columnIndex(letters: string) {
  return [...letters].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function decodeXml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
}

function normalizeZipPath(base: string, target: string) {
  const parts = base.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}

async function textEntry(file: Awaited<ReturnType<typeof open>>, entries: ZipEntry[], name: string) {
  const entry = entries.find((item) => item.name === name);
  if (!entry) return null;
  if (entry.uncompressedSize > PREVIEW_ENTRY_MAX_BYTES) throw new Error("preview_limit");
  return Buffer.from(await readEntry(file, entry)).toString("utf8");
}

async function readEntry(file: Awaited<ReturnType<typeof open>>, entry: ZipEntry) {
  const header = Buffer.alloc(30);
  if ((await file.read(header, 0, 30, entry.localOffset)).bytesRead !== 30 || header.readUInt32LE(0) !== LOCAL) throw new Error("malformed_file");
  const dataOffset = entry.localOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const compressed = Buffer.alloc(entry.compressedSize);
  if ((await file.read(compressed, 0, compressed.length, dataOffset)).bytesRead !== compressed.length) throw new Error("malformed_file");
  if (entry.method === 0) return new Uint8Array(compressed.subarray(0, entry.uncompressedSize));
  if (entry.method !== 8) throw new Error("unsafe_workbook");
  const inflated = inflateRawSync(compressed);
  if (inflated.length > entry.uncompressedSize || inflated.length > PREVIEW_ENTRY_MAX_BYTES) throw new Error("preview_limit");
  return new Uint8Array(inflated);
}

async function readCentralDirectory(file: Awaited<ReturnType<typeof open>>, size: number) {
  const tailLength = Math.min(size, 22 + 0xffff);
  const tail = Buffer.alloc(tailLength);
  await file.read(tail, 0, tailLength, size - tailLength);
  let eocd = -1;
  for (let index = tail.length - 22; index >= 0; index -= 1) {
    if (tail.readUInt32LE(index) === EOCD) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new Error("malformed_file");
  const entryCount = tail.readUInt16LE(eocd + 10);
  const directorySize = tail.readUInt32LE(eocd + 12);
  const directoryOffset = tail.readUInt32LE(eocd + 16);
  if (entryCount > IMPORT_METADATA_MAX_ENTRIES) throw new Error("unsafe_workbook");
  const directory = Buffer.alloc(directorySize);
  await file.read(directory, 0, directorySize, directoryOffset);
  const entries: ZipEntry[] = [];
  let offset = 0;
  for (let seen = 0; seen < entryCount; seen += 1) {
    if (directory.readUInt32LE(offset) !== CENTRAL) throw new Error("malformed_file");
    const method = directory.readUInt16LE(offset + 10);
    const compressedSize = directory.readUInt32LE(offset + 20);
    const uncompressedSize = directory.readUInt32LE(offset + 24);
    const nameLength = directory.readUInt16LE(offset + 28);
    const extraLength = directory.readUInt16LE(offset + 30);
    const commentLength = directory.readUInt16LE(offset + 32);
    const localOffset = directory.readUInt32LE(offset + 42);
    const name = directory.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ compressedSize, localOffset, method, name, uncompressedSize });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
