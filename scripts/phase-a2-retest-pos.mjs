/**
 * POS checkout retest only (manager + cashier).
 */
import { chromium } from "playwright";

const baseUrl = process.env.A2_BASE_URL ?? "http://127.0.0.1:3001";

async function login(page, username, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function testPosCheckout(role, username, password, scanSku) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await login(page, username, password);
  await page.goto(`${baseUrl}/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Payment", { timeout: 30_000 });
  await page.locator("div.grid.grid-cols-5 button").first().click();
  const barcode = page.locator("input.h-14.w-full").first();
  await barcode.waitFor({ state: "visible", timeout: 15_000 });
  await barcode.fill(scanSku);
  await barcode.press("Enter");
  await page.waitForTimeout(2000);
  const unitModal = page.locator("text=Select sale unit");
  if (await unitModal.isVisible().catch(() => false)) {
    await page.locator("section").filter({ hasText: "Select sale unit" }).locator("button").nth(1).click();
    await page.waitForTimeout(1000);
  }
  const cartText = await page.locator("body").innerText();
  const cartOk = /added to cart|added|ກະຕ່າ/i.test(cartText);
  console.log(`${role} cart after scan (${scanSku}):`, cartOk);
  if (!cartOk) {
    const productBtn = page.locator("button").filter({ hasText: /Pepsi|Water|A2/i }).first();
    if (await productBtn.isVisible().catch(() => false)) {
      await productBtn.click();
      await page.waitForTimeout(1000);
    }
  }
  await page.getByRole("button", { name: "Pay" }).click({ force: true });
  await page.waitForTimeout(10000);
  const body = await page.locator("body").innerText();
  const ok = /completed and saved|Receipt preview/i.test(body);
  console.log(`${role} checkout:`, ok ? "PASS" : "FAIL");
  if (!ok) console.log(body.slice(0, 400));
  await browser.close();
  return ok;
}

const scanSku = process.argv[2] ?? "DRK-PEP-CAN-001";
const managerOk = await testPosCheckout("manager", "manager", "Manager123!", scanSku);
const cashierOk = await testPosCheckout("cashier", "cashier", "Cashier123!", scanSku);
process.exit(managerOk && cashierOk ? 0 : 1);
