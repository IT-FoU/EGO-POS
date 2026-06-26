import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

process.env.IGO_DEMO_MODE = "false";

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE" || key === "NODE_ENV") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const guardSrc = readSource("lib/env/demo-mode-guard.ts");
const demoModeSrc = readSource("lib/demo-mode.ts");
const nextConfig = readSource("next.config.ts");
const instrumentation = readSource("instrumentation.ts");
const healthConfig = readSource("app/api/health/config/route.ts");

check("A. Centralized demo-mode guard exists", guardSrc.includes("assertProductionDemoModeSafe"));
check(
  "B. Production error message is explicit",
  guardSrc.includes("Unsafe configuration: IGO_DEMO_MODE=true is not allowed in production."),
);
check("C. isDemoMode uses effective resolver", demoModeSrc.includes("resolveEffectiveDemoMode"));
check("D. next.config asserts production demo safety", nextConfig.includes("assertProductionDemoModeSafe()"));
check(
  "E. next.config forces NEXT_PUBLIC_IGO_DEMO_MODE false in production",
  nextConfig.includes('NEXT_PUBLIC_IGO_DEMO_MODE: isProductionNodeEnv()') && nextConfig.includes('"false"'),
);
check("F. instrumentation registers production startup guard", instrumentation.includes("assertProductionDemoModeSafe"));
check("G. health config endpoint reports demo mode state", healthConfig.includes("getDemoModeHealthStatus"));

const {
  assertProductionDemoModeSafe,
  getDemoModeHealthStatus,
  isUnsafeProductionDemoMode,
  resolveEffectiveDemoMode,
} = await import("../lib/env/demo-mode-guard");

const originalNodeEnv = process.env.NODE_ENV;
const originalDemoMode = process.env.IGO_DEMO_MODE;
const mutableEnv = process.env as Record<string, string | undefined>;

function setNodeEnv(value: string) {
  mutableEnv.NODE_ENV = value;
}

setNodeEnv("production");
process.env.IGO_DEMO_MODE = "true";
let blocked = false;
try {
  assertProductionDemoModeSafe();
} catch (error) {
  blocked = error instanceof Error && error.message.includes("IGO_DEMO_MODE=true is not allowed in production");
}
check("H. NODE_ENV=production + IGO_DEMO_MODE=true is blocked", blocked);
check(
  "I. Unsafe production demo mode health status is not ok",
  isUnsafeProductionDemoMode() && getDemoModeHealthStatus().ok === false,
);

process.env.IGO_DEMO_MODE = "false";
let productionSafe = true;
try {
  assertProductionDemoModeSafe();
} catch {
  productionSafe = false;
}
check("J. NODE_ENV=production + IGO_DEMO_MODE=false passes guard", productionSafe);
check(
  "K. Production effective demo mode is false even if env true",
  (() => {
    process.env.IGO_DEMO_MODE = "true";
    const effective = resolveEffectiveDemoMode() === false;
    process.env.IGO_DEMO_MODE = "false";
    return effective;
  })(),
);

setNodeEnv("development");
process.env.IGO_DEMO_MODE = "true";
check("L. NODE_ENV=development + IGO_DEMO_MODE=true is allowed", resolveEffectiveDemoMode() === true);

const { isDemoMode } = await import("../lib/demo-mode");
check("M. Development isDemoMode honors IGO_DEMO_MODE=true", isDemoMode() === true);

setNodeEnv(originalNodeEnv ?? "test");
process.env.IGO_DEMO_MODE = originalDemoMode ?? "false";

const businessesPage = readSource("app/(platform)/businesses/page.tsx");
const registerPage = readSource("app/(auth)/register/page.tsx");
check(
  "N. /businesses production path remains DB-backed",
  businessesPage.includes("!demoMode") && businessesPage.includes("CompanyMembershipPicker"),
);
check(
  "O. /register remains request-access only",
  registerPage.includes("registerClosedTitle") && !registerPage.includes('href="/businesses"'),
);
check(
  "P. Onboarding access blocks production NODE_ENV",
  readSource("lib/demo/onboarding-access.ts").includes("isProductionNodeEnv()"),
);

const failed = results.filter((result) => !result.ok);
console.log(`\nLP-6A production env guard harness: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
