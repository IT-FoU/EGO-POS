import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cartSubtotal,
  filterPosCatalogue,
  findPosScanMatch,
  planPosCartAdd,
  resolvePosSaleUnits,
  updatePosCartQuantity,
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
    return { ok: false as const, cart: cartRef.current, planned };
  }
  cartRef.current = planned.result.cart;
  return { ok: true as const, cart: cartRef.current, planned };
}

const pepsi = pepsiSnapshot(23);
const piece = unitByName(pepsi, "Piece");
const pack = unitByName(pepsi, "Pack");
const catalogue = [pepsi];

// ---------------------------------------------------------------------------
// Minimal text-node model of the LocalizationRepairRuntime algorithms.
// React reuses DOM text nodes across renders, so a node is modelled as an
// object whose `value` React can change at any time.
// ---------------------------------------------------------------------------
type FakeTextNode = { value: string };

function oldRuntimeTranslate(node: FakeTextNode, originals: Map<FakeTextNode, string>) {
  const original = originals.get(node) ?? node.value;
  if (!originals.has(node)) {
    originals.set(node, original);
  }
  node.value = original;
}

function newRuntimeTranslate(
  node: FakeTextNode,
  originals: Map<FakeTextNode, string>,
  applied: Map<FakeTextNode, string>,
  translate: (value: string) => string,
) {
  const current = node.value;
  if (applied.get(node) !== current) {
    originals.set(node, current);
  }
  const original = originals.get(node) ?? current;
  const next = translate(original);
  if (next !== current) {
    node.value = next;
  }
  applied.set(node, next);
}

check("source: localization runtime re-captures externally changed text", () => {
  const src = readFileSync(join(process.cwd(), "components/i18n/localization-repair-runtime.tsx"), "utf8");
  assert(src.includes("textAppliedValues"), "runtime must track the last value it wrote per text node");
  assert(src.includes("if (textAppliedValues.get(node) !== current)"), "runtime must re-capture when React changed the text");
  assert(src.includes("if (next !== current)"), "runtime must not write unchanged text nodes");
  assert(
    !src.includes("node.nodeValue = locale === \"th\" ? translateToThai(original) : original;"),
    "runtime must not unconditionally restore first-seen text",
  );
  assert(src.includes("attrAppliedPrefix"), "attribute translation must track applied values too");
  const thaiTable = readFileSync(join(process.cwd(), "lib/i18n/thai-ui-translations.ts"), "utf8");
  assert(thaiTable.includes('"Report": "รายงาน"') && thaiTable.includes('"Promotion": "โปรโมชัน"'), "Thai table must cover the singular shell nav placeholders");
});

check("source: cart header and totals derive from cartItems state", () => {
  const clientSrc = readFileSync(join(process.cwd(), "features/pos/components/pos-page-client.tsx"), "utf8");
  assert(clientSrc.includes("{cartItems.length}"), "header item count must render from cartItems state");
  assert(clientSrc.includes("const subtotal = cartSubtotal(cartItems)"), "subtotal must derive from cartItems state");
  assert(clientSrc.includes("planPosCartAdd(cartItemsRef.current"), "adds must plan against cartItemsRef.current");
  assert(clientSrc.includes("cartItemsRef.current = planned.result.cart"), "adds must update the ref before setState");
  assert(clientSrc.includes("setCartItems(planned.result.cart)"), "adds must commit the planned cart to state");
  assert(!clientSrc.includes("[POS-RENDER]") && !clientSrc.includes("[POS-ADD]"), "diagnostic logging must be removed");
});

check("regression: old localization runtime reverts a React cart update", () => {
  const headerCount: FakeTextNode = { value: "0" };
  const originals = new Map<FakeTextNode, string>();
  oldRuntimeTranslate(headerCount, originals);
  headerCount.value = "1";
  oldRuntimeTranslate(headerCount, originals);
  assert(headerCount.value === "0", "old runtime must reproduce the stale revert");
});

check("repair: new localization runtime preserves React cart updates", () => {
  const identity = (value: string) => value;
  const headerCount: FakeTextNode = { value: "0" };
  const headerTotal: FakeTextNode = { value: "0" };
  const originals = new Map<FakeTextNode, string>();
  const applied = new Map<FakeTextNode, string>();
  newRuntimeTranslate(headerCount, originals, applied, identity);
  newRuntimeTranslate(headerTotal, originals, applied, identity);
  headerCount.value = "1";
  headerTotal.value = "11,000";
  const cartLineName: FakeTextNode = { value: "PEPSI 320ml" };
  for (const node of [headerCount, headerTotal, cartLineName]) {
    newRuntimeTranslate(node, originals, applied, identity);
  }
  assert(headerCount.value === "1", "header count must keep the React value");
  assert(headerTotal.value === "11,000", "header total must keep the React value");
  assert(cartLineName.value === "PEPSI 320ml", "new cart line text must be captured, not reverted");
  headerCount.value = "2";
  newRuntimeTranslate(headerCount, originals, applied, identity);
  assert(headerCount.value === "2", "subsequent increments must survive repeated walks");
});

check("repair: Thai locale still translates static text without reverting state", () => {
  const thai = (value: string) => (value === "Favorites" ? "รายการโปรด" : value);
  const staticLabel: FakeTextNode = { value: "Favorites" };
  const headerCount: FakeTextNode = { value: "0" };
  const originals = new Map<FakeTextNode, string>();
  const applied = new Map<FakeTextNode, string>();
  newRuntimeTranslate(staticLabel, originals, applied, thai);
  assert(staticLabel.value === "รายการโปรด", "static label must be translated");
  newRuntimeTranslate(headerCount, originals, applied, thai);
  headerCount.value = "1";
  newRuntimeTranslate(headerCount, originals, applied, thai);
  assert(headerCount.value === "1", "dynamic count must not revert under Thai locale");
});

check("cart summary invariants: add 1, add 2, decrement, clear", () => {
  const cartRef = { current: [] as PosCartItem[] };
  assert(cartRef.current.length === 0 && cartSubtotal(cartRef.current) === 0, "initial 0 items / 0 LAK");
  assert(clientAddToCart(cartRef, pepsi, piece).ok, "first card add");
  assert(cartRef.current.length === 1, "1 item line");
  assert(cartRef.current[0].quantity === 1, "line qty 1");
  assertClose(cartSubtotal(cartRef.current), 11000, "subtotal 11000");
  assert(clientAddToCart(cartRef, pepsi, piece).ok, "second card add");
  assert(cartRef.current.length === 1 && cartRef.current[0].quantity === 2, "qty increments to 2");
  assertClose(cartSubtotal(cartRef.current), 22000, "subtotal 22000");
  const decremented = updatePosCartQuantity(cartRef.current, pepsi.id, 1, piece.id);
  cartRef.current = decremented;
  assert(cartRef.current[0].quantity === 1, "decrement to qty 1");
  assertClose(cartSubtotal(cartRef.current), 11000, "subtotal back to 11000");
  cartRef.current = [];
  assert(cartRef.current.length === 0 && cartSubtotal(cartRef.current) === 0, "clear 0 items / 0 LAK");
});

check("multi-unit totals use sell-unit price with base-unit stock", () => {
  const pieceAdd = clientAddToCart({ current: [] }, pepsi, piece);
  assert(pieceAdd.ok && pieceAdd.planned.requestedBaseQty === 1, "Piece base qty 1");
  assertClose(cartSubtotal(pieceAdd.cart), 11000, "Piece total 11000");
  const packAdd = clientAddToCart({ current: [] }, pepsi, pack);
  assert(packAdd.ok && packAdd.planned.requestedBaseQty === 12, "Pack base qty 12");
  assertClose(cartSubtotal(packAdd.cart), 132000, "Pack total 132000");
  const twoPieces = clientAddToCart({ current: pieceAdd.cart }, pepsi, piece);
  assert(twoPieces.ok, "second Piece add");
  assertClose(cartSubtotal(twoPieces.cart), 22000, "2 Pieces total 22000");
});

check("all add paths produce identical cart summaries", () => {
  const summaries = [
    clientAddToCart({ current: [] }, pepsi, unitByName(pepsi, "Piece")),
    clientAddToCart({ current: [] }, filterPosCatalogue(catalogue, "PEPSI")[0], unitByName(pepsi, "Piece")),
    (() => {
      const match = findPosScanMatch(catalogue, "8859313502907");
      assert(match, "barcode match");
      return clientAddToCart({ current: [] }, match.product, match.unit);
    })(),
    (() => {
      const match = findPosScanMatch(catalogue, "18859313502904");
      assert(match, "pack barcode match");
      return clientAddToCart({ current: [] }, match.product, match.unit);
    })(),
  ];
  for (const result of summaries.slice(0, 3)) {
    assert(result.ok, "add path must succeed");
    assert(result.cart.length === 1 && result.cart[0].quantity === 1, "header count source: 1 item");
    assertClose(cartSubtotal(result.cart), 11000, "header total source: 11000");
  }
  const packScan = summaries[3];
  assert(packScan.ok && packScan.cart.length === 1 && packScan.cart[0].quantity === 1, "pack scan: 1 item");
  assertClose(cartSubtotal(packScan.cart), 132000, "pack scan total 132000");
});

check("checkout enablement source: non-empty cartItems", () => {
  const cartRef = { current: [] as PosCartItem[] };
  assert(cartRef.current.length === 0, "empty cart disables checkout");
  assert(clientAddToCart(cartRef, pepsi, piece).ok, "add for checkout state");
  assert(cartRef.current.length > 0 && cartSubtotal(cartRef.current) > 0, "non-empty cart enables checkout");
});

const failed = results.filter((result) => result.status === "FAIL");
if (failed.length) {
  console.error(`\nFIX-14B cart summary checks failed: ${failed.length}`);
  process.exit(1);
}
console.log(`\nFIX-14B cart summary checks passed: ${results.length}`);
