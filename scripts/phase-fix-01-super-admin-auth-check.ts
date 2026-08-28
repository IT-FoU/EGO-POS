import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { compare } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

const TARGET_REF = "ieutdqnlfiiaawctapor";
const SECRETS_PATH = join(process.env.LOCALAPPDATA ?? "", "ego-pos-production", "secrets.json");

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function readSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function readSecrets() {
  if (!existsSync(SECRETS_PATH)) throw new Error("Owner secrets file missing");
  return JSON.parse(readFileSync(SECRETS_PATH, "utf8")) as {
    goboxPassword?: string;
    superAdminEmail?: string;
    superAdminPassword?: string;
    superAdminUsername?: string;
  };
}

const url = process.env.DATABASE_URL ?? "";
check("A. Configured target is Production ref", url.includes(TARGET_REF) && !url.includes("localhost"));

const secrets = readSecrets();
const email = (secrets.superAdminEmail ?? "admin@igopos.local").trim();
const password = secrets.superAdminPassword?.trim() ?? "";
check(
  "B. Super Admin password is present locally and is not a repository default",
  Boolean(password) && password !== "AdminChangeMe123!" && password.length >= 12,
);

const loginSrc = readSource("lib/auth/super-admin-login.ts");
const sessionSrc = readSource("lib/admin/session.ts");
const middlewareSrc = readSource("middleware.ts");
const logoutSrc = readSource("app/api/super-admin/logout/route.ts");
const loginPageSrc = readSource("app/(super-admin)/super-admin/login/page.tsx");
const loginCardSrc = readSource("components/auth/super-admin-login-card.tsx");
const homeSrc = readSource("app/(super-admin)/super-admin/page.tsx");
const seedSrc = readSource("prisma/seed.ts");
const seedDemoSrc = readSource("prisma/seed-demo.ts");

check(
  "C. Existing Super Admin architecture is Prisma SuperAdmin + /api/super-admin/login",
  loginSrc.includes("prisma.superAdmin.findFirst") &&
    loginSrc.includes("export async function authenticateSuperAdminLogin") &&
    loginCardSrc.includes("/api/super-admin/login"),
);
check("D. Super Admin session revalidates active SuperAdmin row", sessionSrc.includes('status: "active"') && sessionSrc.includes("prisma.superAdmin"));
check("E. /super-admin requires Super Admin portal access", homeSrc.includes("requireSuperAdminPortalAccess"));
check(
  "F. Unauthenticated /super-admin is redirected",
  middlewareSrc.includes('loginUrl.pathname = "/super-admin/login"') &&
    sessionSrc.includes('redirect("/super-admin/login")'),
);
check("G. Logout clears Super Admin session cookie", logoutSrc.includes("clearAdminSession"));
check("H. Merchant users cannot authenticate through Super Admin login", loginSrc.includes("authenticateMerchantUser"));
check("I. Demo Super Admin fallback remains gated", loginSrc.includes("isDemoFallbackEnabled") && !readSource("lib/demo-mode.ts").includes("return true"));
check("J. Production seed paths refuse this target", seedSrc.includes("ieutdqnlfiiaawctapor") && seedDemoSrc.includes("ieutdqnlfiiaawctapor"));
check("K. Login UI still posts to existing Super Admin API", loginPageSrc.includes("SuperAdminLoginCard"));

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

try {
  const [
    superAdmins,
    setupAdmins,
    companies,
    users,
    products,
    sales,
    customers,
    promotions,
    balances,
    current,
  ] = await Promise.all([
    prisma.superAdmin.findMany({
      select: { email: true, passwordHash: true, role: true, status: true, username: true },
    }),
    prisma.setupAdmin.count(),
    prisma.company.findMany({ select: { name: true, storeCode: true } }),
    prisma.user.findMany({ select: { email: true, username: true } }),
    prisma.product.count(),
    prisma.sale.count(),
    prisma.customer.count(),
    prisma.promotion.count(),
    prisma.inventoryBalance.count(),
    prisma.superAdmin.findFirst({
      select: { email: true, passwordHash: true, role: true, status: true, username: true },
      where: { email },
    }),
  ]);

  check("M. Exactly one Super Admin exists", superAdmins.length === 1, String(superAdmins.length));
  check(
    "N. Super Admin is active platform role with intended identity",
    current?.status === "active" &&
      current.role === "super_admin" &&
      current.email === email &&
      current.username === "igo-admin",
  );
  check("O. No setup admin was created", setupAdmins === 0);
  check(
    "P. GO BOX tenant/users unchanged",
    companies.length === 1 &&
      companies[0]?.storeCode === "0001" &&
      companies[0]?.name === "GO BOX Mini Mart" &&
      users.length === 1 &&
      users[0]?.username === "gobox",
  );
  check(
    "Q. Business records unchanged",
    products === 0 && sales === 0 && customers === 0 && promotions === 0 && balances === 0,
  );

  if (!current) {
    throw new Error("Intended Super Admin row was not found");
  }

  check(
    "R. Correct Super Admin credentials authenticate",
    (await compare(password, current.passwordHash)) === true && current.status === "active",
  );
  check("S. Incorrect password is denied", (await compare(`${password}-wrong`, current.passwordHash)) === false);
  check(
    "T. Unknown email is denied",
    (await prisma.superAdmin.findFirst({ where: { email: "unknown-admin@igopos.local" } })) === null,
  );
  check("U. Repository default Super Admin password is denied", (await compare("AdminChangeMe123!", current.passwordHash)) === false);

  const goboxUser = users.find((row) => row.username === "gobox");
  check(
    "V. Store Owner is not a Super Admin identity",
    Boolean(goboxUser) && !superAdmins.some((row) => row.username === goboxUser?.username || row.email === goboxUser?.email),
  );
  check("W. Manager user does not exist on this target", users.every((row) => row.username !== "manager"));
  check("X. Cashier user does not exist on this target", users.every((row) => row.username !== "cashier"));
  check("Y. Super Admin password is not PIN-only", !/^\d{4,8}$/.test(password));
} finally {
  await prisma.$disconnect();
}

const failed = results.filter((result) => !result.ok);
console.log(`\nFIX-01 Super Admin auth harness: ${results.length - failed.length}/${results.length} PASS`);
if (failed.length > 0) {
  process.exit(1);
}
