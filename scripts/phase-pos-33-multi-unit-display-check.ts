import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  expandPosSellableUnitCards,
  findPosScanMatch,
  maxSellQty,
  planPosCartAdd,
  productWithSaleUnit,
  projectPosCatalogueCards,
  resolveUnitCardImageUrl,
} from "../features/pos/pos-cart";
import { DEFAULT_POS_UNIT_DISPLAY_MODE, parsePosUnitDisplayMode } from "../features/pos/pos-unit-display-settings";
import type { PosProduct, PosProductUnit } from "../features/pos/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ detail?: string; name: string; status: "FAIL" | "PASS" }> = [];

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

function product(name: string, units: PosProductUnit[], stockQty = 24): PosProduct {
  const defaultUnit = units.find((row) => row.isDefaultSaleUnit) ?? units.find((row) => row.isBaseUnit) ?? units[0]!;
  return {
    barcode: `${name}-barcode`,
    categoryName: "Drinks",
    conversionQty: defaultUnit.conversionQty,
    id: `product-${name}`,
    imageKey: "cola",
    nameEn: name,
    nameLo: name,
    priceLak: defaultUnit.sellingPriceLak,
    productImageUrl: "https://cdn.example/main.webp",
    sku: `SKU-${name}`,
    stockQty,
    unitId: defaultUnit.id,
    unitImageUrl: defaultUnit.imageUrl ?? "https://cdn.example/main.webp",
    unitName: defaultUnit.unitName,
    units,
  };
}

const root = process.cwd();
const client = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const cart = readFileSync(join(root, "features/pos/pos-cart.ts"), "utf8");
const settings = readFileSync(join(root, "features/pos/pos-unit-display-settings.ts"), "utf8");

check("default display mode is separate unit cards", () => {
  assert(DEFAULT_POS_UNIT_DISPLAY_MODE === "separate", "default separate");
  assert(parsePosUnitDisplayMode("combined") === "combined", "combined parse");
  assert(parsePosUnitDisplayMode("other") === "separate", "fallback separate");
  assert(settings.includes("ego.pos.unitDisplayMode"), "localStorage key");
  assert(!settings.includes("prisma") && !settings.includes("migrate"), "no migration");
});

check("1-4. enabled unit card expansion", () => {
  const pieceOnly = product("A", [
    unit({ id: "a-piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 20000, barcode: "P1" }),
    unit({ id: "a-pack", unitName: "Pack", status: "inactive", sellingPriceLak: 110000, barcode: "PK1", conversionQty: 6 }),
  ]);
  const piecePack = product("B", [
    unit({ id: "b-piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 20000, barcode: "P2" }),
    unit({ id: "b-pack", unitName: "Pack", sellingPriceLak: 110000, barcode: "PK2", conversionQty: 6 }),
    unit({ id: "b-box", unitName: "Box", status: "inactive", sellingPriceLak: 400000, barcode: "BX2", conversionQty: 24 }),
  ]);
  const allThree = product("C", [
    unit({ id: "c-piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 20000, barcode: "P3", imageUrl: "https://cdn.example/piece.webp" }),
    unit({ id: "c-pack", unitName: "Pack", sellingPriceLak: 110000, barcode: "PK3", conversionQty: 6, imageUrl: "https://cdn.example/pack.webp" }),
    unit({ id: "c-box", unitName: "Box", sellingPriceLak: 400000, barcode: "BX3", conversionQty: 24 }),
  ]);

  assert(expandPosSellableUnitCards([pieceOnly]).length === 1, "piece only");
  assert(expandPosSellableUnitCards([piecePack]).length === 2, "piece+pack");
  const cards = expandPosSellableUnitCards([allThree]);
  assert(cards.length === 3, "piece+pack+box");
  assert(cards.every((card) => card.id === allThree.id), "same productId");
  assert(new Set(cards.map((card) => card.unitId)).size === 3, "distinct unitIds");
  assert(!cards.some((card) => card.unitName === "Box" && card.units?.find((u) => u.id === "b-box" && u.status === "inactive")), "no inactive from B");
  assert(projectPosCatalogueCards([allThree], "combined").length === 1, "combined one card");
});

check("5-9. unit price + image priority", () => {
  const cola = product("Cola", [
    unit({ id: "piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 20000, imageUrl: "https://cdn.example/piece.webp" }),
    unit({ id: "pack", unitName: "Pack", sellingPriceLak: 110000, conversionQty: 6, imageUrl: "https://cdn.example/pack.webp" }),
    unit({ id: "box", unitName: "Box", sellingPriceLak: 400000, conversionQty: 24 }),
  ]);
  const cards = expandPosSellableUnitCards([cola]);
  assert(cards.find((c) => c.unitId === "piece")?.priceLak === 20000, "piece price");
  assert(cards.find((c) => c.unitId === "pack")?.priceLak === 110000, "pack price");
  assert(cards.find((c) => c.unitId === "box")?.priceLak === 400000, "box price");
  assert(cards.find((c) => c.unitId === "piece")?.unitImageUrl?.includes("piece"), "piece custom");
  assert(cards.find((c) => c.unitId === "pack")?.unitImageUrl?.includes("pack"), "pack custom");
  assert(cards.find((c) => c.unitId === "box")?.unitImageUrl?.includes("main"), "box main fallback");
  const noMain = { ...cola, productImageUrl: undefined, unitImageUrl: undefined };
  const boxOnly = unit({ id: "box2", unitName: "Box", sellingPriceLak: 1 });
  assert(!resolveUnitCardImageUrl(noMain, boxOnly), "placeholder path");
});

check("10-14. cart identity productId+unitId", () => {
  const beer = product("Beer", [
    unit({ id: "piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 20000, barcode: "BP" }),
    unit({ id: "pack", unitName: "Pack", sellingPriceLak: 120000, conversionQty: 6, barcode: "BPk" }),
  ], 12);
  let cart = planPosCartAdd([], beer, beer.units![0]!).result.cart;
  cart = planPosCartAdd(cart, beer, beer.units![1]!).result.cart;
  assert(cart.length === 2, "separate lines");
  assert(cart[0]!.unitId === "piece" && cart[1]!.unitId === "pack", "unit ids");
  cart = planPosCartAdd(cart, beer, beer.units![0]!).result.cart;
  assert(cart.length === 2 && cart.find((line) => line.unitId === "piece")?.quantity === 2, "qty increment");
});

check("15-17. barcode resolves exact unit + conflict", () => {
  const beer = product("Beer", [
    unit({ id: "piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 20000, barcode: "111" }),
    unit({ id: "pack", unitName: "Pack", sellingPriceLak: 120000, conversionQty: 6, barcode: "222" }),
  ]);
  const other = product("Other", [
    unit({ id: "o-piece", unitName: "Piece", isBaseUnit: true, isDefaultSaleUnit: true, sellingPriceLak: 1, barcode: "222" }),
  ]);
  const pack = findPosScanMatch([beer], "222");
  assert(pack?.unit?.id === "pack" && !pack.conflict, "pack barcode");
  const conflict = findPosScanMatch([beer, other], "222");
  assert(conflict?.conflict === true, "duplicate barcode conflict");
});

check("18-20. stock conversion availability", () => {
  assert(maxSellQty(12, 6) === 2, "pack availability");
  assert(maxSellQty(24, 24) === 1, "box availability");
  const beer = product("Beer", [
    unit({ id: "pack", unitName: "Pack", isBaseUnit: false, isDefaultSaleUnit: true, sellingPriceLak: 120000, conversionQty: 6, barcode: "PK" }),
  ], 12);
  const planned = planPosCartAdd([], beer, beer.units![0]!);
  assert(planned.requestedBaseQty === 6, "pack deducts 6");
  assert(planned.maxSellableQty === 2, "sellable packs");
});

check("client wiring + More menu Unit Display control", () => {
  assert(client.includes("projectPosCatalogueCards"), "catalogue projection");
  assert(client.includes("unitDisplayMode"), "display mode state");
  assert(client.includes("unitDisplayMode === \"separate\""), "separate click path");
  assert(client.includes("ui.barcode.conflict"), "conflict message");
  assert(client.includes("item.unitName ? ` — ${item.unitName}`"), "receipt unit");
  assert(cart.includes("expandPosSellableUnitCards"), "expand helper");
  assert(client.includes('label={t("ui.unit.display")}'), "More menu Unit Display");
  assert(client.includes('data-testid="pos-unit-display-mode"'), "mode picker");
  assert(client.includes('setPosUnitDisplayMode("separate")'), "select separate");
  assert(client.includes('setPosUnitDisplayMode("combined")'), "select combined");
  assert(client.includes("ui.unit.cards.separate.hint"), "separate hint");
  assert(client.includes("ui.unit.cards.combined.hint"), "combined hint");
  assert(!client.includes("toggleUnitDisplayMode"), "header toggle removed");
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
