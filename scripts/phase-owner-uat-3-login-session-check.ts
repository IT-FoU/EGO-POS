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
const OWNER_EMAIL = "owner@igopos.local";
const OWNER_PIN = "123456";
const MANAGER_PIN = "234567";
const CASHIER_PIN = "345678";

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";

const { prisma } = await import("../lib/db/prisma");
const {
  authenticateMerchantUser,
  findMerchantUserForLogin,
  INVALID_CREDENTIALS_MESSAGE,
} = await import("../lib/auth/merchant-login");
const { resolveTenantMembership } = await import("../lib/db/resolve-tenant-user");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");
const { getDictionary } = await import("../lib/i18n/dictionaries");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

if (!ownerUser.pinHash || !managerUser.pinHash || !cashierUser.pinHash) {
  console.error("Seed users are missing PIN hashes. Re-run: npm run db:seed:demo");
  process.exit(1);
}

const ownerByUsernamePassword = await authenticateMerchantUser("igo-admin", OWNER_PASSWORD);
check(
  "A. Owner login by username + password succeeds",
  ownerByUsernamePassword?.id === ownerUser.id,
  `userId=${ownerByUsernamePassword?.id ?? "none"}`,
);

const ownerByEmailPassword = await authenticateMerchantUser(OWNER_EMAIL, OWNER_PASSWORD);
check(
  "B. Owner login by email + password succeeds",
  ownerByEmailPassword?.id === ownerUser.id,
  `userId=${ownerByEmailPassword?.id ?? "none"}`,
);

const ownerByUsernamePin = await authenticateMerchantUser("igo-admin", OWNER_PIN);
check(
  "C. Owner login by username + PIN succeeds",
  ownerByUsernamePin?.id === ownerUser.id,
  `userId=${ownerByUsernamePin?.id ?? "none"}`,
);

const managerByPin = await authenticateMerchantUser("manager", MANAGER_PIN);
check(
  "D. Manager login by username + PIN succeeds",
  managerByPin?.id === managerUser.id,
  `userId=${managerByPin?.id ?? "none"}`,
);

const cashierByPin = await authenticateMerchantUser("cashier", CASHIER_PIN);
check(
  "E. Cashier login by username + PIN succeeds",
  cashierByPin?.id === cashierUser.id,
  `userId=${cashierByPin?.id ?? "none"}`,
);

const wrongPassword = await authenticateMerchantUser("igo-admin", "definitely-wrong-password");
check("F. Wrong username/password returns null", wrongPassword === null);

const wrongPin = await authenticateMerchantUser("manager", "000000");
check("G. Wrong PIN returns null", wrongPin === null);

check(
  "H. Generic invalid credentials message is exact",
  INVALID_CREDENTIALS_MESSAGE === "Username or password is incorrect.",
  INVALID_CREDENTIALS_MESSAGE,
);

check(
  "I. English dictionary uses generic invalid credentials message",
  getDictionary("en").invalidCredentials === INVALID_CREDENTIALS_MESSAGE,
  getDictionary("en").invalidCredentials,
);

const managerByEmail = await findMerchantUserForLogin("manager@igopos.local");
check("J. Manager email login is blocked", managerByEmail === null);

const loginFormSource = readFileSync(resolve(process.cwd(), "components/auth/login-form.tsx"), "utf8");
check(
  "K. Password toggle preserves controlled value",
  loginFormSource.includes("value={password}") &&
    loginFormSource.includes('type={isPasswordVisible ? "text" : "password"}') &&
    loginFormSource.includes('type="button"') &&
    !loginFormSource.includes("setPassword(\"\")"),
);
check(
  "L. Login form parses credential callback JSON for failures",
  loginFormSource.includes("credentialsSignInFailed") && loginFormSource.includes('json: "true"'),
);

const ownerTenant = {
  branchId: BRANCH_ID,
  companyId: COMPANY_ID,
  userId: ownerUser.id,
  warehouseId: WAREHOUSE_ID,
};
const demoOwnerTenant = {
  branchId: BRANCH_ID,
  companyId: COMPANY_ID,
  userId: "demo-owner-login",
  warehouseId: WAREHOUSE_ID,
};
const unassignedTenant = {
  branchId: BRANCH_ID,
  companyId: COMPANY_ID,
  userId: "not-assigned-user-uat3-login",
  warehouseId: WAREHOUSE_ID,
};
const foreignTenant = {
  branchId: BRANCH_ID,
  companyId: "foreign-company",
  userId: ownerUser.id,
  warehouseId: WAREHOUSE_ID,
};

await getPrismaDashboardSnapshot(ownerTenant, { key: "today" });
check("M. Owner /dashboard snapshot loads with real session user id", true);

await getPrismaDashboardSnapshot(demoOwnerTenant, { key: "today" });
check("N. Owner /dashboard snapshot loads with mapped demo session user id", true);

try {
  await resolveTenantMembership(unassignedTenant);
  check("O. User without company membership is blocked", false, "expected error");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  check(
    "O. User without company membership is blocked",
    message.includes("User is not assigned to the active company."),
    message,
  );
}

try {
  await resolveTenantMembership(foreignTenant);
  check("P. Cross-company access remains blocked", false, "expected error");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  check(
    "P. Cross-company access remains blocked",
    message.includes("User is not assigned to the active company."),
    message,
  );
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nOWNER-UAT-3 login/session: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
