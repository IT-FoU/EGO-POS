/**
 * Verify consecutive POS checkouts do not reuse sale_no.
 */
import { existsSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const baseUrl = process.env.A2_BASE_URL ?? "http://127.0.0.1:3001";

async function login(page, username, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function completeOneSale(page) {
  await page.goto(`${baseUrl}/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Payment", { timeout: 30_000 });
  await page.locator("div.grid.grid-cols-5 button").first().click();
  const barcode = page.locator("input.h-14.w-full").first();
  await barcode.fill("DRK-PEP-CAN-001");
  await barcode.press("Enter");
  await page.waitForTimeout(1500);
  if (await page.locator("text=Select sale unit").isVisible().catch(() => false)) {
    await page.locator("section").filter({ hasText: "Select sale unit" }).locator("button").nth(1).click();
    await page.waitForTimeout(1000);
  }
  const bodyBefore = await page.locator("body").innerText();
  const saleNoMatch = bodyBefore.match(/Bill No\.?\s*([A-Z0-9]+)/i);
  await page.getByRole("button", { name: "Pay" }).click({ force: true });
  await page.waitForTimeout(10000);
  const bodyAfter = await page.locator("body").innerText();
  const duplicate = /unique constraint failed|sale_no/i.test(bodyAfter);
  const success = !duplicate && /completed and saved|Receipt preview/i.test(bodyAfter);
  const completedMatch = bodyAfter.match(/([A-Z0-9]+) completed and saved/i);
  return {
    billNo: saleNoMatch?.[1] ?? "unknown",
    completedSaleNo: completedMatch?.[1] ?? null,
    duplicate,
    success,
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await login(page, "cashier", "Cashier123!");
const first = await completeOneSale(page);
const second = await completeOneSale(page);
await browser.close();

const pass = first.success && second.success && !first.duplicate && !second.duplicate && first.completedSaleNo !== second.completedSaleNo;
console.log(JSON.stringify({ first, pass, second }, null, 2));
process.exit(pass ? 0 : 1);
