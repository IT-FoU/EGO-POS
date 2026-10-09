import { deflateRawSync } from "node:zlib";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PermissionDeniedError } from "../lib/auth/permissions";
import { PRODUCT_IMPORT_MAX_UNCOMPRESSED_BYTES, PRODUCT_IMPORT_MAX_ZIP_ENTRIES } from "../features/products/product-import-zip";
import { MetadataReadError, readWorkbookMetadata } from "../features/products/product-import-metadata";
import { IMPORT_METADATA_MAX_ENTRIES, IMPORT_METADATA_MAX_RATIO, IMPORT_PROCESS_MEMORY_STOP_BYTES } from "../features/products/product-import-process";
import { createMemoryLargeImportStore } from "../features/products/product-import-large-store";
import type { LargeImportStorage } from "../features/products/product-import-large-storage";
import { cleanupExpiredLargeImports, startLargeImportUpload, verifyLargeImportUpload } from "../features/products/product-import-large-service";
import { createMemoryImportProcessStore } from "../features/products/product-import-process-store";
import { cancelImportProcess, readImportProcess, startImportProcess } from "../features/products/product-import-process-service";
import { productsCopyKeyParity } from "../lib/i18n/products-copy";

const results: Array<{ ok: boolean; name: string }> = [];
function check(name: string, ok: boolean) {
  results.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const tenant = { companyId: "company001", userId: "user000001" };
const other = { companyId: "company002", userId: "user000002" };
const directory = mkdtempSync(join(tmpdir(), "ego-import-meta-"));

const workbook = await readWorkbookMetadata(writeZip("sample.xlsx", [
  { data: Buffer.from(`<workbook xmlns:r="http://x"><sheets><sheet name="Stock" sheetId="1" r:id="rId1"/></sheets></workbook>`), name: "xl/workbook.xml" },
  { data: Buffer.from(`<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`), name: "xl/_rels/workbook.xml.rels" },
  { data: Buffer.from(`<worksheet><sheetData><row r="1"/><row r="2"><c/></row></sheetData></worksheet>`), name: "xl/worksheets/sheet1.xml" },
]));
check("metadata reads sheet name and row count", workbook.sheetCount === 1 && workbook.rowCount === 2 && workbook.sheets[0]?.name === "Stock" && workbook.sheets[0]?.rows === 2);

let unsafe = false;
try {
  const zeros = Buffer.alloc(2 * 1024 * 1024);
  await readWorkbookMetadata(writeZip("bomb.xlsx", [{ data: zeros, method: 8, name: "xl/worksheets/sheet1.xml" }]));
} catch (error) {
  unsafe = error instanceof MetadataReadError && error.code === "unsafe_workbook";
}
check("compression ratio above 20 is rejected", unsafe);

let encrypted = false;
try {
  await readWorkbookMetadata(writeZip("locked.xlsx", [{ data: Buffer.from("x"), flags: 1, name: "xl/workbook.xml" }]));
} catch (error) {
  encrypted = error instanceof MetadataReadError && error.code === "unsafe_workbook";
}
check("encrypted zip entries are rejected", encrypted);

let memory = false;
try {
  await readWorkbookMetadata(writeZip("memory.xlsx", [{ data: Buffer.from("<row/>"), name: "xl/worksheets/sheet1.xml" }]), {
    memoryBytes: () => IMPORT_PROCESS_MEMORY_STOP_BYTES + 1,
  });
} catch (error) {
  memory = error instanceof MetadataReadError && error.code === "memory_limit";
}
check("metadata stops above 80 percent of 4 GiB", memory);
check("small-file zip ceiling stays at 32 MB and 400 entries", PRODUCT_IMPORT_MAX_UNCOMPRESSED_BYTES === 32 * 1024 * 1024 && PRODUCT_IMPORT_MAX_ZIP_ENTRIES === 400 && IMPORT_METADATA_MAX_ENTRIES === 8000 && IMPORT_METADATA_MAX_RATIO === 20);

const header = new Uint8Array(2048);
header.set([0x50, 0x4b, 0x03, 0x04]);
const storage = memoryStorage();
const uploads = createMemoryLargeImportStore();
const processes = createMemoryImportProcessStore();
const sent: string[] = [];
const started = await startLargeImportUpload({
  byteSize: 2048,
  fileName: "catalogue.xlsx",
  idempotencyKey: "idempotency-key-101",
}, tenant, { now: new Date("2026-10-09T00:00:00Z"), storage: storage.storage, store: uploads });
storage.objects.set(started.objectPath, header);
await verifyLargeImportUpload(started.jobId, tenant, { now: new Date("2026-10-09T00:10:00Z"), storage: storage.storage, store: uploads });
const first = await startImportProcess(started.jobId, tenant, {
  now: new Date("2026-10-09T00:10:00Z"),
  sender: { async send(processId) { sent.push(processId); } },
  store: processes,
  uploads,
});
const second = await startImportProcess(started.jobId, tenant, {
  now: new Date("2026-10-09T00:11:00Z"),
  sender: { async send(processId) { sent.push(processId); } },
  store: processes,
  uploads,
});
check("process start is idempotent for a queued workbook", first.processId === second.processId && sent.length === 2 && new Set(sent).size === 1);
check("another tenant cannot read the process", await throwsAsync(() => readImportProcess(first.processId, other, { store: processes })) instanceof PermissionDeniedError);
const cancelled = await cancelImportProcess(first.processId, tenant, { store: processes });
check("cancel does not remove the uploaded object", cancelled.status === "cancelled" && storage.objects.has(started.objectPath));
const cleaned = await cleanupExpiredLargeImports(new Date("2026-10-12T00:00:00Z"), {
  protectedUploadIds: [started.jobId],
  storage: storage.storage,
  store: uploads,
});
check("cleanup keeps an object while its process is protected", cleaned.removed === 0 && storage.objects.has(started.objectPath));

const service = readFileSync("features/products/product-import-process-service.ts", "utf8");
const worker = readFileSync("workers/import-processor/index.ts", "utf8");
const server = readFileSync("workers/import-processor/server.ts", "utf8");
const migration = readFileSync("prisma/migrations/20261009120000_product_import_processes/migration.sql", "utf8");
check("processing does not create products or images", !service.includes("createPrismaProduct") && !worker.includes("createPrismaProduct") && !server.includes("product-images"));
check("queue payload is only a process id", worker.includes("parseImportProcessMessage") && !worker.includes("signedUrl:"));
check("container allows only the QA storage host", server.includes("IMPORT_CONTAINER_ALLOWED_HOSTS") && worker.includes("enableInternet = false"));
check("migration has no destructive statement", !/\b(drop|truncate|delete|update|alter)\b/i.test(migration));
check("process copy parity", productsCopyKeyParity());

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);

function writeZip(name: string, entries: Array<{ data: Buffer; flags?: number; method?: 0 | 8; name: string }>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 0;
    const payload = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const entryName = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(entryName.length, 26);
    const localBytes = Buffer.concat([local, entryName, payload]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entryName.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(localBytes);
    centrals.push(Buffer.concat([central, entryName]));
    offset += localBytes.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  const path = join(directoryName(), name);
  writeFileSync(path, Buffer.concat([...locals, directory, eocd]));
  return path;
}

function directoryName() {
  return directory;
}

function memoryStorage() {
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  const storage: LargeImportStorage = {
    async authorizeUpload() {
      return { token: "signed-upload-token", tusEndpoint: "https://arkhwskvcnntluoakmef.storage.supabase.co/storage/v1/upload/resumable/sign" };
    },
    async readPrefix(path) {
      return objects.get(path)?.slice(0, 4) ?? null;
    },
    async readSize(path) {
      return objects.get(path)?.byteLength ?? null;
    },
    async remove(paths) {
      for (const path of paths) {
        removed.push(path);
        objects.delete(path);
      }
    },
  };
  return { objects, removed, storage };
}

async function throwsAsync(fn: () => Promise<unknown>) {
  try {
    await fn();
    return null;
  } catch (error) {
    return error;
  }
}
