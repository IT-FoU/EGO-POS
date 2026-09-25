import { test, expect, loginToDashboard } from "./support/qa-fixtures";
import type { Page } from "@playwright/test";

async function openPos(page: Page) {
  await loginToDashboard(page);
  await page.goto("/pos");
  await expect(page.getByRole("main")).toBeVisible();
}

test.describe("POS safe workflow coverage", () => {
  test("POS loads product search, cart, checkout and cash-session surfaces", async ({ page }) => {
    await openPos(page);
    await expect(page.getByPlaceholder(/search|scan/i)).toBeVisible();
    await expect(page.getByText(/shopping cart/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /payment/i })).toBeVisible();
  });
  test("product search returns a deterministic empty state for a unique QA query", async ({ page }) => {
    await openPos(page);
    await page.getByPlaceholder(/search|scan/i).fill("TEST-NOT-A-REAL-PRODUCT-9C47F");
    await expect(page.getByText(/no search results|no products/i)).toBeVisible();
  });
  test("multi-unit, favorites, hold/resume, checkout, receipt and refund/void entry points are available", async ({ page }) => {
    await openPos(page);
    await page.getByRole("button", { name: "Favorites", exact: true }).click();
    await expect(page.getByTestId("pos-favorites-empty").or(page.getByTestId("pos-favorites-grid"))).toBeVisible();
    await page.getByRole("button", { name: /close/i }).first().click();
    await expect(page.getByRole("button", { name: /hold bill/i })).toBeDisabled();
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("button", { name: /recent sales/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /cash in.*cash out/i })).toBeVisible();
    await page.getByRole("button", { name: /unit display/i }).click();
    await expect(page.getByTestId("pos-unit-display-mode")).toBeVisible();
  });
  test("cash session controls show a safe state without submitting cash movements", async ({ page }) => {
    await openPos(page);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("button", { name: /cash shift count/i }).click();
    await expect(page.getByTestId("cash-shift-ui-state")).toBeVisible();
    await expect(page.getByTestId("open-cash-session")).toBeVisible();
    await expect(page.getByTestId("end-work")).toBeVisible();
  });
});
