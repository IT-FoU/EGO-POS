import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mapPrismaPosProduct } from "../features/pos/dto-mapper";
import {
  addPosCartLine,
  cartExceedsStock,
  cartSubtotal,
  filterPosCatalogue,
  findPosScanMatch,
  maxSellQty,
  planPosCartAdd,
  productWithSaleUnit,
  requiredBaseQty,
  resolvePosSaleUnits,
  updatePosCartQuantity,
  type AddPosCartResult,
} from "../features/pos/pos-cart";
import type { PosCartItem, PosProduct, PosProductUnit } from "../features/pos/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual: unknown, expected: number, message: string) {
  const value = Number(actual);
  if (!Number.isFinite(value) || Math.abs(value - expected) > 1e-9) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
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

function pepsiUnit(overrides: Partial<PosProductUnit> & Pick<PosProductUnit, "id" | "unitName" | "conversionQty" | "barcode">): PosProductUnit {
  return {
    allowManualUnitSelect: true,
    costPriceLak: 8000 * overrides.conversionQty,
    isBaseUnit: false,
    isDefaultSaleUnit: false,
    isPurchaseUnit: false,
    sellingPriceLak: 11000 * overrides.conversionQty,
    sortOrder: 0,
    status: "active",
    ...overrides,
  };
}

function pepsiSnapshot(stockQty = 23): PosProduct {
  const units: PosProductUnit[] = [
    pepsiUnit({
      barcode: "8859313502907",
      conversionQty: 1,
      costPriceLak: 8000,
      id: "pepsi-piece",
      isBaseUnit: true,
      isDefaultSaleUnit: true,
      isPurchaseUnit: true,
      sellingPriceLak: 11000,
      sortOrder: 0,
      unitName: "Piece",
    }),
    pepsiUnit({
      barcode: "18859313502904",
      conversionQty: 12,
      id: "pepsi-pack",
      sellingPriceLak: 132000,
      sortOrder: 1,
      unitName: "Pack",
    }),
    pepsiUnit({
      barcode: "",
      conversionQty: 24,
      id: "pepsi-box",
      sellingPriceLak: 264000,
      sortOrder: 2,
      unitName: "Box",
    }),
  ];
  return {
    barcode: "8859313502907",
    categoryName: "Drinks",
    conversionQty: 1,
    costPriceLak: 8000,
    id: "cmtdzscjq0006psp7x55deom2",
    imageKey: "generic",
    nameEn: "PEPSI 320ml",
    nameLo: "PEPSI 320ml",
    priceLak: 11000,
    productCode: "PEPSI-320ML-0384",
    sku: "PEPSI-320ML-0384",
    stockQty,
    unitId: "pepsi-piece",
    unitName: "Piece",
    units,
  };
}

function unitByName(product: PosProduct, unitName: string) {
  const unit = resolvePosSaleUnits(product).find((item) => item.unitName === unitName);
  assert(unit, `Missing unit ${unitName}`);
  return unit;
}

function clientAddToCart(
  cartRef: { current: PosCartItem[] },
  product: PosProduct,
  selectedUnit?: PosProductUnit,
) {
  const saleUnit = selectedUnit ?? resolvePosSaleUnits(product)[0];
  const planned = planPosCartAdd(cartRef.current, product, saleUnit);
  if (!planned.result.added) {
    return {
      ok: false as const,
      cart: cartRef.current,
      message: `Insufficient stock for ${product.nameEn}. Available ${product.stockQty}, requested ${planned.requestedBaseQty}.`,
      planned,
    };
  }
  cartRef.current = planned.result.cart;
  return { ok: true as const, cart: cartRef.current, planned };
}

function addUntil(product: PosProduct, unit: PosProductUnit, times: number) {
  const cartRef = { current: [] as PosCartItem[] };
  let last = clientAddToCart(cartRef, product, unit);
  for (let index = 1; index < times; index += 1) {
    last = clientAddToCart(cartRef, product, unit);
  }
  return last;
}

function brokenAddToCartReadsUpdaterResult(product: PosProduct, selectedUnit?: PosProductUnit) {
  const saleUnit = selectedUnit ?? resolvePosSaleUnits(product)[0];
  const unitProduct = saleUnit ? productWithSaleUnit(product, saleUnit) : product;
  let result: AddPosCartResult | undefined;
  const queued: Array<(current: PosCartItem[]) => PosCartItem[]> = [];
  const setCartItems = (updater: (current: PosCartItem[]) => PosCartItem[]) => {
    queued.push(updater);
  };
  setCartItems((current) => {
    result = addPosCartLine(current, {
      ...unitProduct,
      id: product.id,
      quantity: 1,
      retailPriceLak: unitProduct.priceLak,
    });
    return result.cart;
  });
  const requested = saleUnit?.conversionQty ?? unitProduct.conversionQty ?? 1;
  return {
    condition: "!result?.added",
    queuedCount: queued.length,
    rejected: !result?.added,
    requested,
    resultDefined: result !== undefined,
    message: `Insufficient stock for ${product.nameEn}. Available ${product.stockQty}, requested ${requested}.`,
  };
}

function simulateCardAdd(product: PosProduct) {
  const units = resolvePosSaleUnits(product);
  if (units.length <= 1) {
    return clientAddToCart({ current: [] }, product, units[0]);
  }
  return clientAddToCart({ current: [] }, product, unitByName(product, "Piece"));
}

function simulateNameSearchAdd(products: PosProduct[], query: string) {
  const found = filterPosCatalogue(products, query);
  assert(found.length >= 1, `Name search missed ${query}`);
  return simulateCardAdd(found[0]);
}

function simulateBarcodeAdd(products: PosProduct[], query: string) {
  const match = findPosScanMatch(products, query);
  assert(match, `Barcode/scanner missed ${query}`);
  return clientAddToCart({ current: [] }, match.product, match.unit);
}

const pepsi = pepsiSnapshot(23);
const piece = unitByName(pepsi, "Piece");
const pack = unitByName(pepsi, "Pack");
const box = unitByName(pepsi, "Box");
const catalogue = [pepsi];

check("source: add-to-cart plans stock synchronously", () => {
  const clientSrc = readFileSync(join(process.cwd(), "features/pos/components/pos-page-client.tsx"), "utf8");
  assert(clientSrc.includes("planPosCartAdd(cartItemsRef.current"), "addToCart must call planPosCartAdd against the current cart ref");
  assert(clientSrc.includes("setCartItems(planned.result.cart)"), "successful add must set the planned cart");
  assert(!clientSrc.includes("let result: AddPosCartResult"), "must not read a deferred setState updater result");
  assert(!clientSrc.includes("function getSaleUnits"), "sale units must be centralized");
  assert(clientSrc.includes("resolvePosSaleUnits(product)"), "all add paths must share resolvePosSaleUnits");
});

check("source: checkout server stock protection unchanged", () => {
  const repo = readFileSync(join(process.cwd(), "features/pos/prisma-repository.ts"), "utf8");
  assert(repo.includes("applyAtomicStockDelta"), "checkout must still apply atomic stock deltas");
  assert(repo.includes("if (afterQty < 0)"), "checkout must still reject overselling");
  assert(
    repo.includes("throw new Error(`Insufficient stock for product ${item.productId}. Available ${beforeQty}, requested ${item.baseQuantity}.`)"),
    "checkout insufficient-stock throw must remain",
  );
  assert(repo.includes("lockInventoryMutationKey"), "checkout must still lock inventory");
  assert(repo.includes("consumeInventoryForSale"), "checkout must still consume lots");
});

check("mapper: Production-shaped PEPSI snapshot", () => {
  const mapped = mapPrismaPosProduct(
    {
      barcode: "8859313502907",
      costPriceLak: "8000",
      id: "cmtdzscjq0006psp7x55deom2",
      nameEn: "PEPSI 320ml",
      nameLo: "PEPSI 320ml",
      sellingPriceLak: "11000",
      sku: "PEPSI-320ML-0384",
      balances: [{ quantity: "23", warehouseId: "main" }],
      units: [
        {
          allowManualUnitSelect: true,
          barcode: "8859313502907",
          conversionQty: "1",
          costPriceLak: "8000",
          id: "pepsi-piece",
          isBaseUnit: true,
          isDefaultSaleUnit: true,
          isPurchaseUnit: true,
          sellingPriceLak: "11000",
          sortOrder: "0",
          status: "active",
          unitName: "Piece",
        },
        {
          barcode: "18859313502904",
          conversionQty: "12",
          id: "pepsi-pack",
          isBaseUnit: false,
          isDefaultSaleUnit: false,
          sellingPriceLak: "132000",
          sortOrder: "1",
          status: "active",
          unitName: "Pack",
        },
        {
          barcode: "",
          conversionQty: "24",
          id: "pepsi-box",
          isBaseUnit: false,
          isDefaultSaleUnit: false,
          sellingPriceLak: "264000",
          sortOrder: "2",
          status: "active",
          unitName: "Box",
        },
      ],
    },
    "main",
  );
  assert(mapped.stockQty === 23 && typeof mapped.stockQty === "number", "stockQty must be number 23");
  assert(mapped.conversionQty === 1 && typeof mapped.conversionQty === "number", "default conversion must be Piece 1");
  assert(mapped.priceLak === 11000, "selling price must be 11000");
  const mappedPiece = mapped.units?.find((unit) => unit.unitName === "Piece");
  assert(mappedPiece?.conversionQty === 1 && typeof mappedPiece.conversionQty === "number", "Piece conversion must be number 1");
  const planned = planPosCartAdd([], mapped, mappedPiece);
  assert(planned.result.added, "mapped PEPSI Piece qty 1 must add");
  assertClose(planned.requestedBaseQty, 1, "mapped Piece requestedBaseQty");
  assertClose(planned.maxSellableQty, 23, "mapped Piece maxSellableQty");
});

check("invariant: requestedBaseQty = sellQty × conversion", () => {
  assertClose(requiredBaseQty(1, 1), 1, "Piece");
  assertClose(requiredBaseQty(1, 12), 12, "Pack");
  assertClose(requiredBaseQty(4, 6), 24, "4 packages of 6");
  assertClose(requiredBaseQty(5, 6), 30, "5 packages of 6");
  assert(maxSellQty(23, 1) === 23, "23/1");
  assert(maxSellQty(23, 12) === 1, "23/12");
  assert(maxSellQty(23, 24) === 0, "23/24");
  assert(maxSellQty(24, 6) === 4, "24/6");
});

check("regression: deferred setState result false-rejects PEPSI qty 1", () => {
  const broken = brokenAddToCartReadsUpdaterResult(pepsi, piece);
  assert(broken.rejected, "old pattern must reject before the updater runs");
  assert(broken.resultDefined === false, "result stays undefined while the updater is queued");
  assert(broken.queuedCount === 1, "updater was queued, not executed");
  assert(broken.requested === 1, "banner requested conversion 1");
  assert(
    broken.message === "Insufficient stock for PEPSI 320ml. Available 23, requested 1.",
    `unexpected banner: ${broken.message}`,
  );
});

check("repair: synchronous plan accepts PEPSI qty 1", () => {
  const planned = planPosCartAdd([], pepsi, piece);
  assert(typeof pepsi.stockQty === "number" && pepsi.stockQty === 23, "product.stockQty");
  assert(typeof planned.maxSellableQty === "number" && planned.maxSellableQty === 23, "maxSellableQty");
  assert(planned.requestedSellQty === 1 && typeof planned.requestedSellQty === "number", "requestedSellQty");
  assert(planned.requestedBaseQty === 1 && typeof planned.requestedBaseQty === "number", "requestedBaseQty");
  assert(planned.saleUnit.conversionQty === 1 && typeof planned.saleUnit.conversionQty === "number", "conversionFactor");
  assert(planned.saleUnit.unitName === "Piece", "selected unit");
  assert(planned.result.added, "qty 1 must add");
  assertClose(cartSubtotal(planned.result.cart), 11000, "subtotal");
  assert(planned.result.cart[0].quantity === 1, "cart qty");
  const condition = planned.requestedBaseQty > pepsi.stockQty || planned.maxSellableQty < 1;
  assert(condition === false, "eligibility condition must be false for stock 23 / qty 1");
});

check("boundary: stock 23 / qty 1 PASS", () => {
  const last = addUntil(pepsi, piece, 1);
  assert(last.ok && last.cart[0].quantity === 1, "qty 1");
});

check("boundary: stock 23 / qty 22 PASS", () => {
  const last = addUntil(pepsi, piece, 22);
  assert(last.ok && last.cart[0].quantity === 22, "qty 22");
});

check("boundary: stock 23 / qty 23 PASS", () => {
  const last = addUntil(pepsi, piece, 23);
  assert(last.ok && last.cart[0].quantity === 23, "qty 23");
  const direct = updatePosCartQuantity(last.cart, pepsi.id, 23, piece.id);
  assert(direct[0].quantity === 23, "stepper qty 23");
});

check("boundary: stock 23 / qty 24 REJECT", () => {
  const last = addUntil(pepsi, piece, 24);
  assert(!last.ok, "24th Piece must reject");
  assert(last.cart[0]?.quantity === 23, "cart stays at 23");
  assert(last.message.includes("Available 23, requested 1"), last.message);
  const overflow = updatePosCartQuantity(addUntil(pepsi, piece, 23).cart, pepsi.id, 24, piece.id);
  assert(overflow[0].quantity === 23, "stepper must cap at 23");
});

check("boundary: zero stock / qty 1 REJECT", () => {
  const empty = pepsiSnapshot(0);
  const last = clientAddToCart({ current: [] }, empty, unitByName(empty, "Piece"));
  assert(!last.ok && last.cart.length === 0, "zero stock must not enter cart");
});

check("package: conversion 6 against stock 24", () => {
  const packed: PosProduct = {
    ...pepsiSnapshot(24),
    conversionQty: 1,
    units: [
      pepsiUnit({ barcode: "pack-base", conversionQty: 1, id: "base", isBaseUnit: true, isDefaultSaleUnit: true, unitName: "Piece" }),
      pepsiUnit({ barcode: "pack-6", conversionQty: 6, id: "six", sellingPriceLak: 66000, unitName: "Pack6" }),
    ],
  };
  packed.stockQty = 24;
  const pack6 = unitByName(packed, "Pack6");
  const one = addUntil(packed, pack6, 1);
  assert(one.ok && one.planned.requestedBaseQty === 6, "1 pack requires 6");
  const four = addUntil(packed, pack6, 4);
  assert(four.ok && four.cart[0].quantity === 4, "4 packs require 24");
  assertClose(requiredBaseQty(4, 6), 24, "4×6");
  const five = addUntil(packed, pack6, 5);
  assert(!five.ok && five.cart[0].quantity === 4, "5th pack must reject");
});

check("package: PEPSI Pack 12 and Box 24 against stock 23", () => {
  const onePack = clientAddToCart({ current: [] }, pepsi, pack);
  assert(onePack.ok && onePack.planned.requestedBaseQty === 12, "1 pack requires 12");
  const twoPack = addUntil(pepsi, pack, 2);
  assert(!twoPack.ok && twoPack.cart[0].quantity === 1, "2 packs require 24 and must reject");
  const oneBox = clientAddToCart({ current: [] }, pepsi, box);
  assert(!oneBox.ok && oneBox.cart.length === 0, "Box 24 against 23 must reject");
  assert(oneBox.planned.requestedBaseQty === 24, "Box requestedBaseQty");
});

check("entry paths share the same planner", () => {
  const card = simulateCardAdd(pepsi);
  const name = simulateNameSearchAdd(catalogue, "PEPSI");
  const barcode = simulateBarcodeAdd(catalogue, "8859313502907");
  const scanner = simulateBarcodeAdd(catalogue, "8859313502907");
  for (const result of [card, name, barcode, scanner]) {
    assert(result.ok, "entry path must add Piece qty 1");
    assert(result.planned.saleUnit.unitName === "Piece", "barcode 8859313502907 must select Piece");
    assertClose(result.planned.requestedBaseQty, 1, "requested base qty");
    assertClose(cartSubtotal(result.cart), 11000, "subtotal");
    assert(result.cart[0].quantity === 1, "clear-cart equivalent isolated add");
  }
  const packScan = simulateBarcodeAdd(catalogue, "18859313502904");
  assert(packScan.ok && packScan.planned.saleUnit.unitName === "Pack", "pack barcode selects Pack");
  assertClose(packScan.planned.requestedBaseQty, 12, "pack requested base");
});

check("repeated / rapid barcode increments then caps", () => {
  const cartRef = { current: [] as PosCartItem[] };
  for (let index = 0; index < 8; index += 1) {
    const match = findPosScanMatch(catalogue, "8859313502907");
    assert(match, "rapid scan missed barcode");
    const added = clientAddToCart(cartRef, match.product, match.unit);
    assert(added.ok, `rapid scan ${index + 1} must add`);
  }
  assert(cartRef.current.length === 1 && cartRef.current[0].quantity === 8, "rapid scans increment one line");
  for (let index = 8; index < 23; index += 1) {
    const match = findPosScanMatch(catalogue, "8859313502907");
    assert(match && clientAddToCart(cartRef, match.product, match.unit).ok, "fill to 23");
  }
  const match = findPosScanMatch(catalogue, "8859313502907");
  assert(match, "cap scan missed barcode");
  const capped = clientAddToCart(cartRef, match.product, match.unit);
  assert(!capped.ok && cartRef.current[0].quantity === 23, "24th rapid scan must reject");
});

check("client checkout guard still uses product.stockQty", () => {
  const oversold: PosCartItem[] = [{
    ...pepsi,
    conversionQty: 1,
    quantity: 24,
    retailPriceLak: 11000,
    unitId: piece.id,
    unitName: "Piece",
  }];
  const message = cartExceedsStock(oversold, [pepsi]);
  assert(message?.includes("Available 23, requested 24"), String(message));
  assert(cartExceedsStock(addUntil(pepsi, piece, 23).cart, [pepsi]) === null, "qty 23 must pass client checkout guard");
});

const failed = results.filter((result) => result.status === "FAIL");
if (failed.length) {
  console.error(`\nFIX-14 cart stock checks failed: ${failed.length}`);
  process.exit(1);
}
console.log(`\nFIX-14 cart stock checks passed: ${results.length}`);
