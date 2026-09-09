import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { mapPrismaPosProduct } from "../features/pos/dto-mapper";
import { attachPosProductImageDelivery } from "../features/products/product-image-delivery";
import {
  writePrismaProductArchive,
  writePrismaProductCreate,
  writePrismaProductUpdate,
} from "../features/products/prisma-repository";
import { cleanupHardDeletedProductImages, uploadAndAttachProductImages } from "../features/products/product-image-service";
import { auditContainsEmbeddedImage, OMITTED_EMBEDDED_IMAGE, sanitizeAuditData } from "../lib/audit/sanitize-audit-data";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import {
  assertProductImagePathScope,
  buildProductImagePaths,
  compactProductImageKey,
  isEmbeddedImagePayload,
  isRenderableImageUrl,
  persistableProductImageUrl,
  thumbPathFromMain,
} from "../lib/storage/product-image-ref";
import { detectImageMimeFromMagicBytes, ProductImageValidationError, validateProductImageBytes } from "../lib/storage/image-validate";
import { createMemoryProductImageStorage, setProductImageStorageForTests } from "../lib/storage/product-image-storage";

class RollbackError extends Error {
  constructor() {
    super("FIX-21 isolated fixture rollback");
    this.name = "RollbackError";
  }
}

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
loadProjectEnvFiles();
process.env.EGO_APP_ENV = "test";
process.env.IGO_DEMO_MODE = "false";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const jpegHeader = [0xff, 0xd8, 0xff, 0xe0];
function jpegBytes(size = 128) {
  const bytes = new Uint8Array(size);
  bytes.set(jpegHeader);
  return bytes;
}

function gifBytes() {
  return new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
}

const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

async function checkAsync(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ detail, name, status: "FAIL" });
    console.log(`FAIL  ${name} — ${detail}`);
  }
}

check("rejects oversized image", () => {
  const bytes = jpegBytes(5 * 1024 * 1024 + 24);
  let thrown = false;
  try {
    validateProductImageBytes(bytes, { declaredMime: "image/jpeg", kind: "source" });
  } catch (error) {
    thrown = error instanceof ProductImageValidationError && error.message.includes("too large");
  }
  assert(thrown, "expected oversized source rejection");
});

check("rejects invalid MIME / GIF", () => {
  let gifThrown = false;
  try {
    validateProductImageBytes(gifBytes(), { declaredMime: "image/gif", kind: "source" });
  } catch (error) {
    gifThrown = error instanceof ProductImageValidationError;
  }
  assert(gifThrown, "expected GIF rejection");
  assert(detectImageMimeFromMagicBytes(jpegBytes()) === "image/jpeg", "jpeg magic");
});

check("tenant-scoped path includes companyId and productId", () => {
  const paths = buildProductImagePaths({ companyId: "co_1", productId: "p_1", version: "v1" });
  assert(paths.mainPath === "products/co_1/p_1/v1/main.webp", paths.mainPath);
  assert(paths.thumbPath === "products/co_1/p_1/v1/thumb.webp", paths.thumbPath);
  assert(thumbPathFromMain(paths.mainPath) === paths.thumbPath, "thumb derivation");
  assertProductImagePathScope(paths.mainPath, { companyId: "co_1", productId: "p_1" });
  let denied = false;
  try {
    assertProductImagePathScope(paths.mainPath, { companyId: "co_other", productId: "p_1" });
  } catch {
    denied = true;
  }
  assert(denied, "cross-tenant path must be denied");
});

check("persistable refs reject Base64", () => {
  let thrown = false;
  try {
    persistableProductImageUrl("data:image/jpeg;base64,AAAA", { companyId: "co_1", productId: "p_1" });
  } catch (error) {
    thrown = error instanceof Error && error.message.includes("embedded data");
  }
  assert(thrown, "expected embedded data rejection");
  const path = persistableProductImageUrl("products/co_1/p_1/v1/main.webp", { companyId: "co_1", productId: "p_1" });
  assert(path === "products/co_1/p_1/v1/main.webp", String(path));
});

check("audit sanitizer strips Base64 and keeps storage paths", () => {
  const sanitized = sanitizeAuditData({
    imageUrl: "data:image/jpeg;base64," + "A".repeat(200),
    nested: { photo: "data:image/png;base64,BBBB" },
    path: "products/co_1/p_1/v1/main.webp",
    name: "Milk",
  }) as Record<string, unknown>;
  assert(sanitized.imageUrl === OMITTED_EMBEDDED_IMAGE, "imageUrl redacted");
  assert((sanitized.nested as Record<string, unknown>).photo === OMITTED_EMBEDDED_IMAGE, "nested redacted");
  assert(sanitized.path === "products/co_1/p_1/v1/main.webp", "path kept");
  assert(auditContainsEmbeddedImage({ imageUrl: "data:image/jpeg;base64,xx" }) === true, "detect embedded");
  assert(auditContainsEmbeddedImage(sanitized) === false, "sanitized is clean");
});

check("legacy data URI rendering does not crash", () => {
  assert(isRenderableImageUrl("data:image/jpeg;base64,AAAA") === true, "legacy still renderable in admin");
  assert(isEmbeddedImagePayload("data:image/jpeg;base64,AAAA") === true, "detected as embedded");
  assert(compactProductImageKey("data:image/jpeg;base64,AAAA") === "generic", "POS key compacted");
  assert(isRenderableImageUrl("products/co/p/main.webp") === false, "raw storage path is not an img src");
});

check("product-form no longer persists via FileReader.readAsDataURL", () => {
  const form = readFileSync("features/products/components/product-form.tsx", "utf8");
  assert(!form.includes("readAsDataURL"), "readAsDataURL must be removed from product form");
  assert(form.includes("optimizeProductImageFile"), "optimizer must be used");
  assert(form.includes("uploadProductImageAction"), "upload action must be used");
});

check("repeated product images use native lazy loading", () => {
  const posImage = readFileSync("features/pos/components/pos-product-image.tsx", "utf8");
  const list = readFileSync("features/products/components/product-list-client.tsx", "utf8");
  const form = readFileSync("features/products/components/product-form.tsx", "utf8");
  assert(posImage.includes('loading="lazy"') && posImage.includes('decoding="async"'), "POS cards lazy+async");
  assert(list.includes('function ProductThumbnail') && list.includes('loading="lazy"') && list.includes('decoding="async"'), "admin list thumbs lazy+async");
  assert(form.includes('loading="lazy"') && form.includes('decoding="async"'), "form gallery thumbs lazy+async");
  assert(posImage.includes("isRenderableImageUrl"), "POS fallback path unchanged");
  assert(list.includes("ProductImagePlaceholder"), "list placeholder fallback unchanged");
});

check("service-role key is not a NEXT_PUBLIC env", () => {
  const envExample = readFileSync(".env.example", "utf8");
  const actions = readFileSync("features/products/actions.ts", "utf8");
  const writeContext = readFileSync("lib/db/write-context.ts", "utf8");
  assert(!envExample.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"), "env example must not publicize service role");
  assert(!actions.includes("NEXT_PUBLIC_SUPABASE"), "actions must not use NEXT_PUBLIC supabase keys");
  assert(writeContext.includes("sanitizeAuditData"), "audit writes must be sanitized");
});

check("create/update/delete keep sanitizer and storage cleanup contracts", () => {
  const repo = readFileSync("features/products/prisma-repository.ts", "utf8");
  const writeContext = readFileSync("lib/db/write-context.ts", "utf8");
  assert(writeContext.includes("sanitizeAuditData"), "write-context sanitizes audit");
  assert(repo.includes('action: "create"') && repo.includes("newData: input"), "create audit uses input");
  assert(repo.includes('action: "update"') && repo.includes("newData: { productId, ...input }"), "update audit uses input");
  assert(repo.includes("cleanupHardDeletedProductImages"), "hard delete invokes cleanup");
  const archiveBlock = repo.slice(repo.indexOf("export async function writePrismaProductArchive"), repo.indexOf("export async function deletePrismaProduct"));
  assert(!archiveBlock.includes("cleanupHardDeletedProductImages"), "archive must not delete storage objects");
});

const storage = createMemoryProductImageStorage();
setProductImageStorageForTests(storage);

await checkAsync("POS mapping returns thumbnail reference and strips Base64", async () => {
  const mainPath = "products/co_pos/p_pos/v1/main.webp";
  const thumbPath = "products/co_pos/p_pos/v1/thumb.webp";
  await storage.upload(thumbPath, { bytes: jpegBytes(), contentType: "image/jpeg" });
  const mapped = mapPrismaPosProduct({
    barcode: "1",
    id: "p_pos",
    imageUrl: mainPath,
    nameEn: "Milk",
    nameLo: "Milk",
    sellingPriceLak: 1000,
    sku: "MILK",
    units: [
      {
        barcode: "1",
        conversionQty: 1,
        id: "u1",
        imageUrl: mainPath,
        isBaseUnit: true,
        isDefaultSaleUnit: true,
        sellingPriceLak: 1000,
        sortOrder: 0,
        status: "active",
        unitName: "Piece",
      },
    ],
  });
  assert(mapped.imageKey === "generic", mapped.imageKey);
  const [delivered] = await attachPosProductImageDelivery([mapped]);
  assert(delivered.unitImageUrl?.startsWith("https://product-images.local/") === true, String(delivered.unitImageUrl));
  assert(!isEmbeddedImagePayload(delivered.unitImageUrl), "POS must not receive Base64");

  const legacy = mapPrismaPosProduct({
    id: "p_legacy",
    imageUrl: "data:image/jpeg;base64," + "A".repeat(120),
    nameEn: "Old",
    nameLo: "Old",
    sellingPriceLak: 1,
    sku: "OLD",
    units: [{ conversionQty: 1, id: "u", imageUrl: "data:image/jpeg;base64," + "B".repeat(120), isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 1, status: "active", unitName: "Piece" }],
  });
  const [legacyDelivered] = await attachPosProductImageDelivery([legacy]);
  assert(!legacyDelivered.unitImageUrl || !isEmbeddedImagePayload(legacyDelivered.unitImageUrl), "legacy Base64 stripped from POS");
});

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `FIX-21 ${label}`, passwordHash: "isolated-fixture", username: `e21u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `FIX-21 ${label}`, ownerUserId: user.id, storeCode: `e21${token}` },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, isMainBranch: true, name: "Main" },
  });
  const warehouse = await tx.warehouse.create({
    data: { branchId: branch.id, companyId: company.id, name: "WH-A", type: "store" },
  });
  await tx.companyUser.create({
    data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
  });
  const tenant: TenantContext = {
    branchId: branch.id,
    companyId: company.id,
    userId: user.id,
    warehouseId: warehouse.id,
  };
  return { tenant };
}

const productInput = {
  barcode: "2100123456789",
  nameEn: "Image Test",
  nameLo: "Image Test",
  sku: "IMG-TEST",
  sellingPriceLak: 5000,
  costPriceLak: 2000,
  units: [{ conversionQty: 1, isBaseUnit: true, isDefaultSaleUnit: true, isPurchaseUnit: true, sellingPriceLak: 5000, unitName: "Piece" }],
};

async function main() {
  const url = resolveScriptDatabaseUrl("test-write");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  async function isolated(name: string, run: (tx: Tx) => Promise<void>) {
    try {
      await prisma.$transaction(async (tx) => {
        await run(tx);
        throw new RollbackError();
      });
      results.push({ name, status: "PASS" });
    } catch (error) {
      if (error instanceof RollbackError) {
        results.push({ name, status: "PASS" });
        console.log(`PASS  ${name}`);
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ detail, name, status: "FAIL" });
      console.log(`FAIL  ${name} — ${detail}`);
    }
  }

  await isolated("create rejects Base64 imageUrl", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "reject-b64");
    let thrown = false;
    try {
      await writePrismaProductCreate(tx, { ...productInput, imageUrl: "data:image/jpeg;base64,AAAA" }, tenant);
    } catch (error) {
      thrown = error instanceof Error && error.message.toLowerCase().includes("embedded");
    }
    assert(thrown, "create must reject Base64");
  });

  await isolated("update rejects Base64 imageUrl", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "update-b64");
    const created = await writePrismaProductCreate(tx, productInput, tenant);
    let thrown = false;
    try {
      await writePrismaProductUpdate(tx, created.id, { imageUrl: "data:image/jpeg;base64,EEEE" }, tenant);
    } catch (error) {
      thrown = error instanceof Error && error.message.toLowerCase().includes("embedded");
    }
    assert(thrown, "update must reject Base64");
  });

  await checkAsync("upload creates tenant-scoped main+thumb and stores path not Base64", async () => {
    const token = randomBytes(4).toString("hex");
    const user = await prisma.user.create({
      data: { fullName: "FIX-21 upload", passwordHash: "isolated-fixture", username: `e21up${token}` },
    });
    const company = await prisma.company.create({
      data: { businessTemplateKey: "mini-mart", name: "FIX-21 upload", ownerUserId: user.id, storeCode: `e21up${token}` },
    });
    const branch = await prisma.branch.create({ data: { companyId: company.id, isMainBranch: true, name: "Main" } });
    const warehouse = await prisma.warehouse.create({
      data: { branchId: branch.id, companyId: company.id, name: "WH", type: "store" },
    });
    await prisma.companyUser.create({
      data: { branchId: branch.id, companyId: company.id, isOwner: true, status: "active", userId: user.id },
    });
    const tenant: TenantContext = { branchId: branch.id, companyId: company.id, userId: user.id, warehouseId: warehouse.id };
    try {
      const created = await writePrismaProductCreate(prisma, {
        ...productInput,
        barcode: `21${token}00001`,
        sku: `IMG-${token}`,
      }, tenant);
      const createAuditPayload = JSON.stringify(sanitizeAuditData({
        ...productInput,
        imageUrl: "data:image/jpeg;base64," + "A".repeat(80),
      }));
      assert(!createAuditPayload.includes("data:image"), createAuditPayload);
      assert(!createAuditPayload.includes("base64,"), createAuditPayload);
      const assigned = await uploadAndAttachProductImages(created.id, {
        assignToUnitId: created.units[0]?.id,
        main: jpegBytes(200),
        mainType: "image/jpeg",
        thumb: jpegBytes(120),
        thumbType: "image/jpeg",
      }, tenant, prisma);
      assert(assigned.imageUrl?.startsWith(`products/${company.id}/${created.id}/`) === true, String(assigned.imageUrl));
      assert(assigned.imageUrl?.endsWith("/main.webp") === true, String(assigned.imageUrl));
      assert(!isEmbeddedImagePayload(assigned.imageUrl), "db path must not be Base64");
      assert(storage.objects.has(assigned.imageUrl!), "main object");
      assert(storage.objects.has(thumbPathFromMain(assigned.imageUrl!)!), "thumb object");
      const row = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      assert(row.imageUrl === assigned.imageUrl, "db stores path");
      assert(!String(row.imageUrl).startsWith("data:"), "db is not data URI");
      const imageAudit = await prisma.auditLog.findFirst({
        orderBy: { createdAt: "desc" },
        where: { action: "update_image", companyId: company.id, module: "products" },
      });
      const auditPayload = JSON.stringify(imageAudit?.newData ?? {});
      assert(!auditPayload.includes("data:image"), auditPayload);
      assert(!auditPayload.includes("base64"), auditPayload);
      assert(auditPayload.includes(`products/${company.id}/`), auditPayload);

      const previous = assigned.imageUrl!;
      const replaced = await uploadAndAttachProductImages(created.id, {
        main: jpegBytes(180),
        mainType: "image/jpeg",
        thumb: jpegBytes(100),
        thumbType: "image/jpeg",
      }, tenant, prisma);
      assert(replaced.imageUrl !== previous, "replace uses a new versioned path");
      assert(!storage.objects.has(previous), "old main removed after successful replace");

      const failing = createMemoryProductImageStorage();
      failing.upload = async () => {
        throw new Error("forced upload failure");
      };
      setProductImageStorageForTests(failing);
      const beforeFail = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      let replaceFailed = false;
      try {
        await uploadAndAttachProductImages(created.id, {
          main: jpegBytes(160),
          mainType: "image/jpeg",
          thumb: jpegBytes(90),
          thumbType: "image/jpeg",
        }, tenant, prisma);
      } catch {
        replaceFailed = true;
      }
      assert(replaceFailed, "replace failure should throw");
      const afterFail = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      assert(afterFail.imageUrl === beforeFail.imageUrl, "previous image preserved after replace failure");
      setProductImageStorageForTests(storage);

      await writePrismaProductArchive(prisma, created.id, tenant);
      const archived = await prisma.product.findUniqueOrThrow({ where: { id: created.id } });
      assert(archived.imageUrl === afterFail.imageUrl, "archive keeps image reference");
      assert(Boolean(archived.imageUrl && storage.objects.has(archived.imageUrl)), "archive does not delete storage objects");

      const snapshot = await prisma.product.findUniqueOrThrow({
        include: { units: { select: { imageUrl: true } } },
        where: { id: created.id },
      });
      await prisma.inventoryBalance.deleteMany({ where: { productId: created.id } });
      await prisma.product.delete({ where: { id: created.id } });
      await cleanupHardDeletedProductImages(snapshot);
      const gone = await prisma.product.findUnique({ where: { id: created.id } });
      assert(!gone, "hard delete removes product");
      assert([...storage.objects.keys()].every((path) => !path.includes(created.id)), "hard delete cleans storage objects");
      const deleteSource = readFileSync("features/products/prisma-repository.ts", "utf8");
      assert(deleteSource.includes("if (hardDeletedImages)") && deleteSource.includes("cleanupHardDeletedProductImages(hardDeletedImages)"), "deletePrismaProduct invokes cleanup after SQL success");
    } finally {
      await prisma.company.delete({ where: { id: company.id } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      setProductImageStorageForTests(storage);
    }
  });

  const failed = results.filter((result) => result.status === "FAIL");
  console.log(`\nFIX-21 product image storage: ${results.length - failed.length}/${results.length} PASS${failed.length ? ` (${failed.length} FAIL)` : ""}`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

await main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
