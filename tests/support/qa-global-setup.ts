import fs from "node:fs";
import path from "node:path";
import { uniqueQaSuffix } from "./phase2-helpers";

export default function qaGlobalSetup() {
  const target = path.resolve("test-results/.phase2-run-state.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify({
    cleanupErrors: [],
    createdSession: false,
    expectedDeduction: 32,
    productName: `TEST-P2-${uniqueQaSuffix()}-EDIT`,
    saleAllowedWithoutSession: false,
  }, null, 2));
}
