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

const COMPANY_ID = "gobox-company";
const BRANCH_ID = "gobox-main-branch";
const WAREHOUSE_ID = "gobox-default-warehouse";

const { prisma } = await import("../lib/db/prisma");
const { getReportFilterOptions, getPrismaReportsSnapshot } = await import("../features/reports/prisma-repository");
const { assertPermission, PermissionDeniedError, READ_PERMISSIONS } = await import("../lib/auth/permissions");

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
const cashierUser = await prisma.user.findFirst({ where: { username: "cashier" } });
if (!ownerUser || !cashierUser) {
  console.error("Missing seed users. Run: npm run db:seed:demo");
  process.exit(1);
}

const ownerTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: ownerUser.id, warehouseId: WAREHOUSE_ID };
const cashierTenant = { branchId: BRANCH_ID, companyId: COMPANY_ID, userId: cashierUser.id, warehouseId: WAREHOUSE_ID };
const foreignTenant = { branchId: BRANCH_ID, companyId: "foreign-company", userId: ownerUser.id, warehouseId: WAREHOUSE_ID };

const reportsSource = readFileSync(resolve(process.cwd(), "features/reports/prisma-repository.ts"), "utf8");
check(
  "A. Reports repository uses Customer.fullName",
  reportsSource.includes("orderBy: { fullName: \"asc\" }") &&
    reportsSource.includes("select: { customerCode: true, fullName: true, id: true, phone: true }") &&
    !reportsSource.includes("db.customer.findMany({\n      orderBy: { name:"),
);

const filterOptions = await getReportFilterOptions(ownerTenant);
check(
  "B. getReportFilterOptions returns customer labels",
  filterOptions.customers.length >= 0 &&
    filterOptions.customers.every((option) => Boolean(option.id) && Boolean(option.label)),
  `count=${filterOptions.customers.length}`,
);

if (filterOptions.customers.length > 0) {
  const sampleCustomerId = filterOptions.customers[0]?.id;
  const dbCustomer = await prisma.customer.findFirst({
    select: { companyId: true, fullName: true },
    where: { id: sampleCustomerId },
  });
  check(
    "C. Customer filter options are company scoped",
    dbCustomer?.companyId === COMPANY_ID,
    `companyId=${dbCustomer?.companyId ?? "none"}`,
  );
  check(
    "D. Customer filter labels use fullName",
    Boolean(dbCustomer?.fullName && filterOptions.customers[0]?.label.includes(dbCustomer.fullName)),
    filterOptions.customers[0]?.label,
  );
} else {
  check("C. Customer filter options are company scoped", true, "no customers seeded");
  check("D. Customer filter labels use fullName", true, "no customers seeded");
}

const foreignCustomers = await prisma.customer.findMany({
  select: { id: true },
  take: 5,
  where: { companyId: { not: COMPANY_ID } },
});
if (foreignCustomers.length > 0) {
  const leaked = filterOptions.customers.some((option) =>
    foreignCustomers.some((customer) => customer.id === option.id),
  );
  check("E. Cross-company customer options do not leak", !leaked);
} else {
  check("E. Cross-company customer options do not leak", true, "no foreign customers in DB");
}

const snapshot = await getPrismaReportsSnapshot(ownerTenant);
check("F. Reports snapshot loads without Prisma validation error", Boolean(snapshot.hub));

await assertPermission(ownerTenant, READ_PERMISSIONS.reportsView);
check("G. Owner reports.view permission allowed", true);

await expectDenied("H. Cashier reports.view blocked", () =>
  assertPermission(cashierTenant, READ_PERMISSIONS.reportsView),
);

const customerQueryMatch = reportsSource.match(/db\.customer\.findMany\([\s\S]*?\}\),/);
check(
  "I. No invalid Customer.name Prisma query remains in reports repository",
  Boolean(
    customerQueryMatch &&
      customerQueryMatch[0].includes("fullName") &&
      !customerQueryMatch[0].includes("orderBy: { name:") &&
      !customerQueryMatch[0].includes("name: true"),
  ),
);

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nOWNER-UAT-6 reports customer filter: ${passed}/${results.length} PASS${failed ? ` (${failed} FAIL)` : ""}`);
process.exit(failed ? 1 : 0);
