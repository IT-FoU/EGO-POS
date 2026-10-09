import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { readWorkbookMetadata } from "../features/products/product-import-metadata";

const directory = await mkdtemp(join(tmpdir(), "ego-import-bench-"));
const sizes = [10, 50, 100];
try {
  for (const size of sizes) {
    const path = join(directory, `${size}mb.xlsx`);
    const startedWrite = Date.now();
    await writeWorksheetZip(path, size * 1024 * 1024 - 200);
    const started = Date.now();
    const before = process.memoryUsage().rss;
    const metadata = await readWorkbookMetadata(path);
    const after = process.memoryUsage().rss;
    console.log(JSON.stringify({
      durationMs: Date.now() - started,
      entryCount: metadata.entryCount,
      fileMb: size,
      peakRssMb: Math.round(Math.max(metadata.peakMemoryBytes, after) / (1024 * 1024)),
      rowCount: metadata.rowCount,
      rssBeforeMb: Math.round(before / (1024 * 1024)),
      sheetCount: metadata.sheetCount,
      uncompressedMb: Math.round(metadata.uncompressedBytes / (1024 * 1024)),
      writeMs: Date.now() - startedWrite,
    }));
  }
} finally {
  await rm(directory, { force: true, recursive: true });
}

async function writeWorksheetZip(path: string, payloadBytes: number) {
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(payloadBytes, 18);
  local.writeUInt32LE(payloadBytes, 22);
  local.writeUInt16LE(name.length, 26);
  const stream = createWriteStream(path);
  stream.write(local);
  stream.write(name);
  const pattern = Buffer.from("<row/>");
  let remaining = payloadBytes;
  while (remaining > 0) {
    const chunk = Buffer.alloc(Math.min(remaining, pattern.length * 1024 * 64));
    for (let offset = 0; offset < chunk.length; offset += pattern.length) pattern.copy(chunk, offset);
    if (!stream.write(chunk.subarray(0, remaining > chunk.length ? chunk.length : remaining))) await once(stream, "drain");
    remaining -= Math.min(remaining, chunk.length);
  }
  const directoryOffset = 30 + name.length + payloadBytes;
  const central = Buffer.alloc(46 + name.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(payloadBytes, 20);
  central.writeUInt32LE(payloadBytes, 24);
  central.writeUInt16LE(name.length, 28);
  name.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(directoryOffset, 16);
  stream.write(central);
  stream.end(eocd);
  await once(stream, "finish");
}
