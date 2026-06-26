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

const OWNER_PASSWORD = "AdminChangeMe123!";
const OWNER_PIN = "123456";
const MANAGER_PIN = "234567";
const CASHIER_PIN = "345678";
const SUPER_ADMIN_EMAIL = "admin@igopos.local";
const SUPER_ADMIN_PASSWORD = "AdminChangeMe123!";
const SETUP_ADMIN_USERNAME = "ego-setup";
const SETUP_ADMIN_PASSWORD = "SetupChangeMe123!";

const { prisma } = await import("../lib/db/prisma");
const { authenticateMerchantUser } = await import("../lib/auth/merchant-login");
const { verifySuperAdminCredentials } = await import("../lib/auth/super-admin-login");
const { verifySetupAdminCredentials } = await import("../lib/auth/setup-admin-login");
const { PIN_NOT_ALLOWED_MESSAGE } = await import("../lib/auth/portal-credentials");
const { getDictionary } = await import("../lib/i18n/dictionaries");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const storeLoginPage = readSource("app/(auth)/login/page.tsx");
const superAdminLoginPage = readSource("app/(super-admin)/super-admin/login/page.tsx");
const egoAdminLoginPage = readSource("app/(ego-admin)/ego-admin/login/page.tsx");
const superAdminHomePage = readSource("app/(super-admin)/super-admin/page.tsx");
const egoAdminHomePage = readSource("app/(ego-admin)/ego-admin/page.tsx");
const egoAdminReadinessPanel = readSource("components/ego-admin/setup-portal-readiness.tsx");
const portalGuards = readSource("lib/auth/portal-guards.ts");
const superAdminLoginLib = readSource("lib/auth/super-admin-login.ts");
const setupAdminLoginLib = readSource("lib/auth/setup-admin-login.ts");
const portalLoginForm = readSource("components/auth/portal-login-form.tsx");
const architectureSpec = readSource("LOGIN_PORTAL_ARCHITECTURE_SPEC.md");

check("A. /login page labels Store Login portal", storeLoginPage.includes("storeLoginPortal"));
check(
  "B. /super-admin/login page exists with Super Admin Portal copy",
  superAdminLoginPage.includes("superAdminPortal") && superAdminLoginPage.includes("/api/super-admin/login"),
);
check(
  "C. /ego-admin/login page exists with EGO Admin Portal copy",
  egoAdminLoginPage.includes("egoAdminPortal") && egoAdminLoginPage.includes("/api/ego-admin/login"),
);
check(
  "D. Super Admin placeholder requires portal guard",
  superAdminHomePage.includes("requireSuperAdminPortalAccess") &&
    superAdminHomePage.includes("superAdminPlaceholder"),
);
check(
  "E. EGO Admin placeholder requires portal guard",
  egoAdminHomePage.includes("requireEgoAdminPortalAccess") &&
    egoAdminHomePage.includes("SetupPortalReadiness") &&
    egoAdminReadinessPanel.includes("egoAdminPlaceholder"),
);
check(
  "F. Legacy /igo-admin/login redirects to /super-admin/login",
  readSource("app/(igo-admin)/igo-admin/login/page.tsx").includes('redirect("/super-admin/login")'),
);
check(
  "G. Architecture spec documents three independent portals",
  architectureSpec.includes("independent") && architectureSpec.includes("/super-admin/login") && architectureSpec.includes("/ego-admin/login"),
);
check(
  "H. Language toggle present on all portal login pages",
  storeLoginPage.includes("LoginLocaleSwitcher") &&
    superAdminLoginPage.includes("PortalLocaleSwitcher") &&
    egoAdminLoginPage.includes("PortalLocaleSwitcher"),
);
check(
  "I. Super Admin login rejects PIN-only secrets",
  superAdminLoginLib.includes("isPinOnlySecret") && superAdminLoginLib.includes("PIN_NOT_ALLOWED_MESSAGE"),
);
check(
  "J. EGO Admin login rejects PIN-only secrets",
  setupAdminLoginLib.includes("isPinOnlySecret") && setupAdminLoginLib.includes("PIN_NOT_ALLOWED_MESSAGE"),
);
check(
  "K. Super Admin login requires email identifier",
  superAdminLoginLib.includes("isEmailIdentifier"),
);
check(
  "L. Portal guard blocks merchant and setup admin sessions from Super Admin",
  portalGuards.includes("getCurrentSession") &&
    portalGuards.includes('redirect("/dashboard")') &&
    portalGuards.includes("rejectSetupAdminSessionForSuperAdminPortal") &&
    portalGuards.includes('redirect("/ego-admin")'),
);
check(
  "L2. Portal guard blocks store and super admin sessions from EGO Admin",
  portalGuards.includes("rejectSuperAdminSessionForEgoAdminPortal") &&
    portalGuards.includes("requireEgoAdminPortalAccess") &&
    portalGuards.includes('redirect("/super-admin")'),
);
check(
  "M. Shared portal login form reuses login submit helpers",
  portalLoginForm.includes("canSubmitLoginCredentials") && portalLoginForm.includes("readLoginCredentialsFromForm"),
);

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
let hasSetupAdminTable = false;
try {
  await prisma.$queryRaw`SELECT 1 FROM setup_admins LIMIT 1`;
  hasSetupAdminTable = true;
} catch {
  hasSetupAdminTable = false;
}

if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

if (!hasSetupAdminTable) {
  check(
    "V. setup_admins migration is present when table is not migrated yet",
    existsSync(resolve(process.cwd(), "prisma/migrations/20260625_setup_admin_portal_foundation/migration.sql")),
    "run: npx prisma migrate deploy && npm run db:seed:demo",
  );
} else {
  const setupAdmin = await prisma.setupAdmin.findFirst({ where: { username: SETUP_ADMIN_USERNAME } });
  if (!setupAdmin) {
    console.error("Missing setup admin seed. Run: npm run db:seed:demo");
    process.exit(1);
  }

  const setupAdminLogin = await verifySetupAdminCredentials(SETUP_ADMIN_USERNAME, SETUP_ADMIN_PASSWORD);
  check(
    "V. EGO Admin portal accepts setup admin credentials",
    setupAdminLogin.ok === true,
    setupAdminLogin.ok ? "ok" : setupAdminLogin.error,
  );
}

const ownerLogin = await authenticateMerchantUser("igo-admin", OWNER_PASSWORD);
check("N. Store owner can still login through merchant auth", ownerLogin?.id === ownerUser.id);

const managerLogin = await authenticateMerchantUser("manager", MANAGER_PIN);
check("O. Manager can still login with PIN through merchant auth", managerLogin?.id === managerUser.id);

const cashierLogin = await authenticateMerchantUser("cashier", CASHIER_PIN);
check("P. Cashier can still login with PIN through merchant auth", cashierLogin?.id === cashierUser.id);

const superAdminCashier = await verifySuperAdminCredentials("cashier", CASHIER_PIN);
check(
  "Q. Super Admin portal rejects cashier credentials",
  !superAdminCashier.ok,
  superAdminCashier.ok ? "unexpected success" : superAdminCashier.error,
);

const superAdminManager = await verifySuperAdminCredentials("manager", MANAGER_PIN);
check(
  "R. Super Admin portal rejects manager credentials",
  !superAdminManager.ok,
  superAdminManager.ok ? "unexpected success" : superAdminManager.error,
);

const superAdminPinAttempt = await verifySuperAdminCredentials(SUPER_ADMIN_EMAIL, OWNER_PIN);
check(
  "S. Super Admin portal rejects PIN-only password",
  !superAdminPinAttempt.ok && superAdminPinAttempt.error === PIN_NOT_ALLOWED_MESSAGE,
  superAdminPinAttempt.ok ? "unexpected success" : superAdminPinAttempt.error,
);

const egoAdminCashier = await verifySetupAdminCredentials("cashier", CASHIER_PIN);
check(
  "T. EGO Admin portal rejects cashier credentials",
  !egoAdminCashier.ok,
  egoAdminCashier.ok ? "unexpected success" : egoAdminCashier.error,
);

const egoAdminOwner = await verifySetupAdminCredentials("igo-admin", OWNER_PASSWORD);
check(
  "U. EGO Admin portal rejects store owner credentials",
  !egoAdminOwner.ok,
  egoAdminOwner.ok ? "unexpected success" : egoAdminOwner.error,
);

const superAdminLogin = await verifySuperAdminCredentials(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
check(
  "W. Super Admin portal accepts platform owner email + password",
  superAdminLogin.ok === true,
  superAdminLogin.ok ? "ok" : superAdminLogin.error,
);

check(
  "X. English dictionary includes portal labels",
  getDictionary("en").storeLoginPortal === "Store Login" &&
    getDictionary("en").superAdminPortal === "Super Admin Portal" &&
    getDictionary("en").egoAdminPortal === "EGO Admin Portal",
);

const failed = results.filter((result) => !result.ok);
console.log(`\nOWNER-UAT-8 login portal harness: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
