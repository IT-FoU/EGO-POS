/**
 * Focused regression: Combined POS image delivery must not blank when Separate shows an image.
 * Covers legacy data-URI main images and storage-path signing collection.
 */
import {
  attachPosProductImageDelivery,
} from "../features/products/product-image-delivery";
import {
  projectPosCatalogueCards,
  resolveCombinedCardImageUrl,
  resolveUnitCardImageUrl,
} from "../features/pos/pos-cart";
import type { PosProduct, PosProductUnit } from "../features/pos/types";
import {
  displayableProductImageRef,
  normalizeStorageObjectPath,
  persistableProductImageUrl,
} from "../lib/storage/product-image-ref";
import { normalizeSupabaseProjectUrl } from "../lib/storage/supabase-admin";
import {
  createMemoryProductImageStorage,
  setProductImageStorageForTests,
} from "../lib/storage/product-image-storage";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

function check(name: string, run: () => void | Promise<void>) {
  return Promise.resolve()
    .then(() => run())
    .then(() => {
      results.push({ name, status: "PASS" });
      console.log(`PASS  ${name}`);
    })
    .catch((error) => {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ detail, name, status: "FAIL" });
      console.log(`FAIL  ${name} — ${detail}`);
    });
}

function unit(partial: Partial<PosProductUnit> & Pick<PosProductUnit, "id" | "unitName">): PosProductUnit {
  return {
    allowManualUnitSelect: true,
    barcode: "",
    conversionQty: 1,
    costPriceLak: 0,
    isBaseUnit: false,
    isDefaultSaleUnit: false,
    isPurchaseUnit: false,
    sellingPriceLak: 0,
    sortOrder: 0,
    status: "active",
    ...partial,
  };
}

function baseProduct(overrides: Partial<PosProduct> = {}): PosProduct {
  const units = [
    unit({ id: "piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 10000 }),
  ];
  return {
    barcode: "123",
    categoryName: "Drinks",
    conversionQty: 1,
    id: "prod-1",
    imageKey: "generic",
    nameEn: "Pepsi",
    nameLo: "Pepsi",
    priceLak: 10000,
    sku: "SKU-1",
    stockQty: 10,
    unitId: "piece",
    unitName: "Piece",
    units,
    ...overrides,
  };
}

async function main() {
  await check("normalize SUPABASE_URL strips /rest/v1", () => {
    assert(
      normalizeSupabaseProjectUrl("https://abc.supabase.co/rest/v1") === "https://abc.supabase.co",
      "rest stripped",
    );
    assert(
      normalizeSupabaseProjectUrl("https://abc.supabase.co/storage/v1/") === "https://abc.supabase.co",
      "storage stripped",
    );
    assert(
      normalizeSupabaseProjectUrl("https://abc.supabase.co/") === "https://abc.supabase.co",
      "trailing slash",
    );
  });

  await check("normalizeStorageObjectPath rejects bad paths and signed URLs as paths", () => {
    assert(normalizeStorageObjectPath("products/c1/p1/v/main.webp") === "products/c1/p1/v/main.webp", "bare path");
    assert(normalizeStorageObjectPath("/products/c1/p1/v/main.webp") === "products/c1/p1/v/main.webp", "leading slash");
    assert(
      normalizeStorageObjectPath("products/c1/p1/v/main.webp?token=x") === "products/c1/p1/v/main.webp",
      "query stripped",
    );
    assert(!normalizeStorageObjectPath("data:image/jpeg;base64,AAAA"), "reject data uri");
    assert(!normalizeStorageObjectPath("https://cdn.example/x.webp"), "reject random http");
    assert(
      normalizeStorageObjectPath(
        "https://abc.supabase.co/storage/v1/object/public/product-images/products/c1/p1/v/main.webp",
      ) === "products/c1/p1/v/main.webp",
      "extract from public url",
    );
  });

  await check("persistable rejects embedded; accepts storage path", () => {
    let threw = false;
    try {
      persistableProductImageUrl("data:image/png;base64,xx", { companyId: "c1", productId: "p1" });
    } catch {
      threw = true;
    }
    assert(threw, "embedded rejected");
    assert(
      persistableProductImageUrl("products/c1/p1/v/main.webp", { companyId: "c1", productId: "p1" }) ===
        "products/c1/p1/v/main.webp",
      "storage accepted",
    );
  });

  await check("legacy data-URI main shows on Combined and Separate after delivery", async () => {
    const legacy = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD";
    const product = baseProduct({
      productImageUrl: legacy,
      unitImageUrl: legacy,
      units: [
        unit({ id: "piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 10000, imageUrl: legacy }),
      ],
    });
    const [delivered] = await attachPosProductImageDelivery([product]);
    assert(delivered.productImageUrl === legacy, "product main kept for display");
    assert(delivered.unitImageUrl === legacy, "combined unitImageUrl is main");
    assert(delivered.units?.[0]?.imageUrl === legacy, "unit keeps legacy display");

    const combined = projectPosCatalogueCards([delivered], "combined");
    assert(combined[0]!.unitImageUrl === legacy, "combined card image");
    const separate = projectPosCatalogueCards([delivered], "separate");
    assert(separate[0]!.unitImageUrl === legacy, "separate card image");
  });

  await check("storage-path main is signed and used for Combined without unit image", async () => {
    const memory = createMemoryProductImageStorage();
    const mainPath = "products/c1/p1/v1/main.webp";
    const thumbPath = "products/c1/p1/v1/thumb.webp";
    await memory.upload(mainPath, { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
    await memory.upload(thumbPath, { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
    setProductImageStorageForTests(memory);
    try {
      const product = baseProduct({
        productImageUrl: mainPath,
        unitImageUrl: undefined,
        units: [
          unit({ id: "piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 1 }),
        ],
      });
      const [delivered] = await attachPosProductImageDelivery([product]);
      assert(delivered.productImageUrl?.includes("product-images.local"), "signed product main");
      assert(delivered.unitImageUrl?.includes("product-images.local"), "combined uses signed main");
      assert(resolveCombinedCardImageUrl(delivered)?.includes("product-images.local"), "resolve combined");
      assert(resolveUnitCardImageUrl(delivered, delivered.units![0]!)?.includes("product-images.local"), "separate fallback");
    } finally {
      setProductImageStorageForTests(null);
    }
  });

  await check("displayableProductImageRef allows legacy only", () => {
    assert(displayableProductImageRef("data:image/png;base64,xx")?.startsWith("data:"), "data uri");
    assert(!displayableProductImageRef("products/c1/p1/v/main.webp"), "storage not displayable raw");
  });

  const failed = results.filter((row) => row.status === "FAIL");
  if (failed.length) {
    console.error(`\n${failed.length} failed`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
