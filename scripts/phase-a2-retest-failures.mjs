/**
 * Re-run only A2 failed scenarios with corrected selectors.
 * Run: IGO_DEMO_MODE=false node scripts/phase-a2-retest-failures.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const baseUrl = process.env.A2_BASE_URL ?? "http://127.0.0.1:3001";
const results = [];

function record(id, pass, detail) {
  results.push({ detail, id, pass });
  console.log(`${pass ? "PASS" : "FAIL"} [${id}] ${detail}`);
}

async function login(page, username, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function testProductSearch(page) {
  const stamp = Date.now();
  const sku = `A2R-${stamp}`;
  const name = `A2R Product ${stamp}`;
  await page.goto(`${baseUrl}/products/new`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="productName"]').first().fill(name);
  await page.locator('input[name="sku"]').first().fill(sku);
  await page.locator('form button[type="submit"]').last().click();
  await page.waitForURL((url) => url.pathname === "/products", { timeout: 60_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder(/barcode|sku|product/i).or(page.locator("input.h-11.w-full")).first();
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(sku);
  await page.waitForTimeout(1500);
  const listed = await page.locator("tbody tr", { hasText: sku }).first().isVisible().catch(() => false);
  record("F1-product-search", listed, `sku=${sku} listed=${listed}`);
}

async function testCustomerRefresh(page) {
  const stamp = Date.now();
  const customerName = `A2R Customer ${stamp}`;
  const customerPhone = `020${String(stamp).slice(-7)}`;
  await page.goto(`${baseUrl}/customers/new`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="customerCode"]', `CUS-R-${stamp}`);
  await page.fill('input[name="fullName"]', customerName);
  await page.fill('input[name="phone"]', customerPhone);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/customers", { timeout: 60_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const search = page.locator("input.field-input.pl-10").first();
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(customerPhone);
  await page.waitForTimeout(1500);
  const visible = await page.getByText(customerName).isVisible().catch(() => false);
  record("F2-customer-refresh", visible, `name=${customerName} visible=${visible}`);
}

async function testPosCheckout(page, role, username, password, skipLogin = false) {
  if (!skipLogin) {
    await login(page, username, password);
  }
  await page.goto(`${baseUrl}/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Payment", { timeout: 30_000 });
  const billNo = await page.locator("body").innerText().then((text) => {
    const match = text.match(/Bill No\.?\s*([A-Z0-9]+)/i) ?? text.match(/GB\d{4}|INV\d{4}|A\d{4}/);
    return match?.[1] ?? match?.[0] ?? "unknown";
  });
  await page.locator("div.grid.grid-cols-5 button").first().click();
  const barcode = page.locator("input.h-14.w-full").first();
  await barcode.waitFor({ state: "visible", timeout: 15_000 });
  await barcode.fill("DRK-PEP-CAN-001");
  await barcode.press("Enter");
  await page.waitForTimeout(1500);
  if (await page.locator("text=Select sale unit").isVisible().catch(() => false)) {
    await page.locator("section").filter({ hasText: "Select sale unit" }).locator("button").nth(1).click();
    await page.waitForTimeout(1000);
  }
  const cartText = await page.locator("body").innerText();
  if (!/added to cart|Pepsi/i.test(cartText)) {
    const productBtn = page.locator("button").filter({ hasText: "Pepsi" }).first();
    if (await productBtn.isVisible().catch(() => false)) await productBtn.click();
  }
  await page.getByRole("button", { name: "Pay" }).click({ force: true });
  await page.waitForTimeout(10000);
  const body = await page.locator("body").innerText();
  const duplicateError = /unique constraint failed|sale_no/i.test(body);
  const ok = !duplicateError && /completed and saved|Receipt preview/i.test(body);
  record(`F3-pos-${role}`, ok, ok ? `sale completed bill=${billNo}` : body.slice(0, 220));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await login(page, "igo-admin", "AdminChangeMe123!");
  await testProductSearch(page);
  await testCustomerRefresh(page);
  await testPosCheckout(page, "owner", "igo-admin", "AdminChangeMe123!", true);
  await browser.close();

  const browser2 = await chromium.launch({ headless: true });
  const page2 = await browser2.newPage();
  await testPosCheckout(page2, "manager", "manager", "Manager123!");
  await browser2.close();

  const browser3 = await chromium.launch({ headless: true });
  const page3 = await browser3.newPage();
  await testPosCheckout(page3, "cashier", "cashier", "Cashier123!");
  await browser3.close();

  writeFileSync("scripts/phase-a2-retest-failures.json", JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\nDone: ${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
