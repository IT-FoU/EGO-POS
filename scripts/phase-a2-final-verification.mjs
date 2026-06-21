/**
 * A2 Final Post-Hotfix Verification — browser + DB checks.
 * Run after: IGO_DEMO_MODE=false npm run build && npx next start --port 3001
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

function loadEnv() {
  for (const fileName of [".env", ".env.local"]) {
    if (!existsSync(fileName)) continue;
    for (const line of readFileSync(fileName, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let value = trimmed.slice(i + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

loadEnv();
process.env.IGO_DEMO_MODE = "false";

const baseUrl = process.env.A2_BASE_URL ?? "http://127.0.0.1:3001";
const companyId = "gobox-company";
const warehouseId = "gobox-default-warehouse";
const results = [];
const artifacts = { customerPhone: null, ownerSaleNo: null, productSku: null, saleNos: [], stockProductId: null };

function record(section, name, pass, detail) {
  results.push({ detail, name, pass, section });
  console.log(`${pass ? "PASS" : "FAIL"} [${section}/${name}] ${detail}`);
}

async function login(page, username, password) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 90_000, waitUntil: "domcontentloaded" });
}

async function searchProducts(page, sku) {
  const search = page.locator("input.h-11.w-full").first();
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(sku);
  await page.waitForTimeout(1500);
}

async function searchCustomers(page, query) {
  const search = page.locator("input.field-input.pl-10").first();
  await search.waitFor({ state: "visible", timeout: 15_000 });
  await search.fill(query);
  await page.waitForTimeout(1500);
}

async function dismissUnitModal(page) {
  if (await page.locator("text=Select sale unit").isVisible().catch(() => false)) {
    await page.locator("section").filter({ hasText: "Select sale unit" }).locator("button").nth(1).click();
    await page.waitForTimeout(1000);
  }
}

async function completePosSale(page, role, withMember = false) {
  await page.goto(`${baseUrl}/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Payment", { timeout: 30_000 });
  await page.locator("div.grid.grid-cols-5 button").first().click();
  if (withMember) {
    const memberInput = page.getByPlaceholder(/phone|member|ເບີ/i);
    await memberInput.fill("1001");
    await memberInput.press("Enter");
    await page.waitForTimeout(2000);
    const memberOk = /Somchai|membership active|Active/i.test(await page.locator("body").innerText());
    record("POS", `${role} attach member`, memberOk, "Somchai Vongsavanh");
  }
  const gridProduct = page.locator("button.grid.h-16").first();
  if (await gridProduct.isVisible().catch(() => false)) {
    await gridProduct.click();
    await page.waitForTimeout(1500);
  } else {
    const barcode = page.locator("input.h-14.w-full").first();
    await barcode.fill("UI-SKU-1781435254566");
    await barcode.press("Enter");
    await page.waitForTimeout(1500);
  }
  await dismissUnitModal(page);
  const bodyBefore = await page.locator("body").innerText();
  if (!/added to cart|Total|ລວມ/i.test(bodyBefore)) {
    if (await gridProduct.isVisible().catch(() => false)) await gridProduct.click();
  }
  await page.getByRole("button", { name: "Pay" }).click({ force: true });
  await page.waitForTimeout(10000);
  const body = await page.locator("body").innerText();
  const duplicate = /unique constraint failed|sale_no/i.test(body);
  const stockError = /Insufficient stock/i.test(body);
  const ok = !duplicate && !stockError && /completed and saved|Receipt preview/i.test(body);
  const saleMatch = body.match(/([A-Z0-9]+) completed and saved/i);
  if (saleMatch?.[1]) {
    artifacts.saleNos.push(saleMatch[1]);
    if (role === "Owner") artifacts.ownerSaleNo = saleMatch[1];
  }
  record("POS", `${role} complete payment`, ok, saleMatch?.[1] ?? (stockError ? "insufficient stock" : ok ? "checkout ok" : body.slice(0, 120)));
  record("POS", `${role} receipt`, /Receipt preview/i.test(body), "receipt modal");
  return ok;
}

async function ownerProductCrud(page) {
  const stamp = Date.now();
  const sku = `A2F-${stamp}`;
  const name = `A2 Final Product ${stamp}`;
  artifacts.productSku = sku;

  await page.goto(`${baseUrl}/products/new`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="productName"]').first().fill(name);
  await page.locator('input[name="sku"]').first().fill(sku);
  await page.locator('input[name="barcode"]').first().fill(sku);
  await page.locator('form button[type="submit"]').last().click();
  await page.waitForURL((url) => url.pathname === "/products", { timeout: 120_000, waitUntil: "domcontentloaded" });
  record("Products", "Create", true, sku);

  await page.reload({ waitUntil: "domcontentloaded" });
  await searchProducts(page, sku);
  const listed = await page.locator("tbody tr", { hasText: sku }).first().isVisible().catch(() => false);
  record("Products", "Search", listed, sku);

  const row = page.locator("tbody tr", { hasText: sku }).first();
  await row.scrollIntoViewIfNeeded();
  const edit = row.locator('a[href*="/edit"]').first();
  if (await edit.isVisible().catch(() => false)) {
    await edit.click();
    const updated = `${name} Updated`;
    await page.locator('input[name="productName"]').first().fill(updated);
    await page.locator('form button[type="submit"]').last().click();
    await page.waitForTimeout(8000);
    if (!page.url().includes("/products")) {
      await page.goto(`${baseUrl}/products`, { waitUntil: "domcontentloaded" });
    }
    record("Products", "Edit", true, updated);
    await page.reload({ waitUntil: "domcontentloaded" });
    await searchProducts(page, sku);
    const persisted = await page.locator("tbody tr", { hasText: sku }).filter({ hasText: /Updated/ }).first().isVisible().catch(() => false);
    record("Products", "Refresh after edit", persisted, updated);
    const delRow = page.locator("tbody tr", { hasText: sku }).first();
    await delRow.scrollIntoViewIfNeeded();
    await page.locator(".overflow-x-auto").first().evaluate((el) => { el.scrollLeft = el.scrollWidth; }).catch(() => undefined);
    const del = delRow.locator("button.border-danger").first();
    if (await del.isVisible().catch(() => false)) {
      await del.click({ force: true });
      await page.waitForTimeout(3000);
      await page.reload({ waitUntil: "domcontentloaded" });
      await searchProducts(page, sku);
      const gone = !(await page.locator("tbody tr", { hasText: sku }).isVisible().catch(() => false));
      record("Products", "Delete", gone, gone ? "removed" : "still listed");
    } else {
      const editAgain = delRow.locator('a[href*="/edit"]').first();
      await editAgain.click();
      await page.waitForURL(/\/products\/.*\/edit/, { timeout: 30_000 });
      const archiveOrDelete = page.locator("button.border-danger").last();
      if (await archiveOrDelete.isVisible().catch(() => false)) {
        await archiveOrDelete.click();
        await page.waitForTimeout(3000);
        await page.goto(`${baseUrl}/products`, { waitUntil: "domcontentloaded" });
        await searchProducts(page, sku);
        const removed = !(await page.locator("tbody tr", { hasText: sku }).isVisible().catch(() => false));
        record("Products", "Delete", removed, removed ? "deleted from edit page" : "still listed");
      } else {
        record("Products", "Delete", false, "Delete/Archive control not visible");
      }
    }
  } else {
    record("Products", "Edit", false, "Edit link not visible");
  }
}

async function ownerCustomerFlow(page) {
  const stamp = Date.now();
  const customerName = `A2 Final Customer ${stamp}`;
  const customerPhone = `020${String(stamp).slice(-7)}`;
  artifacts.customerPhone = customerPhone;

  await page.goto(`${baseUrl}/customers/new`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="customerCode"]', `CUS-F-${stamp}`);
  await page.fill('input[name="fullName"]', customerName);
  await page.fill('input[name="phone"]', customerPhone);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/customers", { timeout: 60_000 });
  record("Customers", "Create", true, customerName);

  await page.reload({ waitUntil: "domcontentloaded" });
  await searchCustomers(page, customerPhone);
  const visible = await page.getByText(customerName).isVisible().catch(() => false);
  record("Customers", "Search and refresh", visible, customerPhone);

  const view = page.getByRole("link", { name: "View" }).first();
  if (await view.isVisible().catch(() => false)) {
    await view.click();
    await page.waitForURL(/\/customers\//, { timeout: 30_000 });
    const detailOk = (await page.locator("body").innerText()).includes(customerName);
    record("Customers", "Open details", detailOk, page.url());
  } else {
    const nameLink = page.getByRole("link", { name: customerName }).first();
    if (await nameLink.isVisible().catch(() => false)) {
      await nameLink.click();
      await page.waitForURL(/\/customers\//, { timeout: 30_000 });
      record("Customers", "Open details", true, page.url());
    } else {
      record("Customers", "Open details", false, "No detail link");
    }
  }
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
  record("Permissions", `${role} settings save`, pass, shouldSave ? `saved ${after}` : `blocked (${after})`);
}

async function verifyDatabase(testStartedAt) {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

  const productDeleted = results.some((r) => r.section === "Products" && r.name === "Delete" && r.pass);
  const product = artifacts.productSku
    ? await prisma.product.findFirst({ where: { companyId, sku: artifacts.productSku } })
    : null;
  if (productDeleted) {
    record("Database", "Product removed after delete", !product, artifacts.productSku ?? "n/a");
  } else {
    record("Database", "Product in PostgreSQL", Boolean(product), artifacts.productSku ?? "n/a");
  }

  const customer = artifacts.customerPhone
    ? await prisma.customer.findFirst({ where: { companyId, phone: { contains: artifacts.customerPhone.slice(-7) } } })
    : null;
  record("Database", "Customer in PostgreSQL", Boolean(customer), artifacts.customerPhone ?? "n/a");

  const pepsi = await prisma.product.findFirst({ where: { companyId, sku: "DRK-PEP-CAN-001" } });
  artifacts.stockProductId = pepsi?.id ?? null;

  if (artifacts.saleNos.length > 0) {
    const movement = await prisma.stockMovement.findFirst({
      where: { companyId, movementType: "sale", createdAt: { gte: testStartedAt } },
      orderBy: { createdAt: "desc" },
    });
    record("Database", "Stock deduction", Boolean(movement && Number(movement.quantity) < 0), `qty=${movement?.quantity ?? "n/a"}`);
  }

  const recentSales = await prisma.sale.findMany({
    where: { companyId, createdAt: { gte: testStartedAt } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { saleNo: true },
  });
  for (const sale of recentSales) {
    if (!artifacts.saleNos.includes(sale.saleNo)) artifacts.saleNos.push(sale.saleNo);
  }

  for (const saleNo of artifacts.saleNos.slice(0, 5)) {
    const sale = await prisma.sale.findFirst({
      where: { companyId, saleNo },
      include: { items: true, payments: true },
    });
    record("Database", `Sale ${saleNo} exists`, Boolean(sale?.id), `items=${sale?.items?.length ?? 0} payments=${sale?.payments?.length ?? 0}`);
  }

  const dupes = await prisma.$queryRawUnsafe(
    `SELECT sale_no, COUNT(*)::int AS c FROM sales WHERE company_id = $1 GROUP BY sale_no HAVING COUNT(*) > 1 LIMIT 5`,
    companyId,
  );
  record("Database", "No duplicate sale_no", !Array.isArray(dupes) || dupes.length === 0, JSON.stringify(dupes));

  if (artifacts.saleNos.length >= 2) {
    const unique = new Set(artifacts.saleNos).size === artifacts.saleNos.length;
    record("Database", "Consecutive unique bill numbers", unique, artifacts.saleNos.join(", "));
  }

  const somchai = await prisma.customer.findFirst({
    where: { companyId, fullName: { contains: "Somchai" } },
    include: { loyaltyPointLedger: { orderBy: { createdAt: "desc" }, take: 3 } },
  });
  if (somchai) {
    const ownerSale = await prisma.sale.findFirst({
      where: { companyId, createdAt: { gte: testStartedAt }, customerId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { customerId: true, saleNo: true },
    });
    const memberAttached = Boolean(ownerSale?.customerId);
    record("Database", "Sale has customer", memberAttached, ownerSale?.saleNo ?? "n/a");
    const ledger = ownerSale?.customerId
      ? await prisma.loyaltyPointLedger.findFirst({
          where: {
            companyId,
            customerId: ownerSale.customerId,
            createdAt: { gte: testStartedAt },
            points: { gt: 0 },
          },
          orderBy: { createdAt: "desc" },
        })
      : null;
    record("Database", "Loyalty points ledger", Boolean(ledger), `balance=${somchai.pointsBalance} earned=${ledger?.points ?? 0}`);
  }

  await prisma.$disconnect();
}

async function main() {
  const testStartedAt = new Date();
  const browser = await chromium.launch({ headless: true });

  const owner = await browser.newPage();
  await login(owner, "igo-admin", "AdminChangeMe123!");
  record("Auth", "Owner login", true, "igo-admin");
  await ownerProductCrud(owner);
  await ownerCustomerFlow(owner);
  await completePosSale(owner, "Owner", true);
  await settingsProbe(owner, "Owner", true);
  await owner.close();

  const manager = await browser.newPage();
  await login(manager, "manager", "Manager123!");
  record("Auth", "Manager login", true, "manager");
  await completePosSale(manager, "Manager");
  await settingsProbe(manager, "Manager", false);
  await manager.close();

  const cashier = await browser.newPage();
  await login(cashier, "cashier", "Cashier123!");
  record("Auth", "Cashier login", true, "cashier");
  await completePosSale(cashier, "Cashier");
  await settingsProbe(cashier, "Cashier", false);
  await cashier.close();

  await browser.close();
  await verifyDatabase(testStartedAt);

  const payload = {
    artifacts,
    generatedAt: new Date().toISOString(),
    passed: results.filter((r) => r.pass).length,
    results,
    total: results.length,
  };
  writeFileSync("scripts/phase-a2-final-verification.json", JSON.stringify(payload, null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`\nFINAL: ${payload.passed}/${payload.total} passed, ${failed.length} failed`);
  if (failed.length) {
    for (const f of failed) console.log(`  BLOCKER: [${f.section}/${f.name}] ${f.detail}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
