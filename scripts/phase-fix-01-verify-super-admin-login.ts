import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

process.env.IGO_DEMO_MODE = "false";
delete process.env.IGO_ENABLE_DEMO_FALLBACK;

for (const fileName of [".env", ".env.local"]) {
  if (!existsSync(fileName)) continue;
  for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === "IGO_DEMO_MODE" || key === "IGO_ENABLE_DEMO_FALLBACK") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const secrets = JSON.parse(
  readFileSync(join(process.env.LOCALAPPDATA ?? "", "ego-pos-production", "secrets.json"), "utf8"),
) as { goboxPassword?: string; superAdminEmail?: string; superAdminPassword?: string };

const email = (secrets.superAdminEmail ?? "admin@igopos.local").trim();
const password = secrets.superAdminPassword?.trim() ?? "";
const goboxPassword = secrets.goboxPassword?.trim() ?? "";

const { verifySuperAdminCredentials } = await import("../lib/auth/super-admin-login");
const { isDemoFallbackEnabled } = await import("../lib/demo-mode");

const loginOk = await verifySuperAdminCredentials(email, password);
const ownerDenied = await verifySuperAdminCredentials("gobox", goboxPassword || "unused-password-value");
const wrongDenied = await verifySuperAdminCredentials(email, `${password}-wrong`);
const unknownDenied = await verifySuperAdminCredentials("unknown-admin@igopos.local", password);
const defaultDenied = await verifySuperAdminCredentials(email, "AdminChangeMe123!");
const managerDenied = await verifySuperAdminCredentials("manager", "234567");
const cashierDenied = await verifySuperAdminCredentials("cashier", "345678");
const pinDenied = await verifySuperAdminCredentials(email, "123456");

console.log(
  JSON.stringify({
    cashierDenied: !cashierDenied.ok,
    defaultDenied: !defaultDenied.ok,
    demoFallback: isDemoFallbackEnabled(),
    loginOk: loginOk.ok === true,
    loginRedirect: loginOk.ok ? loginOk.redirectTo : loginOk.error,
    managerDenied: !managerDenied.ok,
    ownerDenied: !ownerDenied.ok,
    pinDenied: !pinDenied.ok,
    unknownDenied: !unknownDenied.ok,
    wrongDenied: !wrongDenied.ok,
  }),
);

if (
  !loginOk.ok ||
  isDemoFallbackEnabled() ||
  ownerDenied.ok ||
  wrongDenied.ok ||
  unknownDenied.ok ||
  defaultDenied.ok ||
  managerDenied.ok ||
  cashierDenied.ok ||
  pinDenied.ok
) {
  process.exit(1);
}
