import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCustomerDisplayProductImage } from "../features/pos/customer-display-product-image";
import type { PosCartItem, PosProductUnit } from "../features/pos/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const image = (name: string) => `https://cdn.test/${name}.webp`;

function unit(id: string, unitName: string, overrides: Partial<PosProductUnit> = {}): PosProductUnit {
  return {
    allowManualUnitSelect: true,
    barcode: `${id}-barcode`,
    conversionQty: 1,
    costPriceLak: 100,
    id,
    isBaseUnit: unitName === "Piece",
    isDefaultSaleUnit: unitName === "Piece",
    isPurchaseUnit: true,
    sellingPriceLak: 100,
    sortOrder: 0,
    status: "active",
    unitName,
    ...overrides,
  };
}

function line(overrides: Partial<PosCartItem> = {}): PosCartItem {
  return {
    barcode: "barcode",
    categoryName: "Drinks",
    id: "coke",
    imageKey: "generic",
    nameEn: "Coca-Cola",
    nameLo: "Coca-Cola",
    priceLak: 100,
    quantity: 1,
    retailPriceLak: 100,
    sku: "COKE",
    stockQty: 10,
    unitName: "Piece",
    units: [unit("piece", "Piece")],
    ...overrides,
  };
}

const piece = unit("piece", "Piece", { imageThumbUrl: image("piece-thumb"), imageUrl: image("piece-main") });
const pack = unit("pack", "Pack", { imageThumbUrl: image("pack-thumb"), imageUrl: image("pack-main") });
const box = unit("box", "Box", { imageThumbUrl: image("box-thumb"), imageUrl: image("box-main") });
const allUnits = [piece, pack, box];

assert(
  resolveCustomerDisplayProductImage(line({ unitId: "piece", units: allUnits })).url === image("piece-thumb"),
  "sold unit thumbnail must win",
);
assert(
  resolveCustomerDisplayProductImage(line({ unitId: "piece", units: [unit("piece", "Piece", { imageUrl: image("piece-main") })] })).url === image("piece-main"),
  "sold unit main image must be used when thumbnail is missing",
);
assert(
  resolveCustomerDisplayProductImage(line({ unitId: "pack", productThumbnailUrl: image("base-thumb"), units: [unit("pack", "Pack")] })).url === image("base-thumb"),
  "base thumbnail must be used when sold unit image is missing",
);
assert(
  resolveCustomerDisplayProductImage(line({ unitId: "pack", productImageUrl: image("base-main"), units: [unit("pack", "Pack")] })).url === image("base-main"),
  "base main image must be used when base thumbnail is missing",
);
assert(
  resolveCustomerDisplayProductImage(line({ unitId: "pack", units: [unit("pack", "Pack")] })).url === undefined,
  "placeholder source must have no image URL",
);

for (const [unitId, expected] of [["piece", "piece-thumb"], ["pack", "pack-thumb"], ["box", "box-thumb"]] as const) {
  assert(
    resolveCustomerDisplayProductImage(line({ unitId, units: allUnits })).url === image(expected),
    `${unitId} must use its own sold-unit image`,
  );
}

assert(
  resolveCustomerDisplayProductImage(
    line({
      unitId: "pack",
      productImageUrl: undefined,
      productThumbnailUrl: undefined,
      units: [unit("pack", "Pack"), unit("box", "Box", { imageUrl: image("box-main") })],
    }),
  ).source === "placeholder",
  "another unit image must not be used as fallback",
);

const root = process.cwd();
const displaySource = readFileSync(join(root, "features/pos/components/customer-display-client.tsx"), "utf8");
const helperSource = readFileSync(join(root, "features/pos/customer-display-product-image.ts"), "utf8");
const posSource = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const imageDeliverySource = readFileSync(join(root, "features/products/product-image-delivery.ts"), "utf8");
const heldCartSource = readFileSync(join(root, "features/pos/held-cart.ts"), "utf8");

const imageIndex = displaySource.indexOf("<CustomerDisplayProductImage");
const nameIndex = displaySource.indexOf("{localizedProductName(item, locale)}", imageIndex);
assert(imageIndex >= 0 && nameIndex > imageIndex, "image must render before product name");
assert(displaySource.includes("size-14 shrink-0"), "image slot must remain fixed at 56px");
assert(displaySource.includes('loading="lazy"') && displaySource.includes('decoding="async"'), "images must use lazy async loading");
assert(displaySource.includes("onError={() => setFailed(true)}"), "failed image must switch to placeholder");
assert(displaySource.includes("<Package"), "neutral placeholder icon must be present");
assert(helperSource.includes("item.units?.find((unit) => unit.id === item.unitId)"), "sold unit must be resolved by unitId");
assert(helperSource.includes("productThumbnailUrl") && helperSource.includes("productImageUrl"), "base image fallback must be supported");
assert(imageDeliverySource.includes("thumbnailDeliveryFor") && imageDeliverySource.includes("thumbPathFromMain"), "existing signed thumbnail path must be used");
assert(heldCartSource.includes("productThumbnailUrl") && heldCartSource.includes("imageThumbUrl"), "held carts must preserve image fields");
assert(posSource.includes("DemoStorageKeys.customerDisplayState"), "customer display sync key must remain unchanged");
assert(displaySource.includes("displayState.totalLak") && displaySource.includes("item.priceLak * item.quantity"), "totals must remain unchanged");
assert(displaySource.includes("QrOverlay"), "QR overlay must remain in place");

console.log("PASS: Customer Display product image priority, fallback, layout, and sync checks");
