import type { Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { expect, loginToDashboard, test } from "./support/qa-fixtures";
import { qaApi, qaApiRaw, regexEscape } from "./support/phase2-helpers";

type ProductUnit = {
  id: string;
  unitName: string;
  conversionQty: number;
  barcode: string;
  costPriceLak: number;
  pricingMode: "manual" | "cost_plus_percent" | "cost_plus_amount";
  markupPercent: number;
  addAmountLak: number;
  roundingLak: number;
  sellingPriceLak: number;
  isBaseUnit: boolean;
  isDefaultSaleUnit: boolean;
  isPurchaseUnit: boolean;
  status: "active" | "inactive";
  sortOrder: number;
};

type Product = {
  id: string;
  nameEn: string;
  nameLo: string;
  sku: string;
  barcode: string;
  categoryId: string;
  currentStock?: number;
  imageUrl?: string;
  imageDisplayUrl?: string;
  imageThumbUrl?: string;
  minStock: number;
  targetStock: number;
  reorderQtyMode: "AUTO" | "MANUAL";
  status: string;
  units: ProductUnit[];
};

type CashSession = {
  id: string;
  status: "open" | "closed";
  expectedCashLak: number;
  openingCashLak: number;
};

type CashContext = {
  attendanceCashSessionId: string | null;
  attendanceOpen: boolean;
  requireCashShiftBeforeSale: boolean;
  session: CashSession | null;
};

type RecentSale = {
  id: string;
  saleNo: string;
  receiptNo: string;
  status: string;
  items: Array<{ id: string; unitName?: string; conversionQty?: number; quantity: number }>;
};

type RecentSalesPage = { items: RecentSale[] };
type Customer = { id: string; fullName: string; phone: string; pointsBalance?: number };
type HeldSale = { id: string; items: Array<{ id: string; unitName?: string; quantity: number }> };

type Phase2State = {
  product?: Product;
  productName: string;
  stockBefore?: number;
  stockAfterSale?: number;
  expectedDeduction: number;
  session?: CashSession;
  createdSession: boolean;
  saleAllowedWithoutSession: boolean;
  sale?: RecentSale;
  heldId?: string;
  customer?: Customer;
  cleanupErrors: string[];
};

const statePath = path.resolve("test-results/.phase2-run-state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as Phase2State;
const suffix = state.productName.replace(/^TEST-P2-/, "").replace(/-EDIT$/, "");

function saveState() {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function unit(product: Product, name: string) {
  const result = product.units.find((entry) => entry.unitName === name);
  if (!result) throw new Error(`Environment/data blocker: ${name} unit was not returned for ${product.nameEn}.`);
  return result;
}

async function openPos(page: Page) {
  await loginToDashboard(page);
  await page.addInitScript(() => localStorage.setItem("ego.pos.unitDisplayMode", "separate"));
  await page.goto("/pos");
  await expect(page.getByRole("main")).toBeVisible();
}

async function safeGoto(page: Page, route: string) {
  try {
    await page.goto(route, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED")) throw error;
  }
  await expect(page).toHaveURL(new RegExp(regexEscape(route.split("?")[0])));
}

async function addProductUnit(page: Page, productName: string, unitName: string) {
  const search = page.getByPlaceholder(/search|scan/i);
  await search.fill(productName);
  const card = page.locator("button[title]").filter({ hasText: productName }).filter({ hasText: unitName }).first();
  await expect(card).toBeVisible();
  await card.click();
}

async function latestProduct(page: Page) {
  const products = await qaApi<Product[]>(page, "/api/products");
  return products.find((product) => product.id === state.product?.id);
}

async function findCreatedSale(page: Page) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const sales = await qaApi<RecentSalesPage>(page, `/api/pos/sales?search=${encodeURIComponent(state.productName)}&limit=20`);
    const sale = sales.items.find((entry) => entry.items.some((item) => item.id === state.product?.id));
    if (sale) return sale;
    await page.waitForTimeout(500);
  }
  throw new Error(`Application defect: completed sale for ${state.productName} did not appear in Recent Sales.`);
}

async function cleanPhase2Data(page: Page) {
  state.cleanupErrors = [];
  try {
    if (state.sale && !["voided", "deleted"].includes(state.sale.status)) {
      const result = await qaApiRaw<{ sale?: RecentSale }>(page, `/api/pos/sales/${state.sale.id}/void`, "POST", { reason: `TEST Phase 2 cleanup ${suffix}` });
      if (!result.response.ok() && !/already (?:voided|refunded)/i.test(result.payload.message ?? result.payload.error ?? "")) {
        state.cleanupErrors.push(`sale cleanup: ${result.payload.message ?? result.payload.error ?? result.response.statusText()}`);
      }
    }
    if (state.heldId) {
      const result = await qaApiRaw(page, `/api/pos/held-bills/${state.heldId}/cancel`, "POST", { reason: `TEST Phase 2 cleanup ${suffix}` });
      if (!result.response.ok() && !/cancelled|completed|not found/i.test(result.payload.message ?? result.payload.error ?? "")) {
        state.cleanupErrors.push(`held bill cleanup: ${result.payload.message ?? result.payload.error ?? result.response.statusText()}`);
      }
    }
    if (state.customer) {
      const result = await qaApiRaw(page, `/api/customers/${state.customer.id}`, "DELETE");
      if (!result.response.ok()) state.cleanupErrors.push(`customer archive: ${result.payload.message ?? result.payload.error ?? result.response.statusText()}`);
    }
    if (state.product) {
      const result = await qaApiRaw(page, `/api/products/${state.product.id}`, "DELETE");
      if (!result.response.ok()) state.cleanupErrors.push(`product archive: ${result.payload.message ?? result.payload.error ?? result.response.statusText()}`);
    }
    if (state.createdSession && state.session) {
      const current = await qaApi<CashContext>(page, "/api/pos/cash-sessions/current");
      if (current.session?.id === state.session.id) {
        await qaApi(page, "/api/pos/cash-sessions/close", "POST", {
          sessionId: state.session.id,
          countedCashLak: current.session.expectedCashLak,
          note: `TEST Phase 2 cleanup ${suffix}`,
        });
        await qaApi(page, "/api/pos/attendance/end-work", "POST", { note: `TEST Phase 2 cleanup ${suffix}` });
      }
    }
  } catch (error) {
    state.cleanupErrors.push(error instanceof Error ? error.message : String(error));
  }
  saveState();
}

test.describe("Products", () => {
  test("creates and edits an isolated multi-unit TEST product with pricing and reorder settings", async ({ page }) => {
    test.setTimeout(90_000);
    await loginToDashboard(page);
    const categories = await qaApi<Array<{ id: string; status: string }>>(page, "/api/products/categories");
    const category = categories.find((entry) => entry.status === "active") ?? categories[0];
    test.skip(!category, "Environment/data blocker: no QA category exists for the isolated TEST product.");

    const base = `TEST-P2-${suffix}`;
    const created = await qaApi<Product>(page, "/api/products", "POST", {
      nameEn: base,
      nameLo: base,
      sku: base,
      barcode: `P2${Date.now()}`,
      categoryId: category.id,
      costPriceLak: 1_000,
      sellingPriceLak: 2_000,
      minStock: 10,
      targetStock: 150,
      reorderQtyMode: "MANUAL",
      stockDisplayMode: "breakdown",
      status: "active",
      initialStock: { quantity: 120, unitName: "Piece", unitCostLak: 1_000, lotNumber: `TEST-${suffix}` },
      units: [
        { unitName: "Piece", conversionQty: 1, barcode: `PCE${Date.now()}`, costPriceLak: 1_000, pricingMode: "manual", markupPercent: 0, addAmountLak: 0, roundingLak: 0, sellingPriceLak: 2_000, isBaseUnit: true, isDefaultSaleUnit: true, isPurchaseUnit: false, status: "active", sortOrder: 0 },
        { unitName: "Pack", conversionQty: 6, barcode: `PAK${Date.now()}`, costPriceLak: 6_000, pricingMode: "manual", markupPercent: 0, addAmountLak: 0, roundingLak: 0, sellingPriceLak: 11_000, isBaseUnit: false, isDefaultSaleUnit: false, isPurchaseUnit: true, status: "active", sortOrder: 1 },
        { unitName: "Box", conversionQty: 24, barcode: `BOX${Date.now()}`, costPriceLak: 24_000, pricingMode: "cost_plus_percent", markupPercent: 20, addAmountLak: 0, roundingLak: 1_000, sellingPriceLak: 29_000, isBaseUnit: false, isDefaultSaleUnit: false, isPurchaseUnit: false, status: "active", sortOrder: 2 },
        { unitName: "Case", conversionQty: 48, barcode: `CSE${Date.now()}`, costPriceLak: 48_000, pricingMode: "cost_plus_amount", markupPercent: 0, addAmountLak: 2_000, roundingLak: 500, sellingPriceLak: 50_000, isBaseUnit: false, isDefaultSaleUnit: false, isPurchaseUnit: false, status: "inactive", sortOrder: 3 },
      ],
    });
    state.product = created;
    saveState();

    const editedUnits = created.units.map((entry) => ({
      ...entry,
      barcode: entry.unitName === "Piece" ? `PC2${Date.now()}` : entry.barcode,
    }));
    const edited = await qaApi<Product>(page, `/api/products/${created.id}`, "PATCH", {
      nameEn: state.productName,
      nameLo: state.productName,
      categoryId: category.id,
      barcode: `P2E${Date.now()}`,
      units: editedUnits,
    });
    state.product = edited;
    const persisted = (await qaApi<Product[]>(page, "/api/products")).find((product) => product.id === edited.id);
    state.stockBefore = Number(persisted?.currentStock);
    saveState();

    expect(unit(edited, "Piece")).toMatchObject({ conversionQty: 1, pricingMode: "manual", sellingPriceLak: 2_000, status: "active" });
    expect(unit(edited, "Pack")).toMatchObject({ conversionQty: 6, costPriceLak: 6_000, pricingMode: "manual", status: "active" });
    expect(unit(edited, "Box")).toMatchObject({ conversionQty: 24, costPriceLak: 24_000, pricingMode: "cost_plus_percent", markupPercent: 20, roundingLak: 1_000, status: "active" });
    expect(unit(edited, "Case")).toMatchObject({ pricingMode: "cost_plus_amount", roundingLak: 500, status: "inactive" });
    expect(edited).toMatchObject({ minStock: 10, targetStock: 150, reorderQtyMode: "MANUAL" });
    expect(state.stockBefore).toBe(120);

    await page.goto("/products");
    await page.getByPlaceholder(/search/i).fill(state.productName);
    await expect(page.getByText(state.productName, { exact: true }).first()).toBeVisible();
  });
});

test.describe("Product Images", () => {
  test("renders an existing assigned product image in Products and POS", async ({ page }) => {
    await loginToDashboard(page);
    const products = await qaApi<Product[]>(page, "/api/products");
    const imageProduct = products.find((product) => product.status === "active" && (product.imageDisplayUrl || product.imageThumbUrl || product.imageUrl || product.units.some((entry) => Boolean((entry as ProductUnit & { imageUrl?: string }).imageUrl))));
    test.skip(!imageProduct, "Environment/data blocker: QA has no active product with an assigned image; Brave/external image APIs are intentionally not required.");
    const assigned = imageProduct!;

    await page.goto("/products");
    await page.getByPlaceholder(/search/i).fill(assigned.nameEn || assigned.nameLo);
    await expect(page.locator("img").first()).toBeVisible();
    await page.addInitScript(() => localStorage.setItem("ego.pos.unitDisplayMode", "separate"));
    await page.goto("/pos");
    await page.getByPlaceholder(/search|scan/i).fill(assigned.nameEn || assigned.nameLo);
    await expect(page.locator("img:visible").first()).toBeVisible();
  });
});

test.describe("Cash Session", () => {
  test("opens or verifies the cash session and attendance state", async ({ page }) => {
    await loginToDashboard(page);
    let current = await qaApi<CashContext>(page, "/api/pos/cash-sessions/current");
    let recoveryBlocked = !current.session && current.attendanceOpen;
    state.saleAllowedWithoutSession = current.requireCashShiftBeforeSale === false;
    saveState();
    if (recoveryBlocked && current.attendanceCashSessionId == null) {
      await qaApi(page, "/api/pos/attendance/end-work", "POST", { note: `TEST Phase 2 safe orphan-attendance recovery ${suffix}` });
      current = await qaApi<CashContext>(page, "/api/pos/cash-sessions/current");
      recoveryBlocked = !current.session && current.attendanceOpen;
    }
    if (!current.session && !recoveryBlocked) {
      const opened = await qaApi<CashSession>(page, "/api/pos/cash-sessions/open", "POST", { openingCashLak: 0, note: `TEST Phase 2 ${suffix}` });
      state.createdSession = true;
      state.session = opened;
      saveState();
      current = await qaApi<CashContext>(page, "/api/pos/cash-sessions/current");
    } else {
      state.session = current.session ?? undefined;
      saveState();
    }
    if (!recoveryBlocked) expect(current.session?.status).toBe("open");
    expect(current.attendanceOpen).toBe(true);

    await page.goto("/pos");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /cash shift count/i }).click();
    await expect(page.getByTestId("cash-shift-ui-state")).toBeVisible();
    await expect(page.getByTestId("open-cash-session")).toBeVisible();
    await expect(page.getByTestId("end-work")).toBeVisible();
    test.skip(recoveryBlocked, "Environment/data blocker: QA attendance is open without a cash session; End Work/recovery requires deliberate operator action before a new session can be opened.");
  });

  test("rejects an unsafe cash overdraw on the isolated test-created session", async ({ page }) => {
    test.skip(!state.createdSession || !state.session, "Environment/data blocker: no isolated test-created cash session is available, so destructive overdraw probing is unsafe.");
    const session = state.session!;
    await loginToDashboard(page);
    const current = await qaApi<CashContext>(page, "/api/pos/cash-sessions/current");
    const overdraw = await qaApiRaw(page, "/api/pos/cash-sessions/cash-out", "POST", {
      sessionId: session.id,
      amountLak: current.session!.expectedCashLak + 1,
      reason: `TEST unsafe overdraw guard ${suffix}`,
    });
    expect(overdraw.response.ok(), "Cash Out above expected cash must be rejected without mutation.").toBe(false);
  });

  test("records balanced TEST Cash In and Cash Out without changing expected cash", async ({ page }) => {
    test.skip(!state.session, "Environment/data blocker: no open QA cash session is available.");
    const session = state.session!;
    await loginToDashboard(page);
    const before = await qaApi<CashContext>(page, "/api/pos/cash-sessions/current");
    await qaApi(page, "/api/pos/cash-sessions/cash-in", "POST", { sessionId: session.id, amountLak: 100, reason: `TEST Phase 2 in ${suffix}` });
    await qaApi(page, "/api/pos/cash-sessions/cash-out", "POST", { sessionId: session.id, amountLak: 100, reason: `TEST Phase 2 out ${suffix}` });
    const after = await qaApi<CashContext>(page, "/api/pos/cash-sessions/current");
    expect(after.session?.expectedCashLak).toBe(before.session?.expectedCashLak);
  });
});

test.describe("Hold/Resume", () => {
  test("holds an isolated cart and restores its product, unit and quantity", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!state.product || (!state.session && !state.saleAllowedWithoutSession), "Environment/data blocker: isolated TEST product is unavailable or QA requires a cash session that cannot be opened safely.");
    await openPos(page);
    await addProductUnit(page, state.productName, "Piece");
    await page.getByRole("button", { name: /increase qty/i }).first().click();
    await page.getByRole("button", { name: /hold bill/i }).click();
    await expect(page.getByRole("button", { name: /hold bill/i })).toBeDisabled();

    const held = await qaApi<HeldSale[]>(page, "/api/pos/held-bills");
    const own = held.find((entry) => entry.items.some((item) => item.id === state.product!.id));
    expect(own, "Held TEST bill must be persisted and discoverable.").toBeTruthy();
    state.heldId = own!.id;
    saveState();

    await page.getByRole("button", { name: /resume bills/i }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select").selectOption(own!.id);
    await dialog.getByRole("button", { name: /^resume bills$/i }).click();
    await expect(page.getByText(new RegExp(`${regexEscape(state.productName)}.*Piece`, "i")).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /decrease qty/i }).first().locator("xpath=following-sibling::*[1]")).toHaveValue("2");
  });
});

test.describe("POS sale", () => {
  test("completes a Piece, Pack and Box cash sale and exposes receipt and Recent Sales", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!state.product || (!state.session && !state.saleAllowedWithoutSession), "Environment/data blocker: isolated TEST product is unavailable or QA requires a cash session that cannot be opened safely.");
    await openPos(page);

    // The resumed Piece line is local to the previous test context, so build a fresh deterministic cart.
    await addProductUnit(page, state.productName, "Piece");
    await page.getByRole("button", { name: /increase qty/i }).first().click();
    await addProductUnit(page, state.productName, "Pack");
    await addProductUnit(page, state.productName, "Box");
    await expect(page.getByText(/2,000.*Piece/i).first()).toBeVisible();
    await expect(page.getByText(/11,000.*Pack/i).first()).toBeVisible();
    await expect(page.getByText(/29,000.*Box/i).first()).toBeVisible();

    await page.getByRole("button", { name: /^exact$/i }).click();
    await page.getByRole("button", { name: /^pay$/i }).click();
    const completed = page.getByRole("dialog", { name: /payment completed/i });
    await expect(completed).toBeVisible({ timeout: 30_000 });
    await completed.getByRole("button", { name: /view receipt/i }).click();
    await expect(page.getByText(new RegExp(regexEscape(state.productName), "i")).first()).toBeVisible();

    state.sale = await findCreatedSale(page);
    saveState();
    expect(state.sale.items.map((item) => item.unitName)).toEqual(expect.arrayContaining(["Piece", "Pack", "Box"]));
    await page.getByRole("button", { name: /close/i }).first().click();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /recent sales/i }).click();
    await expect(page.getByText(state.sale.saleNo, { exact: false }).first()).toBeVisible();
  });
});

test.describe("Stock deduction", () => {
  test("deducts base stock using Piece=1, Pack=6 and Box=24 conversions", async ({ page }) => {
    test.skip(!state.product || !state.sale || state.stockBefore == null, "Environment/data blocker: the multi-unit TEST sale was not created.");
    const sale = state.sale!;
    await loginToDashboard(page);
    const product = await latestProduct(page);
    expect(product).toBeTruthy();
    state.stockAfterSale = Number(product!.currentStock);
    saveState();
    expect(state.stockAfterSale).toBe(state.stockBefore! - state.expectedDeduction);
    const sold = sale.items.filter((item) => item.id === state.product!.id);
    expect(sold.reduce((sum, item) => sum + item.quantity * Number(item.conversionQty ?? 1), 0)).toBe(state.expectedDeduction);
  });
});

test.describe("Refund/Void", () => {
  test("voids only the TEST sale, retains unit labels, and restores stock", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!state.product || !state.sale || state.stockBefore == null, "Environment/data blocker: no isolated TEST sale is available to void.");
    const sale = state.sale!;
    await loginToDashboard(page);
    const result = await qaApi<{ status: string; sale: RecentSale }>(page, `/api/pos/sales/${sale.id}/void`, "POST", { reason: `TEST Phase 2 void ${suffix}` });
    state.sale = result.sale;
    saveState();
    expect(result.status).toBe("completed");
    expect(result.sale.status).toBe("voided");
    expect(result.sale.items.map((item) => item.unitName)).toEqual(expect.arrayContaining(["Piece", "Pack", "Box"]));
    const restored = await latestProduct(page);
    expect(Number(restored?.currentStock)).toBe(state.stockBefore);
  });
});

test.describe("Inventory", () => {
  test("shows the TEST product across stock, movement, count, reorder and settings surfaces", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!state.product, "Environment/data blocker: isolated TEST product setup is unavailable.");
    await loginToDashboard(page);
    for (const route of ["/inventory", "/inventory/adjustment", "/inventory/count", "/inventory/reorder", "/inventory/reorder-settings", `/reports/inventory/movements?q=${encodeURIComponent(state.productName)}`]) {
      await safeGoto(page, route);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByText(/access denied|internal server error/i)).toHaveCount(0);
    }
    await safeGoto(page, `/inventory/reorder-settings?q=${encodeURIComponent(state.productName)}`);
    await expect(page.getByText(state.productName, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("main")).toContainText("MANUAL");
    await expect(page.getByRole("main")).toContainText("150");
  });
});

test.describe("Purchasing", () => {
  test("builds an unsaved TEST-product purchase-order draft without sending or approving it", async ({ page }) => {
    test.skip(!state.product, "Environment/data blocker: isolated TEST product setup is unavailable.");
    await loginToDashboard(page);
    await page.goto("/purchasing/new");
    const search = page.getByRole("textbox", { name: /search products/i });
    await search.fill(state.productName);
    await page.getByRole("button", { name: new RegExp(regexEscape(state.productName), "i") }).click();
    await expect(page.getByRole("main")).toContainText(state.productName);
    // Navigate away deliberately: this validates a safe draft workflow without persisting a supplier order.
    await page.goto("/purchasing");
    await expect(page.getByRole("main")).toBeVisible();
  });
});

test.describe("Customers/Membership", () => {
  test("creates, searches and selects an isolated TEST member without changing points", async ({ page }) => {
    test.setTimeout(90_000);
    await loginToDashboard(page);
    const phone = `020${Date.now().toString().slice(-8)}`;
    state.customer = await qaApi<Customer>(page, "/api/customers", "POST", {
      fullName: `TEST Member ${suffix}`,
      phone,
      email: `test-${suffix.toLowerCase()}@example.invalid`,
      notes: `TEST Phase 2 ${suffix}`,
      openingBalance: 0,
      creditLimit: 0,
    });
    saveState();
    const pointsBefore = Number(state.customer.pointsBalance ?? 0);

    await page.goto("/customers");
    await page.getByPlaceholder(/phone|ໂທ/i).fill(phone);
    await expect(page.getByText(state.customer.fullName, { exact: true })).toBeVisible();

    await page.goto("/pos");
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /member search/i }).click();
    await page.getByTestId("pos-member-search-panel").locator("input").first().fill(phone);
    const results = page.getByTestId("pos-member-search-results");
    await expect(results).toContainText(state.customer.fullName);
    await results.getByRole("button").first().click();
    await expect(page.getByTestId("pos-selected-member")).toContainText(state.customer.fullName);

    const customers = await qaApi<Customer[]>(page, "/api/customers");
    expect(Number(customers.find((entry) => entry.id === state.customer!.id)?.pointsBalance ?? 0)).toBe(pointsBefore);
  });
});

test.describe("Promotions", () => {
  test("loads the promotions workspace and all supported lifecycle filters", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/promotions");
    const statuses = page.locator('select:has(option[value="scheduled"])');
    await expect(statuses).toBeVisible();
    const statusText = (await statuses.locator("option").allTextContents()).join(" ");
    expect(statusText).toMatch(/active/i);
    expect(statusText).toMatch(/scheduled/i);
    expect(statusText).toMatch(/inactive/i);
    expect(statusText).toMatch(/expired/i);
  });

  test("creates an isolated TEST draft promotion when QA supports a draft state", async () => {
    test.skip(true, "Environment/data blocker: QA promotion contract supports active/inactive/scheduled/expired but has no non-effective draft status; creating an active promotion is unsafe.");
  });
});

test.describe("Reports", () => {
  test("shows the TEST transaction on sales and void reporting pages", async ({ page }) => {
    test.setTimeout(90_000);
    test.skip(!state.sale, "Environment/data blocker: no isolated TEST transaction is available for report verification.");
    const sale = state.sale!;
    await loginToDashboard(page);
    for (const route of [
      `/reports/sales/receipts?q=${encodeURIComponent(sale.saleNo)}`,
      `/reports/sales/refunds-voids?q=${encodeURIComponent(sale.saleNo)}`,
      `/reports/inventory/movements?q=${encodeURIComponent(state.productName)}`,
    ]) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByText(/access denied|internal server error/i)).toHaveCount(0);
    }
    await page.goto(`/reports/sales/refunds-voids?q=${encodeURIComponent(sale.saleNo)}`);
    await expect(page.getByRole("main")).toContainText(sale.saleNo);
  });
});

test.describe("Permissions", () => {
  test("a restricted account is denied protected settings access", async ({ browser }) => {
    test.skip(!process.env.EGO_QA_RESTRICTED_USERNAME || !process.env.EGO_QA_RESTRICTED_PASSWORD, "Environment/data blocker: dedicated restricted QA credentials are not present in .env.test; Owner access is not treated as permission coverage.");
    const page = await browser.newPage();
    await page.goto("/login");
    await page.getByRole("textbox", { name: /email|username/i }).fill(process.env.EGO_QA_RESTRICTED_USERNAME!);
    await page.locator("#merchant-login-password").fill(process.env.EGO_QA_RESTRICTED_PASSWORD!);
    await page.getByRole("button", { name: /sign in|login/i }).click();
    await page.goto("/settings");
    await expect(page.getByText(/access denied|not authorized|permission/i)).toBeVisible();
    await page.context().close();
  });
});

test.describe("Cleanup", () => {
  test("archives only the isolated TEST records and closes only a test-created cash session", async ({ page }) => {
    test.setTimeout(90_000);
    await loginToDashboard(page);
    await cleanPhase2Data(page);
    expect(state.cleanupErrors, `QA cleanup must not leave TEST records or a test-created cash session active: ${state.cleanupErrors.join("; ")}`).toEqual([]);
  });
});
