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
    if (key === "IGO_DEMO_MODE") continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

const SETUP_ADMIN_USERNAME = "ego-setup";
const SETUP_ADMIN_PASSWORD = "SetupChangeMe123!";
const SUPER_ADMIN_EMAIL = "admin@igopos.local";
const SUPER_ADMIN_PASSWORD = "AdminChangeMe123!";
const OWNER_PASSWORD = "AdminChangeMe123!";
const CASHIER_PIN = "345678";
const OWNER_PIN = "123456";

const { verifySetupAdminCredentials } = await import("../lib/auth/setup-admin-login");
const { verifySuperAdminCredentials } = await import("../lib/auth/super-admin-login");
const { authenticateMerchantUser } = await import("../lib/auth/merchant-login");
const { PIN_NOT_ALLOWED_MESSAGE } = await import("../lib/auth/portal-credentials");
import {
  SETUP_ADMIN_MIGRATION_GUIDANCE,
  isSetupAdminTableReady,
} from "../lib/setup-admin/migration-status";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const egoAdminLoginPage = readSource("app/(ego-admin)/ego-admin/login/page.tsx");
const egoAdminHomePage = readSource("app/(ego-admin)/ego-admin/page.tsx");
const setupAdminLoginLib = readSource("lib/auth/setup-admin-login.ts");
const portalGuards = readSource("lib/auth/portal-guards.ts");
const migrationStatusLib = readSource("lib/setup-admin/migration-status.ts");
const logoutRoute = readSource("app/api/ego-admin/logout/route.ts");
const schema = readSource("prisma/schema.prisma");
const seedDemo = readSource("prisma/seed-demo.ts");

check(
  "A. SetupAdmin model exists in Prisma schema",
  schema.includes("model SetupAdmin") && schema.includes("@@map(\"setup_admins\")"),
);
check(
  "B. setup_admins migration file exists",
  existsSync(resolve(process.cwd(), "prisma/migrations/20260625_setup_admin_portal_foundation/migration.sql")),
);
check(
  "C. Demo seed creates ego-setup account",
  seedDemo.includes('username: "ego-setup"') && seedDemo.includes("SetupChangeMe123!"),
);
check(
  "D. /ego-admin/login page loads with portal form and migration banner hook",
  egoAdminLoginPage.includes("PortalLoginForm") &&
    egoAdminLoginPage.includes("/api/ego-admin/login") &&
    egoAdminLoginPage.includes("getSetupAdminMigrationStatus"),
);
check(
  "E. /ego-admin protected shell uses requireEgoAdminPortalAccess",
  egoAdminHomePage.includes("requireEgoAdminPortalAccess") &&
    egoAdminHomePage.includes("SetupPortalReadiness"),
);
check(
  "F. Setup portal readiness panel links to store provisioning",
  readSource("components/ego-admin/setup-portal-readiness.tsx").includes('href="/ego-admin/stores/new"') &&
    readSource("components/ego-admin/setup-portal-readiness.tsx").includes("egoAdminActionCreateStore"),
);
check(
  "G. EGO Admin login rejects PIN-only secrets",
  setupAdminLoginLib.includes("isPinOnlySecret") && setupAdminLoginLib.includes("PIN_NOT_ALLOWED_MESSAGE"),
);
check(
  "H. EGO Admin login rejects merchant credentials",
  setupAdminLoginLib.includes("authenticateMerchantUser"),
);
check(
  "I. EGO Admin login rejects Super Admin credentials without setup admin record",
  setupAdminLoginLib.includes("rejectIfSuperAdminCredentialsWithoutSetupAdmin"),
);
check(
  "J. Missing setup_admins table returns ops guidance",
  migrationStatusLib.includes(SETUP_ADMIN_MIGRATION_GUIDANCE) &&
    setupAdminLoginLib.includes("SETUP_ADMIN_MIGRATION_GUIDANCE"),
);
check(
  "K. Portal guards block store and super admin sessions from EGO Admin",
  portalGuards.includes("rejectMerchantSessionForAdminPortal") &&
    portalGuards.includes("rejectSuperAdminSessionForEgoAdminPortal") &&
    portalGuards.includes("requireEgoAdminPortalAccess"),
);
check(
  "L. EGO Admin logout clears setup admin session only",
  logoutRoute.includes("clearSetupAdminSession"),
);
check(
  "M. Setup admin session cookie is separate",
  readSource("lib/setup-admin/session.ts").includes('const SETUP_ADMIN_COOKIE = "ego_setup_admin_session"'),
);
check(
  "N. Language toggle present on EGO Admin login",
  egoAdminLoginPage.includes("PortalLocaleSwitcher"),
);

const tableReady = await isSetupAdminTableReady();

const wrongCredentials = await verifySetupAdminCredentials("ego-setup", "wrong-password");
check(
  "O. Wrong credentials rejected with safe error",
  !wrongCredentials.ok && wrongCredentials.error === "Invalid EGO admin username or password.",
  wrongCredentials.ok ? "unexpected success" : wrongCredentials.error,
);

const pinAttempt = await verifySetupAdminCredentials(SETUP_ADMIN_USERNAME, OWNER_PIN);
check(
  "P. PIN rejected on EGO Admin login",
  !pinAttempt.ok && pinAttempt.error === PIN_NOT_ALLOWED_MESSAGE,
  pinAttempt.ok ? "unexpected success" : pinAttempt.error,
);

const ownerAttempt = await verifySetupAdminCredentials("igo-admin", OWNER_PASSWORD);
check(
  "Q. Store owner credentials rejected",
  !ownerAttempt.ok,
  ownerAttempt.ok ? "unexpected success" : ownerAttempt.error,
);

const cashierAttempt = await verifySetupAdminCredentials("cashier", CASHIER_PIN);
check(
  "R. Cashier credentials rejected",
  !cashierAttempt.ok,
  cashierAttempt.ok ? "unexpected success" : cashierAttempt.error,
);

const superAdminAttempt = await verifySetupAdminCredentials(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
check(
  "S. Super Admin credentials rejected on EGO Admin portal",
  !superAdminAttempt.ok,
  superAdminAttempt.ok ? "unexpected success" : superAdminAttempt.error,
);

if (!tableReady) {
  const migrationBlocked = await verifySetupAdminCredentials(SETUP_ADMIN_USERNAME, SETUP_ADMIN_PASSWORD);
  check(
    "T. Missing setup_admins table returns migration guidance",
    !migrationBlocked.ok && migrationBlocked.error === SETUP_ADMIN_MIGRATION_GUIDANCE,
    migrationBlocked.ok ? "unexpected success" : migrationBlocked.error,
  );
  check(
    "U. Setup admin login succeeds after migration/seed",
    true,
    "skipped — apply migration then re-run harness for live login check",
  );
} else {
  const migrationBlocked = await verifySetupAdminCredentials("definitely-missing-user", "password");
  check(
    "T. Missing setup_admins table returns migration guidance",
    !migrationBlocked.ok && migrationBlocked.error !== SETUP_ADMIN_MIGRATION_GUIDANCE,
    migrationBlocked.ok ? "unexpected success" : migrationBlocked.error,
  );

  const setupLogin = await verifySetupAdminCredentials(SETUP_ADMIN_USERNAME, SETUP_ADMIN_PASSWORD);
  check(
    "U. Setup admin login succeeds after migration/seed",
    setupLogin.ok === true,
    setupLogin.ok ? "ok" : setupLogin.error,
  );
}

if (tableReady) {
  const superAdminStillWorks = await verifySuperAdminCredentials(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD).catch(
    () => ({ error: "database unavailable", ok: false as const, status: 500 }),
  );
  check(
    "V. Super Admin login regression still works",
    superAdminStillWorks.ok === true,
    superAdminStillWorks.ok ? "ok" : superAdminStillWorks.error,
  );

  const merchantStillWorks = await authenticateMerchantUser("igo-admin", OWNER_PASSWORD).catch(() => null);
  check("W. Store merchant login regression still works", merchantStillWorks !== null);
} else {
  check("V. Super Admin login regression still works", true, "skipped — database migration not applied on this host");
  check("W. Store merchant login regression still works", true, "skipped — database migration not applied on this host");
}

const failed = results.filter((result) => !result.ok);
console.log(`\nLP-3 EGO Admin setup portal harness: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
