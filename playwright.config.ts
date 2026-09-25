import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", quiet: true });

const QA_BASE_URL = "https://egopos-qa.i-goto.workers.dev";
const configuredBaseUrl = process.env.EGO_QA_BASE_URL ?? QA_BASE_URL;
if (configuredBaseUrl !== QA_BASE_URL) throw new Error(`QA safety check failed: EGO_QA_BASE_URL must be exactly ${QA_BASE_URL}`);

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  // A shared QA account and non-destructive QA data need deterministic sequencing.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  outputDir: "test-results/artifacts",
  reporter: [
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/qa-results.json" }],
    ["./tests/support/qa-markdown-reporter.ts"],
  ],
  use: {
    baseURL: QA_BASE_URL,
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox-smoke", testMatch: /cross-browser\.spec\.ts/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit-smoke", testMatch: /cross-browser\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
  ],
});
