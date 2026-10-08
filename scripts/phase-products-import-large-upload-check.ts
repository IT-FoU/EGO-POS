import { readFileSync } from "node:fs";
import { PermissionDeniedError } from "../lib/auth/permissions";
import {
  isTempImportObjectPath,
  isXlsxLocalHeader,
  largeImportObjectPath,
  PRODUCT_IMPORT_LARGE_MAX_BYTES,
  tusMetadata,
} from "../features/products/product-import-large";
import type { LargeImportStorage } from "../features/products/product-import-large-storage";
import { createMemoryLargeImportStore } from "../features/products/product-import-large-store";
import {
  cancelLargeImportUpload,
  cleanupExpiredLargeImports,
  startLargeImportUpload,
  verifyLargeImportUpload,
} from "../features/products/product-import-large-service";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const results: Array<{ ok: boolean; name: string }> = [];
function check(name: string, ok: boolean) {
  results.push({ ok, name });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
}

const tenant = { companyId: "company001", userId: "user000001" };
const other = { companyId: "company002", userId: "user000002" };
const header = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

check("xlsx signature accepts a zip local header", isXlsxLocalHeader(header));
check("temporary paths stay inside the import prefix", isTempImportObjectPath(largeImportObjectPath(tenant.companyId, tenant.userId, "job00000000000001")) && !isTempImportObjectPath("products/company001/product/main.webp"));
check("path traversal is rejected", throws(() => largeImportObjectPath("../secret", tenant.userId, "job00000000000001")));

const memory = memoryStorage();
const store = createMemoryLargeImportStore();
const started = await startLargeImportUpload({
  byteSize: 2048,
  fileName: "catalogue.xlsx",
  idempotencyKey: "idempotency-key-001",
}, tenant, { storage: memory.storage, store });
const again = await startLargeImportUpload({
  byteSize: 2048,
  fileName: "catalogue.xlsx",
  idempotencyKey: "idempotency-key-001",
}, tenant, { storage: memory.storage, store });
check("retry keeps the same temporary object", started.jobId === again.jobId && started.objectPath === again.objectPath && memory.authorizations === 2);
check("upload authorization does not include a service key", !JSON.stringify(started).includes("service_role") && started.token === "signed-token" && started.bucket === "product-import-temp");

memory.objects.set(started.objectPath, header);
const bad = await verifyLargeImportUpload(started.jobId, tenant, { storage: memory.storage, store });
check("a file that does not match its declared size is not accepted", bad.status === "failed" && !memory.objects.has(started.objectPath));

const repaired = await startLargeImportUpload({
  byteSize: header.byteLength,
  fileName: "catalogue.xlsx",
  idempotencyKey: "idempotency-key-001",
}, tenant, { storage: memory.storage, store });
memory.objects.set(repaired.objectPath, header);
const verified = await verifyLargeImportUpload(repaired.jobId, tenant, { storage: memory.storage, store });
check("a checked xlsx object can be marked uploaded", verified.status === "uploaded");
check("wrong tenant cannot read the upload", await throwsAsync(() => verifyLargeImportUpload(repaired.jobId, other, { storage: memory.storage, store })) instanceof PermissionDeniedError);

await cancelLargeImportUpload(repaired.jobId, tenant, { storage: memory.storage, store });
check("cancel removes only the temporary object", !memory.objects.has(repaired.objectPath) && memory.removed.every(isTempImportObjectPath));

const expiredStore = createMemoryLargeImportStore();
const expiredStorage = memoryStorage();
const old = await startLargeImportUpload({
  byteSize: 10,
  fileName: "old.xlsx",
  idempotencyKey: "idempotency-key-002",
}, tenant, { now: new Date("2026-10-01T00:00:00Z"), storage: expiredStorage.storage, store: expiredStore });
expiredStorage.objects.set(old.objectPath, header);
const cleaned = await cleanupExpiredLargeImports(new Date("2026-10-08T00:00:00Z"), { storage: expiredStorage.storage, store: expiredStore });
check("expired uploads are deleted", cleaned.removed === 1 && !expiredStorage.objects.has(old.objectPath));

check("files over 100 MB are rejected before authorization", await throwsAsync(() => startLargeImportUpload({
  byteSize: PRODUCT_IMPORT_LARGE_MAX_BYTES + 1,
  fileName: "huge.xlsx",
  idempotencyKey: "idempotency-key-003",
}, tenant, { storage: memory.storage, store: createMemoryLargeImportStore() })));

const service = readFileSync("features/products/product-import-large-service.ts", "utf8");
const drawer = readFileSync("features/products/components/product-import-drawer.tsx", "utf8");
const actions = readFileSync("features/products/actions.ts", "utf8");
const cleanup = readFileSync("features/products/product-import-large-storage.ts", "utf8");
check("large upload does not create products", !service.includes("createPrismaProduct") && !service.includes("uploadAndAttachProductImages"));
check("large confirm stays hidden", drawer.includes("!largeUpload") && drawer.includes("products-import-confirm"));
check("large file is not sent as a server-action body", drawer.includes("beginLargeUpload") && !drawer.slice(drawer.indexOf("async function beginLargeUpload"), drawer.indexOf("async function cancelLargeUpload")).includes("fileBase64"));
check("upload actions still require products.create", actions.includes("startLargeProductImportUploadAction") && actions.includes("WRITE_PERMISSIONS.productsCreate"));
check("cleanup cannot target product image paths", cleanup.includes("isTempImportObjectPath") && !cleanup.includes("product-images"));
check("copy parity", productsCopyKeyParity());
check("lo large upload hint", tProducts("importLargeHint", "lo") !== tProducts("importLargeHint", "en"));
check("tus metadata keeps the object name", tusMetadata({ objectName: "imports/company001/user000001/job.xlsx" }).includes("objectName "));

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) process.exit(1);

function memoryStorage() {
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  let authorizations = 0;
  const storage: LargeImportStorage = {
    async authorizeUpload(path) {
      if (!isTempImportObjectPath(path)) throw new Error("bad path");
      authorizations += 1;
      return { token: "signed-token", tusEndpoint: "https://example.test/upload/resumable/sign" };
    },
    async readPrefix(path) {
      return objects.get(path)?.slice(0, 4) ?? null;
    },
    async readSize(path) {
      return objects.get(path)?.byteLength ?? null;
    },
    async remove(paths) {
      for (const path of paths) {
        if (!isTempImportObjectPath(path)) continue;
        removed.push(path);
        objects.delete(path);
      }
    },
  };
  return { authorizationsRef: () => authorizations, get authorizations() { return authorizations; }, objects, removed, storage };
}

function throws(run: () => unknown) {
  try {
    run();
    return false;
  } catch {
    return true;
  }
}

async function throwsAsync(run: () => Promise<unknown>) {
  try {
    await run();
    return null;
  } catch (error) {
    return error;
  }
}
