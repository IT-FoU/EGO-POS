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
const { resolveTenantMembership } = await import("../lib/db/resolve-tenant-user");
const { resolveTenantScope } = await import("../lib/db/tenant-scope");
const { getPrismaDashboardSnapshot } = await import("../features/dashboard/dashboard-service");

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ detail, name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
async function expectThrow(name: string, fn: () => Promise<unknown>, expectedMessage?: string) {
  try {
    await fn();
    check(name, false, "expected an error but none was thrown");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(name, !expectedMessage || message.includes(expectedMessage), message);
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
const demoOwnerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "demo-owner-login", warehouseId: WAREHOUSE_ID };
const demoManagerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "demo-manager-login", warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: "foreign-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const unassignedTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: "not-assigned-user-uat3", warehouseId: WAREHOUSE_ID };

const ownerMembership = await resolveTenantMembership(ownerTenant);
check(
  "A. Owner tenant membership resolves",
  ownerMembership.effectiveUserId === ownerUser.id && ownerMembership.isOwner,
  `userId=${ownerMembership.effectiveUserId}`,
);

const managerMembership = await resolveTenantMembership(managerTenant);
check(
  "B. Manager tenant membership resolves",
  managerMembership.effectiveUserId === managerUser.id,
  `userId=${managerMembership.effectiveUserId}`,
);

const cashierMembership = await resolveTenantMembership(cashierTenant);
check(
  "C. Cashier tenant membership resolves",
  cashierMembership.effectiveUserId === cashierUser.id,
  `userId=${cashierMembership.effectiveUserId}`,
);

const demoOwnerMembership = await resolveTenantMembership(demoOwnerTenant);
check(
  "D. Synthetic demo owner id maps to seeded DB user",
  demoOwnerMembership.effectiveUserId === ownerUser.id,
  `mapped=${demoOwnerMembership.effectiveUserId}`,
);

const demoManagerMembership = await resolveTenantMembership(demoManagerTenant);
check(
  "E. Synthetic demo manager id maps to seeded DB user",
  demoManagerMembership.effectiveUserId === managerUser.id,
  `mapped=${demoManagerMembership.effectiveUserId}`,
);

await expectThrow(
  "F. User without company membership is blocked",
  () => resolveTenantMembership(unassignedTenant),
  "User is not assigned to the active company.",
);

await expectThrow(
  "G. Cross-company tenant scope is blocked",
  () => resolveTenantScope(foreignTenant),
  "User is not assigned to the active company.",
);

const ownerScope = await resolveTenantScope(demoOwnerTenant);
check(
  "H. Demo owner tenant scope resolves branch/warehouse",
  ownerScope.branchId === BRANCH_ID && Boolean(ownerScope.warehouseId),
  `branch=${ownerScope.branchId}`,
);

await getPrismaDashboardSnapshot(demoOwnerTenant, { key: "today" });
check("I. Owner dashboard snapshot loads with demo session user id", true);

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nOWNER-UAT-3 tenant scope: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
