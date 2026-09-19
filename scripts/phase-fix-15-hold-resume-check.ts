import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasRestorableHeldCart,
  heldCartSummary,
  heldSaleCartItems,
  pickRestorableHeldSale,
  restoreCartFromHeldSale,
  slimHeldSnapshot,
  slimPosCartItem,
  snapshotContainsEmbeddedImages,
} from "../features/pos/held-cart";
import { planPosCartAdd } from "../features/pos/pos-cart";
import type { HeldSale, PosCartItem, PosProduct, PosProductUnit } from "../features/pos/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const results: Array<{ name: string; status: "FAIL" | "PASS"; detail?: string }> = [];

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
    imageUrl: `data:image/jpeg;base64,${"A".repeat(200)}`,
    ...overrides,
  };
}

function pepsiProduct(stockQty = 18): PosProduct {
  const units = [
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
    id: "pepsi-320",
    imageKey: `data:image/jpeg;base64,${"B".repeat(200)}`,
    nameEn: "PEPSI 320ml",
    nameLo: "PEPSI 320ml",
    priceLak: 11000,
    sku: "PEPSI-320ML-0384",
    stockQty,
    unitId: "pepsi-piece",
    unitImageUrl: `data:image/jpeg;base64,${"C".repeat(200)}`,
    unitName: "Piece",
    units,
  };
}

function addLine(product: PosProduct, unitId: string, cart: PosCartItem[] = []) {
  const unit = product.units?.find((item) => item.id === unitId);
  const planned = planPosCartAdd(cart, product, unit, { stockQty: product.stockQty });
  assert(planned.result?.added, "fixture add must succeed");
  return planned.result.cart;
}

function heldSaleFromCart(id: string, cart: PosCartItem[], extra: Partial<HeldSale> = {}): HeldSale {
  const snapshot = slimHeldSnapshot({
    appliedPromotions: [],
    cardAmount: 0,
    cashAmount: 11000,
    cartItems: cart,
    customer: extra.snapshot?.customer ?? null,
    discountAmount: extra.snapshot?.discountAmount ?? 0,
    discountPercent: extra.snapshot?.discountPercent ?? 0,
    membershipDiscountLak: 0,
    paymentMode: "cash",
    qrAmount: 0,
    redeemPoints: 0,
    taxAmount: 0,
    taxEnabled: true,
    taxRatePercent: 0,
    transferAmount: 0,
  });
  return {
    createdAt: new Date().toISOString(),
    id,
    itemCount: cart.reduce((total, item) => total + item.quantity, 0),
    items: snapshot?.cartItems ?? cart,
    saleNo: extra.saleNo ?? "HOLD-FIXTURE",
    snapshot,
    totalLak: heldCartSummary(snapshot?.cartItems ?? cart).totalLak,
    ...extra,
  };
}

const repoSrc = readFileSync(join(process.cwd(), "features/pos/held-bills-repository.ts"), "utf8");
const clientSrc = readFileSync(join(process.cwd(), "features/pos/components/pos-page-client.tsx"), "utf8");
const posLoaderSrc = readFileSync(join(process.cwd(), "scripts/phase-perf-02-pos-loader-check.ts"), "utf8");
const posPageSrc = readFileSync(join(process.cwd(), "features/pos/prisma-repository.ts"), "utf8");

check("forensic hold fields map onto PosCartItem", () => {
  const fat = addLine(pepsiProduct(18), "pepsi-piece");
  const item = fat[0];
  assert(item.id === "pepsi-320", "productId");
  assert(item.nameEn === "PEPSI 320ml", "name");
  assert(item.barcode === "8859313502907", "barcode");
  assert(item.unitId === "pepsi-piece", "unitId");
  assert(item.unitName === "Piece", "unit");
  assert(item.conversionQty === 1, "conversion");
  assert(item.quantity === 1, "qty");
  assert(item.priceLak === 11000, "price");
  assert(item.stockQty === 18, "stockQty");
});

check("slim snapshot strips embedded images", () => {
  const fat = addLine(pepsiProduct(18), "pepsi-piece");
  const fatSnapshot = {
    appliedPromotions: [],
    cardAmount: 0,
    cashAmount: 0,
    cartItems: fat,
    customer: null,
    discountAmount: 0,
    discountPercent: 0,
    membershipDiscountLak: 0,
    paymentMode: "cash" as const,
    qrAmount: 0,
    redeemPoints: 0,
    taxAmount: 0,
    taxEnabled: true,
    taxRatePercent: 0,
    transferAmount: 0,
  };
  assert(snapshotContainsEmbeddedImages(fatSnapshot), "fixture must start fat");
  const slim = slimHeldSnapshot(fatSnapshot);
  assert(slim && !snapshotContainsEmbeddedImages(slim), "slim must drop data URLs");
  assert(slim.cartItems[0].imageKey === "generic", "imageKey compacted");
  assert(slim.cartItems[0].units?.[0].imageUrl === undefined, "unit imageUrl dropped");
  assert(slim.cartItems[0].priceLak === 11000, "price kept");
  assert(slim.cartItems[0].unitId === "pepsi-piece", "unit kept");
});

check("single-line resume restores cart immediately and stays stable", () => {
  const local = heldSaleFromCart("hold-1", addLine(pepsiProduct(18), "pepsi-piece"));
  const emptyServer: HeldSale = { ...local, items: [], snapshot: { ...local.snapshot!, cartItems: [] } };
  const restorable = pickRestorableHeldSale(emptyServer, local);
  assert(hasRestorableHeldCart(restorable), "fallback to local payload");
  const restored = restoreCartFromHeldSale(restorable);
  const snapshots = [0, 100, 500, 1000].map(() => heldCartSummary(restored));
  for (const snap of snapshots) {
    assert(snap.lineCount === 1, "1 line");
    assert(snap.quantity === 1, "qty 1");
    assert(snap.headerCount === 1, "header 1");
    assert(snap.totalLak === 11000, "total 11000");
  }
});

check("server payload is preferred when it contains lines", () => {
  const local = heldSaleFromCart("hold-1", addLine(pepsiProduct(18), "pepsi-piece"));
  const serverCart = addLine(pepsiProduct(18), "pepsi-piece");
  serverCart[0].quantity = 1;
  const server = heldSaleFromCart("hold-1", serverCart, { saleNo: "HOLD-SERVER" });
  const picked = pickRestorableHeldSale(server, local);
  assert(picked.saleNo === "HOLD-SERVER", "server sale wins when complete");
});

check("multi-line Piece + Pack resume", () => {
  const product = pepsiProduct(18);
  const cart = addLine(product, "pepsi-pack", addLine(product, "pepsi-piece"));
  const sale = heldSaleFromCart("hold-multi", cart);
  const restored = restoreCartFromHeldSale(sale);
  const summary = heldCartSummary(restored);
  assert(restored.length === 2, "two lines");
  assert(restored.some((item) => item.unitName === "Piece" && item.priceLak === 11000 && item.conversionQty === 1), "piece");
  assert(restored.some((item) => item.unitName === "Pack" && item.priceLak === 132000 && item.conversionQty === 12), "pack");
  assert(summary.totalLak === 143000, `total ${summary.totalLak}`);
});

check("customer and discount context survive slim/restore", () => {
  const cart = addLine(pepsiProduct(18), "pepsi-piece");
  const sale = heldSaleFromCart("hold-member", cart);
  sale.snapshot = slimHeldSnapshot({
    ...sale.snapshot!,
    customer: {
      customerCode: "C1",
      id: "cust-1",
      membershipExpiry: "",
      membershipNumber: "M1",
      membershipStatus: "Active",
      membershipType: "Monthly",
      name: "Walk-in Member",
      phone: "020",
      pointsBalance: 10,
    },
    discountAmount: 1000,
    discountPercent: 0,
  });
  assert(sale.snapshot?.customer?.id === "cust-1", "customer kept");
  assert(sale.snapshot?.discountAmount === 1000, "discount kept");
  assert(sale.snapshot?.appliedPromotions?.length === 0, "promotions stay empty when none persisted");
});

check("old empty-server restore reproduces the Production failure", () => {
  const local = heldSaleFromCart("hold-1", addLine(pepsiProduct(18), "pepsi-piece"));
  const brokenServer: HeldSale = { createdAt: local.createdAt, id: local.id, itemCount: 0, items: [], saleNo: local.saleNo, totalLak: 11000 };
  const oldRestore = brokenServer.snapshot?.cartItems ?? brokenServer.items;
  assert(oldRestore.length === 0, "old path leaves cart empty");
  const fixed = restoreCartFromHeldSale(pickRestorableHeldSale(brokenServer, local));
  assert(fixed.length === 1 && heldCartSummary(fixed).totalLak === 11000, "new path restores from local hold");
});

check("repository keeps Hold reserving after Resume (not terminal)", () => {
  assert(repoSrc.includes('status: { in: [...HOLD_RESERVING_STATUSES] }') || repoSrc.includes("HOLD_RESERVING_STATUSES"), "resume targets reserving statuses");
  assert(repoSrc.includes("resumedAt: new Date()"), "records resume interaction");
  assert(!repoSrc.includes('status: "resumed"'), "Resume must not terminal-status the Hold");
  assert(repoSrc.includes("stockReservation.create") || repoSrc.includes("stockReservation"), "creates reservations");
  assert(repoSrc.includes("slimHeldSnapshot"), "resume DTO is slimmed");
  assert(repoSrc.includes("You can only access your own held bills."), "ownership enforced");
});

check("client commits restored cart through ref + setCartItems", () => {
  const resumeFn = clientSrc.slice(
    clientSrc.indexOf("async function resumeHeldBillToCart"),
    clientSrc.indexOf("async function holdCurrentAndResume"),
  );
  assert(clientSrc.includes("cartItemsRef.current = restored"), "ref commit");
  assert(clientSrc.includes("setCartItems(restored)"), "state commit");
  assert(clientSrc.includes("pickRestorableHeldSale(result.sale, heldSale)"), "fallback to local hold");
  assert(clientSrc.includes("slimHeldSnapshot"), "hold persist slims images");
  assert(clientSrc.includes("if (cartItems.length > 0)"), "conflict path kept");
  assert(!resumeFn.includes("router.refresh()"), "resume must not refresh page props");
  assert(!resumeFn.includes("clearSale("), "resume must not clear the restored cart");
});

check("held bills remain deferred on first paint", () => {
  assert(posLoaderSrc.includes("Held/recent sales are not fetched on POS mount"), "perf check still asserts deferral");
  assert(!clientSrc.includes("void refreshRecentSalesFromServer();\n        void refreshHeldBillsFromServer();"), "no mount fetch");
  assert(posPageSrc.includes("getOpenCashSession(tenant, { scope })"), "scope reuse kept");
});

check("slim item keeps required cart fields", () => {
  const slim = slimPosCartItem(addLine(pepsiProduct(18), "pepsi-piece")[0]);
  for (const field of ["id", "barcode", "unitId", "unitName", "quantity", "conversionQty", "priceLak", "stockQty"] as const) {
    assert(slim[field] != null && slim[field] !== "", field);
  }
  assert(heldSaleCartItems(heldSaleFromCart("x", [slim])).length === 1, "items helper");
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  throw new Error(`FIX-15 hold/resume checks failed: ${failed.length}`);
}
console.log(`\nFIX-15 hold/resume checks passed: ${results.length}`);
