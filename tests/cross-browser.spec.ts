import { test, expect, loginToDashboard } from "./support/qa-fixtures";

test.describe("Cross-browser smoke", () => {
  test.skip(process.env.EGO_QA_CROSS_BROWSER !== "true", "Set EGO_QA_CROSS_BROWSER=true only after Chromium is stable in the QA network.");
  test("dashboard and POS load", async ({ page }) => {
    await loginToDashboard(page);
    await page.goto("/pos");
    await expect(page.getByRole("main")).toBeVisible();
  });
});
