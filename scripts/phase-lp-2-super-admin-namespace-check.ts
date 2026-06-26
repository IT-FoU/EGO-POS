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

const SUPER_ADMIN_EMAIL = "admin@igopos.local";
const SUPER_ADMIN_PASSWORD = "AdminChangeMe123!";
const SETUP_ADMIN_USERNAME = "ego-setup";
const SETUP_ADMIN_PASSWORD = "SetupChangeMe123!";
const OWNER_PASSWORD = "AdminChangeMe123!";
const CASHIER_PIN = "345678";

const { verifySuperAdminCredentials } = await import("../lib/auth/super-admin-login");
const { verifySetupAdminCredentials } = await import("../lib/auth/setup-admin-login");
const { mapLegacyIgoAdminPath } = await import("../lib/super-admin/legacy-routes");
const { authenticateMerchantUser } = await import("../lib/auth/merchant-login");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const superAdminLoginPage = readSource("app/(super-admin)/super-admin/login/page.tsx");
const superAdminHomePage = readSource("app/(super-admin)/super-admin/page.tsx");
const superAdminLayout = readSource("app/(super-admin)/super-admin/layout.tsx");
const legacyLoginPage = readSource("app/(igo-admin)/igo-admin/login/page.tsx");
const legacyBusinessesPage = readSource("app/(igo-admin)/igo-admin/businesses/page.tsx");
const legacyApiLogin = readSource("app/api/igo-admin/login/route.ts");
const superAdminApiLogin = readSource("app/api/super-admin/login/route.ts");
const portalGuards = readSource("lib/auth/portal-guards.ts");
const architectureSpec = readSource("LOGIN_PORTAL_ARCHITECTURE_SPEC.md");
const adminI18n = readSource("components/igo-admin/admin-i18n.tsx");

check(
  "A. /super-admin/login is canonical login page",
  superAdminLoginPage.includes("/api/super-admin/login") && superAdminLoginPage.includes("superAdminPortal"),
);
check(
  "B. /super-admin home uses requireSuperAdminPortalAccess",
  superAdminHomePage.includes("requireSuperAdminPortalAccess") && superAdminHomePage.includes("superAdminPlaceholder"),
);
check(
  "C. Super Admin layout links use /super-admin namespace",
  superAdminLayout.includes('href: "/super-admin"') &&
    superAdminLayout.includes('href: "/super-admin/businesses"') &&
    superAdminLayout.includes("superAdminBrand"),
);
check(
  "D. Legacy /igo-admin/login redirects to /super-admin/login",
  legacyLoginPage.includes('redirect("/super-admin/login")'),
);
check(
  "E. Legacy /igo-admin/businesses redirects to /super-admin/businesses",
  legacyBusinessesPage.includes('mapLegacyIgoAdminPath("/igo-admin/businesses")'),
);
check(
  "F. Legacy route mapper covers dashboard and subroutes",
  mapLegacyIgoAdminPath("/igo-admin") === "/super-admin" &&
    mapLegacyIgoAdminPath("/igo-admin/users") === "/super-admin/users" &&
    mapLegacyIgoAdminPath("/igo-admin/audit-logs") === "/super-admin/audit-logs",
);
check(
  "G. /api/super-admin/login is canonical API",
  superAdminApiLogin.includes("authenticateSuperAdminLogin"),
);
check(
  "H. /api/igo-admin/login delegates with /super-admin redirect",
  legacyApiLogin.includes("authenticateSuperAdminLogin") &&
    legacyApiLogin.includes('redirectTo: "/super-admin"') &&
    legacyApiLogin.includes("X-Deprecated-Api"),
);
check(
  "I. Super Admin portal blocks setup admin session",
  portalGuards.includes("rejectSetupAdminSessionForSuperAdminPortal"),
);
check(
  "J. Super Admin shell copy says Super Admin not EGO Admin",
  adminI18n.includes('superAdminBrand: "Super Admin"') &&
    adminI18n.includes('signIn: "Sign in to Super Admin"') &&
    adminI18n.includes('egoAdmin: "EGO Admin"'),
);
check(
  "K. Architecture spec marks /super-admin as canonical",
  architectureSpec.includes("/super-admin/login") && architectureSpec.includes("LP-2"),
);

const superAdminLogin = await verifySuperAdminCredentials(SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
check(
  "L. Super Admin login succeeds with email + password",
  superAdminLogin.ok === true,
  superAdminLogin.ok ? "ok" : superAdminLogin.error,
);

const superAdminPin = await verifySuperAdminCredentials(SUPER_ADMIN_EMAIL, "123456");
check("M. Super Admin login rejects PIN", !superAdminPin.ok, superAdminPin.ok ? "unexpected success" : superAdminPin.error);

const storeOwnerOnSuperAdmin = await verifySuperAdminCredentials("igo-admin", OWNER_PASSWORD);
check(
  "N. Store owner credentials rejected on Super Admin portal",
  !storeOwnerOnSuperAdmin.ok,
  storeOwnerOnSuperAdmin.ok ? "unexpected success" : storeOwnerOnSuperAdmin.error,
);

const cashierOnSuperAdmin = await verifySuperAdminCredentials("cashier", CASHIER_PIN);
check(
  "O. Cashier credentials rejected on Super Admin portal",
  !cashierOnSuperAdmin.ok,
  cashierOnSuperAdmin.ok ? "unexpected success" : cashierOnSuperAdmin.error,
);

const setupAdminOnSuperAdmin = await verifySuperAdminCredentials(SETUP_ADMIN_USERNAME, SETUP_ADMIN_PASSWORD);
check(
  "P. EGO Admin credentials rejected on Super Admin portal",
  !setupAdminOnSuperAdmin.ok,
  setupAdminOnSuperAdmin.ok ? "unexpected success" : setupAdminOnSuperAdmin.error,
);

const setupAdminLogin = await verifySetupAdminCredentials(SETUP_ADMIN_USERNAME, SETUP_ADMIN_PASSWORD);
let hasSetupAdminTable = true;
try {
  const { prisma } = await import("../lib/db/prisma");
  await prisma.$queryRaw`SELECT 1 FROM setup_admins LIMIT 1`;
} catch {
  hasSetupAdminTable = false;
}

if (!hasSetupAdminTable) {
  check(
    "Q. EGO Admin login migration present when setup_admins table is missing",
    existsSync(resolve(process.cwd(), "prisma/migrations/20260625_setup_admin_portal_foundation/migration.sql")),
    "run: npx prisma migrate deploy && npm run db:seed:demo",
  );
} else {
  check(
    "Q. EGO Admin login still works independently",
    setupAdminLogin.ok === true,
    setupAdminLogin.ok ? "ok" : setupAdminLogin.error,
  );
}

const ownerMerchant = await authenticateMerchantUser("igo-admin", OWNER_PASSWORD);
check("R. Store login merchant auth still works", ownerMerchant !== null);

const failed = results.filter((result) => !result.ok);
console.log(`\nLP-2 super admin namespace harness: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
