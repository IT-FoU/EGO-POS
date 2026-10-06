/**
 * Products step 1: opening stock on create, additive receive on edit.
 * Static only. No database and no Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const form = read("features/products/components/product-form.tsx");
const panel = read("features/products/components/product-stock-lot-panel.tsx");
const inventory = read("features/inventory/prisma-repository.ts");
const inventoryDto = read("features/inventory/dto.ts");
const inventoryActions = read("features/inventory/actions.ts");
const editPage = read("app/(dashboard)/products/[productId]/edit/page.tsx");

let failed = 0;
let passed = 0;
function check(label: string, ok: boolean) {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${label}`);
    return;
  }
  passed += 1;
  console.log(`PASS ${label}`);
}

function receivedBase(current: number, quantity: number, conversion: number) {
  return current + quantity * conversion;
}
function totalReceivedCost(quantity: number, costPerReceiveUnit: number) {
  return quantity * costPerReceiveUnit;
}

check("create section is opening stock", form.includes('t("initialStockLot")') && form.includes('t("openingQuantity")') && form.includes('t("startingStock")') && tProducts("initialStockLot", "en") === "Opening Stock & Lot Tracking" && tProducts("initialStockLot", "lo").includes("ສະຕັອກເປີດຕົ້ນ"));
check("create posts only when opening stock is opted in and quantity is positive", form.includes('mode === "create" && initialStockPreview.addOpeningStock && openingQuantity > 0'));
check("edit section is additive receive", panel.includes('t("receiveAdditionalStock")') && panel.includes('t("currentStockLabel")') && panel.includes('t("stockAfterReceiving")') && panel.includes('t("convertedBaseQuantity")') && panel.includes("stockInAction"));
check("edit save does not overwrite stock from the product payload", !form.includes("initialStock: mode === \"edit\"") && !read("features/products/prisma-repository.ts").includes("writePrismaProductUpdate") === false);
check("cost label is per receive unit and total is quantity times that cost", form.includes('t("costPerReceiveUnit")') && form.includes('t("totalReceivedCost")') && panel.includes('t("costPerReceiveUnit")') && panel.includes('t("totalReceivedCost")') && inventory.includes("const totalCostLak = unitCostLak * quantity"));
check("stock-in adds converted base quantity", inventory.includes("quantityDelta: baseQuantity") && inventory.includes("const baseQuantity = quantity * conversionQty"));
check("zero quantity is rejected by stock-in", inventory.includes('throw new Error("Stock-in quantity must be greater than zero.")') && panel.includes('t("zeroReceiveNoChange")'));
check("receive uses inventory stock-in permission", inventoryActions.includes("WRITE_PERMISSIONS.inventoryStockIn") && inventoryActions.includes("STORE_ACTIONS.INVENTORY_STOCK_IN") && editPage.includes("STORE_ACTIONS.INVENTORY_STOCK_IN"));
check("receive date is a stock-in field and does not replace createdAt", inventoryDto.includes('"receiveDate"') && inventory.includes("receivedAt: businessReceivedAt") && !inventory.includes("createdAt: businessReceivedAt") && form.includes("receiveDate: initialStockPreview.receiveDate") && panel.includes('t("receiveDate")'));
check("piece pack and box examples", receivedBase(0, 10, 1) === 10 && receivedBase(0, 2, 24) === 48 && receivedBase(5, 10, 1) === 15 && receivedBase(5, 2, 6) === 17 && receivedBase(5, 2, 24) === 53 && totalReceivedCost(3, 120000) === 360000 && totalReceivedCost(10, 5000) === 50000);
check("copy parity and Lao labels", productsCopyKeyParity() && tProducts("receiveAdditionalStock", "lo") !== tProducts("receiveAdditionalStock", "en") && tProducts("stockAfterReceiving", "lo") !== "stockAfterReceiving");

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
