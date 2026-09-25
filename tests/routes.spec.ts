import { test, expect, loginToDashboard } from "./support/qa-fixtures";

const routes = [
  ["Products", "/products"], ["Product categories, units and price tiers", "/products/categories"], ["Inventory", "/inventory"], ["Stock movements", "/inventory/adjustment"], ["Stock count", "/inventory/count"], ["Low stock and reorder", "/inventory/reorder"],
  ["Purchasing and PO navigation", "/purchasing"], ["Purchase receiving", "/purchasing/receiving"], ["Customers", "/customers"], ["Membership", "/membership-levels"], ["Suppliers", "/suppliers"], ["Promotions", "/promotions"],
  ["Reports", "/reports"], ["Sales receipts", "/reports/sales/receipts"], ["Refunds and voids", "/reports/sales/refunds-voids"], ["Inventory movements report", "/reports/inventory/movements"], ["Settings", "/settings"],
] as const;

test.describe("Module navigation and loading", () => {
  for (const [module, route] of routes) {
    test(`${module} loads without an access or server error`, async ({ page }) => {
      await loginToDashboard(page);
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(route.replace(/[/?]/g, "\\$&")));
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByText(/access denied|internal server error/i)).toHaveCount(0);
    });
  }
  test("restricted-account access denial is covered when dedicated credentials are supplied", async ({ browser }) => {
    test.skip(!process.env.EGO_QA_RESTRICTED_USERNAME || !process.env.EGO_QA_RESTRICTED_PASSWORD, "Missing dedicated restricted QA credentials.");
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
