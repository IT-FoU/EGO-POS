import { test, expect, loginToDashboard } from "./support/qa-fixtures";

test.describe("Authentication and dashboard", () => {
  test("valid QA credentials open the dashboard", async ({ page }) => {
    await loginToDashboard(page);
    await expect(page.getByRole("main")).toBeVisible();
  });
  test("logout returns to the QA login page", async ({ page }) => {
    await loginToDashboard(page);
    await page.getByRole("button", { name: /sign out|logout/i }).click();
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
  });
  test("dashboard navigation shell and major controls load", async ({ page }) => {
    await loginToDashboard(page);
    await expect(page.getByRole("link", { name: /POS/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Products/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Reports/i }).first()).toBeVisible();
  });
});
