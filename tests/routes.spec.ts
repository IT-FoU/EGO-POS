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
});
