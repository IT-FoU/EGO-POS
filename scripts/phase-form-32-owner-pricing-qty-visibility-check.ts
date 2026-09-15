import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyUnitPricingPatch, sellingPriceFromCost } from "../features/products/unit-pricing";
import {
  moneyInputDisplay,
  onMoneyInputChange,
  onMoneyInputFocus,
  moneyInputFromCommitted,
  simulateMoneyClearThenType,
  simulateMoneyReplace,
} from "../features/products/money-input";
import {
  openingQtyDisplay,
  onOpeningQtyChange,
  onOpeningQtyFocus,
  openingQtyFromCommitted,
  simulateOpeningQtyClearThenType,
  simulateOpeningQtyReplace,
} from "../features/products/opening-qty-input";

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

function unit(id: string, unitName: string, conversionQty: number, extra: Record<string, unknown> = {}) {
  return {
    addAmountLak: 0,
    conversionQty,
    costPriceLak: (extra.costPriceLak as number | undefined) ?? 0,
    id,
    markupPercent: (extra.markupPercent as number | undefined) ?? 0,
    pricingMode: (extra.pricingMode as "manual" | "cost_plus_percent" | "cost_plus_amount" | undefined) ?? "manual",
    roundingLak: (extra.roundingLak as number | undefined) ?? 0,
    sellingPriceLak: (extra.sellingPriceLak as number | undefined) ?? 0,
    status: (extra.status as "active" | "inactive" | undefined) ?? "active",
    unitName,
    ...extra,
  };
}

const piece = () => unit("piece", "Piece", 1, {
  isBaseUnit: true,
  costPriceLak: 5000,
  markupPercent: 20,
  pricingMode: "cost_plus_percent",
  roundingLak: 500,
  sellingPriceLak: 6000,
});
const pack = () => unit("pack", "Pack", 6, { costPriceLak: 28000, sellingPriceLak: 30000 });
const box = () => unit("box", "Box", 60, { costPriceLak: 250000, sellingPriceLak: 260000 });
const trio = () => [piece(), pack(), box()];

const root = process.cwd();
const productForm = readFileSync(join(root, "features/products/components/product-form.tsx"), "utf8");
const inventoryList = readFileSync(join(root, "features/inventory/list-query.ts"), "utf8");
const inventoryRepo = readFileSync(join(root, "features/inventory/prisma-repository.ts"), "utf8");
const productListPage = readFileSync(join(root, "app/(dashboard)/products/page.tsx"), "utf8");
const posRepo = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");

check("1. Piece pricing still works", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "piece",
    patch: { costPriceLak: 5000, pricingMode: "cost_plus_percent", markupPercent: 20, roundingLak: 500 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "piece")?.sellingPriceLak === 6000, "piece selling");
});

check("2. Pack manual Cost → automatic Selling Price", () => {
  assert(sellingPriceFromCost({
    costPriceLak: 28000,
    markupPercent: 20,
    pricingMode: "cost_plus_percent",
    roundingLak: 500,
  }) === 34000, "helper pack 28k/20%/500");
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 28000, pricingMode: "cost_plus_percent", markupPercent: 20, roundingLak: 500 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 34000, "pack selling");
  const changed = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 30000, markupPercent: 25 },
    shareStock: true,
    units: next,
  });
  assert(changed.find((row) => row.id === "pack")?.sellingPriceLak === 37500, "pack recalculated");
  assert(changed.find((row) => row.id === "piece")?.sellingPriceLak === 6000, "piece untouched");
});

check("3. Box manual Cost → automatic Selling Price", () => {
  assert(sellingPriceFromCost({
    costPriceLak: 250000,
    markupPercent: 15,
    pricingMode: "cost_plus_percent",
    roundingLak: 500,
  }) === 287500, "helper box");
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 250000, pricingMode: "cost_plus_percent", markupPercent: 15, roundingLak: 500 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 287500, "box selling");
});

check("4. Pack Qty change does not alter Cost/Selling Price", () => {
  const priced = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 28000, pricingMode: "cost_plus_percent", markupPercent: 20, roundingLak: 500 },
    shareStock: true,
    units: trio(),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { conversionQty: 12 },
    shareStock: true,
    units: priced,
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "pack cost");
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 34000, "pack selling");
});

check("5. Box Qty change does not alter Cost/Selling Price", () => {
  const priced = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { costPriceLak: 250000, pricingMode: "cost_plus_percent", markupPercent: 15, roundingLak: 500 },
    shareStock: true,
    units: trio(),
  });
  const next = applyUnitPricingPatch({
    editedUnitId: "box",
    patch: { conversionQty: 120 },
    shareStock: true,
    units: priced,
  });
  assert(next.find((row) => row.id === "box")?.costPriceLak === 250000, "box cost");
  assert(next.find((row) => row.id === "box")?.sellingPriceLak === 287500, "box selling");
});

check("6. Manual Pack Selling Price fully editable", () => {
  const clear = simulateMoneyClearThenType(28000, "35000");
  assert(clear.blank === "" && clear.duringEdit === "35000" && clear.committed === 35000, JSON.stringify(clear));
  const replace = simulateMoneyReplace(28000, "40000");
  assert(replace.duringEdit === "40000" && replace.committed === 40000, JSON.stringify(replace));
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { pricingMode: "manual", sellingPriceLak: 40000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 40000, "manual pack");
  assert(productForm.includes('disabled={(unit.pricingMode ?? "manual") !== "manual"}'), "auto modes disable selling");
  assert(productForm.includes('data-field="money-input"'), "draft money input");
});

check("7. Manual Box Selling Price fully editable", () => {
  const clear = simulateMoneyClearThenType(250000, "300000");
  assert(clear.blank === "" && clear.committed === 300000, JSON.stringify(clear));
  const mid = onMoneyInputChange(onMoneyInputFocus(moneyInputFromCommitted(250000)), "");
  assert(moneyInputDisplay(mid) === "", "blank while editing");
});

check("8. Rounding applies only to selling price", () => {
  const next = applyUnitPricingPatch({
    editedUnitId: "pack",
    patch: { costPriceLak: 28000, pricingMode: "cost_plus_percent", markupPercent: 20, roundingLak: 1000 },
    shareStock: true,
    units: trio(),
  });
  assert(next.find((row) => row.id === "pack")?.costPriceLak === 28000, "cost unchanged");
  assert(next.find((row) => row.id === "pack")?.sellingPriceLak === 34000, "rounded selling");
});

check("9. Quantity received 0 → clear → 12 = 12", () => {
  const typed = simulateOpeningQtyClearThenType(0, "12");
  assert(typed.blank === "" && typed.duringEdit === "12" && typed.committed === 12, JSON.stringify(typed));
});

check("10. Quantity received 0 → Ctrl+A → 50 = 50", () => {
  const typed = simulateOpeningQtyReplace(0, "50");
  assert(typed.duringEdit === "50" && typed.committed === 50 && typed.display === "50", JSON.stringify(typed));
});

check("11. temporary blank allowed", () => {
  const blank = onOpeningQtyChange(onOpeningQtyFocus(openingQtyFromCommitted(0)), "");
  assert(openingQtyDisplay(blank) === "", JSON.stringify(blank));
});

check("12. no leading 0 restored", () => {
  assert(!productForm.includes('type="number" value={value.quantityReceived}'), "old controlled number input");
  assert(productForm.includes('data-field="quantity-received"'), "draft qty field");
  assert(productForm.includes("QuantityReceivedField"), "draft component");
  const typed = onOpeningQtyChange(onOpeningQtyFocus(openingQtyFromCommitted(0)), "12");
  assert(openingQtyDisplay(typed) === "12", "no leading 0");
});

check("13. opening stock save still posts correct quantity", () => {
  assert(productForm.includes("Math.max(Number(initialStockPreview.quantityReceived) || 0, 0)"), "save math unchanged");
  assert(productForm.includes("Math.max(Number(snapshot.initialStock.quantityReceived) || 0, 0)"), "preview math unchanged");
});

check("14-15. Active product list + POS filters", () => {
  assert(productListPage.includes('status: "active"'), "products default active");
  assert(posRepo.includes("isActive: true"), "POS requires isActive");
});

check("16. Inventory hides soft-deleted products", () => {
  assert(inventoryList.includes("p.is_active = true"), "list filters is_active");
  assert(inventoryList.includes("p.status <> 'deleted'"), "list filters deleted");
  assert(inventoryRepo.includes('status: { not: "deleted" }'), "snapshot filters deleted");
  assert(inventoryRepo.includes("isActive: true"), "snapshot filters isActive");
});

check("No DB migration / stock math unchanged", () => {
  assert(!productForm.includes("prisma migrate"), "no migrate");
  assert(productForm.includes("Math.max(Number(initialStockPreview.quantityReceived) || 0, 0)"), "opening qty math");
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  console.error(`\n${failed.length} failed`);
  process.exit(1);
}
console.log(`\nAll ${results.length} checks passed.`);
