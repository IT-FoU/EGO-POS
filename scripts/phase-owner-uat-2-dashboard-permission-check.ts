import { existsSync, readFileSync } from "node:fs";

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

const { prisma } = await import("../lib/db/prisma");
const { assertPermission, PermissionDeniedError, READ_PERMISSIONS } = await import("../lib/auth/permissions");
const { getUserPermissionKeys } = await import("../features/access-control/prisma-repository");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
async function expectDenied(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, "expected permission denial");
  } catch (error) {
    check(name, error instanceof PermissionDeniedError, error instanceof Error ? error.message : String(error));
  }
}

const ownerUser = await prisma.user.findFirst({ where: { username: "igo-admin" } });
const managerUser = await prisma.user.findFirst({ where: { username: "manager" } });
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !managerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const managerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: managerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const demoLoginTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "demo-owner-login", warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: "foreign-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

check(
  "A. Permission key is dashboard.view (not dashboards.view)",
  READ_PERMISSIONS.dashboardView === "dashboard.view",
  READ_PERMISSIONS.dashboardView,
);

const ownerKeys = await getUserPermissionKeys(ownerTenant);
check("B. Owner permission keys include wildcard", ownerKeys.includes("*"), `keys=${ownerKeys.join(",")}`);

await assertPermission(ownerTenant, READ_PERMISSIONS.dashboardView);
check("C. Owner dashboard.view allowed", true);

await (assertPermission as (tenant: typeof ownerTenant, permission: string) => Promise<void>)(
  ownerTenant,
  "dashboards.view",
);
check("C2. Legacy dashboards.view alias allowed for owner", true);

const managerKeys = await getUserPermissionKeys(managerTenant);
check(
  "D. Manager has dashboard.view or wildcard",
  managerKeys.includes("*") || managerKeys.includes("dashboard.view"),
  `hasDashboard=${managerKeys.includes("dashboard.view")}`,
);

await getPrismaDashboardSnapshot(ownerTenant, { key: "today" });
check("E. Owner dashboard snapshot loads", true);

await getPrismaDashboardSnapshot(managerTenant, { key: "today" });
check("F. Manager dashboard snapshot loads", true);

await expectDenied("G. Cashier dashboard blocked", () => getPrismaDashboardSnapshot(cashierTenant, { key: "today" }));
await expectDenied("H. Cross-company dashboard blocked", () => assertPermission(foreignTenant, READ_PERMISSIONS.dashboardView));

const demoKeys = await getUserPermissionKeys(demoLoginTenant);
check(
  "I. Demo-login user id resolves owner permissions (not empty)",
  demoKeys.includes("*") || demoKeys.includes("dashboard.view"),
  `keys=${demoKeys.join(",") || "none"}`,
);

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nOWNER-UAT-2 dashboard permission: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
