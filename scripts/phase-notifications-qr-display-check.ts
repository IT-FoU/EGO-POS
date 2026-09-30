import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  availableStock,
  classifyStockNotification,
  membershipExpiringDays,
  nearExpiryDays,
  promotionWindowDays,
} from "../features/notifications/notification-types";
import { fillPosCopy, posCopyKeyParity, tPos } from "../lib/i18n/pos-copy";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");
const now = new Date("2026-09-30T12:00:00.000Z");

assert(availableStock(10, 3) === 7, "available stock must subtract active reservations");
assert(classifyStockNotification(2, 2) === "low_stock", "positive available stock at minStock is low stock");
assert(classifyStockNotification(0, 2) === "out_of_stock", "zero available stock is out of stock");
assert(classifyStockNotification(-1, 2) === "out_of_stock", "negative available stock is out of stock");
assert(classifyStockNotification(3, 2) === null, "stock above minStock is neither alert");
assert(
  classifyStockNotification(0, 0) !== "low_stock",
  "a product must not be both low stock and out of stock",
);

const expiryIn30Days = new Date("2026-10-30T12:00:00.000Z");
assert(nearExpiryDays(expiryIn30Days, now) === 30, "expiry within 30 calendar days must alert");
assert(nearExpiryDays(null, now) === null, "null expiry must not alert");
assert(membershipExpiringDays(new Date("2026-10-07T12:00:00.000Z"), now) === 7, "seven-day membership warning");
assert(membershipExpiringDays(new Date("2026-09-29T12:00:00.000Z"), now) === null, "expired membership must not alert");
assert(promotionWindowDays(new Date("2026-10-02T12:00:00.000Z"), now) === 2, "promotion lifecycle window");

const liveCenter = read("components/layout/notification-center-live.tsx");
const loader = read("features/notifications/load-notifications.ts");
const qrToggle = read("components/layout/customer-display-qr-toggle.tsx");
const qrState = read("features/pos/customer-display-qr.ts");
const displayToggle = read("components/layout/customer-display-toggle.tsx");
const displayWindow = read("features/pos/customer-display-window.ts");

for (const oldType of [
  "deadStock",
  "cashDifference",
  "lowSales",
  "membershipExpired",
  "subscriptionExpired",
  "supplier due",
  "customer credit",
  "system mock",
]) {
  assert(!liveCenter.includes(oldType), `old mock notification type remains: ${oldType}`);
}
assert(liveCenter.includes('fetch("/api/notifications"'), "bell must load real notifications");
assert(liveCenter.includes("notifications.length"), "badge must use the real feed count");
assert(loader.includes("InventoryLot") || loader.includes("inventoryLot"), "loader must use inventory lots");
assert(loader.includes("expiryDate"), "near-expiry must use lot expiry dates");
assert(loader.includes("StockReservation") || loader.includes("stockReservation"), "loader must use reservations");
assert(loader.includes("customerSubscription"), "loader must use customer memberships");
assert(!loader.includes("db.subscription.find") && !loader.includes("db.plan.find"), "SaaS plans must not create membership alerts");
assert(loader.includes("companyId: tenant.companyId"), "notification queries must be tenant scoped");

assert(qrToggle.includes("function toggleQr()"), "QR main control must have a toggle handler");
assert(qrToggle.includes("if (intent.visible)"), "visible QR must hide from the main control");
assert(qrToggle.includes("banks.length === 1"), "one QR option must show immediately");
assert(qrState.includes('bankId: "", visible: false'), "hiding QR must clear the selected bank");
assert(!qrToggle.includes("localStorage"), "QR toggle must not persist a bank preference directly");

assert(displayToggle.includes("customerDisplayWindow.close()"), "customer display must close the same popup");
assert(displayToggle.includes("!customerDisplayWindow.closed"), "customer display must check stale popup refs");
assert(displayWindow.includes("ego-pos-customer-display"), "customer display must use the stable named window");
assert(displayWindow.includes('"/customer-display"'), "customer display route must remain unchanged");

assert(posCopyKeyParity(), "EN and LO POS dictionaries must have matching keys");
const message = fillPosCopy(tPos("ui.notification.message.membership_expiring", "en"), {
  days: 3,
  name: "Ava",
});
assert(message.includes("Ava") && message.includes("3"), "notification values must interpolate");
assert(!tPos("ui.notification.title.low_stock", "en").startsWith("ui."), "EN notification key must resolve");
assert(!tPos("ui.notification.title.low_stock", "lo").startsWith("ui."), "LO notification key must resolve");

console.log("PASS: notification classification, source isolation, QR/display toggles, and EN/LO localization");
