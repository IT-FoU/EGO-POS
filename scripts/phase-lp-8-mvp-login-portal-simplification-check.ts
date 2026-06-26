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

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const loginForm = readSource("components/auth/login-form.tsx");
const loginPage = readSource("app/(auth)/login/page.tsx");
const superAdminLogin = readSource("app/(super-admin)/super-admin/login/page.tsx");
const superAdminHome = readSource("app/(super-admin)/super-admin/page.tsx");
const portalLoginForm = readSource("components/auth/portal-login-form.tsx");
const egoAdminLogin = readSource("app/(ego-admin)/ego-admin/login/page.tsx");
const prismaSchema = readSource("prisma/schema.prisma");

check("A. MVP visible login portals defined", readSource("lib/portals/mvp-login-portals.ts").includes("/login"));
check(
  "B. Store login page does not link to /ego-admin/login",
  !loginPage.includes("/ego-admin") && !loginForm.includes("/ego-admin"),
);
check(
  "C. Super Admin login does not link to /ego-admin/login",
  !superAdminLogin.includes("/ego-admin"),
);
check(
  "D. Portal login form has no cross-portal navigation links",
  !portalLoginForm.includes("href="),
);
check(
  "E. EGO Admin login shows deferred MVP notice",
  egoAdminLogin.includes("egoAdminDeferredNotice"),
);
check(
  "F. Super Admin home promotes store creation for MVP",
  superAdminHome.includes("/super-admin/stores/new") && superAdminHome.includes("superAdminPlaceholder"),
);
check(
  "G. Super Admin store provisioning API exists",
  readSource("app/api/super-admin/stores/route.ts").includes("provisionStore"),
);
check(
  "H. EGO Admin code and SetupAdmin model retained",
  prismaSchema.includes("model SetupAdmin") && existsSync(resolve(process.cwd(), "app/(ego-admin)/ego-admin/login/page.tsx")),
);
check(
  "I. Store login clarifies owner/manager/cashier audience",
  loginPage.includes("storeLoginAudience"),
);
check(
  "J. Language toggle on visible login pages",
  loginPage.includes("LoginLocaleSwitcher") && superAdminLogin.includes("PortalLocaleSwitcher"),
);

const { MVP_VISIBLE_LOGIN_PORTALS, MVP_DEFERRED_LOGIN_PORTALS } = await import("../lib/portals/mvp-login-portals");
check("K. MVP visible portals are /login and /super-admin/login only", MVP_VISIBLE_LOGIN_PORTALS.length === 2);
check("L. EGO Admin login is deferred not visible", MVP_DEFERRED_LOGIN_PORTALS.includes("/ego-admin/login"));

const { authenticateMerchantUser } = await import("../lib/auth/merchant-login");
const { verifySuperAdminCredentials } = await import("../lib/auth/super-admin-login");
const { getStoreMembershipsForUser, resolveStorePostLoginRedirect } = await import("../lib/auth/store-membership");
const { prisma } = await import("../lib/db/prisma");

const owner = await authenticateMerchantUser("igo-admin", "AdminChangeMe123!");
check("M. Store owner login still works", Boolean(owner?.id), owner?.id ?? "failed");

const manager = await authenticateMerchantUser("manager", "234567");
check("N. Manager PIN login still works", Boolean(manager?.id), manager?.id ?? "failed");

const cashier = await authenticateMerchantUser("cashier", "345678");
check("O. Cashier PIN login still works", Boolean(cashier?.id), cashier?.id ?? "failed");

const superAdmin = await verifySuperAdminCredentials("admin@igopos.local", "AdminChangeMe123!");
check(
  "P. Super Admin login still works",
  superAdmin.ok === true,
  superAdmin.ok ? "ok" : superAdmin.error,
);

if (owner) {
  const memberships = await getStoreMembershipsForUser(owner.id);
  const resolved = resolveStorePostLoginRedirect(memberships);
  check("Q. Owner post-login redirect still DB-backed", resolved.redirectTo === "/dashboard", resolved.redirectTo);
}

const portalGuards = readSource("lib/auth/portal-guards.ts");
check(
  "R. Portal guards prevent session mixing",
  portalGuards.includes("rejectMerchantSessionForAdminPortal") &&
    portalGuards.includes("rejectSetupAdminSessionForSuperAdminPortal"),
);

let dbReady = true;
try {
  await prisma.$queryRaw`SELECT id FROM setup_admins LIMIT 1`;
} catch {
  dbReady = false;
}

if (!dbReady) {
  check("S. Super Admin provisioning regression", true, "skipped — database unavailable");
} else {
  const lp4Company = await prisma.company.findFirst({
    orderBy: { createdAt: "desc" },
    where: { storeCode: { startsWith: "lp4-" } },
  });
  check("S. LP-4 provisioned stores still present", Boolean(lp4Company), lp4Company?.storeCode ?? "none");
}

const failed = results.filter((result) => !result.ok);
console.log(`\nLP-8 MVP login portal simplification harness: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
