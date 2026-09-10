import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  ImageSearchConfigurationError,
  ImageSearchRequestError,
  searchBraveImages,
} from "../features/products/brave-image-search";
import {
  BRAVE_IMAGES_SEARCH_ENDPOINT,
  BRAVE_IMAGE_SEARCH_COUNT,
  BRAVE_SEARCH_API_KEY_ENV,
  IMAGE_SEARCH_PROVIDER,
  mapBraveImageResults,
  readBraveSearchApiKey,
  redactImageSearchSecrets,
  resolveImageSearchQuery,
} from "../features/products/product-image-search";
import { writePrismaProductCreate } from "../features/products/prisma-repository";
import { uploadAndAttachProductImages } from "../features/products/product-image-service";
import {
  applyProductImageAssignment,
  assignImageToNewUnit,
  inferUnitImageOrigin,
  replaceInheritedProductImage,
  unitImageSelectValue,
} from "../features/products/unit-image-assignment";
import { getProductsCopy, localizeProductError } from "../lib/i18n/products-copy";
import type { TenantContext } from "../lib/db/write-context";
import { loadProjectEnvFiles, resolveScriptDatabaseUrl } from "../lib/db/script-database";
import { persistableProductImageUrl } from "../lib/storage/product-image-ref";
import { assertSafeRemoteImageUrl, importRemoteProductImageBytes, RemoteImageImportError } from "../features/products/remote-image-import";
import { createMemoryProductImageStorage, setProductImageStorageForTests } from "../lib/storage/product-image-storage";

class RollbackError extends Error {
  constructor() {
    super("FIX-24 isolated fixture rollback");
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

const results: Array<{ name: string; status: "PASS" | "FAIL"; detail?: string }> = [];

function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

async function checkAsync(name: string, run: () => Promise<void>) {
  try {
    await run();
    results.push({ name, status: "PASS" });
    console.log(`PASS  ${name}`);
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

const productName = "Coca Cola Original 330ml";
const barcode = "8851959132011";
const testApiKey = "BSAK_TEST_SECRET_VALUE_DO_NOT_USE";
const image = { id: "img-main", storagePath: "products/co/p1/v1/main.webp" };
const units = [
  { id: "piece", isBaseUnit: true, unitName: "Piece" },
  { id: "pack", isBaseUnit: false, unitName: "Pack" },
  { id: "box", isBaseUnit: false, unitName: "Box" },
];

const braveHit = {
  title: "Cola bottle",
  url: "https://example.com/cola",
  thumbnail: { src: "https://imgs.search.brave.com/cola-thumb.jpg" },
  properties: {
    url: "https://cdn.example.com/cola.jpg",
    width: 800,
    height: 600,
  },
};

function readClientFiles() {
  return [
    readFileSync("features/products/components/product-form.tsx", "utf8"),
    readFileSync("features/products/components/product-list-client.tsx", "utf8"),
  ].join("\n");
}

check("empty Product Name cannot search by name", () => {
  const resolved = resolveImageSearchQuery("name", { barcode, productName: "  " });
  assert(!resolved.ok && resolved.reason === "empty-name", JSON.stringify(resolved));
});

check("empty Barcode cannot search by barcode", () => {
  const resolved = resolveImageSearchQuery("barcode", { barcode: "", productName });
  assert(!resolved.ok && resolved.reason === "empty-barcode", JSON.stringify(resolved));
});

check("A. Product name search sends the exact current form query", () => {
  const resolved = resolveImageSearchQuery("name", { barcode, productName });
  assert(resolved.ok && resolved.query === productName, JSON.stringify(resolved));
});

check("B. Barcode search sends the exact current form query", () => {
  const resolved = resolveImageSearchQuery("barcode", { barcode, productName });
  assert(resolved.ok && resolved.query === barcode, JSON.stringify(resolved));
});

check("C. BRAVE_SEARCH_API_KEY is required", () => {
  assert(readBraveSearchApiKey({}) === null, "empty env must be unconfigured");
  assert(readBraveSearchApiKey({ [BRAVE_SEARCH_API_KEY_ENV]: "   " }) === null, "blank key must be unconfigured");
  assert(readBraveSearchApiKey({ [BRAVE_SEARCH_API_KEY_ENV]: testApiKey }) === testApiKey, "present key is read");
  assert(IMAGE_SEARCH_PROVIDER === "brave_search", IMAGE_SEARCH_PROVIDER);
});

check("D. Brave response maps to the internal image result format", () => {
  const hits = mapBraveImageResults({ type: "images", results: [braveHit] });
  assert(hits.length === 1, JSON.stringify(hits));
  assert(hits[0]?.importUrl === "https://cdn.example.com/cola.jpg", hits[0]?.importUrl ?? "");
  assert(hits[0]?.thumbnailUrl === "https://imgs.search.brave.com/cola-thumb.jpg", hits[0]?.thumbnailUrl ?? "");
  assert(hits[0]?.title === "Cola bottle", hits[0]?.title ?? "");
  assert(hits[0]?.sourcePageUrl === "https://example.com/cola", hits[0]?.sourcePageUrl ?? "");
  assert(hits[0]?.width === 800 && hits[0]?.height === 600, JSON.stringify(hits[0]));
});

check("E. Zero image results are handled", () => {
  const empty = mapBraveImageResults({ type: "images", results: [] });
  assert(empty.length === 0, JSON.stringify(empty));
  const missing = mapBraveImageResults({ type: "images" });
  assert(missing.length === 0, JSON.stringify(missing));
});

check("H. Malformed Brave JSON maps to no hits", () => {
  assert(mapBraveImageResults(null).length === 0, "null");
  assert(mapBraveImageResults("nope").length === 0, "string");
  assert(mapBraveImageResults({ results: [{ title: "x" }] }).length === 0, "missing https urls");
});

check("I. API key never appears in client code or mapped results", () => {
  const client = readClientFiles();
  assert(!client.includes(BRAVE_SEARCH_API_KEY_ENV), "client must not reference the secret name");
  assert(!client.includes("X-Subscription-Token"), "client must not send Brave auth");
  assert(!client.includes("GOOGLE_CSE"), "client must not mention Google CSE");
  assert(!client.toLowerCase().includes("google cse"), client.slice(0, 40));
  const hits = mapBraveImageResults({ results: [braveHit] });
  assert(!JSON.stringify(hits).includes(testApiKey), "mapped results must not include the key");
  const redacted = redactImageSearchSecrets(`X-Subscription-Token: ${testApiKey} BRAVE_SEARCH_API_KEY=${testApiKey}`);
  assert(!redacted.includes(testApiKey), redacted);
});

check("J. Selected Brave image still uses Storage import, not remote URL persistence", () => {
  let threw = false;
  try {
    persistableProductImageUrl("https://cdn.example.com/cola.jpg", { companyId: "co", productId: "p1" });
  } catch {
    threw = true;
  }
  assert(threw, "remote URL must be rejected as product image");
  const form = readFileSync("features/products/components/product-form.tsx", "utf8");
  assert(form.includes("importRemoteProductImageAction"), "search select must import remotely first");
  assert(form.includes("hit.importUrl"), "import uses the search hit URL as input only");
  assert(form.includes("optimizeProductImageFile"), "imported bytes still optimize to webp");
  const actions = readFileSync("features/products/actions.ts", "utf8");
  assert(actions.includes("searchBraveImages"), "server action uses Brave");
  assert(!actions.includes("GOOGLE_CSE"), "Google CSE runtime removed");
  assert(!existsSync("features/products/google-cse-image-search.ts"), "old Google provider file retired");
});

check("K. Apply to all units assigns unassigned units", () => {
  const next = applyProductImageAssignment({
    image,
    mode: "all",
    origins: { piece: "none", pack: "none", box: "none" },
    units,
  });
  assert(next.units.every((unit) => unit.imageUrl === image.storagePath), JSON.stringify(next.units));
  assert(next.origins.piece === "inherited" && next.origins.pack === "inherited" && next.origins.box === "inherited", JSON.stringify(next.origins));
});

check("L. Apply to base unit only assigns the base unit", () => {
  const next = applyProductImageAssignment({
    image,
    mode: "base",
    origins: { piece: "none", pack: "none", box: "none" },
    units,
  });
  assert(next.units.find((unit) => unit.id === "piece")?.imageUrl === image.storagePath, "base assigned");
  assert(!next.units.find((unit) => unit.id === "pack")?.imageUrl, "pack stays empty");
  assert(!next.units.find((unit) => unit.id === "box")?.imageUrl, "box stays empty");
});

check("M. Custom unit images remain protected", () => {
  const next = applyProductImageAssignment({
    image,
    mode: "all",
    origins: { piece: "none", pack: "custom", box: "none" },
    units: units.map((unit) => unit.id === "pack" ? { ...unit, imageUrl: "products/co/p1/pack/main.webp" } : unit),
  });
  assert(next.units.find((unit) => unit.id === "pack")?.imageUrl === "products/co/p1/pack/main.webp", "pack custom kept");
  assert(next.units.find((unit) => unit.id === "box")?.imageUrl === image.storagePath, "box inherited");
  const replaced = replaceInheritedProductImage({
    image: { id: "img-2", storagePath: "products/co/p1/v2/main.webp" },
    origins: { piece: "inherited", pack: "none", box: "custom" },
    units: [
      { id: "piece", isBaseUnit: true, imageUrl: image.storagePath },
      { id: "pack", imageUrl: undefined },
      { id: "box", imageUrl: "products/co/p1/box/main.webp" },
    ],
  });
  assert(replaced.units.find((unit) => unit.id === "piece")?.imageUrl === "products/co/p1/v2/main.webp", "inherited piece updates");
  assert(replaced.units.find((unit) => unit.id === "box")?.imageUrl === "products/co/p1/box/main.webp", "custom box kept");
});

check("Inherited unit image updates when Product Main Image changes", () => {
  const replaced = replaceInheritedProductImage({
    image: { id: "img-2", storagePath: "products/co/p1/v2/main.webp" },
    origins: { piece: "inherited", pack: "inherited", box: "inherited" },
    units: units.map((unit) => ({ ...unit, imageUrl: image.storagePath })),
  });
  assert(replaced.units.every((unit) => unit.imageUrl === "products/co/p1/v2/main.webp"), JSON.stringify(replaced.units));
});

check("New unit under Apply to all inherits Product Image", () => {
  const assigned = assignImageToNewUnit({
    image,
    mode: "all",
    origins: {},
    unit: { id: "carton", isBaseUnit: false },
  });
  assert(assigned.origin === "inherited" && assigned.unit.imageUrl === image.storagePath, JSON.stringify(assigned));
});

check("New unit under base-only remains unassigned", () => {
  const assigned = assignImageToNewUnit({
    image,
    mode: "base",
    origins: {},
    unit: { id: "carton", isBaseUnit: false },
  });
  assert(assigned.origin === "none" && !assigned.unit.imageUrl, JSON.stringify(assigned));
});

check("Unit Image binding after successful assignment", () => {
  const next = applyProductImageAssignment({
    image,
    mode: "all",
    origins: { piece: "none", pack: "none", box: "none" },
    units,
  });
  assert(unitImageSelectValue(next.units[0]!, [image]) === image.storagePath, "select value bound");
  assert(inferUnitImageOrigin(next.units[0]!, image) === "inherited", "origin inherited");
  const form = readFileSync("features/products/components/product-form.tsx", "utf8");
  assert(form.includes("applyImageToAllUnits") && form.includes("applyImageToBaseUnitOnly"), "assignment options exist");
  assert(form.includes("searchByProductName") && form.includes("searchByBarcode"), "search source chooser exists");
  assert(!form.includes("FileReader.readAsDataURL"), "no FileReader persist");
});

check("Unsafe/private-network image URL rejected", () => {
  const blocked = [
    "http://example.com/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://10.0.0.5/a.jpg",
    "https://192.168.1.8/a.jpg",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/a.jpg",
  ];
  for (const url of blocked) {
    let threw = false;
    try {
      assertSafeRemoteImageUrl(url);
    } catch (error) {
      threw = error instanceof RemoteImageImportError || error instanceof Error;
    }
    assert(threw, `expected reject ${url}`);
  }
});

check("I18N EN/LO assignment and search copy", () => {
  const en = getProductsCopy("en");
  const lo = getProductsCopy("lo");
  assert(en.searchImages === "Search images", en.searchImages);
  assert(en.searchByProductName === "Search by Product Name", en.searchByProductName);
  assert(en.applyImageToAllUnits === "Apply to all units", en.applyImageToAllUnits);
  assert(en.applyImageToBaseUnitOnly === "Apply to base unit only", en.applyImageToBaseUnitOnly);
  assert(en.inheritedFromProductImage === "Inherited from Product Image", en.inheritedFromProductImage);
  assert(!en.imageSearchHint.toLowerCase().includes("google"), en.imageSearchHint);
  assert(localizeProductError("Image search is not authorized.") === en.imageSearchUnauthorized, "401/403 copy");
  assert(localizeProductError("Image search is temporarily limited. Try again later.") === en.imageSearchRateLimited, "429 copy");
  assert(lo.searchImages.length > 0 && lo.searchImages !== en.searchImages, lo.searchImages);
  assert(lo.applyImageToBaseUnitOnly.length > 0 && lo.applyImageToBaseUnitOnly !== en.applyImageToBaseUnitOnly, lo.applyImageToBaseUnitOnly);
  assert(lo.imageSearchUnauthorized.length > 0 && lo.imageSearchUnauthorized !== en.imageSearchUnauthorized, lo.imageSearchUnauthorized);
});

await checkAsync("A2. Brave name search request uses exact query and strict safe search", async () => {
  const hits = await searchBraveImages(productName, testApiKey, async (input, init) => {
    const url = new URL(String(input));
    assert(url.origin + url.pathname === BRAVE_IMAGES_SEARCH_ENDPOINT, url.toString());
    assert(url.searchParams.get("q") === productName, url.searchParams.get("q") ?? url.toString());
    assert(url.searchParams.get("count") === String(BRAVE_IMAGE_SEARCH_COUNT), url.searchParams.get("count") ?? "");
    assert(url.searchParams.get("safesearch") === "strict", url.searchParams.get("safesearch") ?? "");
    assert(!url.toString().includes(testApiKey), "key must not be in the URL");
    const headers = new Headers(init?.headers);
    assert(headers.get("X-Subscription-Token") === testApiKey, "token header required for provider call");
    return new Response(JSON.stringify({ type: "images", results: [braveHit] }), { status: 200 });
  });
  assert(hits.length === 1 && hits[0]?.importUrl === "https://cdn.example.com/cola.jpg", JSON.stringify(hits));
  assert(!JSON.stringify(hits).includes(testApiKey), "result payload must not include the key");
});

await checkAsync("B2. Brave barcode search request uses exact barcode query", async () => {
  const hits = await searchBraveImages(barcode, testApiKey, async (input) => {
    const url = new URL(String(input));
    assert(url.searchParams.get("q") === barcode, url.searchParams.get("q") ?? url.toString());
    return new Response(JSON.stringify({ type: "images", results: [braveHit] }), { status: 200 });
  });
  assert(hits.length === 1, JSON.stringify(hits));
});

await checkAsync("C2. Missing Brave API key throws a configuration error", async () => {
  try {
    await searchBraveImages(productName, "  ");
    throw new Error("expected configuration error");
  } catch (error) {
    assert(error instanceof ImageSearchConfigurationError, String(error));
    assert(!String(error).includes(testApiKey), String(error));
  }
});

await checkAsync("E2. Brave zero-result payload returns an empty list", async () => {
  const hits = await searchBraveImages(productName, testApiKey, async () => {
    return new Response(JSON.stringify({ type: "images", results: [] }), { status: 200 });
  });
  assert(hits.length === 0, JSON.stringify(hits));
});

await checkAsync("F. 401/403 are handled without leaking the key", async () => {
  for (const status of [401, 403]) {
    try {
      await searchBraveImages(productName, testApiKey, async () => new Response("denied", { status }));
      throw new Error(`expected ${status}`);
    } catch (error) {
      assert(error instanceof ImageSearchRequestError, String(error));
      assert(error.message === "Image search is not authorized.", error.message);
      assert(!error.message.includes(testApiKey), error.message);
    }
  }
});

await checkAsync("G. Rate limit is handled", async () => {
  try {
    await searchBraveImages(productName, testApiKey, async () => new Response("slow down", { status: 429 }));
    throw new Error("expected 429");
  } catch (error) {
    assert(error instanceof ImageSearchRequestError, String(error));
    assert(error.message === "Image search is temporarily limited. Try again later.", error.message);
  }
});

await checkAsync("H2. Malformed Brave body is handled", async () => {
  try {
    await searchBraveImages(productName, testApiKey, async () => new Response("{not-json", { status: 200 }));
    throw new Error("expected malformed");
  } catch (error) {
    assert(error instanceof ImageSearchRequestError, String(error));
    assert(error.message === "Image search failed.", error.message);
  }
});

await checkAsync("Brave 5xx and timeout are handled", async () => {
  try {
    await searchBraveImages(productName, testApiKey, async () => new Response("down", { status: 503 }));
    throw new Error("expected 503");
  } catch (error) {
    assert(error instanceof ImageSearchRequestError, String(error));
    assert(error.message === "Image search is temporarily unavailable.", error.message);
  }
  try {
    await searchBraveImages(productName, testApiKey, async () => {
      throw new Error("Aborted");
    });
    throw new Error("expected timeout");
  } catch (error) {
    assert(error instanceof ImageSearchRequestError, String(error));
    assert(error.message === "Image search is temporarily unavailable.", error.message);
  }
});

await checkAsync("F2. Redirect to private metadata IP is rejected", async () => {
  let reachedPrivate = false;
  try {
    await importRemoteProductImageBytes("https://images.example.com/cola.jpg", async (input) => {
      const url = String(input);
      if (url.includes("169.254.169.254")) {
        reachedPrivate = true;
        return new Response("no", { status: 200 });
      }
      return new Response(null, { headers: { location: "https://169.254.169.254/latest/meta-data" }, status: 302 });
    });
    throw new Error("expected redirect reject");
  } catch (error) {
    assert(error instanceof RemoteImageImportError, String(error));
    assert(!reachedPrivate, "must not fetch private redirect target");
  }
});

await checkAsync("F3. Valid HTTPS JPEG is imported as bytes, not a remote URL", async () => {
  const imported = await importRemoteProductImageBytes("https://cdn.example.com/cola.jpg", async () => {
    return new Response(jpegBytes(256), { headers: { "content-type": "image/jpeg" }, status: 200 });
  });
  assert(imported.mime === "image/jpeg", imported.mime);
  assert(imported.bytes[0] === 0xff, "jpeg magic");
});

type Tx = any;

async function createIsolatedTenant(tx: Tx, label: string) {
  const token = randomBytes(6).toString("hex");
  const user = await tx.user.create({
    data: { fullName: `FIX-24 ${label}`, passwordHash: "isolated-fixture", username: `e24u${token}` },
  });
  const company = await tx.company.create({
    data: { businessTemplateKey: "mini-mart", name: `FIX-24 ${label}`, ownerUserId: user.id, storeCode: `e24${token}` },
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
  return {
    tenant: {
      branchId: branch.id,
      companyId: company.id,
      userId: user.id,
      warehouseId: warehouse.id,
    } satisfies TenantContext,
  };
}

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
      results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
      console.error(`FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
    }
  }

  const storage = createMemoryProductImageStorage();
  setProductImageStorageForTests(storage);

  await isolated("O. Shared image references do not duplicate Storage objects", async (tx) => {
    const { tenant } = await createIsolatedTenant(tx, "reuse");
    const created = await writePrismaProductCreate(tx, {
      barcode,
      costPriceLak: 2000,
      nameEn: productName,
      nameLo: productName,
      sellingPriceLak: 5000,
      sku: `IMG-SEARCH-${randomBytes(3).toString("hex")}`,
      units: [
        { conversionQty: 1, isBaseUnit: true, isDefaultSaleUnit: true, isPurchaseUnit: true, sellingPriceLak: 5000, unitName: "Piece" },
        { conversionQty: 6, sellingPriceLak: 30000, unitName: "Pack" },
        { conversionQty: 24, sellingPriceLak: 120000, unitName: "Box" },
      ],
    }, tenant);
    const assigned = await uploadAndAttachProductImages(created.id, {
      assignToUnitIds: created.units.map((unit: { id: string }) => unit.id),
      main: jpegBytes(200),
      mainType: "image/jpeg",
      thumb: jpegBytes(120),
      thumbType: "image/jpeg",
    }, tenant, tx);
    const unitPaths = new Set((assigned.units ?? []).map((unit: { imageUrl?: string }) => unit.imageUrl));
    assert(unitPaths.size === 1, `expected one shared path, got ${[...unitPaths].join(",")}`);
    assert([...unitPaths][0] === assigned.imageUrl, "units reuse product main path");
    const productObjects = [...storage.objects.keys()].filter((path) => path.includes(`/${created.id}/`));
    assert(productObjects.length === 2, `expected main+thumb only, got ${productObjects.join(",")}`);
  });

  setProductImageStorageForTests(null);
  await prisma.$disconnect();

  const failed = results.filter((row) => row.status === "FAIL");
  console.log(JSON.stringify({ failed: failed.length, passed: results.length - failed.length, results, total: results.length }, null, 2));
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
