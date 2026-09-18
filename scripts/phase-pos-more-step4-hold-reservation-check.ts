import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aggregateBaseDemand,
  sellQtyToBaseQuantity,
  assertSufficientAvailable,
} from "../features/pos/stock-reservation";

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

const root = process.cwd();
const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(join(root, "prisma/migrations/20260919_stock_reservations/migration.sql"), "utf8");
const repo = readFileSync(join(root, "features/pos/held-bills-repository.ts"), "utf8");
const checkout = readFileSync(join(root, "features/pos/held-checkout.ts"), "utf8");
const saleRepo = readFileSync(join(root, "features/pos/prisma-repository.ts"), "utf8");
const client = readFileSync(join(root, "features/pos/components/pos-page-client.tsx"), "utf8");
const reservation = readFileSync(join(root, "features/pos/stock-reservation.ts"), "utf8");

check("1. schema StockReservation + unique holdBillItemId", () => {
  assert(schema.includes("enum StockReservationStatus"), "enum");
  assert(schema.includes("model StockReservation"), "model");
  assert(/holdBillItemId\s+String\s+@unique/.test(schema), "unique item");
  assert(!/holdBillItemId\s+String\?/.test(schema), "not nullable");
  assert(schema.includes("stockReservation StockReservation?"), "HoldBillItem back-relation");
});

check("2. migration SQL exact surface", () => {
  assert(migration.includes('CREATE TYPE "StockReservationStatus"'), "enum sql");
  assert(migration.includes('CREATE TABLE "stock_reservations"'), "table");
  assert(migration.includes("hold_bill_item_id"), "item fk");
  assert(migration.includes("stock_reservations_hold_bill_item_id_key"), "unique");
  assert(!migration.includes("DROP "), "no destructive drop");
  assert(!/ALTER TABLE "inventory_balances"/.test(migration), "does not alter balances");
  assert(!/CREATE TABLE "inventory_balances"/.test(migration), "does not recreate balances");
  assert(!/"expires_at"/.test(migration) && !/"expired_at"/.test(migration), "no auto-expiry columns");
});

check("3. Pack conversion 2×6 = 12 base", () => {
  assert(sellQtyToBaseQuantity(2, 6) === 12, "pack");
});

check("4. Box conversion uses conversionQty", () => {
  assert(sellQtyToBaseQuantity(1, 24) === 24, "box");
});

check("5. Available gate rejects shortfall", () => {
  let threw = false;
  try {
    assertSufficientAvailable("PEPSI", 4, 5);
  } catch {
    threw = true;
  }
  assert(threw, "must reject");
});

check("6. Available gate allows exact Available", () => {
  assertSufficientAvailable("PEPSI", 4, 4);
});

check("7. aggregate demand merges same product", () => {
  const totals = aggregateBaseDemand([
    { baseQuantity: 12, productId: "p1", productUnitId: "u1", sellQuantity: 2 },
    { baseQuantity: 1, productId: "p1", productUnitId: "u2", sellQuantity: 1 },
  ]);
  assert(totals.get("p1") === 13, "merged");
});

check("8. create Hold reserves ACTIVE after locks", () => {
  assert(repo.includes("lockProductsDeterministically"), "locks");
  assert(repo.includes("availableBaseQty"), "available");
  assert(repo.includes('status: "ACTIVE"'), "active rows");
  assert(repo.includes("stockReservation.create"), "create reservation");
});

check("9. Resume keeps held + no duplicate reservation create", () => {
  assert(repo.includes("resumedAt: new Date()"), "resume stamp");
  assert(!repo.includes('status: "resumed"'), "not terminal");
  assert(repo.includes("HOLD_RESERVING_STATUSES"), "reserving statuses");
  const resumeSlice = repo.slice(repo.indexOf("export async function resumePrismaHeldBill"), repo.indexOf("export async function cancelPrismaHeldBill"));
  assert(!resumeSlice.includes("stockReservation.create"), "no create on resume");
});

check("10. Cancel releases ACTIVE once", () => {
  assert(repo.includes('status: "RELEASED"'), "release");
  assert(repo.includes("You can only access your own held bills."), "ownership");
  assert(!repo.includes('assertPosActionAllowed(policy, "void_bill")'), "cancel not void_bill");
});

check("11. Cashier list scoped to own Holds", () => {
  assert(repo.includes('policy.role === "Cashier" ? { cashierId: tenant.userId }'), "cashier filter");
});

check("12. Held checkout consumes once + heldFromId", () => {
  assert(checkout.includes('status: "CONSUMED"'), "consume");
  assert(checkout.includes("HOLD_STATUS_COMPLETED"), "complete hold");
  assert(saleRepo.includes("heldFromId"), "sale field");
  assert(saleRepo.includes("excludeHoldBillId: heldFromId"), "own reserve excluded");
  assert(saleRepo.includes("consumeHeldBillReservationsForCheckout"), "consume wired");
});

check("13. Catalogue Available subtracts ACTIVE reserved", () => {
  assert(saleRepo.includes("sumActiveReservedByProduct"), "reserved sum");
  assert(saleRepo.includes("stockQty: Math.max(0, Number(product.stockQty ?? 0) - (reserved"), "available display");
});

check("14. UI keeps Hold discoverable after Resume", () => {
  assert(client.includes("setActiveHeldBillId"), "tracks active hold");
  assert(client.includes("heldFromId: activeHeldBillId"), "checkout passes hold");
  assert(client.includes("Keep Hold discoverable"), "comment/path");
  assert(client.includes("· reserved"), "reserved indicator");
  assert(!client.includes('enforcePosAction("void_bill")') || client.indexOf('deleteHeldSale') < client.indexOf('enforcePosAction("void_bill"'), "cancel not void_bill in deleteHeldSale");
  const deleteFn = client.slice(client.indexOf("async function deleteHeldSale"), client.indexOf("function resolvePaymentForCompletion"));
  assert(deleteFn.includes('enforcePosAction("resume_bill")'), "cancel uses resume_bill gate");
  assert(!deleteFn.includes('void_bill'), "cancel not void_bill");
});

check("15. Auto-expiry not implemented", () => {
  assert(!reservation.includes("expir"), "no expiry helper");
  assert(!repo.includes("auto-expir") && !repo.includes("setTimeout"), "no timer in repo");
});

check("16. More / Cash Shift / Favorites untouched markers", () => {
  assert(client.includes("backFromMoreChild"), "more nav");
  assert(client.includes("cashShiftCountOpen"), "cash shift");
  assert(client.includes("favoritesOpen"), "favorites");
});

const failed = results.filter((row) => row.status === "FAIL");
if (failed.length) {
  throw new Error(`STEP4 hold reservation checks failed: ${failed.length}\n${failed.map((f) => f.name).join("\n")}`);
}
console.log(`\nSTEP4 hold reservation checks passed: ${results.length}`);
