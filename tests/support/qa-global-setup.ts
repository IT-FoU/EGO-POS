import fs from "node:fs";
import path from "node:path";
export default function qaGlobalSetup() {
  const target = path.resolve("test-results/.phase2-run-state.json");
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const usernamePrefix = (process.env.EGO_QA_TEST_USERNAME_PREFIX ?? "PWTEST").replace(/[^A-Za-z0-9_-]/g, "");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({
    cleanupErrors: [],
    createdSession: false,
    expectedDeduction: 32,
    productName: `PWTEST_${runId}_PRODUCT_EDIT`,
    restrictedIdentityCreated: false,
    restrictedUsername: `${usernamePrefix}_${runId}_CASHIER`,
    runId,
    saleAllowedWithoutSession: false,
    testIdentityCreated: false,
    testUsername: `${usernamePrefix}_${runId}_MANAGER`,
  }, null, 2));
}
