import { test, expect, loginToDashboard } from "./support/qa-fixtures";

test.describe("Products, localization and responsive UI", () => {
  test("products list has filters and product image affordances", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/products");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByLabel(/filter by category/i)).toBeVisible();
    await expect(page.locator("img").first().or(page.getByText(/no products/i))).toBeVisible();
  });
  test("new product validation blocks an empty submission without creating data", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/products/new");
    const save = page.getByTestId("product-save-button");
    await expect(save).toBeVisible();
    await save.click();
    await expect(page.getByTestId("product-save-validation-summary")).toBeVisible();
  });
  test("English and Lao language switcher exposes supported choices", async ({ page }) => {
    await loginToDashboard(page);
    await expect(page.getByRole("button", { name: "EN", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "LO", exact: true })).toBeVisible();
  });
  test("Thai language switcher is available", async ({ page }) => {
    await loginToDashboard(page);
    await expect(page.getByRole("button", { name: /^(TH|ไทย)$/i })).toBeVisible();
  });
  test("major dashboard navigation stays usable at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginToDashboard(page);
    await expect(page.getByRole("link", { name: /POS/i }).last()).toBeVisible();
    await page.getByRole("link", { name: /POS/i }).last().click();
    await expect(page).toHaveURL(/\/pos/);
  });
});
