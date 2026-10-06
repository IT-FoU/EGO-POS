/**
 * Products step 1A.1: business receive date on stock movements.
 * Static plus date conversion. No database and no Production.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { businessReceiveInstant, INVALID_RECEIVE_DATE } from "../features/inventory/receive-date";
import { productsCopyKeyParity, tProducts } from "../lib/i18n/products-copy";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261006141500_stock_movement_received_at/migration.sql");
const inventory = read("features/inventory/prisma-repository.ts");
const form = read("features/products/components/product-form.tsx");
const panel = read("features/products/components/product-stock-lot-panel.tsx");
const movement = schema.slice(schema.indexOf("model StockMovement {"), schema.indexOf("model StockAdjustment {"));

let failed = 0;
let passed = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${label}${detail ? ` ${detail}` : ""}`);
    return;
  }
  passed += 1;
  console.log(`PASS ${label}`);
}

const receivedLine = movement.split("\n").find((line) => line.includes("receivedAt")) ?? "";
check("schema adds nullable receivedAt without a now() default", receivedLine.includes('DateTime?') && receivedLine.includes('@map("received_at")') && !receivedLine.includes("@default"));
check("createdAt stays the system timestamp", movement.includes('createdAt     DateTime          @default(now()) @map("created_at")'));
const migrationSql = migration.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
check("migration adds a nullable column and does not backfill", migrationSql.includes('ADD COLUMN IF NOT EXISTS "received_at" TIMESTAMP(3)') && !/DEFAULT/i.test(migrationSql) && !/UPDATE/i.test(migrationSql));
check("explicit date uses startOfBusinessDay", read("features/inventory/receive-date.ts").includes("startOfBusinessDay") && !read("features/inventory/receive-date.ts").includes('new Date("'));
const movementInsert = inventory.slice(inventory.indexOf("await tx.stockMovement.create"), inventory.indexOf("return balance;"));
check("movement stores receivedAt and leaves createdAt to the database", movementInsert.includes("receivedAt: businessReceivedAt") && !movementInsert.includes("createdAt"));
check("selected date is shared with a new or updated lot", inventory.includes("receivedAt: businessReceivedAt ?? new Date()"));
check("create and edit pass receiveDate through stock-in", form.includes("receiveDate: initialStockPreview.receiveDate") && panel.includes("receiveDate: receiveDate || null") && panel.includes('t("receiveDate")'));
check("copy parity", productsCopyKeyParity() && tProducts("receiveDate", "en") === "Receive date" && tProducts("receiveDate", "lo") === "ວັນຮັບ" && tProducts("invalidReceiveDate", "lo") !== tProducts("invalidReceiveDate", "en"));

const oct3 = businessReceiveInstant("2026-10-03");
check("2026-10-03 is 00:00 Asia/Vientiane", oct3?.toISOString() === "2026-10-02T17:00:00.000Z", oct3?.toISOString());
check("empty date stays null", businessReceiveInstant("") === null && businessReceiveInstant(null) === null && businessReceiveInstant("   ") === null);
check("past date is accepted", businessReceiveInstant("2020-01-15")?.toISOString() === "2020-01-14T17:00:00.000Z");
check("future date is accepted", businessReceiveInstant("2027-12-31")?.toISOString() === "2027-12-30T17:00:00.000Z");

for (const bad of ["2026-02-31", "not-a-date", "2026/10/03", "2026-10-03T00:00:00.000Z"]) {
  let threw = false;
  try {
    businessReceiveInstant(bad);
  } catch (error) {
    threw = error instanceof Error && error.message === INVALID_RECEIVE_DATE;
  }
  check(`rejects ${bad}`, threw);
}

console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
