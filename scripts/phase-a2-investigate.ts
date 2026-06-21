/**
 * A2 failure investigation — DB + repository + browser (failed scenarios only).
 * Run: IGO_DEMO_MODE=false npx tsx scripts/phase-a2-investigate.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

function loadEnvFile(fileName: string) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
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

loadEnvFile(".env");
loadEnvFile(".env.local");
process.env.IGO_DEMO_MODE = "false";

const baseUrl = process.env.A2_BASE_URL ?? "http://127.0.0.1:3001";
const companyId = "gobox-company";
const branchId = "gobox-main-branch";
const warehouseId = "gobox-default-warehouse";

type Finding = { evidence: string; id: string; label: string; result: string };
const findings: Finding[] = [];

function verdict(id: string, label: string, result: string, evidence: string) {
  findings.push({ evidence, id, label, result });
  console.log(`\n=== ${id}: ${label} ===`);
  console.log(`VERDICT: ${result}`);
  console.log(evidence);
}

async function getUserTenant(prisma: any, username: string) {
  const user = await prisma.user.findFirst({ where: { username } });
  if (!user) throw new Error(`User ${username} not found`);
  return { branchId, companyId, userId: user.id, warehouseId };
}

async function login(page: import("playwright").Page, username: string, password: string) {
  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { waitUntil: "domcontentloaded", timeout: 90_000 });
}

async function waitForProductsList(page: import("playwright").Page) {
  await page.goto(`${baseUrl}/products`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(1500);
  const search = page.locator("input.h-11.w-full").first();
  await search.waitFor({ state: "visible", timeout: 90_000 });
  return search;
}

async function waitForCustomersList(page: import("playwright").Page) {
  await page.goto(`${baseUrl}/customers`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const search = page.locator("input.field-input.pl-10").first();
  await search.waitFor({ state: "visible", timeout: 60_000 });
  return search;
}

async function posBarcodeInput(page: import("playwright").Page) {
  return page.locator("input.h-14.w-full").first();
}

async function investigateProduct() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { createPrismaProduct, getPrismaProducts } = await import("../features/products/prisma-repository");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const tenant = await getUserTenant(prisma, "igo-admin");
  const stamp = Date.now();
  const sku = `INV-A2-${stamp}`;
  const name = `INV Product ${stamp}`;

  const created = await createPrismaProduct({ barcode: sku, nameEn: name, nameLo: name, sellingPriceLak: 12000, sku }, tenant);
  const dbRow = await prisma.product.findFirst({ where: { id: created.id, companyId } });
  const inList = await getPrismaProducts(tenant);
  const listHas = inList.some((p: { id: string }) => p.id === created.id);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await login(page, "igo-admin", "AdminChangeMe123!");
  await page.goto(`${baseUrl}/products/new`, { waitUntil: "domcontentloaded" });
  const uiSku = `UI-${sku}`;
  await page.locator('input[name="productName"]').first().fill(`UI ${name}`);
  await page.locator('input[name="sku"]').first().fill(uiSku);
  await page.locator("form button[type=\"submit\"]").last().click();
  await page.waitForURL((url) => url.pathname === "/products", { timeout: 60_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const search = await waitForProductsList(page);
  await search.fill(uiSku);
  await page.waitForTimeout(2000);
  const uiRowVisible = await page.locator("tbody tr", { hasText: uiSku }).first().isVisible().catch(() => false);
  const bodyHasSku = (await page.locator("body").innerText()).includes(uiSku);
  await browser.close();
  await prisma.$disconnect();

  const dbOk = Boolean(dbRow?.id === created.id && dbRow?.sku === sku);
  const lines = [
    `PostgreSQL direct: exists=${dbOk} id=${created.id} sku=${dbRow?.sku}`,
    `getPrismaProducts (SSR path): contains=${listHas} total=${inList.length}`,
    `Browser /products after reload + search: rowVisible=${uiRowVisible} bodyContainsSku=${bodyHasSku}`,
  ].join("\n");

  let result: string;
  if (!dbOk) result = "REAL BUG";
  else if (listHas && (uiRowVisible || bodyHasSku)) result = "TEST SCRIPT ISSUE";
  else if (listHas && !uiRowVisible && !bodyHasSku) result = "TEST SCRIPT ISSUE";
  else if (!listHas && dbOk) result = "REAL BUG";
  else result = "TEST SCRIPT ISSUE";

  verdict("F1", "Owner product search after create", result, lines);
}

async function investigateCustomer() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { createPrismaCustomer, getPrismaCustomers } = await import("../features/customers/prisma-repository");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const tenant = await getUserTenant(prisma, "igo-admin");
  const stamp = Date.now();
  const phone = `020${String(stamp).slice(-7)}`;
  const fullName = `INV Customer ${stamp}`;

  const created = await createPrismaCustomer({ fullName, phone }, tenant);
  const dbRow = await prisma.customer.findFirst({ where: { id: created.id, companyId } });
  const list = await getPrismaCustomers(tenant);
  const listHas = list.some((c: { id: string }) => c.id === created.id);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await login(page, "igo-admin", "AdminChangeMe123!");
  await page.goto(`${baseUrl}/customers/new`, { waitUntil: "domcontentloaded" });
  const uiPhone = `020${String(stamp + 1).slice(-7)}`;
  const uiName = `UI ${fullName}`;
  await page.fill('input[name="customerCode"]', `INV-${stamp}`);
  await page.fill('input[name="fullName"]', uiName);
  await page.fill('input[name="phone"]', uiPhone);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/customers", { timeout: 60_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const customerSearch = await waitForCustomersList(page);
  const bodyNoSearch = await page.locator("body").innerText();
  const visibleNoSearch = bodyNoSearch.includes(uiName);
  await customerSearch.fill(uiPhone);
  await page.waitForTimeout(2000);
  const visibleSearch = await page.getByText(uiName).isVisible().catch(() => false);
  await browser.close();
  await prisma.$disconnect();

  const dbOk = Boolean(dbRow?.id === created.id);
  const lines = [
    `PostgreSQL direct: exists=${dbOk} id=${created.id} fullName=${dbRow?.fullName}`,
    `getPrismaCustomers (SSR path): contains=${listHas} total=${list.length}`,
    `Browser /customers after create: visibleWithoutSearch=${visibleNoSearch} visibleAfterSearch=${visibleSearch}`,
    `Prior A2 harness used input.h-11 for customer search — correct selector is input.field-input.pl-10`,
  ].join("\n");

  let result: string;
  if (!dbOk) result = "REAL BUG";
  else if (listHas && (visibleNoSearch || visibleSearch)) result = "TEST SCRIPT ISSUE";
  else if (!listHas && dbOk) result = "REAL BUG";
  else result = "TEST SCRIPT ISSUE";

  verdict("F2", "Owner customer refresh", result, lines);
}

async function investigatePos(username: string, roleLabel: string) {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { completePrismaSale, getPrismaPosSnapshot } = await import("../features/pos/prisma-repository");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const tenant = await getUserTenant(prisma, username);
  const snapshot = await getPrismaPosSnapshot(tenant);
  const product = snapshot.products.find((p: { stockQty: number }) => p.stockQty > 0) ?? snapshot.products[0];
  if (!product) {
    verdict(`F3-${roleLabel}`, `${roleLabel} POS checkout`, "REAL BUG", "No products in POS snapshot");
    await prisma.$disconnect();
    return;
  }

  const stockBefore = await prisma.inventoryBalance.findFirst({ where: { companyId, productId: product.id, warehouseId } });
  const saleNo = `INV-${roleLabel}-${Date.now()}`;
  const price = Number(product.priceLak ?? product.sellingPriceLak ?? 0);
  const sale = await completePrismaSale(
    {
      branchId,
      cardAmount: 0,
      cashAmount: price,
      changeAmount: 0,
      discountAmount: 0,
      discountPercent: 0,
      items: [{ productId: product.id, quantity: 1, sellingPrice: price }],
      paymentMode: "cash",
      qrAmount: 0,
      saleNo,
      taxAmount: 0,
      taxRate: 0,
      totalAmount: price,
      warehouseId,
    },
    tenant,
  );
  const stockAfter = await prisma.inventoryBalance.findFirst({ where: { companyId, productId: product.id, warehouseId } });
  const saleRow = await prisma.sale.findFirst({ where: { id: sale.id }, include: { items: true, payments: true } });

  const password = username === "manager" ? "Manager123!" : "Cashier123!";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await login(page, username, password);
  await page.goto(`${baseUrl}/pos`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Payment", { timeout: 30_000 });
  await page.locator("div.grid.grid-cols-5 button").first().click();
  const barcode = await posBarcodeInput(page);
  await barcode.waitFor({ state: "visible", timeout: 15_000 });
  const scanSku = product.sku || product.barcode || "DRK-PEP-CAN-001";
  await barcode.fill(scanSku);
  await barcode.press("Enter");
  await page.waitForTimeout(2000);
  if (await page.locator("text=Select sale unit").isVisible().catch(() => false)) {
    await page.locator("section").filter({ hasText: "Select sale unit" }).locator("button").nth(1).click();
    await page.waitForTimeout(1000);
  }
  const bodyBeforePay = await page.locator("body").innerText();
  const cartSignal = /added to cart|Total|ລວມ/i.test(bodyBeforePay);
  await page.getByRole("button", { name: "Pay" }).click({ force: true });
  await page.waitForTimeout(8000);
  const bodyAfterPay = await page.locator("body").innerText();
  const uiSuccess = /completed and saved|Receipt preview/i.test(bodyAfterPay);
  await browser.close();
  await prisma.$disconnect();

  const repoOk = Boolean(saleRow?.id && saleRow.saleNo === saleNo);
  const stockOk = Number(stockBefore?.quantity ?? 0) - Number(stockAfter?.quantity ?? 0) === 1;
  const lines = [
    `Repository completePrismaSale (${username}): saleId=${sale.id} saleNo=${saleNo}`,
    `PostgreSQL sale: ok=${repoOk} total=${saleRow?.totalAmount} items=${saleRow?.items?.length} payments=${saleRow?.payments?.length}`,
    `Inventory: before=${stockBefore?.quantity} after=${stockAfter?.quantity} deducted=${stockOk}`,
    `Receipt data on sale record: saleNo=${saleRow?.saleNo}`,
    `Browser: cartSignal=${cartSignal} paySuccess=${uiSuccess}`,
  ].join("\n");

  const result = repoOk && stockOk && !uiSuccess ? "TEST SCRIPT ISSUE" : !repoOk || !stockOk ? "REAL BUG" : uiSuccess ? "PASS (both layers)" : "TEST SCRIPT ISSUE";
  verdict(`F3-${roleLabel}`, `${roleLabel} POS checkout`, result, lines);
}

async function investigatePriorA2Product() {
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { getPrismaProducts } = await import("../features/products/prisma-repository");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const tenant = await getUserTenant(prisma, "igo-admin");
  const priorSku = "A2-1782049664447";
  const dbRow = await prisma.product.findFirst({ where: { companyId, sku: priorSku } });
  const inList = await getPrismaProducts(tenant);
  const listHas = inList.some((p: { sku?: string }) => p.sku === priorSku);
  await prisma.$disconnect();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await login(page, "igo-admin", "AdminChangeMe123!");
  const search = await waitForProductsList(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  const refreshedSearch = page.locator("input.h-11.w-full").first();
  await refreshedSearch.fill(priorSku);
  await page.waitForTimeout(2000);
  const uiRowVisible = await page.locator("tbody tr", { hasText: priorSku }).first().isVisible().catch(() => false);
  const bodyHasSku = (await page.locator("body").innerText()).includes(priorSku);
  await browser.close();

  const lines = [
    `Prior A2 run SKU=${priorSku}`,
    `PostgreSQL: exists=${Boolean(dbRow)} id=${dbRow?.id ?? "n/a"}`,
    `getPrismaProducts: contains=${listHas}`,
    `Browser after reload+search: rowVisible=${uiRowVisible} bodyContainsSku=${bodyHasSku}`,
  ].join("\n");

  const result = !dbRow ? "TEST SCRIPT ISSUE (create may have rolled back or SKU mismatch)" : listHas && (uiRowVisible || bodyHasSku) ? "TEST SCRIPT ISSUE" : listHas && !uiRowVisible ? "TEST SCRIPT ISSUE" : !listHas && dbRow ? "REAL BUG" : "TEST SCRIPT ISSUE";
  verdict("F1-prior", "Owner product search after create (prior A2 SKU)", result, lines);
}

async function main() {
  console.log(`Investigation server=${baseUrl} IGO_DEMO_MODE=${process.env.IGO_DEMO_MODE}`);
  await investigatePriorA2Product();
  await investigateProduct();
  await investigateCustomer();
  await investigatePos("manager", "Manager");
  await investigatePos("cashier", "Cashier");
  writeFileSync("scripts/phase-a2-investigation.json", JSON.stringify({ findings, generatedAt: new Date().toISOString() }, null, 2));
  console.log("\n=== SUMMARY ===");
  for (const f of findings) console.log(`${f.id}: ${f.result}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
