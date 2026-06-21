/**
 * Phase A2 UI reality runner — direct Playwright (no test runner).
 * Run: IGO_DEMO_MODE=false node scripts/phase-a2-ui-run.mjs
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const baseUrl = process.env.A2_BASE_URL ?? "http://127.0.0.1:3001";
const results = [];

function record(role, module, name, pass, detail) {
  results.push({ detail, module, name, pass, role });
  console.log(`${pass ? "PASS" : "FAIL"} [${role}/${module}] ${name}: ${detail}`);
}

async function login(page, username, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function logout(page, context) {
  await context.clearCookies();
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
}

async function searchProducts(page, sku) {
  const search = page.locator("input.h-11.w-full").first();
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(sku);
  await page.waitForTimeout(1500);
}

async function searchCustomers(page, query) {
  const search = page.locator('input[placeholder*="phone"], input[placeholder*="Phone"], input.h-11').first();
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(query);
  await page.waitForTimeout(1500);
}

async function clickPosProduct(page) {
  const selectors = [
    page.locator("button").filter({ hasText: "Pepsi Can" }).first(),
    page.locator("button").filter({ hasText: "Drinking Water" }).first(),
    page.locator("button").filter({ hasText: "Pepsi" }).first(),
  ];
  for (const locator of selectors) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.click();
      return true;
    }
  }
  return false;
}

async function completePosSale(page, role) {
  await page.goto(`${baseUrl}/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Payment", { timeout: 30_000 });
  await page.locator("div.grid.grid-cols-5 button").first().click();
  const barcodeInput = page.locator("input.field-input.h-14").first();
  await barcodeInput.fill("DRK-PEP-CAN-001");
  await barcodeInput.press("Enter");
  await page.waitForTimeout(1000);
  const cartText = await page.locator("body").innerText();
  if (!/added to cart|Pepsi/i.test(cartText)) {
    const clicked = await clickPosProduct(page);
    if (!clicked) {
      record(role, "POS Checkout", "Complete sale", false, "could not add product to cart");
      return;
    }
  }
  await page.getByRole("button", { name: "Pay" }).click();
  await page.waitForTimeout(6000);
  const body = await page.locator("body").innerText();
  const ok = /completed and saved/i.test(body);
  record(role, "POS Checkout", "Complete sale", ok, ok ? "sale completed" : body.slice(0, 160));
}

async function checkPage(page, role, module, path, pattern) {
  const response = await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const text = await page.locator("body").innerText();
  const pass = (response?.status() ?? 0) === 200 && pattern.test(text);
  record(role, module, "Page load", pass, `${path} status=${response?.status() ?? 0}`);
  return pass;
}

async function ownerFlows(page) {
  const role = "Owner";
  const stamp = Date.now();
  const sku = `A2-${stamp}`;
  const name = `A2 Product ${stamp}`;

  await page.goto(`${baseUrl}/products/new`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="productName"]').first().fill(name);
  await page.locator('input[name="sku"]').first().fill(sku);
  const saveButton = page.locator('form button[type="submit"]').last();
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();
  await page.waitForURL(/\/products/, { timeout: 60_000 });
  record(role, "Products", "Create", true, sku);

  await page.goto(`${baseUrl}/products`, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await searchProducts(page, sku);
  const listed = await page.locator("tr", { hasText: sku }).first().isVisible().catch(() => false);
  record(role, "Products", "Search after create", listed, name);

  const row = page.locator("tr", { hasText: sku }).first();
  const edit = row.getByRole("link", { name: "Edit" });
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    const updated = `${name} Updated`;
    await page.locator('input[name="productName"]').first().fill(updated);
    await page.locator('form button[type="submit"]').last().click();
    await page.waitForURL(/\/products/, { timeout: 60_000 });
    record(role, "Products", "Edit/save", true, updated);
    await page.reload({ waitUntil: "domcontentloaded" });
    await searchProducts(page, sku);
    const persisted = await page.locator("tr", { hasText: sku }).getByText(updated).isVisible().catch(() => false);
    record(role, "Products", "Refresh persistence", persisted, updated);
    const del = page.locator("tr", { hasText: sku }).getByRole("button", { name: "Delete" });
    if (await del.isVisible().catch(() => false)) {
      await del.click();
      await page.waitForTimeout(2000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await searchProducts(page, sku);
      const gone = !(await page.locator("tr", { hasText: sku }).isVisible().catch(() => false));
      record(role, "Products", "Delete", gone, gone ? "removed" : "still listed");
    }
  }

  await page.goto(`${baseUrl}/customers/new`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="customerCode"]', `CUS-${stamp}`);
  const customerName = `A2 Customer ${stamp}`;
  const customerPhone = `020${String(stamp).slice(-7)}`;
  await page.fill('input[name="fullName"]', customerName);
  await page.fill('input[name="phone"]', customerPhone);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL(/\/customers/, { timeout: 60_000 });
  record(role, "Customers", "Create", true, customerName);
  await page.reload({ waitUntil: "domcontentloaded" });
  await searchCustomers(page, customerPhone);
  const customerVisible = await page.getByText(customerName).isVisible().catch(() => false);
  record(role, "Customers", "Refresh persistence", customerVisible, customerName);

  await page.goto(`${baseUrl}/membership-levels`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New level" }).click();
  const levelName = `A2 Level ${stamp}`;
  await page.locator("form input.field-input").first().fill(levelName);
  await page.getByRole("button", { name: "Create level" }).click();
  await page.waitForTimeout(2500);
  record(role, "Membership", "Create", await page.getByText(levelName).isVisible().catch(() => false), levelName);

  await page.goto(`${baseUrl}/promotions/new`, { waitUntil: "domcontentloaded" });
  const promoName = `A2 Promo ${stamp}`;
  const promoNameInput = page.locator('input').filter({ has: page.locator("xpath=..//label[contains(.,'Promotion Name') or contains(.,'Name')]") }).first();
  if (await promoNameInput.count()) {
    await promoNameInput.fill(promoName);
  } else {
    await page.locator("input").nth(1).fill(promoName);
  }
  await page.getByRole("button", { name: "Save Draft" }).first().click();
  await page.waitForTimeout(3000);
  await page.goto(`${baseUrl}/promotions`, { waitUntil: "domcontentloaded" });
  record(role, "Promotions", "Create/save", await page.getByText(promoName).isVisible().catch(() => false), promoName);

  await page.goto(`${baseUrl}/inventory/stock-in`, { waitUntil: "domcontentloaded" });
  record(role, "Inventory", "Stock-in page", /stock in|stock-in|receive/i.test(await page.locator("body").innerText()), "/inventory/stock-in");

  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  const prefixInput = page.locator("input.field-input.font-mono").first();
  const before = await prefixInput.inputValue();
  const next = `A2${String(stamp).slice(-3)}`;
  await prefixInput.fill(next);
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "domcontentloaded" });
  const after = await page.locator("input.field-input.font-mono").first().inputValue();
  record(role, "Settings", "Save/refresh", after === next, `${before} -> ${after}`);
  if (after === next) {
    await page.locator("input.field-input.font-mono").first().fill(before);
    await page.getByRole("button", { name: "Save settings" }).click();
  }

  await page.goto(`${baseUrl}/pos`, { waitUntil: "domcontentloaded" });
  await completePosSale(page, role);
}

async function settingsProbe(page, role, shouldSave) {
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  const input = page.locator("input.field-input.font-mono").first();
  const before = await input.inputValue();
  const probe = `${before}Z`;
  await input.fill(probe);
  await page.getByRole("button", { name: "Save settings" }).click();
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: "domcontentloaded" });
  const after = await page.locator("input.field-input.font-mono").first().inputValue();
  const changed = after === probe;
  const pass = shouldSave ? changed : !changed;
  record(role, "Settings", shouldSave ? "Save allowed" : "Save blocked", pass, after);
  if (changed && !shouldSave) {
    await input.fill(before);
    await page.getByRole("button", { name: "Save settings" }).click();
  }
}

async function posSale(page, role) {
  await completePosSale(page, role);
}

async function runRole(browser, account) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const role = account.role;

  try {
    await login(page, account.username, account.password);
    record(role, "Login", "Login", true, account.username);

    await checkPage(page, role, "Dashboard", "/dashboard", /Dashboard|GO BOX|Sales|ໜ້າຫຼັກ/i);
    await checkPage(page, role, "Products", "/products", /Products|ສິນຄ້າ/i);
    await checkPage(page, role, "Customers", "/customers", /Customers|ລູກຄ້າ/i);
    await checkPage(page, role, "Membership", "/membership-levels", /Membership|Level|ສະມາຊິກ/i);
    await checkPage(page, role, "Promotions", "/promotions", /Promotion|ໂປຣໂມຊັນ/i);
    await checkPage(page, role, "Inventory", "/inventory", /Inventory|Stock|ສາງສິນຄ້າ/i);
    await checkPage(page, role, "Purchasing", "/purchasing", /Purchasing|Purchase|ຈັດຊື້/i);
    await checkPage(page, role, "Reports", "/reports", /Report Center|Report|ລາຍງານ/i);
    await checkPage(page, role, "Settings", "/settings", /Settings|Receipt|ຕັ້ງຄ່/i);
    await checkPage(page, role, "POS Checkout", "/pos", /Payment|Total|ຊຳລະ/i);

    if (account.fullCrud) await ownerFlows(page);
    else await posSale(page, role);

    await settingsProbe(page, role, account.canSave);
    await logout(page, context);
    record(role, "Login", "Logout", true, "cleared");
    await login(page, account.username, account.password);
    record(role, "Login", "Re-login", true, account.username);
  } catch (error) {
    record(role, "Login", "Flow error", false, error instanceof Error ? error.message : String(error));
  } finally {
    await context.close();
  }
}

const accounts = [
  { password: "AdminChangeMe123!", role: "Owner", username: "igo-admin", canSave: true, fullCrud: true },
  { password: "Manager123!", role: "Manager", username: "manager", canSave: false, fullCrud: false },
  { password: "Cashier123!", role: "Cashier", username: "cashier", canSave: false, fullCrud: false },
];

const browser = await chromium.launch({ headless: true });
for (const account of accounts) {
  await runRole(browser, account);
}
await browser.close();

writeFileSync("scripts/phase-a2-results.json", JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

const failed = results.filter((row) => !row.pass);
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed`);
process.exit(failed.length > 0 ? 1 : 0);
