import { expect, test as base } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import fs from "node:fs/promises";

export const QA_TARGET = "https://egopos-qa.i-goto.workers.dev";

function credential(name: "EGO_QA_USERNAME" | "EGO_QA_PASSWORD") {
  const value = process.env[name];
  if (!value) throw new Error(`QA credentials missing: set ${name} in .env.test (never commit it).`);
  return value;
}

export async function login(page: Page) {
  await page.goto("/login?callbackUrl=%2Fdashboard");
  await page.getByRole("textbox", { name: /email|username/i }).fill(credential("EGO_QA_USERNAME"));
  await page.locator("#merchant-login-password").fill(credential("EGO_QA_PASSWORD"));
  await page.getByRole("button", { name: /sign in|login/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|pos|businesses)(?:[/?#]|$)/, { timeout: 30_000 });
}

export async function loginToDashboard(page: Page) {
  await login(page);
  if (!/\/dashboard(?:[/?#]|$)/.test(page.url())) await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard(?:[/?#]|$)/);
}

export const test = base.extend<{ qaConsoleErrors: string[] }>({
  qaConsoleErrors: async ({ page }, use, info) => {
    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    await use(errors);
    if (info.status !== info.expectedStatus) {
      const path = info.outputPath("failure-context.json");
      await fs.writeFile(path, JSON.stringify({ module: info.titlePath[1], scenario: info.title, expected: info.expectedStatus, actual: info.status, url: page.url(), consoleErrors: errors, errors: info.errors.map((error) => error.message) }, null, 2));
      await info.attach("failure-context", { path, contentType: "application/json" });
    }
  },
});

export { expect };
